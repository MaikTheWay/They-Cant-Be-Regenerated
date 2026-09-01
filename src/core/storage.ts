import type { CardDefinition, ProjectFile, PrintSettings } from './models'
import { DEFAULT_PRINT_SETTINGS } from './models'

const PROJECT_KEY = 'tcbr-project-v1'
const RECOVERY_KEY = 'tcbr-recovery-v1'

export function createProject(cards: CardDefinition[] = [], name = 'Untitled project'): ProjectFile {
  const now = new Date().toISOString()
  return { version: 1, name, createdAt: now, updatedAt: now, deckText: '', cards, printSettings: { ...DEFAULT_PRINT_SETTINGS } }
}

export function saveProject(project: ProjectFile, recovery = false): ProjectFile {
  const updated = { ...project, updatedAt: new Date().toISOString() }
  localStorage.setItem(recovery ? RECOVERY_KEY : PROJECT_KEY, JSON.stringify(updated))
  if (!recovery) localStorage.removeItem(RECOVERY_KEY)
  return updated
}

export function loadProject(recovery = false): ProjectFile | null {
  try {
    const raw = localStorage.getItem(recovery ? RECOVERY_KEY : PROJECT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ProjectFile
    if (parsed.version !== 1 || !Array.isArray(parsed.cards)) return null
    return {
      ...parsed,
      deckText: typeof parsed.deckText === 'string' ? parsed.deckText : '',
      printSettings: { ...DEFAULT_PRINT_SETTINGS, ...(parsed.printSettings || {}) } as PrintSettings,
    }
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
  return JSON.stringify(project, null, 2)
}

export function parseProject(raw: string): ProjectFile {
  const parsed = JSON.parse(raw) as ProjectFile
  if (parsed.version !== 1 || !Array.isArray(parsed.cards)) throw new Error('Formato de projeto inválido.')
  return { ...parsed, deckText: typeof parsed.deckText === 'string' ? parsed.deckText : '', printSettings: { ...DEFAULT_PRINT_SETTINGS, ...parsed.printSettings } as PrintSettings }
}

