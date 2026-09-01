import { describe, expect, it } from 'vitest'
import { aggregateEntries, parseDeckText, totalCards } from './deckParser'
import { calculatePageLayout, expandCards } from './pdfExport'
import { DEFAULT_PRINT_SETTINGS, type CardDefinition } from './models'

describe('deck parser', () => {
  it('parses quantity, comments, set metadata and common separators', () => {
    const entries = parseDeckText(`4 Sol Ring\n# comment\n1 Arcane Signet [CMM 324]\nCommand Tower (CMM) 398`)
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({ quantity: 4, name: 'Sol Ring' })
    expect(entries[1]).toMatchObject({ quantity: 1, name: 'Arcane Signet', set: 'cmm', collectorNumber: '324' })
    expect(entries[2]).toMatchObject({ quantity: 1, name: 'Command Tower', set: 'cmm', collectorNumber: '398' })
  })

  it('aggregates duplicate definitions without losing quantity', () => {
    const entries = aggregateEntries(parseDeckText('2 Sol Ring\n3 Sol Ring'))
    expect(entries).toHaveLength(1)
    expect(entries[0].quantity).toBe(5)
    expect(totalCards(entries)).toBe(5)
  })
})

describe('print layout', () => {
  const card: CardDefinition = { id: 'one', quantity: 4, inputName: 'Sol Ring', status: 'validated', selectedImageUri: 'data:image/png;base64,test', transform: { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false, fit: 'cover' } }

  it('calculates a stable A4 grid from physical dimensions', () => {
    const layout = calculatePageLayout([card], DEFAULT_PRINT_SETTINGS)
    expect(layout.width).toBe(210)
    expect(layout.height).toBe(297)
    expect(layout.columns).toBe(3)
    expect(layout.rows).toBe(3)
    expect(layout.cardsPerPage).toBe(9)
    expect(layout.pageCount).toBe(1)
    expect(layout.positions[0]).toMatchObject({ x: 5, y: 5, width: 63, height: 88 })
  })

  it('expands quantities and skips basic lands when requested', () => {
    const basic: CardDefinition = { ...card, id: 'basic', quantity: 2, data: { name: 'Forest', layout: 'basic-land', faces: [{ name: 'Forest', typeLine: 'Basic Land — Forest' }], source: 'local' } }
    expect(expandCards([card, basic], DEFAULT_PRINT_SETTINGS)).toHaveLength(6)
    expect(expandCards([card, basic], { ...DEFAULT_PRINT_SETTINGS, skipBasicLands: true })).toHaveLength(4)
  })

  it('uses custom paper dimensions instead of silently falling back to A4', () => {
    const layout = calculatePageLayout([card], { ...DEFAULT_PRINT_SETTINGS, paper: 'Custom', customPaperWidth: 100, customPaperHeight: 120 })
    expect(layout.width).toBe(100)
    expect(layout.height).toBe(120)
    expect(layout.columns).toBe(1)
    expect(layout.rows).toBe(1)
  })
})

