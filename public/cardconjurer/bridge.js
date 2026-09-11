(() => {
  const SOURCE = 'cardconjurer'
  const REQUEST_TIMEOUT = 60000
  let initialized = false
  let originalSaveCard = null

  let activeBridgeId = null

  function post(type, payload = {}) {
    if (window.parent === window) return
    window.parent.postMessage({ source: SOURCE, type, ...(activeBridgeId ? { bridgeId: activeBridgeId } : {}), ...payload }, '*')
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms))
  }

  async function waitForEditor() {
    const started = Date.now()
    while (Date.now() - started < REQUEST_TIMEOUT) {
      if (window.card && window.cardCanvas && typeof window.drawCard === 'function' && typeof window.loadCard === 'function') {
        if (window.__tcbrStaticImagesReady) await window.__tcbrStaticImagesReady
        return
      }
      await delay(50)
    }
    throw new Error('O bootstrap original do CardConjurer não terminou.')
  }

  function isTransient(value) {
    return value && typeof value === 'object' && (
      (window.HTMLCanvasElement && value instanceof window.HTMLCanvasElement) ||
      (window.HTMLImageElement && value instanceof window.HTMLImageElement) ||
      (window.Element && value instanceof window.Element) ||
      (window.CanvasRenderingContext2D && value instanceof window.CanvasRenderingContext2D)
    )
  }

  function serialize(value, seen = new WeakSet()) {
    if (typeof value === 'function' || value === undefined || isTransient(value)) return undefined
    if (value && typeof value === 'object') {
      if (seen.has(value)) return undefined
      seen.add(value)
      if (Array.isArray(value)) return value.map((item) => serialize(item, seen)).filter((item) => item !== undefined)
      const output = {}
      Object.entries(value).forEach(([key, item]) => {
        if (key === 'image' || key === 'canvas' || key === 'context' || key === 'draw' || key === 'onclick') return
        const next = serialize(item, seen)
        if (next !== undefined) output[key] = next
      })
      return output
    }
    return value
  }

  function snapshot() {
    const document = serialize(window.card)
    if (!document || typeof document !== 'object') throw new Error('O documento do CardConjurer está vazio.')
    return document
  }

  function input(id, value) {
    const element = window.document.getElementById(id)
    if (element && value !== undefined && value !== null) element.value = String(value)
    return element
  }

  function setTextSlot(name, value) {
    if (window.card?.text?.[name]) window.card.text[name].text = value || ''
  }

  async function redraw() {
    if (typeof window.drawText === 'function' && window.card?.text) await window.drawText()
    else if (typeof window.drawCard === 'function') window.drawCard()
    await delay(80)
  }

  function clearFrameListPresentation() {
    const list = window.document.getElementById('frame-list')
    if (list) list.innerHTML = ''
  }

  async function waitForFramePack() {
    const started = Date.now()
    let requested = false
    while (Date.now() - started < REQUEST_TIMEOUT) {
      const button = window.document.getElementById('loadFrameVersion')
      if (button && typeof button.onclick === 'function') {
        if (Array.isArray(window.availableFrames) && window.availableFrames.length > 0) return
        if (!requested) {
          requested = true
          button.click()
        }
      }
      await delay(80)
    }
    throw new Error('O pack de frames padrão do CardConjurer não terminou de carregar.')
  }

  async function loadDefaultFramePack() {
    await waitForEditor()
    const group = window.document.getElementById('selectFrameGroup')
    const pack = window.document.getElementById('selectFramePack')
    if (group) group.value = 'Standard-3'
    if (pack) pack.value = 'M15Regular-1'
    window.availableFrames = []
    if (typeof window.loadScript === 'function') window.loadScript('/js/frames/packM15Regular-1.js')
    await waitForFramePack()
  }

  function imageReady(image) {
    return Boolean(image && image.complete && ((image.naturalWidth || image.width) > 0) && ((image.naturalHeight || image.height) > 0))
  }

  function installImageFallback(image, fallbackSource) {
    if (!image || image.__tcbrFallbackInstalled) return
    image.__tcbrFallbackInstalled = true
    const replaceBroken = () => {
      if (!String(image.src || '').includes(fallbackSource)) image.src = fallbackSource
    }
    image.addEventListener('error', replaceBroken)
    if (image.complete && image.naturalWidth === 0) replaceBroken()
  }

  function installArtFallback() {
    installImageFallback(window.art, '/img/blank.png')
  }

  function installMiscImageFallbacks() {
    installImageFallback(window.setSymbol, '/img/blank.png')
    installImageFallback(window.watermark, '/img/blank.png')
  }

  function installFrameFallbacks() {
    for (const frame of window.card?.frames || []) {
      installImageFallback(frame.image, '/img/black.png')
      for (const mask of frame.masks || []) installImageFallback(mask.image, '/img/black.png')
    }
  }

  function installManaFallbacks() {
    for (const symbol of window.mana?.values?.() || []) installImageFallback(symbol.image, '/img/blank.png')
  }

  function manaImagesReady() {
    return [...(window.mana?.values?.() || [])].every((symbol) => !symbol.image || imageReady(symbol.image) || String(symbol.image.src || '').includes('/img/blank.png'))
  }

  async function waitForRenderAssets({ requireArt = false } = {}) {
    const started = Date.now()
    while (Date.now() - started < REQUEST_TIMEOUT) {
      installArtFallback()
      installMiscImageFallbacks()
      installFrameFallbacks()
      installManaFallbacks()
      const frames = window.card?.frames || []
      const framesReady = frames.length > 0 && frames.every((frame) => imageReady(frame.image) && (frame.masks || []).every((mask) => imageReady(mask.image)))
      const artReady = !requireArt || !window.art || String(window.art.src || '').includes('/img/blank.png') || imageReady(window.art)
      if (framesReady && artReady && manaImagesReady()) return
      await delay(80)
    }
    throw new Error('As imagens do CardConjurer não terminaram de carregar.')
  }

  async function waitForTemplate() {
    const started = Date.now()
    while (Date.now() - started < REQUEST_TIMEOUT) {
      const textKeys = Object.keys(window.card?.text || {})
      if (window.card?.version && window.card?.artBounds && textKeys.includes('title') && textKeys.includes('mana') && textKeys.includes('type') && textKeys.includes('rules')) return
      await delay(80)
    }
    throw new Error('O pack padrão do CardConjurer não terminou de carregar.')
  }

  function isUsableDocument(document) {
    const textKeys = Object.keys(document?.text || {})
    return Boolean(document?.version && textKeys.includes('title') && textKeys.includes('mana') && textKeys.includes('type') && textKeys.includes('rules') && Array.isArray(document?.frames) && document.frames.length > 0)
  }

  function ensureDefaultAutoFrame() {
    const select = window.document.getElementById('autoFrame')
    if (select && select.value === 'false') select.value = 'M15Regular-1'
  }

  // CardConjurer's automatic frame mode rebuilds card.frames on every text edit.
  // The integrated editor must preserve an explicitly composed document; users
  // can still opt into this original behavior manually from the Auto Frame menu.
  function disableImplicitAutoFrame() {
    const select = window.document.getElementById('autoFrame')
    if (select) select.value = 'false'
    try { window.localStorage.setItem('autoFrame', 'false') } catch { /* local-only preference */ }
    window.autoFramePack = null
  }

  async function createBlank({ render = true } = {}) {
    await waitForEditor()
    const baseCard = window.card || {}
    baseCard.version = baseCard.version || 'm15Regular'
    baseCard.width = baseCard.width || (typeof window.getStandardWidth === 'function' ? window.getStandardWidth() : 744)
    baseCard.height = baseCard.height || (typeof window.getStandardHeight === 'function' ? window.getStandardHeight() : 1039)
    baseCard.marginX = 0
    baseCard.marginY = 0
    baseCard.text = {}
    baseCard.frames = []
    baseCard.manaSymbols = []
    baseCard.onload = undefined
    baseCard.artSource = '/img/blank.png'
    baseCard.setSymbolSource = '/img/blank.png'
    baseCard.watermarkSource = '/img/blank.png'
    window.card = baseCard
    await loadDefaultFramePack()
    const loadButton = window.document.getElementById('loadFrameVersion')
    if (!loadButton) throw new Error('O botão de carregamento do pack padrão não existe no creator original.')
    loadButton.click()
    await waitForTemplate()
    if (typeof window.uploadArt === 'function') window.uploadArt('/img/blank.png')
    if (typeof window.uploadSetSymbol === 'function') window.uploadSetSymbol('/img/blank.png')
    if (typeof window.uploadWatermark === 'function') window.uploadWatermark('/img/blank.png')
    input('art-x', 0)
    input('art-y', 0)
    input('art-zoom', 100)
    input('art-rotate', 0)
    input('setSymbol-x', 0)
    input('setSymbol-y', 0)
    input('setSymbol-zoom', 100)
    input('watermark-x', 0)
    input('watermark-y', 0)
    input('watermark-zoom', 100)
    input('watermark-opacity', 40)
    setTextSlot('title', '')
    setTextSlot('mana', '')
    setTextSlot('type', '')
    setTextSlot('rules', '')
    setTextSlot('pt', '')
    ensureDefaultAutoFrame()
    if (typeof window.autoFrame === 'function') window.autoFrame()
    disableImplicitAutoFrame()
    if (!render) return
    await waitForRenderAssets()
    await redraw()
    clearFrameListPresentation()
  }

  async function maybeFetchSetSymbol(data) {
    if (!data?.set || typeof window.fetchSetSymbol !== 'function') return
    const setCode = String(data.set).toLowerCase()
    const rarity = String(data.rarity || 'common').toLowerCase().replace('uncommon', 'u').replace('common', 'c').replace('rare', 'r').replace('mythic', 'm') || 'c'
    let candidate
    if (['sld', 'a22', 'a23', 'j22'].includes(setCode)) {
      candidate = `/img/setSymbols/custom/${setCode}-${rarity}.png`
    } else if (['cc', 'logan', 'joe'].includes(setCode)) {
      candidate = `/img/setSymbols/custom/${setCode}-${rarity}.svg`
    } else {
      const extension = ['moc', 'ltr', 'ltc', 'cmm', 'who', 'scd', 'woe', 'wot', 'woc', 'lci', 'lcc', 'mkm', 'mkc', 'otj', 'otc'].includes(setCode) ? 'png' : 'svg'
      candidate = `/img/setSymbols/official/${setCode}-${rarity}.${extension}`
    }
    try {
      const response = await window.fetch(candidate, { method: 'GET' })
      const contentType = response.headers.get('content-type') || ''
      if (response.ok && /image\/(png|svg\+xml)|application\/svg\+xml/i.test(contentType)) {
        input('set-symbol-code', setCode)
        input('set-symbol-rarity', rarity)
        window.fetchSetSymbol()
      }
    } catch {
      // The original blank set symbol remains active when the local asset is unavailable.
    }
  }

  async function loadDocument(document) {
    await waitForEditor()
    installArtFallback()
    if (isUsableDocument(document)) {
      await loadDefaultFramePack()
      await window.loadCard(document)
      await waitForRenderAssets({ requireArt: Boolean(document.artSource) })
      disableImplicitAutoFrame()
      await redraw()
      clearFrameListPresentation()
      return true
    }
    await createBlank()
    return true
  }

  function canvasData() {
    if (!window.cardCanvas) throw new Error('O canvas final do CardConjurer ainda não está disponível.')
    return window.cardCanvas.toDataURL('image/png')
  }

  async function applyArtwork(dataUrl) {
    if (!dataUrl || typeof window.uploadArt !== 'function') throw new Error('A artwork escolhida não está disponível para o editor.')
    disableImplicitAutoFrame()
    window.uploadArt(dataUrl, 'autoFit')
    await waitForRenderAssets({ requireArt: true })
    await redraw()
  }

  async function handle(message) {
    const { type, requestId, bridgeId } = message.data || {}
    if (message.data?.source !== 'tcbr-host' || !bridgeId) return
    const reply = (replyType, payload = {}) => post(replyType, { ...payload, bridgeId })
    try {
      await waitForEditor()
      if (type === 'tcbr:ping') {
        reply('tcbr:booted', { requestId })
      } else if (type === 'tcbr:init') {
        const restored = message.data.document ? await loadDocument(message.data.document) : false
        if (!restored) await createBlank()
        initialized = true
        reply('tcbr:ready', { requestId, document: snapshot(), preview: canvasData() })
      } else if (type === 'tcbr:new') {
        await createBlank()
        initialized = true
        reply('tcbr:document', { requestId, document: snapshot(), preview: canvasData() })
      } else if (type === 'tcbr:art') {
        if (!initialized) await createBlank()
        await applyArtwork(message.data.dataUrl)
        reply('tcbr:document', { requestId, document: snapshot(), preview: canvasData() })
      } else if (type === 'tcbr:save' || type === 'tcbr:render') {
        if (!initialized) await createBlank()
        await redraw()
        reply('tcbr:document', { requestId, document: snapshot(), preview: canvasData() })
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Falha no editor CardConjurer.'
      const detail = error instanceof Error && error.stack ? `${messageText} [${error.stack.split('\\n').slice(1, 3).join(' | ')}]` : messageText
      reply('tcbr:error', { requestId, message: detail })
    }
  }

  window.addEventListener('message', handle)

  const hookSave = () => {
    if (typeof window.saveCard !== 'function' || originalSaveCard) return
    originalSaveCard = window.saveCard
    window.saveCard = function (...args) {
      const result = originalSaveCard.apply(this, args)
      try { post('tcbr:document', { document: snapshot(), preview: canvasData() }) } catch { /* o host ainda pode solicitar o snapshot */ }
      return result
    }
  }

  const bootstrap = async () => {
    try {
      await waitForEditor()
      hookSave()
      post('tcbr:booted')
    } catch (error) {
      post('tcbr:error', { message: error instanceof Error ? error.message : 'Falha no bootstrap do CardConjurer.' })
    }
  }

  bootstrap()
})()
