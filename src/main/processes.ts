import * as pty from 'node-pty'
import { spawn, type ChildProcess } from 'node:child_process'
import type { ProcessEvent } from '../shared/types'
import { text } from './files'

export class Processes {
  private terminal: pty.IPty | null = null
  private task: ChildProcess | null = null
  private emit: (event: ProcessEvent) => void
  constructor(emit: (event: ProcessEvent) => void) { this.emit = emit }

  startTerminal(cwd: string, cols: number, rows: number): void {
    if (this.terminal) return
    this.size(cols, rows)
    const terminal = pty.spawn(process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/sh'),
      process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : [],
      { name: 'xterm-256color', cols, rows, cwd, env: process.env as Record<string, string> })
    this.terminal = terminal
    terminal.onData(data => this.emit({ type: 'terminal', data }))
    terminal.onExit(({ exitCode }) => { if (this.terminal === terminal) this.terminal = null; this.emit({ type: 'terminal', exitCode }) })
  }
  write(data: string): void { this.terminal?.write(text(data, 65536)) }
  resize(cols: number, rows: number): void { this.size(cols, rows); this.terminal?.resize(cols, rows) }
  private size(cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 1000 || rows < 1 || rows > 500) throw new Error('Invalid terminal size')
  }
  stopTerminal(): void { const current = this.terminal; this.terminal = null; current?.kill() }

  startTask(cwd: string, label: 'build' | 'run', command: string): void {
    if (this.task) throw new Error('Stop the running task first')
    if (!text(command, 8192).trim()) throw new Error('Configure a command in Settings first')
    const child = spawn(command, { cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    this.task = child
    this.emit({ type: 'task', label, data: `$ ${command}\r\n` })
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', data => this.emit({ type: 'task', data }))
    child.stderr?.on('data', data => this.emit({ type: 'task', data }))
    child.on('error', error => this.emit({ type: 'task', data: `${error.message}\n` }))
    child.on('close', code => {
      if (this.task === child) this.task = null
      this.emit({ type: 'task', exitCode: code ?? -1 })
    })
  }
  async stopTask(): Promise<void> {
    const child = this.task
    if (!child?.pid) return
    if (process.platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
        killer.on('error', reject)
        killer.on('close', () => resolve())
      })
    } else { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }
  }
  async dispose(): Promise<void> { this.stopTerminal(); await this.stopTask() }
}
