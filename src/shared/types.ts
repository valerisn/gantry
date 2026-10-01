export interface Entry {
  name: string
  path: string
  directory: boolean
}
export interface DiskFile {
  path: string
  content: string
  revision: string
}
export interface DocumentState extends DiskFile {
  id: string
  saved: string
}
export interface Preferences {
  fontSize: number
  wordWrap: boolean
  indexWidth: number
  trayHeight: number
  indexVisible: boolean
  trayVisible: boolean
}
export interface Session {
  project: string | null
  documents: DocumentState[]
  active: string | null
  preferences: Preferences
  recent: string[]
  tasks: Record<string, { build: string; run: string }>
}
export interface ProcessEvent {
  type: 'terminal' | 'task'
  data?: string
  exitCode?: number
  label?: string
}
export type SaveResult = { status: 'saved'; file: DiskFile } | { status: 'cancelled' | 'conflict' }
export interface Bridge {
  restore(): Promise<Session>
  persist(session: Session): Promise<void>
  chooseProject(recent?: string): Promise<string | null>
  list(path: string): Promise<Entry[]>
  search(query: string): Promise<string[]>
  read(path: string): Promise<DiskFile>
  save(doc: DocumentState, saveAs: boolean): Promise<SaveResult>
  confirm(name: string): Promise<'save' | 'discard' | 'cancel'>
  terminalStart(cols: number, rows: number): Promise<void>
  terminalWrite(data: string): Promise<void>
  terminalResize(cols: number, rows: number): Promise<void>
  terminalStop(): Promise<void>
  taskStart(kind: 'build' | 'run', command: string): Promise<void>
  taskStop(): Promise<void>
  close(): Promise<void>
  onProcess(callback: (event: ProcessEvent) => void): () => void
  onClose(callback: () => void): () => void
}
export const defaultPreferences: Preferences = {
  fontSize: 14,
  wordWrap: false,
  indexWidth: 300,
  trayHeight: 205,
  indexVisible: true,
  trayVisible: true,
}
