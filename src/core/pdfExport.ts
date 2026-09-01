import { jsPDF } from 'jspdf'
import type { CardDefinition, PrintSettings } from './models'
import { imageForCard, isBasicLand } from './models'

export interface PageLayout {
  width: number
  height: number
  cardsPerPage: number
  columns: number
  rows: number
  positions: Array<{ x: number; y: number; width: number; height: number; cardIndex: number }>
  pageCount: number
}

const PAPER_SIZES: Record<PrintSettings['paper'], { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  A3: { width: 297, height: 420 },
  Legal: { width: 215.9, height: 355.6 },
  Custom: { width: 210, height: 297 },
}

function pageSize(settings: PrintSettings): { width: number; height: number } {
  const base = settings.paper === 'Custom'
    ? { width: Math.max(1, settings.customPaperWidth), height: Math.max(1, settings.customPaperHeight) }
    : PAPER_SIZES[settings.paper]
  return settings.orientation === 'portrait' ? base : { width: base.height, height: base.width }
}

export function expandCards(cards: CardDefinition[], settings: PrintSettings): CardDefinition[] {
  const expanded: CardDefinition[] = []
  for (const card of cards) {
    if (settings.skipBasicLands && isBasicLand(card.data)) continue
    for (let index = 0; index < card.quantity; index += 1) expanded.push(card)
  }
  return expanded
}

export function calculatePageLayout(cards: CardDefinition[], settings: PrintSettings): PageLayout {
  const page = pageSize(settings)
  const scale = settings.scale / 100
  const cardWidth = settings.cardWidth * scale
  const cardHeight = settings.cardHeight * scale
  const usableWidth = page.width - settings.marginLeft - settings.marginRight
  const usableHeight = page.height - settings.marginTop - settings.marginBottom
  const columns = Math.max(1, Math.floor((usableWidth + settings.gapX) / (cardWidth + settings.gapX)))
  const rows = Math.max(1, Math.floor((usableHeight + settings.gapY) / (cardHeight + settings.gapY)))
  const cardsPerPage = columns * rows
  const expanded = expandCards(cards, settings)
  const pageCount = Math.max(1, Math.ceil(expanded.length / cardsPerPage))
  const positions = Array.from({ length: cardsPerPage }, (_, slot) => {
    const column = slot % columns
    const row = Math.floor(slot / columns)
    return {
      x: settings.marginLeft + column * (cardWidth + settings.gapX),
      y: settings.marginTop + row * (cardHeight + settings.gapY),
      width: cardWidth,
      height: cardHeight,
      cardIndex: slot,
    }
  })
  return { width: page.width, height: page.height, cardsPerPage, columns, rows, positions, pageCount }
}

async function imageDataForCard(card: CardDefinition): Promise<string> {
  const source = imageForCard(card)
  if (!source) throw new Error(`Imagem original indisponível para ${card.data?.name || card.inputName}.`)
  if (source.startsWith('data:')) return source
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.crossOrigin = 'anonymous'
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error(`Não foi possível carregar a imagem original de ${card.data?.name || card.inputName}.`))
    element.src = source
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function drawCropMarks(pdf: jsPDF, x: number, y: number, width: number, height: number, settings: PrintSettings): void {
  if (!settings.cropMarks) return
  const l = settings.cropMarkLength
  const o = settings.cropMarkOffset
  pdf.setDrawColor(20, 20, 20)
  pdf.setLineWidth(.18)
  pdf.line(x - o - l, y, x - o, y)
  pdf.line(x, y - o - l, x, y - o)
  pdf.line(x + width + o, y, x + width + o + l, y)
  pdf.line(x + width, y - o - l, x + width, y - o)
  pdf.line(x - o - l, y + height, x - o, y + height)
  pdf.line(x, y + height + o, x, y + height + o + l)
  pdf.line(x + width + o, y + height, x + width + o + l, y + height)
  pdf.line(x + width, y + height + o, x + width, y + height + o + l)
}

function drawBlackCorners(pdf: jsPDF, x: number, y: number, width: number, height: number): void {
  pdf.setFillColor(8, 8, 8)
  const size = 1.7
  pdf.rect(x, y, size, size, 'F')
  pdf.rect(x + width - size, y, size, size, 'F')
  pdf.rect(x, y + height - size, size, size, 'F')
  pdf.rect(x + width - size, y + height - size, size, size, 'F')
}

export async function generatePdf(cards: CardDefinition[], settings: PrintSettings, onProgress?: (done: number, total: number) => void): Promise<{ blob: Blob; layout: PageLayout; cardCount: number }> {
  const expanded = expandCards(cards, settings)
  const layout = calculatePageLayout(cards, settings)
  const pdf = new jsPDF({ unit: 'mm', format: [layout.width, layout.height], orientation: settings.orientation })
  const rendered = new Map<string, string>()
  const total = expanded.length
  for (let index = 0; index < expanded.length; index += 1) {
    const card = expanded[index]
    const key = `${card.id}:${card.customArt?.id || card.selectedImageUri || card.data?.imageUris?.normal || 'default'}`
    if (!rendered.has(key)) rendered.set(key, await imageDataForCard(card))
    const pageIndex = Math.floor(index / layout.cardsPerPage)
    const slot = index % layout.cardsPerPage
    if (index > 0 && slot === 0) pdf.addPage([layout.width, layout.height], settings.orientation)
    const position = layout.positions[slot]
    const bleed = settings.bleedEnabled ? settings.bleed : 0
    pdf.addImage(rendered.get(key)!, 'PNG', position.x - bleed, position.y - bleed, position.width + bleed * 2, position.height + bleed * 2, key, 'FAST')
    drawCropMarks(pdf, position.x, position.y, position.width, position.height, settings)
    if (settings.blackCorners) drawBlackCorners(pdf, position.x, position.y, position.width, position.height)
    onProgress?.(index + 1, total)
    void pageIndex
  }
  if (settings.watermarkEnabled) {
    for (let page = 1; page <= layout.pageCount; page += 1) {
      pdf.setPage(page)
      const watermarkTone = 255 - Math.round((255 - 60) * (settings.watermarkOpacity / 100))
      pdf.setTextColor(watermarkTone, watermarkTone, watermarkTone)
      pdf.setFontSize(18 * (settings.watermarkScale / 100))
      pdf.text(settings.watermarkText, layout.width / 2, settings.watermarkPosition === 'bottom' ? layout.height - 12 : layout.height / 2, { angle: settings.watermarkRotation, align: 'center' })
    }
  }
  if (settings.decklistEnabled) {
    pdf.addPage([layout.width, layout.height], settings.orientation)
    pdf.setTextColor(20, 20, 20)
    pdf.setFontSize(10)
    pdf.text('DECKLIST', 15, 18)
    let y = 26
    for (const card of cards) {
      if (settings.skipBasicLands && isBasicLand(card.data)) continue
      pdf.text(`${card.quantity}x ${card.data?.name || card.inputName}`, 15, y)
      y += 5
      if (y > layout.height - 15) break
    }
  }
  return { blob: pdf.output('blob'), layout, cardCount: total }
}

export async function validatePdfBlob(blob: Blob, expected: { layout: PageLayout; cardCount: number }): Promise<{ valid: boolean; messages: string[] }> {
  const messages: string[] = []
  if (blob.size < 1000) messages.push('O arquivo PDF gerado está vazio ou incompleto.')
  if (expected.cardCount === 0) messages.push('Nenhuma carta elegível para exportação.')
  if (expected.layout.pageCount < 1) messages.push('A paginação calculada é inválida.')
  if (!messages.length) messages.push(`${expected.cardCount} carta(s) posicionada(s) em ${expected.layout.pageCount} página(s).`)
  return { valid: messages.length === 1 && messages[0].includes('posicionada'), messages }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}


export const PrintLayoutEngine = {
  calculate: calculatePageLayout,
  expand: expandCards,
}
