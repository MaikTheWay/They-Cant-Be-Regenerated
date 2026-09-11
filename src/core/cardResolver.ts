import { normalizeLanguage, type CardData, type CardDefinition, type CardPrint, type CardStatus, type ParsedDeckEntry } from './models'

const API_ROOT = 'https://api.scryfall.com'
const CARD_CACHE_KEY = 'tcbr-card-cache-v2'
const PRINT_CACHE_KEY = 'tcbr-print-cache-v2'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 30
const REQUEST_TIMEOUT = 9000

type ScryfallCard = {
  id: string
  oracle_id?: string
  name: string
  lang?: string
  set?: string
  set_name?: string
  collector_number?: string
  layout?: string
  frame?: string
  rarity?: string
  released_at?: string
  colors?: string[]
  color_identity?: string[]
  image_uris?: Record<string, string>
  card_faces?: Array<{
    name: string
    mana_cost?: string
    type_line?: string
    oracle_text?: string
    flavor_text?: string
    power?: string
    toughness?: string
    loyalty?: string
    artist?: string
    image_uris?: Record<string, string>
  }>
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  flavor_text?: string
  power?: string
  toughness?: string
  loyalty?: string
  artist?: string
  finishes?: string[]
  legalities?: Record<string, string>
}

type ScryfallSearchResponse = {
  data?: ScryfallCard[]
  has_more?: boolean
  next_page?: string
}

const inflight = new Map<string, Promise<ScryfallCard | null>>()
const inflightPrints = new Map<string, Promise<CardPrint[]>>()
let requestQueue = Promise.resolve()
let nextRequestAt = 0

function readCache<T>(key: string): Record<string, { savedAt: number; value: T }> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, { savedAt: number; value: T }>
  } catch {
    return {}
  }
}

function writeCache<T>(key: string, cacheKey: string, value: T): void {
  try {
    const cache = readCache<T>(key)
    cache[cacheKey] = { savedAt: Date.now(), value }
    localStorage.setItem(key, JSON.stringify(cache))
  } catch {
    // A full localStorage must never turn a successful resolution into an error.
  }
}

function normalize(value = ''): string {
  return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function mapLayout(layout?: string, typeLine?: string): CardData['layout'] {
  if (layout === 'transform' || layout === 'double_faced_token') return 'transform'
  if (layout === 'modal_dfc') return 'modal-double-faced'
  if (layout === 'planeswalker') return 'planeswalker'
  if (layout === 'art_series') return 'special'
  if (layout === 'full_art') return 'full-art'
  if (layout === 'borderless') return 'borderless'
  const type = (typeLine || '').toLowerCase()
  if (type.includes('land')) return type.includes('basic') ? 'basic-land' : 'land'
  if (type.includes('artifact')) return 'artifact'
  if (type.includes('enchantment')) return 'enchantment'
  return 'normal'
}

function toCardData(card: ScryfallCard): CardData {
  const faceSource = card.card_faces?.length
    ? card.card_faces
    : [{
        name: card.name,
        mana_cost: card.mana_cost,
        type_line: card.type_line,
        oracle_text: card.oracle_text,
        flavor_text: card.flavor_text,
        power: card.power,
        toughness: card.toughness,
        loyalty: card.loyalty,
        artist: card.artist,
        image_uris: card.image_uris,
      }]
  return {
    scryfallId: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    set: card.set,
    collectorNumber: card.collector_number,
    language: card.lang,
    layout: mapLayout(card.layout, faceSource[0].type_line),
    frame: card.frame,
    setName: card.set_name,
    rarity: card.rarity,
    releasedAt: card.released_at,
    colors: card.colors,
    colorIdentity: card.color_identity,
    imageUris: card.image_uris || faceSource[0].image_uris,
    finishes: card.finishes,
    legalities: card.legalities,
    source: 'scryfall',
    faces: faceSource.map((face) => ({
      name: face.name,
      manaCost: face.mana_cost,
      typeLine: face.type_line,
      oracleText: face.oracle_text,
      flavorText: face.flavor_text,
      power: face.power,
      toughness: face.toughness,
      loyalty: face.loyalty,
      artist: face.artist,
      imageUris: face.image_uris,
    })),
  }
}

function toPrint(card: ScryfallCard): CardPrint {
  return {
    id: card.id,
    set: card.set || '',
    setName: card.set_name || card.set?.toUpperCase() || 'Unknown set',
    collectorNumber: card.collector_number || '',
    language: card.lang || 'en',
    releasedAt: card.released_at,
    imageUri: card.image_uris?.normal || card.image_uris?.large,
    displayName: `${card.set_name || card.set?.toUpperCase() || 'Unknown set'} (${card.collector_number || '—'})`,
  }
}

function resolverKey(entry: ParsedDeckEntry): string {
  return [normalize(entry.name), entry.set || '', entry.collectorNumber || '', entry.language || ''].join('|')
}

async function requestJson<T>(url: string): Promise<{ ok: boolean; status: number; value?: T }> {
  const scheduled = requestQueue.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now())
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
    nextRequestAt = Date.now() + 500
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      })
      let value: T | undefined
      try { value = await response.json() as T } catch { value = undefined }
      return { ok: response.ok, status: response.status, value }
    } catch {
      throw new Error('Unable to resolve card: network unavailable or request timed out.')
    }
  })
  requestQueue = scheduled.then(() => undefined, () => undefined)
  return scheduled
}

async function fetchCard(entry: ParsedDeckEntry): Promise<ScryfallCard | null> {
  const key = resolverKey(entry)
  const cached = readCache<ScryfallCard>(CARD_CACHE_KEY)[key]
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached.value
  if (inflight.has(key)) return inflight.get(key)!

  const task = (async () => {
    if (entry.set && entry.collectorNumber) {
      const exact = await requestJson<ScryfallCard>(`${API_ROOT}/cards/${encodeURIComponent(entry.set)}/${encodeURIComponent(entry.collectorNumber)}`)
      if (exact.ok && exact.value) {
        writeCache(CARD_CACHE_KEY, key, exact.value)
        return exact.value
      }
      if (exact.status >= 500) throw new Error('Unable to resolve card: the card data provider returned a server error.')
    }
    const params = new URLSearchParams({ fuzzy: entry.name })
    const fuzzy = await requestJson<ScryfallCard>(`${API_ROOT}/cards/named?${params.toString()}`)
    if (fuzzy.ok && fuzzy.value) {
      writeCache(CARD_CACHE_KEY, key, fuzzy.value)
      return fuzzy.value
    }
    if (fuzzy.status >= 500) throw new Error('Unable to resolve card: the card data provider returned a server error.')
    return null
  })().finally(() => inflight.delete(key))
  inflight.set(key, task)
  return task
}

async function fetchPrints(card: ScryfallCard): Promise<CardPrint[]> {
  const oracleId = card.oracle_id
  if (!oracleId) return [toPrint(card)]
  const cacheKey = oracleId
  const cached = readCache<CardPrint[]>(PRINT_CACHE_KEY)[cacheKey]
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached.value
  if (inflightPrints.has(cacheKey)) return inflightPrints.get(cacheKey)!

  const task = (async () => {
    const query = `oracleid:${oracleId}`
    const response = await requestJson<ScryfallSearchResponse>(`${API_ROOT}/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`)
    if (!response.ok || !response.value?.data?.length) return [toPrint(card)]
    const prints = response.value.data.map(toPrint)
    // Scryfall paginates large oracleId result sets and the first page is not
    // guaranteed to contain a translated printing. Fetch Portuguese only when
    // it is absent so the Stage 2 language control remains functional without
    // multiplying requests for every supported language.
    if (!prints.some((print) => normalizeLanguage(print.language) === 'pt')) {
      try {
        const portuguese = await requestJson<ScryfallSearchResponse>(`${API_ROOT}/cards/search?q=${encodeURIComponent(`${query} lang:pt`)}&unique=prints&order=released&dir=desc`)
        if (portuguese.ok && portuguese.value?.data?.length) prints.push(...portuguese.value.data.map(toPrint))
      } catch {
        // Portuguese is an enhancement; a transient secondary request must not
        // turn an otherwise valid official card into an unresolved definition.
      }
    }
    const deduped = [...new Map(prints.map((print) => [print.id, print])).values()]
    writeCache(PRINT_CACHE_KEY, cacheKey, deduped)
    return deduped
  })().catch(() => [toPrint(card)]).finally(() => inflightPrints.delete(cacheKey))
  inflightPrints.set(cacheKey, task)
  return task
}

function selectInitialPrint(prints: CardPrint[], entry: ParsedDeckEntry, data: CardData): CardPrint | undefined {
  return prints.find((print) => entry.set && entry.collectorNumber && print.set === entry.set && print.collectorNumber === entry.collectorNumber)
    || prints.find((print) => entry.language && normalizeLanguage(print.language) === normalizeLanguage(entry.language))
    || prints.find((print) => print.id === data.scryfallId)
    || prints[prints.length - 1]
}

export async function resolveEntry(entry: ParsedDeckEntry): Promise<{ status: CardStatus; data?: CardData; prints?: CardPrint[]; selectedPrint?: CardPrint; message?: string }> {
  try {
    const card = await fetchCard(entry)
    if (!card) return { status: 'not-found', message: 'Card not found. The original line was kept.' }
    const data = toCardData(card)
    const prints = await fetchPrints(card)
    const selectedPrint = selectInitialPrint(prints, entry, data)
    if (entry.set && data.set && entry.set.toLowerCase() !== data.set.toLowerCase() && !prints.some((print) => print.set === entry.set)) {
      return { status: 'ambiguous', data, prints, selectedPrint, message: `Multiple cards matched, but set ${entry.set.toUpperCase()} was not found.` }
    }
    return { status: 'validated', data, prints, selectedPrint }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Unable to resolve card.' }
  }
}

export async function resolveDeck(entries: ParsedDeckEntry[], onProgress?: (done: number, total: number) => void): Promise<CardDefinition[]> {
  let done = 0
  const results: CardDefinition[] = []
  const queue = [...entries]
  const workers = Array.from({ length: Math.min(5, Math.max(1, queue.length)) }, async () => {
    while (queue.length) {
      const entry = queue.shift()!
      const result = await resolveEntry(entry)
      results.push({
        id: crypto.randomUUID(),
        quantity: entry.quantity,
        inputName: entry.name,
        status: result.status,
        data: result.data,
        availablePrints: result.prints,
        selectedPrint: result.selectedPrint,
        selectedLanguage: normalizeLanguage(result.selectedPrint?.language || result.data?.language || entry.language || 'en'),
        selectedImageUri: result.selectedPrint?.imageUri || result.data?.imageUris?.normal,
        artSource: 'original',

        transform: { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false, fit: 'cover' },
        resolverMessage: result.message,
      })
      done += 1
      onProgress?.(done, entries.length)
    }
  })
  await Promise.all(workers)
  return results.sort((a, b) => a.inputName.localeCompare(b.inputName))
}

export function clearCardCache(): void {
  localStorage.removeItem(CARD_CACHE_KEY)
  localStorage.removeItem(PRINT_CACHE_KEY)
  localStorage.removeItem('tcbr-print-cache-v1')
  localStorage.removeItem('tcbr-community-artwork-index-v1')
}
