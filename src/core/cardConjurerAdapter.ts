import type { CardConjurerDocument, CardDefinition } from './models'

const BRIDGE_SOURCE = 'cardconjurer'
const HOST_SOURCE = 'tcbr-host'
const REQUEST_TIMEOUT = 60_000

type BridgeMessage = {
  source?: string
  type?: string
  requestId?: string
  bridgeId?: string
  document?: CardConjurerDocument
  preview?: string
  message?: string
}

type PendingRequest = {
  resolve: (value: CardConjurerResult) => void
  reject: (reason: Error) => void
  timer: number
}

export interface CardConjurerResult {
  document: CardConjurerDocument
  preview: string
}

export function compactPreviewDataUrl(dataUrl: string, maxDimension = 480): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
      if (!longestSide || longestSide <= maxDimension) {
        resolve(dataUrl)
        return
      }
      const scale = maxDimension / longestSide
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
      canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(dataUrl)
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    image.onerror = () => resolve(dataUrl)
    image.src = dataUrl
  })
}

export interface CardConjurerAdapterOptions {
  iframe: HTMLIFrameElement
  onDocument?: (result: CardConjurerResult) => void
  onError?: (message: string) => void
}

function adapterError(message: string): Error {
  return new Error(message || 'O editor CardConjurer não respondeu.')
}

export class CardConjurerAdapter {
  private readonly iframe: HTMLIFrameElement
  private readonly onDocument?: (result: CardConjurerResult) => void
  private readonly onError?: (message: string) => void
  private readonly bridgeId = `bridge-${crypto.randomUUID()}`
  private readonly pending = new Map<string, PendingRequest>()
  private requestCounter = 0
  private booted = false
  private bootPromise: Promise<void> | null = null
  private bootResolve: (() => void) | null = null
  private bootReject: ((error: Error) => void) | null = null
  private pingTimer: number | null = null
  constructor(options: CardConjurerAdapterOptions) {
    this.iframe = options.iframe
    this.onDocument = options.onDocument
    this.onError = options.onError
    window.addEventListener('message', this.handleMessage)
    this.pingTimer = window.setInterval(() => this.ping(), 250)
    this.ping()
  }

  private ping(): void {
    if (this.booted || !this.iframe.contentWindow) return
    this.iframe.contentWindow.postMessage({ source: HOST_SOURCE, type: 'tcbr:ping', bridgeId: this.bridgeId }, '*')
  }

  dispose(): void {
    window.removeEventListener('message', this.handleMessage)
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer)
    for (const request of this.pending.values()) {
      window.clearTimeout(request.timer)
      request.reject(adapterError('A sessão do editor foi encerrada.'))
    }
    this.pending.clear()
    this.bootResolve = null
    this.bootReject = null
  }

  private editorIsReady(): boolean {
    const editorWindow = this.iframe.contentWindow as (Window & { card?: unknown; drawCard?: unknown; loadCard?: unknown }) | null
    return Boolean(editorWindow?.card && typeof editorWindow.drawCard === 'function' && typeof editorWindow.loadCard === 'function')
  }

  waitUntilBooted(): Promise<void> {
    if (!this.booted && this.editorIsReady()) {
      this.booted = true
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer)
    }
    if (this.booted) return Promise.resolve()
    if (!this.bootPromise) {
      this.bootPromise = new Promise<void>((resolve, reject) => {
        this.bootResolve = resolve
        this.bootReject = reject
        const started = Date.now()
        const check = () => {
          if (this.booted) return
          if (this.editorIsReady()) {
            this.booted = true
            if (this.pingTimer !== null) window.clearInterval(this.pingTimer)
            this.bootResolve?.()
            this.bootResolve = null
            this.bootReject = null
            return
          }
          if (Date.now() - started >= REQUEST_TIMEOUT) {
            this.bootReject?.(adapterError('O bootstrap original do CardConjurer não terminou.'))
            this.bootResolve = null
            this.bootReject = null
            return
          }
          window.setTimeout(check, 80)
        }
        check()
      })
    }
    return this.bootPromise
  }

  async initialize(card: CardDefinition): Promise<CardConjurerResult> {
    await this.waitUntilBooted()
    return this.request('tcbr:init', {
      card: this.toSerializableCard(card),
      document: card.cardConjurerDocument,
    })
  }

  async createBlank(): Promise<CardConjurerResult> {
    await this.waitUntilBooted()
    return this.request('tcbr:new')
  }

  async save(): Promise<CardConjurerResult> {
    await this.waitUntilBooted()
    return this.request('tcbr:save')
  }

  async applyArtwork(dataUrl: string): Promise<CardConjurerResult> {
    await this.waitUntilBooted()
    return this.request('tcbr:art', { dataUrl })
  }

  async render(): Promise<CardConjurerResult> {
    await this.waitUntilBooted()
    return this.request('tcbr:render')
  }

  private toSerializableCard(card: CardDefinition): CardDefinition {
    return JSON.parse(JSON.stringify(card)) as CardDefinition
  }

  private request(type: string, payload: Record<string, unknown> = {}): Promise<CardConjurerResult> {
    const requestId = `tcbr-${Date.now()}-${this.requestCounter += 1}-${Math.random().toString(36).slice(2, 8)}`
    return new Promise<CardConjurerResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId)
        reject(adapterError('O CardConjurer demorou demais para responder.'))
      }, REQUEST_TIMEOUT)
      this.pending.set(requestId, { resolve, reject, timer })
      if (!this.iframe.contentWindow) {
        window.clearTimeout(timer)
        this.pending.delete(requestId)
        reject(adapterError('O frame local do CardConjurer não está disponível.'))
        return
      }
      this.iframe.contentWindow.postMessage({ source: HOST_SOURCE, type, requestId, bridgeId: this.bridgeId, ...payload }, '*')
    })
  }

  private readonly handleMessage = (event: MessageEvent<BridgeMessage>): void => {
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.bridgeId !== this.bridgeId) return
    const message = event.data
    if (message.type === 'tcbr:booted') {
      this.booted = true
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer)
      this.bootResolve?.()
      this.bootResolve = null
      this.bootReject = null
      return
    }
    if (message.type === 'tcbr:error') {
      const error = adapterError(message.message || 'Falha no CardConjurer.')
      if (message.requestId && this.pending.has(message.requestId)) {
        const request = this.pending.get(message.requestId)!
        window.clearTimeout(request.timer)
        this.pending.delete(message.requestId)
        request.reject(error)
      } else {
        this.bootReject?.(error)
        this.bootResolve = null
        this.bootReject = null
        this.onError?.(error.message)
      }
      return
    }
    if (message.type !== 'tcbr:ready' && message.type !== 'tcbr:document') return
    if (!message.document || !message.preview) return
    const result = { document: message.document, preview: message.preview }
    if (message.requestId && this.pending.has(message.requestId)) {
      const request = this.pending.get(message.requestId)!
      window.clearTimeout(request.timer)
      this.pending.delete(message.requestId)
      request.resolve(result)
    } else {
      this.onDocument?.(result)
    }
  }
}
