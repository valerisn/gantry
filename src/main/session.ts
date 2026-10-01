import { promises as fs } from 'node:fs'
import path from 'node:path'
import { defaultPreferences, type Session } from '../shared/types.ts'
import { MAX_TEXT, text } from './files.ts'

export function emptySession(): Session {
  return { project: null, documents: [], active: null, preferences: { ...defaultPreferences }, recent: [], tasks: {} }
}
export function validateSession(input: unknown): Session {
  if (!input || typeof input !== 'object') throw new Error('Invalid session')
  const s = input as Session
  if (s.project !== null) text(s.project)
  if (!Array.isArray(s.documents) || s.documents.length > 80) throw new Error('At most 80 files can be restored')
  for (const d of s.documents) { text(d.id); text(d.path); text(d.content, MAX_TEXT); text(d.saved, MAX_TEXT); text(d.revision, 128) }
  if (s.active !== null) text(s.active)
  if (!Array.isArray(s.recent) || s.recent.length > 12) throw new Error('Invalid recent projects')
  s.recent.forEach(p => text(p))
  if (!s.tasks || typeof s.tasks !== 'object' || Array.isArray(s.tasks) || Object.keys(s.tasks).length > 100) throw new Error('Invalid tasks')
  for (const [project, task] of Object.entries(s.tasks)) { text(project); text(task.build, 8192); text(task.run, 8192) }
  const p = s.preferences
  if (!p || typeof p.wordWrap !== 'boolean' || typeof p.indexVisible !== 'boolean' || typeof p.trayVisible !== 'boolean') throw new Error('Invalid preferences')
  for (const [value, min, max] of [[p.fontSize, 10, 28], [p.indexWidth, 200, 550], [p.trayHeight, 100, 600]]) {
    if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid panel or font size')
  }
  if (Buffer.byteLength(JSON.stringify(s)) > 64 * 1024 * 1024) throw new Error('Session exceeds the 64 MiB recovery limit. Close some files first.')
  return s
}
export class SessionStore {
  private file: string
  private queue = Promise.resolve()
  constructor(directory: string) { this.file = path.join(directory, 'session.json') }
  async load(): Promise<Session> {
    try { return validateSession(JSON.parse(await fs.readFile(this.file, 'utf8'))) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await fs.copyFile(this.file, `${this.file}.recovery-${Date.now()}`).catch(() => {})
      }
      return emptySession()
    }
  }
  save(input: unknown): Promise<void> {
    const value = JSON.stringify(validateSession(input))
    const operation = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true })
      await fs.writeFile(`${this.file}.tmp`, value, { mode: 0o600 })
      await fs.rename(`${this.file}.tmp`, this.file)
    })
    this.queue = operation
    return operation
  }
}
