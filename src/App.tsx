import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileDown,
  FolderOpen,
  ImagePlus,
  Layers3,
  Loader2,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react'
import { parseDeckText, aggregateEntries, totalCards } from './core/deckParser'
import { compactPreviewDataUrl, type CardConjurerResult } from './core/cardConjurerAdapter'
import CardConjurerEditor from './components/CardConjurerEditor'
import CardConjurerRenderHost, { type CardConjurerRenderHandle } from './components/CardConjurerRenderHost'
import { clearCardCache, resolveDeck } from './core/cardResolver'
import { calculatePageLayout, downloadBlob, generatePdf, validatePdfBlob } from './core/pdfExport'
import {
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_TRANSFORM,
  imageForCard,
  isBasicLand,
  normalizeLanguage,
  type ArtAsset,
  type CardDefinition,
  type CardPrint,
  type ProjectFile,
  type PrintSettings,
} from './core/models'
import { createProject, discardRecovery, hasRecovery, loadProject, parseProject, saveProject, saveProjectWithRecovery, serializeProject } from './core/storage'
import './styles/app.css'

type Step = 1 | 2 | 3

const SAMPLE_DECK = `1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n1 Tergrid, God of Fright`

function statusLabel(status: CardDefinition['status']): string {
  return ({ pending: 'PENDING', validated: 'FOUND', 'not-found': 'NOT_FOUND', ambiguous: 'AMBIGUOUS', error: 'ERROR' })[status]
}

function statusClass(status: CardDefinition['status']): string {
  return ({ pending: 'pending', validated: 'validated', 'not-found': 'warning', ambiguous: 'warning', error: 'error' })[status]
}

function cardTitle(card: CardDefinition): string {
  return card.data?.name || card.inputName
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function applyPrint(card: CardDefinition, print?: CardPrint): CardDefinition {
  if (!print) return card
  return { ...card, selectedPrint: print, selectedLanguage: normalizeLanguage(print.language), selectedImageUri: print.imageUri || card.data?.imageUris?.normal, artSource: 'original', activeRepresentation: 'original' }
}

function printsForLanguage(card: CardDefinition, language: string): CardPrint[] {
  return (card.availablePrints || []).filter((print) => normalizeLanguage(print.language) === normalizeLanguage(language))
}

function OriginalCardPreview({ card, compact = false }: { card: CardDefinition; compact?: boolean }) {
  const image = imageForCard(card)
  return <div className={`original-card-preview ${compact ? 'compact' : ''}`}>{image ? <img src={image} alt={cardTitle(card)} /> : <div className="original-preview-empty"><ImagePlus size={18} /><span>Original image unavailable</span></div>}</div>
}

function StatusPill({ status }: { status: CardDefinition['status'] }) {
  return <span className={`status-pill ${statusClass(status)}`}><span className="status-dot" />{statusLabel(status)}</span>
}

function EmptyState({ icon: Icon, title, description, children }: { icon: typeof Upload; title: string; description: string; children?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24} /></div><h3>{title}</h3><p>{description}</p>{children}</div>
}

function App() {
  const [project, setProject] = useState<ProjectFile>(() => loadProject() || createProject())
  const [activeStep, setActiveStep] = useState<Step>(1)
  const [deckText, setDeckText] = useState(() => loadProject()?.deckText || '')
  const [isResolving, setIsResolving] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'validated' | 'issues'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [editorCardId, setEditorCardId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ done: 0, total: 0 })
  const [recoveryAvailable] = useState(() => hasRecovery())
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const artInput = useRef<HTMLInputElement>(null)
  const cardConjurerRenderRef = useRef<CardConjurerRenderHandle>(null)
  const compactPreviewCache = useRef<{ source: string; compact: string } | null>(null)

  const cards = project.cards
  const validated = cards.length > 0 && cards.every((card) => card.status === 'validated')
  const total = cards.reduce((sum, card) => sum + card.quantity, 0)
  const selectedCard = cards.find((card) => card.id === selectedCardId) || cards[0]
  const pageLayout = useMemo(() => calculatePageLayout(cards, project.printSettings), [cards, project.printSettings])

  const filteredCards = useMemo(() => cards.filter((card) => {
    const matchesSearch = !search || cardTitle(card).toLocaleLowerCase().includes(search.toLocaleLowerCase()) || card.data?.setName?.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'validated' && card.status === 'validated') || (filter === 'issues' && card.status !== 'validated')
    return matchesSearch && matchesFilter
  }), [cards, filter, search])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      try {
        saveProjectWithRecovery(project)
        setDirty(false)
      } catch {
        setToast('Não foi possível salvar automaticamente. Exporte o projeto para manter uma cópia.')
      }
    }, 800)
    return () => window.clearTimeout(timer)
  }, [dirty, project])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (event.shiftKey) saveProjectFile()
        else saveNow()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [project])

  function updateProject(updater: (current: ProjectFile) => ProjectFile): void {
    setProject((current) => updater(current))
    setDirty(true)
  }

  function updateDeckText(value: string): void {
    setDeckText(value)
    updateProject((current) => ({ ...current, deckText: value }))
  }

  function updateCard(id: string, updater: (card: CardDefinition) => CardDefinition): void {
    updateProject((current) => ({ ...current, cards: current.cards.map((card) => card.id === id ? updater(card) : card) }))
  }

  function openEditor(cardId: string): void {
    setSelectedCardId(cardId)
    setEditorCardId(cardId)
  }

  function closeEditor(): void {
    setEditorCardId(null)
  }

  async function commitCardConjurer(cardId: string, result: CardConjurerResult): Promise<void> {
    const compactPreview = compactPreviewCache.current?.source === result.preview
      ? compactPreviewCache.current.compact
      : await compactPreviewDataUrl(result.preview)
    compactPreviewCache.current = { source: result.preview, compact: compactPreview }
    updateCard(cardId, (card) => ({
      ...card,
      activeRepresentation: 'editor',
      cardConjurerDocument: result.document,
      editorPreviewDataUrl: compactPreview,
      editorPreviewUpdatedAt: new Date().toISOString(),
    }))
    setToast(`Documento CardConjurer salvo para ${cardTitle(cards.find((card) => card.id === cardId) || { inputName: 'carta' } as CardDefinition)}.`)
  }

  function setOriginalRepresentation(cardId: string): void {
    updateCard(cardId, (card) => ({ ...card, activeRepresentation: 'original' }))
  }

  function removeBlankCard(cardId: string): void {
    const card = cards.find((item) => item.id === cardId)
    if (!card || card.inputName !== 'Blank Card') return
    updateProject((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== cardId) }))
    setSelectedCardId(null)
    setToast('Blank Card removida.')
  }

  function createBlankCard(): void {
    const blank: CardDefinition = {
      id: crypto.randomUUID(),
      quantity: 1,
      inputName: 'Blank Card',
      status: 'validated',
      data: { name: 'Blank Card', layout: 'normal', faces: [{ name: 'Blank Card' }], source: 'local' },
      selectedImageUri: '/img/blank.png',
      artSource: 'original',
      activeRepresentation: 'original',
      transform: { ...DEFAULT_TRANSFORM },
    }
    updateProject((current) => ({ ...current, cards: [...current.cards, blank] }))
    setSelectedCardId(blank.id)
    setActiveStep(2)
    setToast('Blank Card adicionada. Entre no editor para construir a carta do zero.')
  }

  async function importDeck(text: string): Promise<void> {
    updateDeckText(text)
    const entries = aggregateEntries(parseDeckText(text))
    if (!entries.length) {
      setToast('Nenhuma carta reconhecida. Use uma linha por carta, por exemplo: 4 Sol Ring.')
      return
    }
    setIsResolving(true)
    setProgress({ done: 0, total: entries.length })
    try {
      const resolved = await resolveDeck(entries, (done, totalEntries) => setProgress({ done, total: totalEntries }))
      updateProject((current) => ({ ...current, cards: resolved, name: current.name === 'Untitled project' ? 'New deck project' : current.name }))
      setSelectedIds([])
      setToast(`${totalCards(entries)} carta(s) importada(s); ${resolved.filter((card) => card.status === 'validated').length}/${resolved.length} resolvida(s).`)
    } finally {
      setIsResolving(false)
    }
  }

  function onDeckFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then(importDeck).catch(() => setToast('Não foi possível ler esse arquivo.'))
    event.target.value = ''
  }

  function onDeckDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file) file.text().then(importDeck).catch(() => setToast('Não foi possível ler esse arquivo.'))
  }

  function saveNow(): void {
    try {
      saveProject(project)
      setDirty(false)
      setToast('Projeto salvo localmente.')
    } catch {
      setToast('Falha ao salvar. Reduza o tamanho das imagens incorporadas ou exporte o projeto.')
    }
  }

  async function saveProjectFile(): Promise<void> {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' })
    const suggestedName = `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'project'}.tcbgr.json`
    const picker = (window as Window & { showSaveFilePicker?: (options?: unknown) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker
    if (picker) {
      try {
        const handle = await picker({ suggestedName, types: [{ description: 'TCBR project', accept: { 'application/json': ['.tcbgr.json', '.json'] } }] })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        setDirty(false)
        setToast('Projeto salvo no local escolhido.')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = suggestedName
    anchor.click()
    URL.revokeObjectURL(url)
    setToast('Projeto baixado. O navegador definiu a pasta de destino.')
  }

  function onProjectFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return
    file.text().then((raw) => {
      try {
        const next = parseProject(raw)
        setProject(next)
        setDeckText(next.deckText)
        setDirty(false)
        setActiveStep(1)
        setToast('Projeto carregado.')
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Projeto inválido.')
      }
    }).catch(() => setToast('Não foi possível ler o projeto.'))
    event.target.value = ''
  }

  function toggleCardSelection(id: string): void {
    setSelectedIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id])
  }

  function toggleAllCards(): void {
    setSelectedIds((current) => current.length === cards.length ? [] : cards.map((card) => card.id))
  }

  function selectPrint(cardId: string, printId: string): void {
    const card = cards.find((item) => item.id === cardId)
    const print = card?.availablePrints?.find((item) => item.id === printId)
    if (print) updateCard(cardId, (current) => applyPrint(current, print))
  }

  function selectLanguage(cardId: string, language: string): void {
    if (!language.trim()) return
    const card = cards.find((item) => item.id === cardId)
    const print = card?.availablePrints?.find((item) => normalizeLanguage(item.language) === normalizeLanguage(language))
    if (print) updateCard(cardId, (current) => applyPrint(current, print))
    else setToast(`Nenhuma impressão em ${languageLabel(language)} foi encontrada para esta carta.`)
  }

  function applyBulkLanguage(language: string): void {
    updateProject((current) => ({ ...current, cards: current.cards.map((card) => selectedIds.includes(card.id) ? applyPrint(card, printsForLanguage(card, language)[0]) : card) }))
    setToast(`Idioma aplicado a ${selectedIds.length} definição(ões) quando disponível.`)
  }

  function applyBulkPrint(printId: string): void {
    updateProject((current) => ({ ...current, cards: current.cards.map((card) => selectedIds.includes(card.id) ? applyPrint(card, card.availablePrints?.find((print) => print.id === printId)) : card) }))
    setToast(`Print aplicado a ${selectedIds.length} definição(ões) quando disponível.`)
  }

  async function onArtFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file || !selectedCard) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setToast('Use PNG, JPG/JPEG ou WEBP.'); return }
    if (file.size > 20 * 1024 * 1024) { setToast('A imagem excede o limite local de 20 MB.'); return }
    const dataUrl = await readFileAsDataUrl(file)
    const dimensions = await readImageDimensions(dataUrl)
    const asset: ArtAsset = { id: crypto.randomUUID(), fileName: file.name, mimeType: file.type, dataUrl, width: dimensions.width, height: dimensions.height }
    updateCard(selectedCard.id, (card) => ({ ...card, customArt: { ...asset, sourceType: 'local' }, selectedImageUri: undefined, artSource: 'custom', activeRepresentation: 'custom', transform: { ...DEFAULT_TRANSFORM } }))
    setToast(`Arte própria adicionada para ${cardTitle(selectedCard)}.`)
    event.target.value = ''
  }

  function clearCache(): void {
    clearCardCache()
    setToast('Cache de cartas e impressões removido. Novas consultas usarão dados atualizados.')
  }

  function updatePrint<K extends keyof PrintSettings>(key: K, value: PrintSettings[K]): void {
    updateProject((current) => ({ ...current, printSettings: { ...DEFAULT_PRINT_SETTINGS, ...current.printSettings, [key]: value } }))
  }

  async function exportPdf(): Promise<void> {
    if (!validated) {
      setToast('Resolva todas as cartas antes de exportar.')
      return
    }
    setExporting(true)
    setExportProgress({ done: 0, total })
    try {
      const result = await generatePdf(cards, project.printSettings, (done, totalCards) => setExportProgress({ done, total: totalCards }), async (card) => {
        if (!cardConjurerRenderRef.current) throw new Error('O renderer CardConjurer ainda não está pronto.')
        return cardConjurerRenderRef.current.render(card)
      })
      const validation = await validatePdfBlob(result.blob, result)
      if (!validation.valid) {
        setToast(`PDF rejeitado: ${validation.messages.join(' ')}`)
        return
      }
      downloadBlob(result.blob, `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'deck'}-print.pdf`)
      setToast(`PDF validado: ${validation.messages[0]}`)
    } catch (error) {
      setToast(error instanceof Error ? `Falha na exportação: ${error.message}` : 'Falha na exportação do PDF.')
    } finally {
      setExporting(false)
    }
  }

  function restoreRecovery(): void {
    const recovered = loadProject(true)
    if (!recovered) return
    setProject(recovered)
    setDeckText(recovered.deckText)
    discardRecovery()
    setToast('Recovery restaurado.')
  }

  return (
    <div className="app-shell">
      <header className="topbar"><h1 className="site-title">THEY CAN'T BE REGENERATED</h1></header>

      <div className="stepbar">
        <div className="stepbar-inner">
          <StepNav step={1} activeStep={activeStep} label="Import & Validate" detail={cards.length ? `${cards.length} definitions · ${total} cards` : 'Deck source'} onClick={() => setActiveStep(1)} />
          <div className="step-connector" />
          <StepNav step={2} activeStep={activeStep} label="Customize Art" detail={validated ? 'Ready to edit' : 'Locked until validation'} locked={!validated} onClick={() => validated && setActiveStep(2)} />
          <div className="step-connector" />
          <StepNav step={3} activeStep={activeStep} label="Print & Export" detail={validated ? 'Ready to print' : 'Locked until validation'} locked={!validated} onClick={() => validated && setActiveStep(3)} />
        </div>
      </div>

      <div className="workspace workspace-full">
        <main className="main-content">
          {activeStep === 1 && <ImportStep deckText={deckText} setDeckText={updateDeckText} onImport={() => importDeck(deckText)} onFile={() => fileInput.current?.click()} onDrop={onDeckDrop} cards={cards} filteredCards={filteredCards} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} isResolving={isResolving} progress={progress} onResolve={() => importDeck(deckText)} onOpenProject={() => projectInput.current?.click()} onSaveProject={saveProjectFile} onClearCache={clearCache} />}
          {activeStep === 2 && (editorCardId ? <CardConjurerEditor card={cards.find((card) => card.id === editorCardId) || selectedCard || cards[0]} onSaved={(result) => commitCardConjurer(editorCardId, result)} onInitialRender={() => undefined} onClose={closeEditor} /> : <ArtStep cards={cards} filteredCards={filteredCards} selectedCard={selectedCard} onSelectCard={setSelectedCardId} onSelectPrint={selectPrint} onSelectLanguage={selectLanguage} onChooseOwnArt={() => artInput.current?.click()} onOpenEditor={openEditor} onUseOriginal={setOriginalRepresentation} onCreateBlank={createBlankCard} onRemoveBlank={removeBlankCard} />)}
          {activeStep === 3 && <PrintStep project={project} pageLayout={pageLayout} onPrintChange={updatePrint} onExport={exportPdf} exporting={exporting} exportProgress={exportProgress} />}
        </main>
      </div>

      <input ref={fileInput} className="hidden-input" type="file" accept=".txt,.csv,.dek,.dec" onChange={onDeckFile} />
      <input ref={projectInput} className="hidden-input" type="file" accept=".json,.tcbgr" onChange={onProjectFile} />
      <input ref={artInput} className="hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onArtFile} />
      {recoveryAvailable && <div className="recovery-banner"><RefreshCw size={15} /><span>A recovery version is available from the last session.</span><button type="button" onClick={restoreRecovery}>Restore</button><button className="dismiss" type="button" onClick={() => discardRecovery()}>Dismiss</button></div>}
      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
      <CardConjurerRenderHost ref={cardConjurerRenderRef} />
    </div>
  )
}

function StepNav({ step, activeStep, label, detail, locked, onClick }: { step: Step; activeStep: Step; label: string; detail: string; locked?: boolean; onClick: () => void }) {
  const complete = activeStep > step
  return <button className={`step-nav ${activeStep === step ? 'active' : ''} ${complete ? 'complete' : ''}`} type="button" onClick={onClick}><span className="step-number">{complete ? <Check size={14} /> : locked ? <Lock size={12} /> : `0${step}`}</span><span className="step-copy"><strong>{label}</strong><small>{detail}</small></span>{activeStep === step && <span className="active-indicator" />}</button>
}

function ImportStep({ deckText, setDeckText, onImport, onFile, onDrop, cards, filteredCards, search, setSearch, filter, setFilter, isResolving, progress, onResolve, onOpenProject, onSaveProject, onClearCache }: { deckText: string; setDeckText: (value: string) => void; onImport: () => void; onFile: () => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; cards: CardDefinition[]; filteredCards: CardDefinition[]; search: string; setSearch: (value: string) => void; filter: 'all' | 'validated' | 'issues'; setFilter: (value: 'all' | 'validated' | 'issues') => void; isResolving: boolean; progress: { done: number; total: number }; onResolve: () => void; onOpenProject: () => void; onSaveProject: () => void; onClearCache: () => void }) {
  const orderedCards = [...filteredCards].sort((a, b) => { const aIssue = a.status === 'validated' ? 1 : 0; const bIssue = b.status === 'validated' ? 1 : 0; return aIssue - bIssue || cardTitle(a).localeCompare(cardTitle(b)) })
  return <div className="step-panel"><div className="page-header"><div><div className="eyebrow">STAGE 01 / FOUNDATION</div><h1>Import & validate your deck</h1><p>Bring in a plain-text list or deck export. The resolver keeps card identity, layout and metadata separate from artwork.</p></div></div><div className="project-actions-bar" aria-label="Project actions"><button className="secondary-button compact-button" type="button" onClick={onOpenProject}><FolderOpen size={14} /> Open project</button><button className="secondary-button compact-button" type="button" onClick={onSaveProject}><Save size={14} /> Save project</button><button className="secondary-button compact-button" type="button" onClick={onClearCache}><Trash2 size={14} /> Clear cache</button></div>
    <section className="import-grid"><div className="source-panel panel"><div className="panel-header"><div><span className="panel-kicker">DECK SOURCE</span><h2>Paste a deck list</h2></div><button className="text-button" type="button" onClick={() => setDeckText(SAMPLE_DECK)}>Load sample</button></div><textarea value={deckText} onChange={(event) => setDeckText(event.target.value)} placeholder={'1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n\nSupports quantity, [SET 123], and common exports.'} /><div className="source-footer"><span><SlidersHorizontal size={14} /> Parser accepts quantity + set metadata</span><button className="primary-button" type="button" onClick={onImport} disabled={isResolving || !deckText.trim()}>{isResolving ? <><Loader2 className="spin" size={15} /> Resolving {progress.done}/{progress.total}</> : <><Upload size={15} /> Import & resolve</>}</button></div></div>
      <div className="drop-panel panel" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><div className="drop-inner"><div className="drop-icon"><FileDown size={22} /></div><h3>Drop a deck file here</h3><p>.txt, .csv, .dek, or .dec</p><button className="secondary-button" type="button" onClick={onFile}><FolderOpen size={15} /> Choose file</button></div></div></section>
    {cards.length > 0 ? <section className="cards-section"><div className="section-heading"><div><span className="panel-kicker">RESOLUTION QUEUE</span><h2>Card definitions <span>{cards.length}</span></h2></div><div className="list-tools"><div className="search-field"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards" /></div><select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'validated' | 'issues')}><option value="all">All states</option><option value="validated">Validated</option><option value="issues">Needs review</option></select>{cards.some((card) => card.status !== 'validated') && <button className="secondary-button compact-button" type="button" onClick={onResolve}><RefreshCw size={14} /> Retry unresolved</button>}</div></div><div className="card-table"><div className="card-table-head"><span>IDENTITY</span><span>SET / COLLECTOR</span><span>QTY</span><span>STATUS</span><span /></div>{orderedCards.map((card) => <div className="card-row" key={card.id}><div className="card-identity"><div className="mini-art">{imageForCard(card) ? <img src={imageForCard(card)} alt="" /> : <ImagePlus size={15} />}</div><div><strong>{cardTitle(card)}</strong><span>{card.data?.faces?.length && card.data.faces.length > 1 ? 'Double-faced' : card.data?.layout || 'Unresolved'}</span></div></div><span className="muted-cell">{card.data?.setName || '—'} <small>{card.data?.collectorNumber || ''}</small></span><strong className="quantity-cell">{card.quantity}×</strong><div><StatusPill status={card.status} />{card.resolverMessage && <small className="resolver-message">{card.resolverMessage}</small>}</div><button className="row-action" type="button" onClick={() => navigator.clipboard?.writeText(cardTitle(card))}>Copy name</button></div>)}</div>{filteredCards.length === 0 && <EmptyState icon={Search} title="No cards match" description="Try a different search or filter." />}</section> : <EmptyState icon={Upload} title="Your deck will appear here" description="Import a deck to begin the validation pipeline." />}</div>
}

function ArtStep({ cards, filteredCards, selectedCard, onSelectCard, onSelectPrint, onSelectLanguage, onChooseOwnArt, onOpenEditor, onUseOriginal, onCreateBlank, onRemoveBlank }: { cards: CardDefinition[]; filteredCards: CardDefinition[]; selectedCard?: CardDefinition; onSelectCard: (id: string) => void; onSelectPrint: (cardId: string, printId: string) => void; onSelectLanguage: (cardId: string, language: string) => void; onChooseOwnArt: () => void; onOpenEditor: (id: string) => void; onUseOriginal: (id: string) => void; onCreateBlank: () => void; onRemoveBlank: (id: string) => void }) {
  const regularCards = filteredCards.filter((card) => !isBasicLand(card.data) && card.data?.layout !== 'land')
  const landCards = filteredCards.filter((card) => isBasicLand(card.data) || card.data?.layout === 'land')
  return <div className="step-panel"><div className="page-header"><div><div className="eyebrow">STAGE 02 / CARD STUDIO</div><h1>Customize each card with CardConjurer</h1><p>Escolha de forma explícita de onde vem a aparência da carta. O original, o documento CardConjurer e a arte própria são representações independentes e não destrutivas.</p></div><button className="primary-button" type="button" onClick={onCreateBlank}><Plus size={15} /> New blank card</button></div><div className="two-column-art-workspace"><section className="imported-cards-panel panel"><div className="panel-header"><div><span className="panel-kicker">CARD STUDIO QUEUE</span><h2>{cards.length} cards</h2></div><span className="card-by-card-note">Select a card to edit</span></div><div className="queue-section"><div className="queue-section-heading"><span>NORMAL CARDS</span><strong>{regularCards.length}</strong></div><CardRows className="regular-card-list" cards={regularCards} selectedCard={selectedCard} onSelectCard={onSelectCard} /></div><div className="lands-group"><div className="queue-section-heading"><span>LANDS</span><strong>{landCards.length}</strong></div><CardRows className="land-card-list" cards={landCards} selectedCard={selectedCard} onSelectCard={onSelectCard} /></div>{filteredCards.length === 0 && <EmptyState icon={Search} title="No cards match" description="Try another search." />}</section><section className="art-options-panel panel">{selectedCard ? <ArtOptions card={selectedCard} onSelectPrint={(printId) => onSelectPrint(selectedCard.id, printId)} onSelectLanguage={(language) => onSelectLanguage(selectedCard.id, language)} onChooseOwnArt={onChooseOwnArt} onOpenEditor={() => onOpenEditor(selectedCard.id)} onUseOriginal={() => onUseOriginal(selectedCard.id)} onRemoveBlank={() => onRemoveBlank(selectedCard.id)} /> : <EmptyState icon={Palette} title="Select a card" description="The available prints and editor actions will appear here." />}</section></div></div>
}

function CardRows({ cards, selectedCard, onSelectCard, className = '' }: { cards: CardDefinition[]; selectedCard?: CardDefinition; onSelectCard: (id: string) => void; className?: string }) {
  return <div className={`imported-cards-list ${className}`}>{cards.map((card) => <ImportedCardRow key={card.id} card={card} active={selectedCard?.id === card.id} onSelect={() => onSelectCard(card.id)} />)}</div>
}

function ImportedCardRow({ card, active, onSelect }: { card: CardDefinition; active: boolean; onSelect: () => void }) {
  const image = imageForCard(card)
  const source = card.activeRepresentation === 'editor' ? 'CardConjurer document' : card.customArt ? 'Own art' : card.selectedPrint ? 'Original art' : 'Choose art'
  return <button type="button" className={`imported-card-row ${active ? 'active' : ''}`} onClick={onSelect}><span className="imported-card-thumb">{image ? <img src={image} alt="" /> : <ImagePlus size={16} />}</span><span className="imported-card-copy"><strong>{cardTitle(card)}</strong><small>{card.data?.setName || 'Blank card'} · {card.quantity}×</small><em>{source} · {card.selectedLanguage ? languageLabel(card.selectedLanguage) : 'Language not selected'}</em></span>{card.cardConjurerDocument && <span className="editor-badge">CC</span>}<StatusPill status={card.status} /></button>
}

function ArtOptions({ card, onSelectPrint, onSelectLanguage, onChooseOwnArt, onOpenEditor, onUseOriginal, onRemoveBlank }: { card: CardDefinition; onSelectPrint: (printId: string) => void; onSelectLanguage: (language: string) => void; onChooseOwnArt: () => void; onOpenEditor: () => void; onUseOriginal: () => void; onRemoveBlank: () => void }) {
  const prints = card.availablePrints || []
  const selectedLanguage = normalizeLanguage(card.selectedLanguage)
  const languages = [...new Set(prints.map((print) => normalizeLanguage(print.language)).filter(Boolean))]
  if (!languages.includes('pt')) languages.push('pt')
  languages.sort()
  const effectiveLanguage = selectedLanguage || languages[0] || ''
  const visiblePrints = effectiveLanguage ? prints.filter((print) => normalizeLanguage(print.language) === effectiveLanguage) : prints
  const isOwnArt = card.activeRepresentation === 'custom'
  const isEditor = card.activeRepresentation === 'editor'
  const isOriginal = !isOwnArt && !isEditor
  const originalImage = card.selectedPrint?.imageUri || card.data?.imageUris?.normal || card.data?.imageUris?.large
  const languageOptions = languages.map((language) => ({ language, prints: prints.filter((print) => normalizeLanguage(print.language) === language) }))
  return <div className="art-options-content"><div className="panel-header"><div><span className="panel-kicker">SELECTED CARD</span><h2>{cardTitle(card)}</h2><span className="selected-card-meta">{card.data?.setName || 'Blank card'} · {card.quantity}×</span></div><div className="panel-header-actions"><StatusPill status={card.status} />{card.inputName === 'Blank Card' && <button className="danger-button compact-button" type="button" onClick={onRemoveBlank} title="Remove Blank Card"><Trash2 size={13} /> Remove blank</button>}</div></div><div className="representation-picker"><div className="representation-picker-heading"><span className="panel-kicker">CARD APPEARANCE</span><small>Escolha uma única fonte principal para a representação visual.</small></div><div className="representation-actions three-way"><button type="button" className={isOriginal ? 'active' : ''} onClick={onUseOriginal} disabled={!prints.length}><Palette size={16} /><span><strong>Original print</strong><small>Selected official print</small></span></button><button type="button" className={isEditor ? 'active' : ''} onClick={onOpenEditor}><Layers3 size={16} /><span><strong>Open Editor</strong><small>{card.cardConjurerDocument ? 'Resume saved document' : 'Start with blank canvas'}</small></span></button><button type="button" className={isOwnArt ? 'active' : ''} onClick={onChooseOwnArt}><ImagePlus size={16} /><span><strong>Use my own art</strong><small>{card.customArt?.fileName || 'Upload a local image'}</small></span></button></div></div><label className="selected-language">Language<select value={effectiveLanguage} onChange={(event) => onSelectLanguage(event.target.value)} disabled={!languageOptions.length}>{languageOptions.map(({ language, prints: matchingPrints }) => <option key={language} value={language} disabled={!matchingPrints.length}>{languageLabel(language)}{!matchingPrints.length ? ' — unavailable for this card' : ''}</option>)}</select><span className="language-filter-note">{effectiveLanguage ? `Showing ${visiblePrints.length} ${languageLabel(effectiveLanguage)} print${visiblePrints.length === 1 ? '' : 's'}` : 'No translated prints available'}</span></label><div className="available-arts-panel original-arts-section"><div className="available-arts-heading"><div><span className="panel-kicker">ORIGINAL ARTS FOR THIS CARD</span><strong>{visiblePrints.length ? `${visiblePrints.length} print${visiblePrints.length === 1 ? '' : 's'} available` : 'No prints in this language'}</strong></div>{originalImage && <img src={originalImage} alt={`Selected art for ${cardTitle(card)}`} />}</div><div className="available-arts-grid">{visiblePrints.map((print) => <button key={print.id} type="button" className={`available-art ${card.selectedPrint?.id === print.id ? 'selected' : ''}`} onClick={() => onSelectPrint(print.id)} disabled={!print.imageUri}><span className="available-art-image">{print.imageUri ? <img loading="lazy" src={print.imageUri} alt={`${cardTitle(card)} — ${print.displayName}`} /> : <ImagePlus size={16} />}</span><span className="available-art-meta"><strong>{print.displayName}</strong><span>{languageLabel(print.language)} · {print.set.toUpperCase()} {print.collectorNumber}</span></span>{card.selectedPrint?.id === print.id && <CheckCircle2 className="available-art-check" size={16} />}</button>)}</div></div></div>
}

function languageLabel(language: string): string {
  const labels: Record<string, string> = { en: 'English / EN', pt: 'Português (Brasil) / pt-BR', 'pt-br': 'Português (Brasil) / pt-BR', es: 'Español / ES', fr: 'Français / FR', de: 'Deutsch / DE', it: 'Italiano / IT', ja: '日本語 / JA', ko: '한국어 / KO', ru: 'Русский / RU', zhs: '简体中文 / ZH-S', zht: '繁體中文 / ZH-T' }
  return labels[language.toLowerCase()] || language.toUpperCase()
}

function PrintStep({ project, pageLayout, onPrintChange, onExport, exporting, exportProgress }: { project: ProjectFile; pageLayout: ReturnType<typeof calculatePageLayout>; onPrintChange: <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => void; onExport: () => void; exporting: boolean; exportProgress: { done: number; total: number } }) {
  const settings = project.printSettings
  const expanded = project.cards.flatMap((card) => settings.skipBasicLands && isBasicLand(card.data) ? [] : Array.from({ length: card.quantity }, () => card))
  const previewPages = Array.from({ length: pageLayout.pageCount }, (_, pageIndex) => expanded.slice(pageIndex * pageLayout.cardsPerPage, (pageIndex + 1) * pageLayout.cardsPerPage))
  const setNumber = (key: keyof PrintSettings) => (event: ChangeEvent<HTMLInputElement>) => onPrintChange(key, Number(event.target.value) as never)
  return <div className="step-panel"><div className="page-header"><div><div className="eyebrow">STAGE 03 / OUTPUT ENGINE</div><h1>Prepare print output</h1><p>Physical dimensions are calculated in millimeters. Preview uses the same layout engine as the PDF export.</p></div><button className="primary-button" type="button" onClick={onExport} disabled={exporting}>{exporting ? <><Loader2 className="spin" size={15} /> Rendering {exportProgress.done}/{exportProgress.total}</> : <><FileDown size={15} /> Generate validated PDF</>}</button></div><div className="print-workspace"><div className="print-preview panel"><div className="panel-header"><div><span className="panel-kicker">LIVE PAGE PREVIEW</span><h2>{pageLayout.width} × {pageLayout.height} mm <span>·</span> {pageLayout.columns} × {pageLayout.rows} grid</h2></div><span className="page-counter">PAGE 01 / {String(pageLayout.pageCount).padStart(2, '0')}</span></div><div className="paper-wrap"><div className="pages-scroll">{previewPages.map((pageCards, pageIndex) => <PagePreview key={pageIndex} cards={pageCards} pageLayout={pageLayout} settings={settings} pageNumber={pageIndex + 1} />)}</div></div><div className="preview-footer"><span><CheckCircle2 size={14} /> Vector positions and card dimensions validated before export</span><span>{expanded.length} cards · {pageLayout.pageCount} pages</span></div></div><div className="print-settings panel"><div className="panel-header"><div><span className="panel-kicker">PRINT SETTINGS</span><h2>Output configuration</h2></div><Settings2 size={17} /></div><div className="settings-scroll"><SettingSelect label="Paper" value={settings.paper} options={['A4', 'Letter', 'A3', 'Legal', 'Custom']} onChange={(value) => onPrintChange('paper', value as PrintSettings['paper'])} /><SettingSelect label="Orientation" value={settings.orientation} options={['portrait', 'landscape']} onChange={(value) => onPrintChange('orientation', value as PrintSettings['orientation'])} />{settings.paper === 'Custom' && <><div className="setting-group-title">CUSTOM PAPER (MM)</div><div className="two-inputs"><NumberInput label="Paper width" value={settings.customPaperWidth} onChange={setNumber('customPaperWidth')} /><NumberInput label="Paper height" value={settings.customPaperHeight} onChange={setNumber('customPaperHeight')} /></div></>}<div className="settings-divider" /><div className="setting-group-title">CARD DIMENSIONS (MM)</div><div className="two-inputs"><NumberInput label="Width" value={settings.cardWidth} onChange={setNumber('cardWidth')} /><NumberInput label="Height" value={settings.cardHeight} onChange={setNumber('cardHeight')} /></div><div className="two-inputs"><NumberInput label="Scale %" value={settings.scale} onChange={setNumber('scale')} /><NumberInput label="Gap X" value={settings.gapX} onChange={setNumber('gapX')} /></div><NumberInput label="Gap Y" value={settings.gapY} onChange={setNumber('gapY')} /><div className="settings-divider" /><div className="setting-group-title">MARGINS (MM)</div><div className="two-inputs"><NumberInput label="Top" value={settings.marginTop} onChange={setNumber('marginTop')} /><NumberInput label="Bottom" value={settings.marginBottom} onChange={setNumber('marginBottom')} /></div><div className="two-inputs"><NumberInput label="Left" value={settings.marginLeft} onChange={setNumber('marginLeft')} /><NumberInput label="Right" value={settings.marginRight} onChange={setNumber('marginRight')} /></div><div className="settings-divider" /><div className="setting-group-title">FINISHING</div><ToggleSetting label="Bleed" hint="Extend beyond trim" checked={settings.bleedEnabled} onChange={(value) => onPrintChange('bleedEnabled', value)} />{settings.bleedEnabled && <NumberInput label="Bleed amount (mm)" value={settings.bleed} onChange={setNumber('bleed')} />}<ToggleSetting label="Crop marks" hint="Outside trim area" checked={settings.cropMarks} onChange={(value) => onPrintChange('cropMarks', value)} /><ToggleSetting label="Black corners" hint="Registration markers" checked={settings.blackCorners} onChange={(value) => onPrintChange('blackCorners', value)} /><ToggleSetting label="Skip basic lands" hint="Exclude from output" checked={settings.skipBasicLands} onChange={(value) => onPrintChange('skipBasicLands', value)} /><ToggleSetting label="Decklist page" hint="Append text list" checked={settings.decklistEnabled} onChange={(value) => onPrintChange('decklistEnabled', value)} /><ToggleSetting label="Playtest watermark" hint="Overlay on every page" checked={settings.watermarkEnabled} onChange={(value) => onPrintChange('watermarkEnabled', value)} />{settings.watermarkEnabled && <><input className="text-input" value={settings.watermarkText} onChange={(event) => onPrintChange('watermarkText', event.target.value)} /><div className="two-inputs"><NumberInput label="Opacity %" value={settings.watermarkOpacity} onChange={setNumber('watermarkOpacity')} /><NumberInput label="Rotation °" value={settings.watermarkRotation} onChange={setNumber('watermarkRotation')} /></div></>}</div></div></div></div>
}

function PagePreview({ cards, pageLayout, settings, pageNumber }: { cards: CardDefinition[]; pageLayout: ReturnType<typeof calculatePageLayout>; settings: PrintSettings; pageNumber: number }) {
  return <div className="page-preview-item"><div className="page-preview-label">PAGE {String(pageNumber).padStart(2, '0')} / {String(pageLayout.pageCount).padStart(2, '0')}</div><div className="paper" style={{ aspectRatio: `${pageLayout.width}/${pageLayout.height}` }}>{cards.map((card, index) => { const pos = pageLayout.positions[index]; return <div key={`${card.id}-${index}`} className="paper-card" style={{ left: `${(pos.x / pageLayout.width) * 100}%`, top: `${(pos.y / pageLayout.height) * 100}%`, width: `${(pos.width / pageLayout.width) * 100}%`, height: `${(pos.height / pageLayout.height) * 100}%` }}><OriginalCardPreview card={card} compact /></div> })}{settings.watermarkEnabled && <div className="paper-watermark" style={{ opacity: settings.watermarkOpacity / 100, transform: `translate(-50%, -50%) rotate(${settings.watermarkRotation}deg) scale(${settings.watermarkScale / 100})` }}>{settings.watermarkText}</div>}</div></div>
}

function SettingSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="setting-select"><span>{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</select><ChevronDown size={14} /></div></label>
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="number-input"><span>{label}</span><input type="number" min="0" step="0.5" value={value} onChange={onChange} /></label>
}

function ToggleSetting({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className="toggle-setting" onClick={() => onChange(!checked)}><span><strong>{label}</strong><small>{hint}</small></span><span className={`switch ${checked ? 'on' : ''}`}><i /></span></button>
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('Imagem inválida.'))
    image.src = dataUrl
  })
}

export default App
