import type { ParsedDeckEntry } from './models'

const COMMENT_PREFIXES = ['#', '//', ';']

function normalizeLine(line: string): string {
  return line
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u00a0]/g, ' ')
    .trim()
}

function normalizeDeckLanguage(value: string): string | undefined {
  const normalized = value.trim().toLocaleLowerCase().replace('_', '-')
  if (['pt', 'pt-br', 'por', 'portuguese', 'portugues', 'português'].includes(normalized)) return 'pt'
  if (/^[a-z]{2}$/.test(normalized)) return normalized
  return undefined
}

function parseBracketMetadata(raw: string): { name: string; set?: string; collectorNumber?: string; language?: string } {
  const metadata: { name: string; set?: string; collectorNumber?: string; language?: string } = { name: raw.trim() }
  const groups = [...raw.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim())
  metadata.name = raw.replace(/\[[^\]]+\]/g, '').trim()

  for (const group of groups) {
    const parts = group.split(/[\s,|/]+/).filter(Boolean)
    if (parts.length === 1) {
      const language = normalizeDeckLanguage(parts[0])
      if (language) metadata.language = language
      else if (/^[a-z0-9]{2,6}$/i.test(parts[0])) metadata.set = parts[0].toLowerCase()
    } else if (parts.length >= 2 && /^[a-z0-9]{2,6}$/i.test(parts[0])) {
      metadata.set = parts[0].toLowerCase()
      metadata.collectorNumber = parts.slice(1).join(' ')
    }
  }
  return metadata
}

export function parseDeckText(input: string): ParsedDeckEntry[] {
  const entries: ParsedDeckEntry[] = []
  const lines = input.replace(/^\uFEFF/, '').split(/\r?\n/)

  for (const original of lines) {
    const line = normalizeLine(original)
    if (!line || COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix))) continue
    if (/^(sideboard|commander|deck|mainboard|companion|maybeboard)\s*:?$/i.test(line)) continue

    const match = line.match(/^(\d+)\s*[xX*]?\s+(.+)$/)
    const quantity = match ? Math.max(1, Number(match[1])) : 1
    const rawName = match ? match[2].trim() : line
    const metadata = parseBracketMetadata(rawName)

    // Accept common export formats: "Name (SET) 123", "Name [SET 123]", "Name // Face".
    const parenthetical = metadata.name.match(/\s*\(([A-Za-z0-9]{2,6})\)\s*(\S+)?$/)
    if (parenthetical) {
      metadata.set = metadata.set || parenthetical[1].toLowerCase()
      metadata.collectorNumber = metadata.collectorNumber || parenthetical[2]
      metadata.name = metadata.name.slice(0, parenthetical.index).trim()
    }
    const trailingSet = metadata.name.match(/\s+([A-Z0-9]{2,6})\s+(\d+[A-Za-z]?)$/)
    if (trailingSet) {
      metadata.set = metadata.set || trailingSet[1].toLowerCase()
      metadata.collectorNumber = metadata.collectorNumber || trailingSet[2]
      metadata.name = metadata.name.slice(0, trailingSet.index).trim()
    }

    if (metadata.name) entries.push({ quantity, ...metadata })
  }

  return entries
}

export function aggregateEntries(entries: ParsedDeckEntry[]): ParsedDeckEntry[] {
  const map = new Map<string, ParsedDeckEntry>()
  for (const entry of entries) {
    const key = `${entry.name.toLocaleLowerCase()}|${entry.set || ''}|${entry.collectorNumber || ''}|${entry.language || ''}`
    const previous = map.get(key)
    if (previous) previous.quantity += entry.quantity
    else map.set(key, { ...entry })
  }
  return [...map.values()]
}

export function totalCards(entries: ParsedDeckEntry[]): number {
  return entries.reduce((total, entry) => total + entry.quantity, 0)
}
