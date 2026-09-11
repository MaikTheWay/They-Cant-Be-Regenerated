#!/usr/bin/env python3
import importlib.util
import json
import os
import sys
import time
import urllib.request

SCRIPT_DIR = os.path.dirname(__file__)
SPEC = importlib.util.spec_from_file_location('cardconjurer_smoke', os.path.join(SCRIPT_DIR, 'cardconjurer-smoke.py'))
SMOKE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(SMOKE)


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def main():
    port = int(os.environ.get('CDP_PORT', '9231'))
    targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))
    target = next(item for item in targets if item.get('type') == 'page')
    cdp = SMOKE.Cdp(target['webSocketDebuggerUrl'])
    cdp.ws.settimeout(90)
    try:
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Page.navigate', {'url': 'http://localhost:4174/'})
        cdp.wait_for("document.body.innerText.includes('Import & validate your deck')", timeout=20)
        cdp.evaluate("""(() => {
          const textarea = document.querySelector('textarea');
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(textarea, '1 Sol Ring');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('button.primary-button')?.click();
        })()""")
        cdp.wait_for("document.body.innerText.includes('FOUND')", timeout=40)
        cdp.evaluate("document.querySelectorAll('.step-nav')[1]?.click(); Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Customize Art'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", timeout=25)
        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Original renderer ready')", timeout=70)

        def state():
            return cdp.evaluate("""(() => {
              const frame = document.querySelector('iframe.cardconjurer-frame');
              const w = frame?.contentWindow;
              const card = w?.card;
              return {
                frames: (card?.frames || []).map((item) => ({ name: item.name, src: item.src, x: item.x, y: item.y, width: item.width, height: item.height })),
                frameListItems: w?.document?.querySelectorAll('#frame-list > *').length || 0,
                artSource: card?.artSource || null,
                title: card?.text?.title?.text || '',
                mana: card?.text?.mana?.text || '',
                type: card?.text?.type?.text || '',
                rules: card?.text?.rules?.text || '',
                pt: card?.text?.pt?.text || '',
                png: w?.cardCanvas ? w.cardCanvas.toDataURL('image/png').length : 0,
              };
            })()""")

        initial = state()
        if not initial['frames'] or initial['png'] <= 1000:
            raise AssertionError(f'Initial editor is not renderable: {initial}')
        if initial['frameListItems'] != 0:
            raise AssertionError(f'Frame list should start visually empty: {initial}')

        cdp.evaluate("""(() => {
          const w = document.querySelector('iframe.cardconjurer-frame')?.contentWindow;
          w?.document.querySelector('#addToFull')?.click();
          if (typeof w?.uploadArt === 'function') w.uploadArt('/img/blank.png');
        })()""")
        time.sleep(1)
        after_assets = state()
        if not after_assets['frames']:
            raise AssertionError(f'Frame disappeared after asset edit: {after_assets}')

        def edit(label, value):
            expression = f"""(() => {{
              const w = document.querySelector('iframe.cardconjurer-frame')?.contentWindow;
              const option = [...(w?.document.querySelectorAll('#text-options .text-option') || [])].find((item) => item.textContent?.trim() === {js_string(label)});
              option?.click();
              const editor = w?.document.querySelector('#text-editor');
              if (!editor) return {{ ok: false, reason: 'missing editor for ' + {js_string(label)} }};
              const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
              setter.call(editor, {js_string(value)});
              editor.dispatchEvent(new Event('input', {{ bubbles: true }}));
              return {{ ok: true }};
            }})()"""
            result = cdp.evaluate(expression)
            if not result['ok']:
                raise AssertionError(result)
            time.sleep(1.1)
            current = state()
            if current['frames'] != after_assets['frames']:
                raise AssertionError(f'Frames changed after {label}: before={after_assets["frames"]}, after={current["frames"]}')
            return current

        current = edit('Title', 'Persistent Title')
        current = edit('Mana Cost', '{2}{R}')
        current = edit('Type', 'Artifact')
        current = edit('Rules Text', 'This rules text must preserve the composed frame.')
        current = edit('Power/Toughness', '2/2')
        if not current['title'] or current['title'] != 'Persistent Title':
            raise AssertionError(f'Title edit failed: {current}')

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Save to project'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Documento CardConjurer salvo')", timeout=70)
        time.sleep(1.5)
        persisted = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1') || 'null');
          const card = project?.cards?.find((item) => item.cardConjurerDocument?.text?.title?.text === 'Persistent Title');
          return { found: Boolean(card), document: card?.cardConjurerDocument || null, preview: Boolean(card?.editorPreviewDataUrl) };
        })()""")
        if not persisted['found'] or not persisted['document']:
            raise AssertionError(f'Structured document not persisted: {persisted}')

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Back to project'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", timeout=15)
        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Original print'))?.click()")
        time.sleep(1)
        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Original renderer ready')", timeout=70)
        reopened = state()
        expected = current
        if reopened['frames'] != expected['frames'] or reopened['title'] != expected['title'] or reopened['mana'] != expected['mana'] or reopened['type'] != expected['type'] or reopened['rules'] != expected['rules'] or reopened['pt'] != expected['pt']:
            raise AssertionError(f'Reopened document changed: expected={expected}, reopened={reopened}')

        print(json.dumps({'ok': True, 'initialFrames': len(initial['frames']), 'finalFrames': len(reopened['frames']), 'title': reopened['title'], 'mana': reopened['mana'], 'type': reopened['type'], 'rulesLength': len(reopened['rules']), 'powerToughness': reopened['pt'], 'structuredDocumentPersisted': persisted['found'], 'originalToggleRoundTrip': True}, ensure_ascii=False))
    finally:
        cdp.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
