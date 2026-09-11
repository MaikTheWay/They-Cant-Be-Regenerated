import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { CardConjurerAdapter } from '../core/cardConjurerAdapter'
import type { CardDefinition } from '../core/models'

export interface CardConjurerRenderHandle {
  render(card: CardDefinition): Promise<string>
}

const CardConjurerRenderHost = forwardRef<CardConjurerRenderHandle>(function CardConjurerRenderHost(_props, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const adapterRef = useRef<CardConjurerAdapter | null>(null)
  const [bootPromise, setBootPromise] = useState<Promise<void> | null>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return undefined
    const adapter = new CardConjurerAdapter({ iframe })
    adapterRef.current = adapter
    const promise = adapter.waitUntilBooted()
    setBootPromise(promise)
    return () => {
      adapter.dispose()
      adapterRef.current = null
    }
  }, [])

  useImperativeHandle(ref, () => ({
    async render(card: CardDefinition): Promise<string> {
      const adapter = adapterRef.current
      if (!adapter) throw new Error('O renderer local do CardConjurer ainda não está disponível.')
      await (bootPromise || adapter.waitUntilBooted())
      const result = await adapter.initialize(card)
      return result.preview
    },
  }), [bootPromise])

  return <iframe ref={iframeRef} className="cardconjurer-render-host" title="CardConjurer local render host" src="/cardconjurer/editor.html" aria-hidden="true" tabIndex={-1} />
})

export default CardConjurerRenderHost
