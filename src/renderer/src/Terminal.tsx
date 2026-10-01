import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function Terminal({ project, visible, report }: { project: string | null; visible: boolean; report: (error: unknown) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const fit = useRef<FitAddon | null>(null)
  const [started, setStarted] = useState(false)
  const [ended, setEnded] = useState(false)
  useEffect(() => { setStarted(false); setEnded(false) }, [project])
  useEffect(() => {
    if (!started || !project || !host.current) return
    const terminal = new XTerminal({ fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000, theme: { background: '#171716', foreground: '#D6D3CC', cursor: '#EABB72', selectionBackground: '#655238' } })
    const addon = new FitAddon(); fit.current = addon; terminal.loadAddon(addon); terminal.open(host.current); addon.fit()
    const input = terminal.onData(data => { void window.gantry.terminalWrite(data).catch(report) })
    const resize = terminal.onResize(({ cols, rows }) => { void window.gantry.terminalResize(cols, rows).catch(report) })
    const remove = window.gantry.onProcess(event => {
      if (event.type !== 'terminal') return
      if (event.data) terminal.write(event.data)
      if (event.exitCode !== undefined) { terminal.writeln(`\r\nShell exited (${event.exitCode}).`); setEnded(true) }
    })
    void window.gantry.terminalStart(terminal.cols, terminal.rows).catch(error => { report(error); setEnded(true) })
    const observer = new ResizeObserver(() => { if (host.current?.clientHeight) addon.fit() })
    observer.observe(host.current)
    return () => { observer.disconnect(); remove(); input.dispose(); resize.dispose(); terminal.dispose(); fit.current = null; void window.gantry.terminalStop().catch(report) }
  }, [started, project])
  useEffect(() => { if (visible) requestAnimationFrame(() => fit.current?.fit()) }, [visible])
  return <div className="terminal-surface" style={{ display: visible ? 'flex' : 'none' }}>
    {!started ? <div className="tray-empty"><p>{project ? 'A shell in your project, ready when you are.' : 'Open a project to use the terminal.'}</p><button disabled={!project} onClick={() => setStarted(true)}>Start terminal</button></div> : <div className="terminal-host" ref={host} />}
    {ended && <button className="restart-terminal" onClick={() => { setStarted(false); setEnded(false) }}>New terminal</button>}
  </div>
}
