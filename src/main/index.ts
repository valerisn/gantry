import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promises as fs } from 'node:fs'
import { Files, MAX_TEXT, revision, text } from './files'
import { Processes } from './processes'
import { SessionStore, validateSession } from './session'
import type { DocumentState, Session } from '../shared/types'

const testData = process.env.GANTRY_USER_DATA
if (testData) app.setPath('userData', testData)
app.setName('Gantry')
let window: BrowserWindow
let closing = false
const files = new Files()
let store: SessionStore
let session: Session
let processes: Processes
const page = path.join(__dirname, '../renderer/index.html')
const developmentURL = process.env.ELECTRON_RENDERER_URL

function handle(name: string, action: (...args: any[]) => unknown): void {
  ipcMain.handle(name, (event, ...args) => {
    const expected = developmentURL ? new URL(developmentURL).href : pathToFileURL(page).href
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url.split('#')[0] !== expected.split('#')[0]
    )
      throw new Error('Untrusted request')
    return action(...args)
  })
}
function project(): string {
  if (!files.project) throw new Error('Open a project first')
  return files.project
}

app.whenReady().then(async () => {
  store = new SessionStore(app.getPath('userData'))
  session = await store.load()
  if (session.project) {
    try {
      await files.select(session.project)
    } catch {
      session.project = null
    }
  }
  for (const doc of session.documents) if (doc.path) await files.restoreGrant(doc.path)
  window = new BrowserWindow({
    width: 1460,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#171716',
    title: 'Gantry',
    icon: path.join(app.getAppPath(), 'assets/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  Menu.setApplicationMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  )
  window.webContents.on('render-process-gone', () => {
    void processes.dispose()
  })
  processes = new Processes((event) => {
    if (!window.isDestroyed()) window.webContents.send('process:event', event)
  })
  window.on('close', (event) => {
    if (!closing) {
      event.preventDefault()
      window.webContents.send('window:closing')
    }
  })
  handle('session:restore', () => session)
  handle('session:persist', async (input) => {
    const value = validateSession(input)
    if (value.project !== files.project)
      throw new Error('Session project does not match the open folder')
    if (value.documents.some((doc) => doc.path && !files.documents.has(doc.path)))
      throw new Error('Session contains an unopened file')
    await store.save(value)
    session = value
  })
  handle('project:choose', async (recent) => {
    let folder: string | undefined
    if (recent !== undefined) {
      if (!session.recent.includes(text(recent))) throw new Error('Unknown recent project')
      folder = recent
    } else {
      const result = await dialog.showOpenDialog(window, {
        properties: ['openDirectory'],
        title: 'Open a project in Gantry',
      })
      folder = result.canceled ? undefined : result.filePaths[0]
    }
    if (!folder) return null
    const selected = await files.select(folder)
    await processes.dispose()
    return selected
  })
  handle('files:list', (file) => files.list(file))
  handle('files:read', (file) => files.read(file))
  handle('files:search', (query) => files.search(query))
  handle('files:confirm', async (name) => {
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      title: 'Unsaved changes',
      message: `Save changes to ${text(name, 1024)}?`,
      detail: 'Your changes will be lost if you discard them.',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    })
    return ['save', 'discard', 'cancel'][result.response]
  })
  handle('files:save', async (doc: DocumentState, saveAs: boolean) => {
    text(doc.content, MAX_TEXT)
    text(doc.path)
    text(doc.revision, 128)
    if (typeof saveAs !== 'boolean') throw new Error('Invalid save request')
    let destination = doc.path,
      expected: string | null = doc.revision
    if (saveAs || !destination) {
      const result = await dialog.showSaveDialog(window, {
        defaultPath:
          destination || path.join(files.project || app.getPath('documents'), 'untitled.txt'),
      })
      if (result.canceled || !result.filePath) return { status: 'cancelled' }
      destination = await files.grantSavePath(result.filePath)
      if (
        session.documents.some(
          (other) => other.id !== doc.id && other.path.toLowerCase() === destination.toLowerCase(),
        )
      )
        throw new Error(
          'That file is already open in another tab. Choose a different name or close that tab first.',
        )
      const existing = await fs.readFile(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      expected = existing ? revision(existing) : null
    }
    const file = await files.write(destination, doc.content, expected)
    return file ? { status: 'saved', file } : { status: 'conflict' }
  })
  handle('terminal:start', (cols, rows) => processes.startTerminal(project(), cols, rows))
  handle('terminal:write', (data) => processes.write(data))
  handle('terminal:resize', (cols, rows) => processes.resize(cols, rows))
  handle('terminal:stop', () => processes.stopTerminal())
  handle('task:start', (kind, command) => {
    if (kind !== 'build' && kind !== 'run') throw new Error('Unknown task')
    processes.startTask(project(), kind, command)
  })
  handle('task:stop', () => processes.stopTask())
  handle('window:close', async () => {
    await processes.dispose()
    closing = true
    window.close()
  })
  if (developmentURL) await window.loadURL(developmentURL)
  else await window.loadFile(page)
})
app.on('window-all-closed', () => app.quit())
