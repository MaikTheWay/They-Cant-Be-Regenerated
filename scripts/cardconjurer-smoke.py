#!/usr/bin/env python3
import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import websocket


class Cdp:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=20)
        self.seq = 0

    def call(self, method, params=None):
        self.seq += 1
        ident = self.seq
        self.ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        while True:
            message = json.loads(self.ws.recv())
            if message.get("id") == ident:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})

    def evaluate(self, expression, await_promise=False, return_by_value=True):
        result = self.call("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": await_promise,
            "returnByValue": return_by_value,
            "userGesture": True,
        })
        exception = result.get("exceptionDetails")
        if exception:
            raise RuntimeError(exception.get("text") or exception.get("exception", {}).get("description", "Runtime evaluation failed"))
        remote = result.get("result", {})
        if remote.get("subtype") == "error":
            raise RuntimeError(remote.get("description", "Runtime evaluation failed"))
        return remote.get("value")

    def wait_for(self, expression, timeout=20, interval=0.25):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            last = self.evaluate(expression)
            if last:
                return last
            time.sleep(interval)
        raise AssertionError(f"Timeout waiting for: {expression}; last={last!r}")

    def screenshot(self, path):
        data = self.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(data))

    def close(self):
        self.ws.close()


def request_json(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.load(response)


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def main():
    port = int(os.environ.get("CDP_PORT", "9222"))
    targets = request_json(f"http://127.0.0.1:{port}/json")
    target = next((item for item in targets if item.get("type") == "page"), None)
    if not target:
        raise RuntimeError("No Chromium page target found")

    cdp = Cdp(target["webSocketDebuggerUrl"])
    try:
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Page.navigate", {"url": "http://localhost:4174/"})
        time.sleep(1.5)

        deck = "1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n1 Tergrid, God of Fright"
        cdp.evaluate(f"""(() => {{
            const textarea = document.querySelector('textarea');
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
            setter.call(textarea, {js_string(deck)});
            textarea.dispatchEvent(new Event('input', {{ bubbles: true }}));
            textarea.dispatchEvent(new Event('change', {{ bubbles: true }}));
            return textarea.value;
        }})()""")
        cdp.evaluate("document.querySelector('button.primary-button')?.click()")
        cdp.wait_for("document.body.innerText.includes('FOUND') && document.body.innerText.includes('4 definitions')", timeout=25)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Customize Art'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", timeout=10)
        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Original renderer ready')", timeout=65)
        cdp.wait_for("Array.from(document.querySelectorAll('iframe')).some((frame) => frame.contentWindow?.cardCanvas?.toDataURL('image/png').length > 1000)", timeout=65)
        cdp.screenshot("/home/ubuntu/work/They-Cant-Be-Regenerated-integrated/validation-editor.png")

        editor_state = cdp.evaluate("""(() => {
            const frame = Array.from(document.querySelectorAll('iframe')).find((item) => item.classList.contains('cardconjurer-frame'));
            const win = frame?.contentWindow;
            const card = win?.card;
            return {
                frames: card?.frames?.length || 0,
                version: card?.version || null,
                artSource: card?.artSource || null,
                title: card?.text?.title?.text || null,
                type: card?.text?.type?.text || null,
                rules: card?.text?.rules?.text || null,
                canvas: win?.cardCanvas ? { width: win.cardCanvas.width, height: win.cardCanvas.height, pngLength: win.cardCanvas.toDataURL('image/png').length } : null,
                m15FrameLoaded: Boolean(card?.frames?.length && card.frames.some((item) => item.image?.complete && (item.image.naturalWidth || item.image.width) > 0)),
            };
        })()""")
        if editor_state["frames"] <= 0 or editor_state["title"] not in (None, '') or not editor_state["canvas"] or editor_state["canvas"]["pngLength"] <= 1000:
            raise AssertionError(f"CardConjurer canvas is not renderable: {editor_state}")

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Save to project'))?.click()")
        feedback = cdp.wait_for("document.querySelector('.toast')?.textContent || document.querySelector('.editor-error')?.textContent", timeout=35)
        if 'Documento CardConjurer salvo' not in feedback:
            raise AssertionError(f'Editor save feedback: {feedback}')
        time.sleep(2)
        persistence_state = cdp.evaluate("""(() => {
            const raw = localStorage.getItem('tcbr-project-v1');
            let project = null;
            try { project = raw ? JSON.parse(raw) : null; } catch {}
            return {
                keys: Object.keys(localStorage),
                keyBytes: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)?.length || 0])),
                projectBytes: raw?.length || 0,
                dirty: document.querySelector('.save-state')?.textContent || null,
                toast: document.querySelector('.toast')?.textContent || null,
                editorError: document.querySelector('.editor-error')?.textContent || null,
                cardDocuments: project?.cards?.filter((card) => card.cardConjurerDocument).length || 0,
            };
        })()""")
        if persistence_state['cardDocuments'] <= 0:
            raise AssertionError(f'Persistence state: {persistence_state}')
        persisted = cdp.evaluate("""(() => Object.entries(localStorage).map(([key, raw]) => {
            try { return { key, value: JSON.parse(raw) }; } catch { return { key, value: null }; }
        }).filter((item) => item.value?.cards?.some((card) => card.cardConjurerDocument)))()""")
        if not persisted:
            raise AssertionError("No persisted CardConjurer document found in localStorage")

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Back to project'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", timeout=10)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Print & Export'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Generate validated PDF')", timeout=10)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Generate validated PDF'))?.click()")
        cdp.wait_for("document.body.innerText.includes('PDF validado')", timeout=30)

        cdp.call("Page.navigate", {"url": "http://localhost:4174/"})
        cdp.wait_for("document.body.innerText.includes('Import & validate your deck')", timeout=15)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Customize Art'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CardConjurer document')", timeout=10)
        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Original renderer ready')", timeout=65)
        restored_state = cdp.evaluate("""(() => {
            const frame = Array.from(document.querySelectorAll('iframe')).find((item) => item.classList.contains('cardconjurer-frame'));
            const win = frame?.contentWindow;
            const card = win?.card;
            return {
                frames: card?.frames?.length || 0,
                version: card?.version || null,
                title: card?.text?.title?.text || null,
                canvasPngLength: win?.cardCanvas ? win.cardCanvas.toDataURL('image/png').length : 0,
            };
        })()""")
        if restored_state['frames'] <= 0 or restored_state['title'] not in (None, '') or restored_state['canvasPngLength'] <= 1000:
            raise AssertionError(f'Restored CardConjurer document is not renderable: {restored_state}')

        print(json.dumps({"ok": True, "editor": editor_state, "restoredEditor": restored_state, "persistedProjects": len(persisted), "pdfValidated": True}, ensure_ascii=False))
    finally:
        cdp.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(1)
