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


def js_string(value):
    return json.dumps(value, ensure_ascii=False)


def wait_body(cdp, text, timeout=70):
    return cdp.wait_for(f'document.body.innerText.includes({js_string(text)})', timeout=timeout)


def main():
    port = int(os.environ.get('CDP_PORT', '9229'))
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=10) as response:
        target = next(item for item in json.load(response) if item.get('type') == 'page')
    cdp = SMOKE.Cdp(target['webSocketDebuggerUrl'])
    cdp.ws.settimeout(90)
    try:
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Page.navigate', {'url': 'http://localhost:4174/'})
        wait_body(cdp, 'Import & validate your deck', timeout=20)
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Customize Art'))?.click()")
        wait_body(cdp, 'CARD STUDIO QUEUE', timeout=15)
        initial = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1') || 'null');
          const card = project?.cards?.find((item) => item.inputName === 'Arcane Signet' || item.data?.name === 'Arcane Signet' || item.cardConjurerDocument);
          return { cards: project?.cards?.length || 0, documents: project?.cards?.filter((item) => item.cardConjurerDocument).length || 0, title: card?.cardConjurerDocument?.text?.title?.text || null, active: card?.activeRepresentation || null };
        })()""")
        if initial['documents'] <= 0:
            raise AssertionError(f'No persisted document before regression: {initial}')

        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Original print'))?.click()")
        wait_body(cdp, 'Original print', timeout=10)
        time.sleep(1.5)
        after_original = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1') || 'null');
          const card = project?.cards?.find((item) => item.cardConjurerDocument);
          return { document: Boolean(card?.cardConjurerDocument), active: card?.activeRepresentation || null };
        })()""")
        if not after_original['document'] or after_original['active'] != 'original':
            raise AssertionError(f'Original toggle lost document: {after_original}')

        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        wait_body(cdp, 'Original renderer ready', timeout=70)
        restored_before_edit = cdp.evaluate("""(() => {
          const frame = document.querySelector('iframe.cardconjurer-frame');
          const w = frame?.contentWindow;
          return { title: w?.card?.text?.title?.text || null, frames: w?.card?.frames?.length || 0, canvas: w?.cardCanvas ? w.cardCanvas.toDataURL('image/png').length : 0 };
        })()""")
        if restored_before_edit['title'] != initial['title'] or restored_before_edit['frames'] <= 0 or restored_before_edit['canvas'] <= 1000:
            raise AssertionError(f'Restored editor not renderable: {restored_before_edit}; expected title={initial["title"]!r}')
        edited_title = 'CardConjurer Regression'
        edited_title_js = js_string(edited_title)

        edit_result = cdp.evaluate("""(() => {
          const frame = document.querySelector('iframe.cardconjurer-frame');
          const w = frame?.contentWindow;
          const textTab = [...(w?.document.querySelectorAll('#creator-menu-tabs h3') || [])].find((item) => item.textContent?.trim() === 'Text');
          textTab?.click();
          const titleOption = [...(w?.document.querySelectorAll('#text-options .text-option') || [])].find((item) => item.textContent?.trim() === 'Title');
          titleOption?.click();
          const editor = w?.document.querySelector('#text-editor');
          if (!editor) return { ok: false, reason: 'text editor missing' };
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(editor, EDITED_TITLE);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          return { ok: true, title: w?.card?.text?.title?.text || null };
        })()""".replace('EDITED_TITLE', edited_title_js))
        if not edit_result['ok'] or edit_result['title'] != edited_title:
            raise AssertionError(f'Native text edit failed: {edit_result}')
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Save to project'))?.click()")
        wait_body(cdp, 'Documento CardConjurer salvo', timeout=70)
        feedback = cdp.evaluate("document.body.innerText.slice(-500)")
        if 'Documento CardConjurer salvo' not in feedback:
            raise AssertionError(f'Edit save feedback missing: {feedback}')
        time.sleep(2)
        edited_persisted = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1') || 'null');
          const card = project?.cards?.find((item) => item.cardConjurerDocument?.text?.title?.text === EDITED_TITLE);
          return { found: Boolean(card), title: card?.cardConjurerDocument?.text?.title?.text || null, active: card?.activeRepresentation || null };
        })()""".replace('EDITED_TITLE', edited_title_js))
        if not edited_persisted['found'] or edited_persisted['active'] != 'editor':
            raise AssertionError(f'Edited snapshot not persisted: {edited_persisted}')

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Back to project'))?.click()")
        wait_body(cdp, 'CARD STUDIO QUEUE', timeout=15)
        print_change = cdp.evaluate("""(() => {
          const candidates = [...document.querySelectorAll('button.available-art:not(.selected)')];
          const before = document.querySelector('button.available-art.selected')?.innerText || null;
          if (candidates.length) candidates[0].click();
          return { availableAlternatives: candidates.length, before };
        })()""")
        time.sleep(2)
        after_print = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1') || 'null');
          const card = project?.cards?.find((item) => item.cardConjurerDocument?.text?.title?.text === EDITED_TITLE);
          return { document: Boolean(card?.cardConjurerDocument), active: card?.activeRepresentation || null, selectedPrint: card?.selectedPrint?.id || null };
        })()""".replace('EDITED_TITLE', edited_title_js))
        if print_change['availableAlternatives'] > 0 and (not after_print['document'] or after_print['active'] != 'original'):
            raise AssertionError(f'Print switch did not preserve document: {after_print}')
        if print_change['availableAlternatives'] == 0 and not after_print['document']:
            raise AssertionError(f'No alternative print and document missing: {after_print}')

        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('New blank card'))?.click()")
        wait_body(cdp, 'Blank Card', timeout=15)
        blank_state = cdp.evaluate("""(() => ({
          queue: document.body.innerText.includes('CARD STUDIO QUEUE'),
          blankRow: [...document.querySelectorAll('.imported-card-row')].some((row) => row.innerText.includes('Blank Card')),
          cards: document.querySelectorAll('.imported-card-row').length
        }))()""")
        if not blank_state['queue'] or not blank_state['blankRow']:
            raise AssertionError(f'Blank Card was not added: {blank_state}')
        cdp.evaluate("Array.from(document.querySelectorAll('.representation-actions.three-way button')).find((button) => button.innerText.includes('Open Editor'))?.click()")
        wait_body(cdp, 'Original renderer ready', timeout=70)
        blank_editor = cdp.evaluate("""(() => {
          const frame = document.querySelector('iframe.cardconjurer-frame');
          const w = frame?.contentWindow;
          return { title: w?.card?.text?.title?.text || null, frames: w?.card?.frames?.length || 0, canvas: w?.cardCanvas ? { width: w.cardCanvas.width, height: w.cardCanvas.height } : null };
        })()""")
        if blank_editor['frames'] <= 0 or not blank_editor['canvas'] or blank_editor['canvas']['width'] <= 0 or blank_editor['canvas']['height'] <= 0:
            raise AssertionError(f'Blank Card editor is not renderable: {blank_editor}')
        cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Save to project'))?.click()")
        wait_body(cdp, 'Documento CardConjurer salvo', timeout=70)
        time.sleep(2)
        blank_persisted = cdp.evaluate("""(() => {
          const project = JSON.parse(localStorage.getItem('tcbr-project-v1') || 'null');
          return { blankDocuments: project?.cards?.filter((item) => item.inputName === 'Blank Card' && item.cardConjurerDocument).length || 0 };
        })()""")
        if blank_persisted['blankDocuments'] <= 0:
            raise AssertionError(f'Blank Card document was not persisted: {blank_persisted}')

        print(json.dumps({
            'ok': True,
            'initial': initial,
            'afterOriginal': after_original,
            'restoredBeforeEdit': restored_before_edit,
            'editedPersisted': edited_persisted,
            'printChange': print_change,
            'afterPrint': after_print,
            'blankCard': blank_state,
            'blankEditor': blank_editor,
            'blankPersisted': blank_persisted,
        }, ensure_ascii=False))
    finally:
        cdp.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        sys.exit(1)
