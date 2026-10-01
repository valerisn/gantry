import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { DiskFile, Entry } from '../shared/types.ts'

export const MAX_TEXT = 8 * 1024 * 1024
export function text(value: unknown, limit = 32768): string {
  if (typeof value !== 'string' || value.length > limit || value.includes('\0')) throw new Error('Invalid text value')
  return value
}
export function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}
export function revision(content: Buffer): string { return createHash('sha256').update(content).digest('hex') }

export class Files {
  project: string | null = null
  private external = new Set<string>()
  private saving = new Set<string>()

  async select(folder: string): Promise<string> {
    const canonical = await fs.realpath(text(folder))
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Select a folder')
    this.project = canonical
    this.external.clear()
    return canonical
  }

  async authorize(file: string): Promise<string> {
    const canonical = await fs.realpath(text(file))
    if ((!this.project || !within(this.project, canonical)) && !this.external.has(canonical)) throw new Error('File is outside the selected project')
    return canonical
  }

  async grantSavePath(file: string): Promise<string> {
    const parent = await fs.realpath(path.dirname(file))
    let canonical = path.join(parent, path.basename(file))
    try { canonical = await fs.realpath(canonical) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    this.external.add(canonical)
    return canonical
  }

  async restoreGrant(file: string): Promise<void> {
    // Only called for paths from our own persisted session, never arbitrary renderer paths.
    this.external.add(path.resolve(file))
  }

  async list(folder: string): Promise<Entry[]> {
    const canonical = await this.authorize(folder)
    const entries: Entry[] = []
    const handle = await fs.opendir(canonical)
    for await (const item of handle) {
      if (item.name === '.git' || item.isSymbolicLink()) continue
      entries.push({ name: item.name, path: path.join(canonical, item.name), directory: item.isDirectory() })
      if (entries.length >= 4000) break
    }
    return entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
  }

  async read(file: string): Promise<DiskFile> {
    const canonical = await this.authorize(file)
    const handle = await fs.open(canonical, 'r')
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > MAX_TEXT) throw new Error('Only text files up to 8 MiB can be opened')
      const bytes = await handle.readFile()
      if (bytes.length > MAX_TEXT || bytes.includes(0)) throw new Error('This file is too large or contains binary data')
      let content: string
      try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
      catch { throw new Error('This file is not UTF-8 text') }
      return { path: canonical, content, revision: revision(bytes) }
    } finally { await handle.close() }
  }

  async write(file: string, content: string, expected: string | null): Promise<DiskFile | null> {
    text(content, MAX_TEXT)
    let canonical: string
    try { canonical = await this.authorize(file) }
    catch (error) {
      canonical = path.resolve(text(file))
      if (!this.external.has(canonical) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (this.saving.has(canonical)) throw new Error('A save is already in progress for this file')
    this.saving.add(canonical)
    const temp = `${canonical}.gantry-${randomUUID()}.tmp`
    try {
      let disk: Buffer | null = null
      try { disk = await fs.readFile(canonical) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if ((disk ? revision(disk) : null) !== expected) return null
      const stat = await fs.stat(canonical).catch(() => null)
      await fs.writeFile(temp, content, { encoding: 'utf8', flag: 'wx', mode: stat?.mode })
      // Check again after writing the temporary file to narrow the external-edit race.
      const latest = await fs.readFile(canonical).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error })
      if ((latest ? revision(latest) : null) !== expected) return null
      await fs.rename(temp, canonical)
      return { path: canonical, content, revision: revision(Buffer.from(content)) }
    } finally {
      this.saving.delete(canonical)
      await fs.unlink(temp).catch(() => {})
    }
  }

  async search(query: string): Promise<string[]> {
    if (!this.project) return []
    const needle = text(query, 256).toLowerCase()
    const root = this.project
    const queue = [root], found: string[] = []
    const skipped = new Set(['.git', 'node_modules', 'dist', 'out', 'build', 'release', '.next', 'target', 'vendor'])
    let visited = 0
    while (queue.length && visited < 20000 && found.length < 150) {
      const folder = queue.shift()!
      let handle
      try { handle = await fs.opendir(folder) } catch { continue }
      for await (const entry of handle) {
        if (++visited > 20000 || found.length >= 150) break
        if (entry.isSymbolicLink()) continue
        const file = path.join(folder, entry.name)
        if (entry.isDirectory()) { if (!skipped.has(entry.name)) queue.push(file) }
        else if (entry.isFile() && path.relative(root, file).toLowerCase().includes(needle)) found.push(file)
      }
    }
    return found
  }
}
