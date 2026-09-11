#!/usr/bin/env python3
import importlib.util, json, os, sys, time, urllib.request
spec=importlib.util.spec_from_file_location('smoke', os.path.join(os.path.dirname(__file__), 'cardconjurer-smoke.py'))
smoke=importlib.util.module_from_spec(spec); assert spec and spec.loader; spec.loader.exec_module(smoke)

def main():
    port=int(os.environ.get('CDP_PORT','9232'))
    target=next(x for x in json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json')) if x.get('type')=='page')
    cdp=smoke.Cdp(target['webSocketDebuggerUrl'])
    try:
        cdp.call('Page.enable'); cdp.call('Runtime.enable'); cdp.call('Page.navigate', {'url':'http://localhost:4174/'})
        cdp.wait_for("document.body.innerText.includes('Import & validate your deck')", 20)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Load sample'))?.click()")
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('Import & resolve'))?.click()")
        cdp.wait_for("document.body.innerText.includes('4 definitions')", 30)
        cdp.evaluate("document.querySelectorAll('.step-nav')[1]?.click()")
        cdp.wait_for("document.body.innerText.includes('CARD STUDIO QUEUE')", 15)
        state=cdp.evaluate("""(() => {
          const grid=document.querySelector('.available-arts-grid');
          const lang=document.querySelector('.selected-language select');
          const normal=document.querySelector('.regular-card-list');
          const lands=document.querySelector('.land-card-list');
          return {sidebar:!!document.querySelector('.sidebar'), queue:!!document.querySelector('.imported-cards-panel'), selected:!!document.querySelector('.art-options-panel'), normalRows:normal?.querySelectorAll('.imported-card-row').length||0, landRows:lands?.querySelectorAll('.imported-card-row').length||0, columns:grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:0, languageOptions:lang?[...lang.options].map(x=>x.value):[], stage2Overlap:document.querySelector('.imported-cards-panel')?.getBoundingClientRect().bottom > document.querySelector('.art-options-panel')?.getBoundingClientRect().top + 2};
        })()""")
        if state['sidebar'] or not state['queue'] or not state['selected'] or state['columns'] < 3:
            raise AssertionError(state)
        filtered=cdp.evaluate("""(() => { const s=document.querySelector('.selected-language select'); if (!s || ![...s.options].some(o=>o.value==='pt')) return {supported:false}; s.value='pt'; s.dispatchEvent(new Event('change',{bubbles:true})); return {supported:true}; })()""")
        time.sleep(.8)
        language_state=cdp.evaluate("""(() => ({selected:document.querySelector('.selected-language select')?.value||'', cards:[...document.querySelectorAll('.available-art .available-art-meta span')].map(x=>x.textContent||'')}))()""")
        if filtered.get('supported') and (language_state['selected'] != 'pt' or any('Português' not in text and 'PT' not in text for text in language_state['cards'])):
            raise AssertionError({'layout':state,'language':language_state})
        print(json.dumps({'ok':True, **state, 'languageFilter':language_state}, ensure_ascii=False))
    finally: cdp.close()
if __name__=='__main__':
    try: main()
    except Exception as e: print(json.dumps({'ok':False,'error':str(e)})); sys.exit(1)
