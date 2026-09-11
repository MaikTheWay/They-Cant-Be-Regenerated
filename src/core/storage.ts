import { DEFAULT_PRINT_SETTINGS, DEFAULT_TRANSFORM, normalizeLanguage, type CardDefinition, type PrintSettings, type ProjectFile } from './models'

const PROJECT_KEY = 'tcbr-project-v1'
const RECOVERY_KEY = 'tcbr-recovery-v1'

type PersistedProject = Partial<ProjectFile> & {
  version?: number
  cards?: unknown
}

function normalizeCard(value: unknown): CardDefinition {
  const card = (value && typeof value === 'object' ? value : {}) as Partial<CardDefinition>
  const requestedRepresentation = card.activeRepresentation
  const activeRepresentation = requestedRepresentation === 'editor' && card.cardConjurerDocument
    ? 'editor'
    : requestedRepresentation === 'custom' && card.customArt?.dataUrl
      ? 'custom'
      : card.customArt?.dataUrl && card.artSource === 'custom'
        ? 'custom'
        : 'original'
  return {
    ...(card as CardDefinition),
    id: typeof card.id === 'string' ? card.id : crypto.randomUUID(),
    quantity: typeof card.quantity === 'number' && card.quantity > 0 ? card.quantity : 1,
    inputName: typeof card.inputName === 'string' ? card.inputName : card.data?.name || 'Untitled card',
    status: card.status || 'pending',
    transform: { ...DEFAULT_TRANSFORM, ...(card.transform || {}) },
    selectedLanguage: card.selectedLanguage ? normalizeLanguage(card.selectedLanguage) : card.selectedLanguage,
    activeRepresentation,
  }
}

function normalizeProject(parsed: PersistedProject): ProjectFile {
  const now = new Date().toISOString()
  return {
    version: 2,
    name: typeof parsed.name === 'string' ? parsed.name : 'Untitled project',
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
    deckText: typeof parsed.deckText === 'string' ? parsed.deckText : '',
    cards: Array.isArray(parsed.cards) ? parsed.cards.map(normalizeCard) : [],
    printSettings: { ...DEFAULT_PRINT_SETTINGS, ...(parsed.printSettings || {}) } as PrintSettings,
  }
}

export function createProject(cards: CardDefinition[] = [], name = 'Untitled project'): ProjectFile {
  const now = new Date().toISOString()
  return { version: 2, name, createdAt: now, updatedAt: now, deckText: '', cards: cards.map(normalizeCard), printSettings: { ...DEFAULT_PRINT_SETTINGS } }
}

export function saveProject(project: ProjectFile, recovery = false): ProjectFile {
  const updated = { ...normalizeProject(project), updatedAt: new Date().toISOString() }
  localStorage.setItem(recovery ? RECOVERY_KEY : PROJECT_KEY, JSON.stringify(updated))
  if (!recovery) localStorage.removeItem(RECOVERY_KEY)
  return updated
}

export function saveProjectWithRecovery(project: ProjectFile): ProjectFile {
  const updated = { ...normalizeProject(project), updatedAt: new Date().toISOString() }
  const serialized = JSON.stringify(updated)
  localStorage.setItem(RECOVERY_KEY, serialized)
  localStorage.setItem(PROJECT_KEY, serialized)
  localStorage.removeItem(RECOVERY_KEY)
  return updated
}

export function loadProject(recovery = false): ProjectFile | null {
  try {
    const raw = localStorage.getItem(recovery ? RECOVERY_KEY : PROJECT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedProject
    if (![1, 2].includes(parsed.version || 0) || !Array.isArray(parsed.cards)) return null
    return normalizeProject(parsed)
  } catch {
    return null
  }
}

export function hasRecovery(): boolean {
  return Boolean(localStorage.getItem(RECOVERY_KEY))
}

export function discardRecovery(): void {
  localStorage.removeItem(RECOVERY_KEY)
}

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(normalizeProject(project), null, 2)
}

export function parseProject(raw: string): ProjectFile {
  const parsed = JSON.parse(raw) as PersistedProject
  if (![1, 2].includes(parsed.version || 0) || !Array.isArray(parsed.cards)) throw new Error('Formato de projeto inválido.')
  return normalizeProject(parsed)
}
