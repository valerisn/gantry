import { useCallback, useEffect, useRef, useState } from 'react'
import type { DocumentState, Preferences, Session } from '../../shared/types'
import { defaultPreferences } from '../../shared/types'
import { monaco, language } from './editor'
import { Icon } from './Icons'
import { Tree } from './Tree'
import { Terminal } from './Terminal'
import logo from '../../../assets/logo.png'

const baseName = (path: string) => path.split(/[\\/]/).pop() || 'Untitled'
const initial: Session = {
  project: null,
  documents: [],
  active: null,
  preferences: defaultPreferences,
  recent: [],
  tasks: {},
}
const api = window.gantry

export default function App() {
  const [session, setSession] = useState<Session>(initial)
  const current = useRef(session)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const [notice, setNotice] = useState('')
  const [conflicts, setConflicts] = useState<Record<string, string>>({})
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 })
  const [palette, setPalette] = useState<'commands' | 'files' | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [selected, setSelected] = useState(0)
  const [settings, setSettings] = useState(false)
  const [tray, setTray] = useState<'output' | 'terminal' | 'problems'>('output')
  const [output, setOutput] = useState('')
  const [task, setTask] = useState<{ running: boolean; label: string; code?: number }>({
    running: false,
    label: '',
  })
  const editorHost = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const models = useRef(new Map<string, monaco.editor.ITextModel>())
  const views = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  const activeRef = useRef<string | null>(null)
  const outputHost = useRef<HTMLPreElement>(null)
  const report = useCallback(
    (error: unknown) =>
      setNotice(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : String(error),
      ),
    [],
  )
  const update = useCallback((fn: (value: Session) => Session) => {
    const next = fn(current.current)
    current.current = next
    setSession(next)
  }, [])
  const preferences = (patch: Partial<Preferences>) =>
    update((s) => ({ ...s, preferences: { ...s.preferences, ...patch } }))
  const active = session.documents.find((doc) => doc.id === session.active)
  const projectName = session.project ? baseName(session.project) : 'Open project'
  const relative = (file: string) =>
    session.project && file.startsWith(session.project)
      ? file.slice(session.project.length + 1).replaceAll('\\', '/')
      : file

  useEffect(() => {
    void api
      .restore()
      .then(async (restored) => {
        for (const doc of restored.documents) {
          if (!doc.path) continue
          try {
            const disk = await api.read(doc.path)
            if (doc.content === doc.saved) Object.assign(doc, disk, { saved: disk.content })
            else if (doc.revision !== disk.revision)
              setConflicts((old) => ({
                ...old,
                [doc.id]: 'This file changed on disk while Gantry was closed.',
              }))
          } catch {
            setConflicts((old) => ({
              ...old,
              [doc.id]: 'The file is unavailable. Your recovered buffer is safe; use Save As.',
            }))
          }
        }
        update(() => restored)
        setReady(true)
      })
      .catch(report)
  }, [])

  useEffect(() => {
    if (!ready) return
    const timeout = setTimeout(() => {
      void api.persist(current.current).catch(report)
    }, 350)
    return () => clearTimeout(timeout)
  }, [session, ready])

  useEffect(() => {
    if (!ready || !editorHost.current) return
    const instance = monaco.editor.create(editorHost.current, {
      theme: 'gantry',
      automaticLayout: true,
      model: null,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: current.current.preferences.fontSize,
      minimap: { enabled: false },
      padding: { top: 16, bottom: 24 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      renderLineHighlight: 'all',
      lineNumbersMinChars: 4,
      glyphMargin: false,
      tabSize: 2,
      wordWrap: current.current.preferences.wordWrap ? 'on' : 'off',
      bracketPairColorization: { enabled: true },
    })
    editor.current = instance
    const position = instance.onDidChangeCursorPosition((e) => setCursor(e.position))
    const changes = instance.onDidChangeModelContent(() => {
      const id = activeRef.current
      if (id)
        update((s) => ({
          ...s,
          documents: s.documents.map((doc) =>
            doc.id === id
              ? {
                  ...doc,
                  content: instance
                    .getModel()!
                    .getValue(monaco.editor.EndOfLinePreference.TextDefined, true),
                }
              : doc,
          ),
        }))
    })
    return () => {
      position.dispose()
      changes.dispose()
      instance.dispose()
      models.current.forEach((model) => model.dispose())
    }
  }, [ready])

  useEffect(() => {
    const instance = editor.current
    if (!instance || !ready) return
    const previous = activeRef.current
    if (previous && previous !== session.active)
      views.current.set(previous, instance.saveViewState())
    activeRef.current = session.active
    for (const [id, model] of models.current) {
      if (!session.documents.some((doc) => doc.id === id)) {
        if (instance.getModel() === model) instance.setModel(null)
        model.dispose()
        models.current.delete(id)
        views.current.delete(id)
      }
    }
    if (!active) {
      instance.setModel(null)
      return
    }
    let model = models.current.get(active.id)
    if (!model) {
      model = monaco.editor.createModel(
        active.content,
        language(active.path),
        monaco.Uri.parse(
          `gantry://document/${active.id}/${encodeURIComponent(baseName(active.path))}`,
        ),
      )
      models.current.set(active.id, model)
    }
    monaco.editor.setModelLanguage(model, language(active.path))
    if (instance.getModel() !== model) {
      instance.setModel(model)
      const view = views.current.get(active.id)
      if (view) instance.restoreViewState(view)
      instance.focus()
      setCursor(instance.getPosition() || { lineNumber: 1, column: 1 })
    }
  }, [ready, session.active, session.documents.length, active?.path])

  useEffect(() => {
    editor.current?.updateOptions({
      fontSize: session.preferences.fontSize,
      wordWrap: session.preferences.wordWrap ? 'on' : 'off',
      readOnly: busy,
    })
  }, [session.preferences, busy])
  useEffect(
    () =>
      api.onProcess((event) => {
        if (event.type !== 'task') return
        if (event.data) setOutput((value) => (value + event.data).slice(-1000000))
        if (event.exitCode !== undefined) {
          setTask((value) => ({ ...value, running: false, code: event.exitCode }))
          setOutput((value) =>
            `${value}\nProcess exited with code ${event.exitCode}.\n`.slice(-1000000),
          )
        }
      }),
    [],
  )
  useEffect(() => {
    if (outputHost.current) outputHost.current.scrollTop = outputHost.current.scrollHeight
  }, [output])

  async function checkExternal() {
    if (locked.current) return
    const doc = current.current.documents.find((d) => d.id === current.current.active)
    if (!doc?.path) return
    try {
      const disk = await api.read(doc.path)
      const latest = current.current.documents.find((d) => d.id === doc.id)
      if (!latest || latest.revision !== doc.revision || locked.current) return
      if (disk.revision !== doc.revision) {
        if (latest.content !== latest.saved)
          setConflicts((old) => ({
            ...old,
            [doc.id]:
              'This file changed on disk. Save As to keep both versions, or reload to discard your changes.',
          }))
        else {
          update((s) => ({
            ...s,
            documents: s.documents.map((d) =>
              d.id === doc.id ? { ...d, ...disk, saved: disk.content } : d,
            ),
          }))
          models.current.get(doc.id)?.setValue(disk.content)
        }
      }
    } catch {
      setConflicts((old) => ({
        ...old,
        [doc.id]: 'This file is unavailable on disk. Use Save As to preserve your buffer.',
      }))
    }
  }
  useEffect(() => {
    window.addEventListener('focus', checkExternal)
    const timer = setInterval(checkExternal, 3000)
    return () => {
      window.removeEventListener('focus', checkExternal)
      clearInterval(timer)
    }
  }, [])

  async function guarded(action: () => Promise<void>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await action()
    } catch (error) {
      report(error)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  async function saveDocument(id: string, saveAs = false): Promise<boolean> {
    const doc = current.current.documents.find((d) => d.id === id)
    if (!doc) return true
    if (saveAs || !doc.path) await api.persist(current.current)
    const result = await api.save(doc, saveAs)
    if (result.status === 'cancelled') return false
    if (result.status === 'conflict') {
      setConflicts((old) => ({
        ...old,
        [id]: 'Save stopped: this file changed on disk. Reload it or use Save As to keep your version.',
      }))
      return false
    }
    if (result.status !== 'saved') return false
    update((s) => ({
      ...s,
      documents: s.documents.map((d) =>
        d.id === id
          ? { ...d, path: result.file.path, revision: result.file.revision, saved: doc.content }
          : d,
      ),
    }))
    setConflicts((old) => {
      const next = { ...old }
      delete next[id]
      return next
    })
    return true
  }
  async function protect(docs: DocumentState[]): Promise<boolean> {
    for (const original of docs) {
      const doc = current.current.documents.find((d) => d.id === original.id)
      if (!doc || doc.content === doc.saved) continue
      const choice = await api.confirm(baseName(doc.path))
      if (choice === 'cancel') return false
      if (choice === 'save' && !(await saveDocument(doc.id))) return false
      if (choice === 'discard') {
        update((s) => ({
          ...s,
          documents: s.documents.map((d) => (d.id === doc.id ? { ...d, content: d.saved } : d)),
        }))
        models.current.get(doc.id)?.setValue(doc.saved)
      }
    }
    return true
  }
  function openProject(recent?: string) {
    void guarded(async () => {
      if (!(await protect(current.current.documents))) return
      const folder = await api.chooseProject(recent)
      if (!folder) return
      update((s) => ({
        ...s,
        project: folder,
        documents: [],
        active: null,
        recent: [folder, ...s.recent.filter((p) => p !== folder)].slice(0, 12),
      }))
      setConflicts({})
      setOutput('')
      setTask({ running: false, label: '' })
      setPalette(null)
      await api.persist(current.current)
    })
  }
  function openFile(path: string) {
    void guarded(async () => {
      const existing = current.current.documents.find(
        (doc) => doc.path.toLowerCase() === path.toLowerCase(),
      )
      if (existing) {
        update((s) => ({ ...s, active: existing.id }))
        setPalette(null)
        return
      }
      if (current.current.documents.length >= 80)
        throw new Error('Close a tab before opening more than 80 files')
      const file = await api.read(path)
      const id = crypto.randomUUID()
      update((s) => ({
        ...s,
        documents: [...s.documents, { ...file, id, saved: file.content }],
        active: id,
      }))
      setPalette(null)
    })
  }
  function newFile() {
    if (current.current.documents.length >= 80) {
      report('Close a tab before opening more than 80 files')
      return
    }
    const doc: DocumentState = {
      id: crypto.randomUUID(),
      path: '',
      content: '',
      saved: '',
      revision: '',
    }
    update((s) => ({ ...s, documents: [...s.documents, doc], active: doc.id }))
  }
  function closeFile(id: string) {
    void guarded(async () => {
      const doc = current.current.documents.find((d) => d.id === id)
      if (!doc || !(await protect([doc]))) return
      update((s) => {
        const documents = s.documents.filter((d) => d.id !== id)
        return {
          ...s,
          documents,
          active: s.active === id ? documents.at(-1)?.id || null : s.active,
        }
      })
    })
  }
  function reloadFile() {
    void guarded(async () => {
      const doc = current.current.documents.find((d) => d.id === current.current.active)
      if (!doc || !(await protect([doc]))) return
      const disk = await api.read(doc.path)
      update((s) => ({
        ...s,
        documents: s.documents.map((d) =>
          d.id === doc.id ? { ...d, ...disk, saved: disk.content } : d,
        ),
      }))
      models.current.get(doc.id)?.setValue(disk.content)
      setConflicts((old) => {
        const next = { ...old }
        delete next[doc.id]
        return next
      })
    })
  }
  const closeWindow = useRef(() => {})
  closeWindow.current = () => {
    void guarded(async () => {
      if (!(await protect(current.current.documents))) return
      await api.persist(current.current)
      await api.close()
    })
  }
  useEffect(() => api.onClose(() => closeWindow.current()), [])

  function showPalette(mode: 'commands' | 'files') {
    setQuery('')
    setSelected(0)
    setResults([])
    setPalette(mode)
  }
  useEffect(() => {
    setSelected(0)
    if (palette !== 'files') return
    let live = true
    const timer = setTimeout(() => {
      void api
        .search(query)
        .then((paths) => {
          if (live) setResults(paths)
        })
        .catch(report)
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, palette])
  function startTask(kind: 'build' | 'run') {
    void guarded(async () => {
      const project = current.current.project
      if (!project) return
      const command = current.current.tasks[project]?.[kind]
      if (!command) {
        setSettings(true)
        return
      }
      if (!(await protect(current.current.documents))) return
      setOutput('')
      setTray('output')
      preferences({ trayVisible: true })
      setTask({ running: true, label: kind })
      try {
        await api.taskStart(kind, command)
      } catch (error) {
        setTask({ running: false, label: kind })
        throw error
      }
    })
  }
  const commands = [
    { label: 'Open folder', shortcut: 'Ctrl+O', action: () => openProject() },
    { label: 'New file', shortcut: 'Ctrl+N', action: newFile },
    {
      label: 'Save file',
      shortcut: 'Ctrl+S',
      action: () =>
        active &&
        void guarded(async () => {
          await saveDocument(active.id)
        }),
    },
    {
      label: 'Save file as…',
      shortcut: 'Ctrl+Shift+S',
      action: () =>
        active &&
        void guarded(async () => {
          await saveDocument(active.id, true)
        }),
    },
    {
      label: 'Find in file',
      shortcut: 'Ctrl+F',
      action: () => {
        editor.current?.focus()
        void editor.current?.getAction('actions.find')?.run()
      },
    },
    {
      label: 'Replace in file',
      shortcut: 'Ctrl+H',
      action: () => {
        editor.current?.focus()
        void editor.current?.getAction('editor.action.startFindReplaceAction')?.run()
      },
    },
    { label: 'Open file', shortcut: 'Ctrl+P', action: () => showPalette('files') },
    {
      label: 'Toggle Project Index',
      shortcut: 'Ctrl+B',
      action: () => preferences({ indexVisible: !session.preferences.indexVisible }),
    },
    {
      label: 'Toggle bottom tray',
      shortcut: 'Ctrl+J',
      action: () => preferences({ trayVisible: !session.preferences.trayVisible }),
    },
    { label: 'Settings and task commands', shortcut: 'Ctrl+,', action: () => setSettings(true) },
    ...session.recent.map((path) => ({
      label: `Open recent: ${path}`,
      shortcut: '',
      action: () => openProject(path),
    })),
  ]
  const choices =
    palette === 'files'
      ? results.map((path) => ({
          label: relative(path),
          shortcut: '',
          action: () => openFile(path),
        }))
      : commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()))
  const keyActions = useRef<(event: KeyboardEvent) => void>(() => {})
  keyActions.current = (event) => {
    if (event.key === 'Escape') {
      setPalette(null)
      setSettings(false)
      return
    }
    if (!(event.ctrlKey || event.metaKey) || busy) return
    const key = event.key.toLowerCase()
    const handled = ['o', 'n', 's', 'p', 'k', 'w', 'b', 'j', ',', 'r'].includes(key)
    if (!handled) return
    event.preventDefault()
    event.stopPropagation()
    if (key === 's' && active)
      void guarded(async () => {
        await saveDocument(active.id, event.shiftKey)
      })
    if (key === 'o') openProject()
    if (key === 'n') newFile()
    if (key === 'p') showPalette(event.shiftKey ? 'commands' : 'files')
    if (key === 'k') showPalette('commands')
    if (key === 'w' && active) closeFile(active.id)
    if (key === 'b') preferences({ indexVisible: !session.preferences.indexVisible })
    if (key === 'j') preferences({ trayVisible: !session.preferences.trayVisible })
    if (key === ',') setSettings(true)
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyActions.current(e)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  function resizePanel(event: React.PointerEvent, panel: 'indexWidth' | 'trayHeight') {
    const start = panel === 'indexWidth' ? event.clientX : event.clientY
    const size = session.preferences[panel]
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) =>
      preferences({
        [panel]: Math.max(
          panel === 'indexWidth' ? 200 : 100,
          Math.min(
            panel === 'indexWidth' ? 550 : Math.min(600, window.innerHeight - 340),
            size + start - (panel === 'indexWidth' ? e.clientX : e.clientY),
          ),
        ),
      })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const taskConfig = session.project
    ? session.tasks[session.project] || { build: '', run: '' }
    : { build: '', run: '' }
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <img src={logo} alt="Gantry logo" />
          <span>GANTRY</span>
        </div>
        <button
          className="project-selector"
          disabled={busy}
          onClick={() => openProject()}
          title="Open a project folder"
        >
          {projectName}
          <span className="down">⌄</span>
        </button>
        <button className="command-search" onClick={() => showPalette('commands')}>
          <Icon name="search" size={16} />
          <span>Search commands and files…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="header-actions">
          <button
            disabled={!session.project || busy || task.running}
            onClick={() => startTask('build')}
            title={taskConfig.build || 'Configure a build command'}
          >
            <Icon name="build" />
            Build
          </button>
          <button
            disabled={!session.project || busy || task.running}
            onClick={() => startTask('run')}
            title={taskConfig.run || 'Configure a run command'}
          >
            <Icon name="run" size={16} />
            Run
          </button>
          <button
            className="icon-button"
            title="Toggle bottom tray"
            aria-label="Toggle bottom tray"
            onClick={() => preferences({ trayVisible: !session.preferences.trayVisible })}
          >
            <Icon name="terminal" />
          </button>
          <button
            className="icon-button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettings(true)}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Workbench navigation">
          <button
            className={session.preferences.indexVisible ? 'active' : ''}
            onClick={() => preferences({ indexVisible: !session.preferences.indexVisible })}
          >
            <Icon name="folder" size={23} />
            <span>Workspace</span>
          </button>
          <button onClick={() => showPalette('files')} disabled={!session.project}>
            <Icon name="search" size={23} />
            <span>Search</span>
          </button>
          <button disabled title="Source control is planned for a later release">
            <Icon name="code" size={23} />
            <span>Source</span>
          </button>
          <button onClick={() => setSettings(true)}>
            <Icon name="settings" size={23} />
            <span>Settings</span>
          </button>
          <div className="rail-bottom">
            G<span>0.1</span>
          </div>
        </nav>
        <section className="workbench">
          <div className="tabs" role="tablist" aria-label="Open files">
            <div className="workbench-label">Workbench</div>
            {session.documents.map((doc, index) => (
              <div key={doc.id} className={`file-tab ${doc.id === session.active ? 'active' : ''}`}>
                <button
                  role="tab"
                  aria-selected={doc.id === session.active}
                  onClick={() => {
                    if (!busy) update((s) => ({ ...s, active: doc.id }))
                  }}
                  title={doc.path || 'Untitled'}
                >
                  <span className="tab-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="tab-text">
                    <span>
                      {baseName(doc.path)}
                      {doc.content !== doc.saved && <i className="dirty-dot" />}
                    </span>
                    <small>
                      {doc.path
                        ? relative(doc.path).split('/').slice(0, -1).join(' / ') || 'project root'
                        : 'unsaved file'}
                    </small>
                  </span>
                </button>
                <button
                  className="tab-close"
                  title={`Close ${baseName(doc.path)}`}
                  aria-label={`Close ${baseName(doc.path)}`}
                  disabled={busy}
                  onClick={() => closeFile(doc.id)}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
            <button
              className="new-tab"
              aria-label="New file"
              title="New file (Ctrl+N)"
              disabled={busy || !ready}
              onClick={newFile}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          {notice && (
            <div className="notice" role="alert">
              <span>{notice}</span>
              <button onClick={() => setNotice('')} aria-label="Dismiss notification">
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          <div className="editing-row">
            <main className="editor-area">
              <div className="breadcrumbs">
                <Icon name="chevron" size={14} />
                {active ? relative(active.path) || 'Untitled' : 'Your workbench'}
                {active && active.content !== active.saved && <i className="dirty-dot" />}
                <span className="breadcrumb-actions">
                  <button
                    disabled={!active || busy}
                    title="Save file"
                    aria-label="Save file"
                    onClick={() =>
                      active &&
                      void guarded(async () => {
                        await saveDocument(active.id)
                      })
                    }
                  >
                    <Icon name="save" size={15} />
                  </button>
                </span>
              </div>
              {active && conflicts[active.id] && (
                <div className="conflict" role="alert">
                  <span>{conflicts[active.id]}</span>
                  <button disabled={busy} onClick={reloadFile}>
                    Reload
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void guarded(async () => {
                        await saveDocument(active.id, true)
                      })
                    }
                  >
                    Save As
                  </button>
                </div>
              )}
              <div className="editor-stage">
                <div
                  ref={editorHost}
                  className="monaco-host"
                  style={{ visibility: active ? 'visible' : 'hidden' }}
                />
                {!active && (
                  <div className="welcome">
                    <img src={logo} alt="" />
                    <div className="eyebrow">A PLACE TO BUILD</div>
                    <h1>Make room for your next idea.</h1>
                    <p>
                      Open a project. Find your focus.
                      <br />
                      Everything you need, right at your workbench.
                    </p>
                    <button
                      className="primary"
                      disabled={busy || !ready}
                      onClick={() => openProject()}
                    >
                      <Icon name="folder" size={18} />
                      Open a project <kbd>Ctrl O</kbd>
                    </button>
                    <button className="quiet" onClick={newFile} disabled={!ready}>
                      Start with a new file <span>↗</span>
                    </button>
                    {session.recent.length > 0 && (
                      <div className="recent">
                        <div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div>
                        {session.recent.slice(0, 3).map((path) => (
                          <button key={path} onClick={() => openProject(path)}>
                            <Icon name="folder" size={15} />
                            <span>
                              {baseName(path)}
                              <small>{path}</small>
                            </span>
                            <span>↗</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </main>
            {session.preferences.indexVisible && (
              <>
                <div
                  className="resize-column"
                  role="separator"
                  aria-label="Resize Project Index"
                  onPointerDown={(event) => resizePanel(event, 'indexWidth')}
                />
                <aside className="project-index" style={{ width: session.preferences.indexWidth }}>
                  {session.project ? (
                    <Tree
                      project={session.project}
                      active={active?.path || ''}
                      openFile={openFile}
                      report={report}
                    />
                  ) : (
                    <>
                      <div className="section-label">Project index</div>
                      <div className="index-empty">
                        <Icon name="folder" size={30} />
                        <p>A home for your project.</p>
                        <small>Open a folder to explore its files.</small>
                        <button onClick={() => openProject()} disabled={!ready}>
                          Open folder
                        </button>
                      </div>
                    </>
                  )}
                </aside>
              </>
            )}
          </div>
        </section>
      </div>
      <section
        className="tray"
        style={{ height: session.preferences.trayVisible ? session.preferences.trayHeight : 0 }}
        aria-label="Bottom tray"
      >
        <div
          className="resize-row"
          role="separator"
          aria-label="Resize bottom tray"
          onPointerDown={(event) => resizePanel(event, 'trayHeight')}
        />
        <div className="tray-tabs">
          <button className={tray === 'output' ? 'active' : ''} onClick={() => setTray('output')}>
            Run log
          </button>
          <button
            className={tray === 'problems' ? 'active' : ''}
            onClick={() => setTray('problems')}
          >
            Problems
          </button>
          <button
            className={tray === 'terminal' ? 'active' : ''}
            onClick={() => setTray('terminal')}
          >
            Terminal
          </button>
          <span className="tray-status">
            {task.running
              ? `${task.label} running…`
              : task.code !== undefined
                ? `Exited ${task.code}`
                : 'Ready when you are'}
          </span>
          {task.running && (
            <button title="Stop task" onClick={() => void api.taskStop().catch(report)}>
              <Icon name="stop" size={13} />
              Stop
            </button>
          )}
          <button
            title="Hide tray"
            aria-label="Hide tray"
            onClick={() => preferences({ trayVisible: false })}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="tray-body">
          <Terminal
            project={session.project}
            visible={tray === 'terminal' && session.preferences.trayVisible}
            report={report}
          />
          {tray === 'output' &&
            (output ? (
              <pre className="output" ref={outputHost}>
                {output}
              </pre>
            ) : (
              <div className="tray-empty">
                <Icon name="terminal" size={22} />
                <p>Your next build starts here.</p>
                <small>
                  Configure Build and Run in Settings. Commands only run when you start them.
                </small>
              </div>
            ))}
          {tray === 'problems' && (
            <div className="tray-empty">
              <p>Compiler diagnostics aren’t connected yet.</p>
              <small>
                Build command output appears in Run Log. Monaco provides syntax coloring and
                built-in web-language checks.
              </small>
            </div>
          )}
        </div>
      </section>
      <footer className="statusbar">
        <span className="status-project">{session.project ? projectName : 'No project open'}</span>
        <span>
          {session.documents.length} open {session.documents.length === 1 ? 'file' : 'files'}
        </span>
        <span className="status-middle">
          {busy
            ? 'Working…'
            : active && active.content !== active.saved
              ? 'Unsaved changes'
              : 'Gantry'}
        </span>
        <span>{active ? language(active.path) : '—'}</span>
        <span>{active ? 'UTF-8' : '—'}</span>
        <span>{active ? (active.content.includes('\r\n') ? 'CRLF' : 'LF') : '—'}</span>
        <span>
          Ln {cursor.lineNumber}, Col {cursor.column}
        </span>
      </footer>
      {palette && (
        <div className="overlay" onMouseDown={() => setPalette(null)}>
          <section
            className="palette"
            role="dialog"
            aria-label={palette === 'files' ? 'Open file' : 'Command palette'}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="palette-input">
              <Icon name="search" />
              <input
                autoFocus
                aria-label={palette === 'files' ? 'Search files' : 'Search commands'}
                placeholder={
                  palette === 'files'
                    ? 'Find a file in your project…'
                    : 'What would you like to do?'
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setSelected((value) => Math.min(value + 1, choices.length - 1))
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setSelected((value) => Math.max(0, value - 1))
                  }
                  if (event.key === 'Enter' && choices[selected]) {
                    const action = choices[selected].action
                    setPalette(null)
                    action()
                  }
                }}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-list">
              {choices.map((choice, index) => (
                <button
                  key={choice.label}
                  className={index === selected ? 'selected' : ''}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => {
                    setPalette(null)
                    choice.action()
                  }}
                >
                  <span>{choice.label}</span>
                  <kbd>{choice.shortcut}</kbd>
                </button>
              ))}
              {choices.length === 0 && <p className="empty-results">No matching results</p>}
            </div>
            <div className="palette-footer">
              ↑ ↓ to navigate · Enter to select
              {palette === 'files' &&
                ' · searches up to 20,000 entries; dependency and build folders excluded'}
            </div>
          </section>
        </div>
      )}
      {settings && (
        <div className="overlay" onMouseDown={() => setSettings(false)}>
          <section
            className="settings-dialog"
            role="dialog"
            aria-label="Settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="dialog-title">
              <div>
                <div className="eyebrow">YOUR WORKBENCH</div>
                <h2>Settings</h2>
              </div>
              <button onClick={() => setSettings(false)} aria-label="Close settings">
                <Icon name="close" />
              </button>
            </div>
            <label>
              Editor font size{' '}
              <input
                aria-label="Editor font size"
                type="number"
                min="10"
                max="28"
                value={session.preferences.fontSize}
                onChange={(event) =>
                  preferences({ fontSize: Math.max(10, Math.min(28, Number(event.target.value))) })
                }
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={session.preferences.wordWrap}
                onChange={(event) => preferences({ wordWrap: event.target.checked })}
              />
              Wrap long lines
            </label>
            <div className="settings-divider" />
            <h3>Project commands</h3>
            <p>
              Commands run in {session.project ? projectName : 'the selected project'} using the
              system command shell. Save these locally, then use Build or Run to start them.
            </p>
            {(['build', 'run'] as const).map((kind) => (
              <label key={kind}>
                {kind === 'build' ? 'Build command' : 'Run command'}
                <input
                  aria-label={`${kind === 'build' ? 'Build' : 'Run'} command`}
                  disabled={!session.project}
                  placeholder={kind === 'build' ? 'e.g. npm run build' : 'e.g. npm run dev'}
                  value={taskConfig[kind]}
                  onChange={(event) => {
                    const value = event.target.value
                    update((s) => ({
                      ...s,
                      tasks: {
                        ...s.tasks,
                        [s.project!]: {
                          ...(s.tasks[s.project!] || { build: '', run: '' }),
                          [kind]: value,
                        },
                      },
                    }))
                  }}
                />
              </label>
            ))}
            <div className="settings-note">
              Preferences save automatically. Project commands never run on open.
            </div>
            <button className="primary" onClick={() => setSettings(false)}>
              Done
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
