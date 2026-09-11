#!/usr/bin/env python3
import json
import os
import sys
import time
import urllib.request
import importlib.util

SMOKE_PATH = os.path.join(os.path.dirname(__file__), 'cardconjurer-smoke.py')
SPEC = importlib.util.spec_from_file_location('cardconjurer_smoke', SMOKE_PATH)
SMOKE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(SMOKE)
Cdp = SMOKE.Cdp


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ART_PATH = os.path.join(ROOT, 'test-assets', 'test-art.png')
FRAME_PATH = os.path.join(ROOT, 'public', 'img', 'frames', 'm15', 'regular', 'm15FrameW.png')


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def main():
    port = int(os.environ.get('CDP_PORT', '9229'))
    targets = urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=10)
    target = next(item for item in json.load(targets) if item.get('type') == 'page')
    cdp = Cdp(target['webSocketDebuggerUrl'])
    cdp.ws.settimeout(90)
    try:
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.evaluate("localStorage.clear(); location.href = 'http://localhost:4174/'")
        cdp.wait_for("document.body.innerText.includes('Import & validate your deck')", timeout=20)

        deck = "1 Ace's Baseball Bat\n1 Forest"
        cdp.evaluate(f"""(() => {{
            const textarea = document.querySelector('textarea');
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
            setter.call(textarea, {js_string(deck)});
            textarea.dispatchEvent(new Event('input', {{ bubbles: true }}));
            textarea.dispatchEvent(new Event('change', {{ bubbles: true }}));
            document.querySelector('button.primary-button')?.click();
            return textarea.value;
        }})()""")
        cdp.wait_for("document.body.innerText.includes('FOUND') && document.body.innerText.includes('2 definitions')", timeout=45)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Customize Art'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", timeout=15)
        cdp.wait_for("document.querySelectorAll('.community-artwork-card').length > 0", timeout=45)
        cdp.evaluate("document.querySelector('.community-artwork-card button')?.click()")
        cdp.wait_for("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards.some((card) => card.customArt?.sourceType === 'community')", timeout=45)
        community_state = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1'));
          const card = project.cards.find((item) => item.customArt?.sourceType === 'community');
          return { active: card?.activeRepresentation || null, source: card?.customArt?.sourceName || null, dataUrl: Boolean(card?.customArt?.dataUrl) };
        })()""")
        if community_state['active'] != 'custom' or not community_state['dataUrl']:
            raise AssertionError(f'Community artwork was not applied: {community_state}')
        cdp.evaluate("Array.from(document.querySelectorAll('.imported-card-row')).find((row) => row.innerText.includes('Forest'))?.click()")
        cdp.wait_for("document.querySelector('.art-options-content .panel-header h2')?.textContent?.includes('Forest')", timeout=10)

        language_state = cdp.evaluate("""(() => {
          const select = document.querySelector('.selected-language select');
          const option = [...(select?.options || [])].find((item) => item.value === 'pt');
          return { label: option?.textContent || null, disabled: option?.disabled ?? null };
        })()""")
        if language_state['label'] is None:
            raise AssertionError(f'Portuguese option missing: {language_state}')
        if language_state['disabled']:
            raise AssertionError(f'Portuguese option unexpectedly unavailable in the selected card context: {language_state}')
        cdp.evaluate("""(() => {
          const select = document.querySelector('.selected-language select');
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(select, 'pt');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        })()""")
        time.sleep(1.5)
        selected_language = cdp.evaluate("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards.find((card) => card.data?.name === 'Forest')?.selectedLanguage || null")
        if selected_language != 'pt':
            raise AssertionError(f'Portuguese print selection was not persisted: {selected_language}')
        cdp.evaluate("Array.from(document.querySelectorAll('.imported-card-row')).find((row) => row.innerText.includes(\"Ace's Baseball Bat\"))?.click()")
        cdp.wait_for("document.querySelector('.art-options-content .panel-header h2')?.textContent?.includes(\"Ace's Baseball Bat\")", timeout=10)

        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Original renderer ready')", timeout=75)
        cdp.wait_for("Array.from(document.querySelectorAll('iframe')).some((frame) => frame.classList.contains('cardconjurer-frame') && frame.contentWindow?.card?.frames?.length > 0)", timeout=75)
        community_editor_state = cdp.evaluate("""(() => {
          const w = document.querySelector('iframe.cardconjurer-frame')?.contentWindow;
          return { artSource: String(w?.card?.artSource || '').slice(0, 24), frames: w?.card?.frames?.length || 0 };
        })()""")
        if not community_editor_state['artSource'].startswith('data:image/') or community_editor_state['frames'] <= 0:
            raise AssertionError(f'Community artwork was not applied to native CardConjurer layer: {community_editor_state}')

        frame_version = cdp.evaluate("""(() => {
          const frame = document.querySelector('iframe.cardconjurer-frame');
          const w = frame?.contentWindow;
          w?.document.querySelector('#selectFrameGroup')?.dispatchEvent(new Event('change', { bubbles: true }));
          w?.document.querySelector('#loadFrameVersion')?.click();
          return { before: w?.card?.version || null, button: Boolean(w?.document.querySelector('#loadFrameVersion')) };
        })()""")
        time.sleep(1.5)
        frame_version['after'] = cdp.evaluate("document.querySelector('iframe.cardconjurer-frame')?.contentWindow?.card?.version || null")
        if not frame_version['button'] or frame_version['after'] != 'm15Regular':
            raise AssertionError(f'Load Frame Version did not run: {frame_version}')

        def set_iframe_file(selector, path):
            remote = cdp.call('Runtime.evaluate', {
                'expression': f"document.querySelector('iframe.cardconjurer-frame')?.contentWindow?.document.querySelector({js_string(selector)})",
                'returnByValue': False,
                'userGesture': True,
            }).get('result', {})
            object_id = remote.get('objectId')
            if not object_id:
                raise AssertionError(f'File input not found: {selector}')
            result = cdp.call('DOM.setFileInputFiles', {'objectId': object_id, 'files': [path]})
            if result.get('error'):
                raise AssertionError(result)
            cdp.evaluate(f"document.querySelector('iframe.cardconjurer-frame')?.contentWindow?.document.querySelector({js_string(selector)})?.dispatchEvent(new Event('input', {{ bubbles: true }}))")

        set_iframe_file('input[type=file][data-dropFunction="uploadFrameOption"]', FRAME_PATH)
        cdp.wait_for("Array.from(document.querySelector('iframe.cardconjurer-frame')?.contentWindow?.availableFrames || []).some((item) => item.name?.includes('Uploaded Image'))", timeout=20)
        cdp.evaluate("""(() => {
          const w = document.querySelector('iframe.cardconjurer-frame')?.contentWindow;
          const options = [...(w?.document.querySelectorAll('#frame-picker .frame-option') || [])];
          options.at(-1)?.click();
          w?.document.querySelector('#addToFull')?.click();
        })()""")
        cdp.wait_for("(document.querySelector('iframe.cardconjurer-frame')?.contentWindow?.card?.frames?.length || 0) > 6", timeout=20)

        set_iframe_file('input[type=file][data-dropFunction="uploadArt"]', ART_PATH)
        cdp.wait_for("String(document.querySelector('iframe.cardconjurer-frame')?.contentWindow?.card?.artSource || '').startsWith('data:image/')", timeout=20)
        art_state = cdp.evaluate("""(() => {
          const w = document.querySelector('iframe.cardconjurer-frame')?.contentWindow;
          return { artSource: String(w?.card?.artSource || '').slice(0, 24), frames: w?.card?.frames?.length || 0, canvas: w?.cardCanvas ? { width: w.cardCanvas.width, height: w.cardCanvas.height } : null };
        })()""")
        if not art_state['artSource'].startswith('data:image/') or art_state['frames'] <= 6:
            raise AssertionError(f'Native uploads were not applied: {art_state}')

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Save to project'))?.click()")
        cdp.wait_for("document.body.innerText.includes('Documento CardConjurer salvo')", timeout=75)
        print(json.dumps({'ok': True, 'language': language_state, 'community': community_state, 'frameVersion': frame_version, 'uploads': art_state}, ensure_ascii=False))
    finally:
        cdp.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
