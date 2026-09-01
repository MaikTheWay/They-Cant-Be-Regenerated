export type CardStatus = 'pending' | 'validated' | 'not-found' | 'ambiguous' | 'error'

export type CardLayout =
  | 'normal'
  | 'artifact'
  | 'enchantment'
  | 'planeswalker'
  | 'land'
  | 'basic-land'
  | 'transform'
  | 'modal-double-faced'
  | 'full-art'
  | 'borderless'
  | 'special'

export interface CardFace {
  name: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  flavorText?: string
  power?: string
  toughness?: string
  loyalty?: string
  artist?: string
  imageUris?: Record<string, string>
}

export interface CardIdentity {
  scryfallId?: string
  oracleId?: string
  name: string
  set?: string
  collectorNumber?: string
  language?: string
}

export interface CardPrint {
  id: string
  set: string
  setName: string
  collectorNumber: string
  language: string
  releasedAt?: string
  imageUri?: string
  displayName: string
}

export interface CardData extends CardIdentity {
  layout: CardLayout
  frame?: string
  setName?: string
  rarity?: string
  releasedAt?: string
  colors?: string[]
  colorIdentity?: string[]
  faces: CardFace[]
  imageUris?: Record<string, string>
  finishes?: string[]
  legalities?: Record<string, string>
  source: 'scryfall' | 'local'
}

export interface ArtTransform {
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  flipY: boolean
  fit: 'cover' | 'contain'
}

export interface ArtAsset {
  id: string
  fileName: string
  mimeType: string
  dataUrl: string
  width?: number
  height?: number
}

export interface CardDefinition {
  id: string
  quantity: number
  inputName: string
  status: CardStatus
  data?: CardData
  availablePrints?: CardPrint[]
  selectedPrint?: CardPrint
  selectedLanguage?: string
  selectedImageUri?: string
  artSource?: 'original' | 'custom'
  customArt?: ArtAsset
  transform: ArtTransform
  resolverMessage?: string
}

export interface PrintSettings {
  paper: 'A4' | 'Letter' | 'A3' | 'Legal' | 'Custom'
  orientation: 'portrait' | 'landscape'
  customPaperWidth: number
  customPaperHeight: number
  unit: 'mm' | 'in'
  cardWidth: number
  cardHeight: number
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  gapX: number
  gapY: number
  scale: number
  bleedEnabled: boolean
  bleed: number
  cropMarks: boolean
  cropMarkLength: number
  cropMarkOffset: number
  blackCorners: boolean
  watermarkEnabled: boolean
  watermarkText: string
  watermarkOpacity: number
  watermarkPosition: 'center' | 'bottom'
  watermarkRotation: number
  watermarkScale: number
  decklistEnabled: boolean
  skipBasicLands: boolean
}

export interface ProjectFile {
  version: 1
  name: string
  createdAt: string
  updatedAt: string
  deckText: string
  cards: CardDefinition[]
  printSettings: PrintSettings
}

export interface ParsedDeckEntry {
  quantity: number
  name: string
  set?: string
  collectorNumber?: string
  language?: string
}

export const DEFAULT_TRANSFORM: ArtTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  fit: 'cover',
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paper: 'A4',
  orientation: 'portrait',
  customPaperWidth: 210,
  customPaperHeight: 297,
  unit: 'mm',
  cardWidth: 63,
  cardHeight: 88,
  marginTop: 5,
  marginBottom: 5,
  marginLeft: 5,
  marginRight: 5,
  gapX: 0.2,
  gapY: 0.2,
  scale: 100,
  bleedEnabled: false,
  bleed: 3,
  cropMarks: true,
  cropMarkLength: 3,
  cropMarkOffset: 1,
  blackCorners: false,
  watermarkEnabled: false,
  watermarkText: 'PLAYTEST',
  watermarkOpacity: 35,
  watermarkPosition: 'center',
  watermarkRotation: -35,
  watermarkScale: 100,
  decklistEnabled: false,
  skipBasicLands: false,
}

export function getCardLayout(card: CardData): CardLayout {
  if (card.layout === 'normal' && card.faces[0]?.typeLine?.toLowerCase().includes('land')) return 'land'
  if (card.layout === 'normal' && card.faces[0]?.typeLine?.toLowerCase().includes('basic land')) return 'basic-land'
  return card.layout
}

export function getPrimaryFace(card?: CardData): CardFace | undefined {
  return card?.faces[0]
}

export function isBasicLand(card?: CardData): boolean {
  return Boolean(card && getPrimaryFace(card)?.typeLine?.toLowerCase().includes('basic land'))
}

export function imageForCard(card?: CardDefinition): string | undefined {
  return card?.customArt?.dataUrl || card?.selectedImageUri || card?.data?.imageUris?.normal || card?.data?.imageUris?.large
}

