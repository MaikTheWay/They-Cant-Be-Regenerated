import { ArrowLeft, CheckCircle2, Loader2, Save, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CardConjurerAdapter, type CardConjurerResult } from '../core/cardConjurerAdapter'
import type { CardDefinition } from '../core/models'

interface CardConjurerEditorProps {
  card: CardDefinition
  onSaved: (result: CardConjurerResult) => void
  onInitialRender: (result: CardConjurerResult) => void
  onClose: () => void
}

export default function CardConjurerEditor({ card, onSaved, onInitialRender, onClose }: CardConjurerEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const adapterRef = useRef<CardConjurerAdapter | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const onSavedRef = useRef(onSaved)
  const onInitialRenderRef = useRef(onInitialRender)
  useEffect(() => {
    onSavedRef.current = onSaved
    onInitialRenderRef.current = onInitialRender
  }, [onSaved, onInitialRender])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return undefined
    const adapter = new CardConjurerAdapter({
      iframe,
      onDocument: (result) => {
        setSavedAt(new Date().toLocaleTimeString())
        onSavedRef.current(result)
      },
      onError: (message) => setError(message),
    })
    adapterRef.current = adapter
    let cancelled = false
    let started = false
    const start = async () => {
      if (started) return
      started = true
      try {
        await adapter.waitUntilBooted()
        if (cancelled) return
        let result = await adapter.initialize(card)
        if (cancelled) return
        if (card.activeRepresentation === 'custom' && card.customArt?.dataUrl) {
          result = await adapter.applyArtwork(card.customArt.dataUrl)
        }
        if (cancelled) return
        setReady(true)
        onInitialRenderRef.current(result)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o CardConjurer.')
      }
    }
    iframe.addEventListener('load', start)
    void start()
    return () => {
      cancelled = true
      iframe.removeEventListener('load', start)
      adapter.dispose()
      adapterRef.current = null
    }
  }, [card.id])

  async function saveEditor(): Promise<void> {
    if (!adapterRef.current) return
    setBusy(true)
    setError(null)
    try {
      const result = await adapterRef.current.save()
      setSavedAt(new Date().toLocaleTimeString())
      onSavedRef.current(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o documento.')
    } finally {
      setBusy(false)
    }
  }

  async function closeEditor(): Promise<void> {
    if (!adapterRef.current) {
      onClose()
      return
    }
    setBusy(true)
    try {
      const result = await adapterRef.current.save()
      onSavedRef.current(result)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Salve o documento antes de sair.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="cardconjurer-session">
    <div className="cardconjurer-session-bar">
      <div className="cardconjurer-session-title">
        <button className="secondary-button" type="button" onClick={() => void closeEditor()} disabled={busy}><ArrowLeft size={15} /> Back to project</button>
        <div><span className="panel-kicker">CARDCONJURER / LOCAL EDITOR</span><strong>{card.data?.name || card.inputName}</strong><small>{ready ? 'Original renderer ready' : 'Loading original renderer…'}</small></div>
      </div>
      <div className="cardconjurer-session-actions">
        {savedAt && <span className="editor-saved-state"><CheckCircle2 size={14} /> Saved {savedAt}</span>}
        {error && <span className="editor-error"><TriangleAlert size={14} /> {error}</span>}
        <button className="primary-button" type="button" onClick={() => void saveEditor()} disabled={!ready || busy}>{busy ? <><Loader2 className="spin" size={15} /> Saving…</> : <><Save size={15} /> Save to project</>}</button>
      </div>
    </div>
    <div className="cardconjurer-frame-wrap"><iframe ref={iframeRef} className="cardconjurer-frame" title="CardConjurer original editor" src="/cardconjurer/editor.html" /></div>
  </div>
}
