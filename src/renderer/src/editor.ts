import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

self.MonacoEnvironment = { getWorker(_id, label) {
  if (label === 'json') return new JsonWorker()
  if (['css', 'scss', 'less'].includes(label)) return new CssWorker()
  if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
  if (['typescript', 'javascript'].includes(label)) return new TsWorker()
  return new EditorWorker()
} }
monaco.editor.defineTheme('gantry', {
  base: 'vs-dark', inherit: true,
  rules: [
    { token: 'comment', foreground: '819B70' }, { token: 'keyword', foreground: '74BDE8' },
    { token: 'string', foreground: 'ACC88A' }, { token: 'number', foreground: 'D9B77D' },
    { token: 'type', foreground: 'D8C3A0' }, { token: 'delimiter', foreground: 'D6D3CC' }
  ],
  colors: {
    'editor.background': '#171716', 'editor.foreground': '#DEDDD6',
    'editorLineNumber.foreground': '#747570', 'editorLineNumber.activeForeground': '#EDBB71',
    'editor.lineHighlightBackground': '#282319', 'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#E8B667', 'editor.selectionBackground': '#68533480',
    'editor.inactiveSelectionBackground': '#49443860', 'editorIndentGuide.background1': '#33332F',
    'editorWidget.background': '#242421', 'editorWidget.border': '#48443C',
    'focusBorder': '#D9AA62', 'input.background': '#191918', 'input.border': '#45443F'
  }
})
export function language(file: string): string {
  const extension = file.split('.').pop()?.toLowerCase() || ''
  const mapping: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', cpp: 'cpp', h: 'cpp', hpp: 'cpp', cc: 'cpp', c: 'c', py: 'python', rs: 'rust', go: 'go', md: 'markdown', html: 'html', css: 'css', scss: 'scss', xml: 'xml', yaml: 'yaml', yml: 'yaml', sh: 'shell', ps1: 'powershell', toml: 'ini', txt: 'plaintext', cmake: 'cmake' }
  return mapping[extension] || 'plaintext'
}
export { monaco }

