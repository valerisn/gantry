import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge, ProcessEvent } from '../shared/types'

const bridge: Bridge = {
  restore: () => ipcRenderer.invoke('session:restore'),
  persist: (session) => ipcRenderer.invoke('session:persist', session),
  chooseProject: (recent) => ipcRenderer.invoke('project:choose', recent),
  list: (path) => ipcRenderer.invoke('files:list', path),
  search: (query) => ipcRenderer.invoke('files:search', query),
  read: (path) => ipcRenderer.invoke('files:read', path),
  save: (doc, saveAs) => ipcRenderer.invoke('files:save', doc, saveAs),
  confirm: (name) => ipcRenderer.invoke('files:confirm', name),
  terminalStart: (cols, rows) => ipcRenderer.invoke('terminal:start', cols, rows),
  terminalWrite: (data) => ipcRenderer.invoke('terminal:write', data),
  terminalResize: (cols, rows) => ipcRenderer.invoke('terminal:resize', cols, rows),
  terminalStop: () => ipcRenderer.invoke('terminal:stop'),
  taskStart: (kind, command) => ipcRenderer.invoke('task:start', kind, command),
  taskStop: () => ipcRenderer.invoke('task:stop'),
  close: () => ipcRenderer.invoke('window:close'),
  onProcess: (callback) => {
    const listener = (_: unknown, event: ProcessEvent) => callback(event)
    ipcRenderer.on('process:event', listener)
    return () => {
      ipcRenderer.removeListener('process:event', listener)
    }
  },
  onClose: (callback) => {
    ipcRenderer.on('window:closing', callback)
    return () => {
      ipcRenderer.removeListener('window:closing', callback)
    }
  },
}
contextBridge.exposeInMainWorld('gantry', bridge)
