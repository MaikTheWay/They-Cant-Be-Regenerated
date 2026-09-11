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
Cdp = SMOKE.Cdp


def main():
    port = int(os.environ.get('CDP_PORT', '9230'))
    targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'))
    target = next(item for item in targets if item.get('type') == 'page')
    cdp = Cdp(target['webSocketDebuggerUrl'])
    try:
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Page.navigate', {'url': 'http://localhost:4174/'})
        cdp.wait_for("Boolean(document.body)", timeout=20)
        cdp.evaluate("localStorage.clear()")
        cdp.call('Page.reload')
        cdp.wait_for("document.body.innerText.includes('Import & validate your deck')", timeout=20)
        cdp.evaluate("""(() => {
          localStorage.setItem('tcbr-card-cache-v2', JSON.stringify({stale: {savedAt: Date.now(), value: {}}}));
          localStorage.setItem('tcbr-print-cache-v1', JSON.stringify({stale: {savedAt: Date.now(), value: []}}));
          localStorage.setItem('tcbr-print-cache-v2', JSON.stringify({stale: {savedAt: Date.now(), value: []}}));
          return true;
        })()""")
        cdp.evaluate("""(() => {
          const textarea = document.querySelector('textarea');
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(textarea, '1 Forest [pt-BR]');
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          document.querySelector('button.primary-button')?.click();
        })()""")
        cdp.wait_for("document.body.innerText.includes('FOUND') && document.body.innerText.includes('1 definitions')", timeout=60)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Customize Art'))?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", timeout=15)
        if cdp.evaluate("document.body.innerText.includes('COMMUNITY ARTWORK')"):
            raise AssertionError('Community Artwork API panel is still visible')
        pt = cdp.evaluate("""(() => {
          const option = [...document.querySelectorAll('.selected-language option')].find((item) => item.value === 'pt');
          return { text: option?.textContent || null, disabled: option?.disabled ?? null };
        })()""")
        if pt['text'] != 'Português (Brasil) / pt-BR' or pt['disabled']:
            raise AssertionError(f'pt-BR option unavailable: {pt}')
        cdp.evaluate("""(() => {
          const select = document.querySelector('.selected-language select');
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(select, 'pt');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        })()""")
        time.sleep(1)
        language = cdp.evaluate("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards[0].selectedLanguage")
        if language != 'pt':
            raise AssertionError(f'pt-BR selection not persisted: {language}')

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('New blank card'))?.click()")
        cdp.wait_for("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards.length === 2", timeout=15)
        before = cdp.evaluate("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards.length")
        cdp.evaluate("document.querySelector('.danger-button')?.click()")
        cdp.wait_for("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards.length === 1", timeout=15)
        after = cdp.evaluate("JSON.parse(localStorage.getItem('tcbr-project-v1')).cards.length")
        if before != 2 or after != 1:
            raise AssertionError(f'Blank Card removal failed: before={before}, after={after}')

        cdp.evaluate("document.querySelector('button[title=\"Clear card cache\"]')?.click()")
        time.sleep(0.4)
        cache = cdp.evaluate("({card: localStorage.getItem('tcbr-card-cache-v2'), oldPrint: localStorage.getItem('tcbr-print-cache-v1'), print: localStorage.getItem('tcbr-print-cache-v2')})")
        if any(cache.values()):
            raise AssertionError(f'Cache was not cleared: {cache}')
        print(json.dumps({'ok': True, 'ptBR': pt, 'language': language, 'blankCards': {'before': before, 'after': after}, 'cache': cache}, ensure_ascii=False))
    finally:
        cdp.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
