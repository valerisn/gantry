import { useEffect, useState } from 'react'
import type { Entry } from '../../shared/types'
import { Icon } from './Icons'

function Folder({
  path,
  depth,
  active,
  openFile,
  report,
}: {
  path: string
  depth: number
  active: string
  openFile: (path: string) => void
  report: (error: unknown) => void
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false
    window.gantry
      .list(path)
      .then((list) => {
        if (!cancelled) setEntries(list)
      })
      .catch(report)
    return () => {
      cancelled = true
    }
  }, [path])
  if (!entries) return <div className="tree-hint">Loading…</div>
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.path}>
          <button
            className={`tree-item ${active === entry.path ? 'selected' : ''}`}
            style={{ paddingLeft: 12 + depth * 17 }}
            title={entry.path}
            onClick={() =>
              entry.directory
                ? setExpanded((old) => {
                    const next = new Set(old)
                    next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path)
                    return next
                  })
                : openFile(entry.path)
            }
            aria-expanded={entry.directory ? expanded.has(entry.path) : undefined}
          >
            {entry.directory ? (
              <span className={expanded.has(entry.path) ? 'expanded' : ''}>
                <Icon name="chevron" size={12} />
              </span>
            ) : (
              <span className="tree-spacer" />
            )}
            <Icon name={entry.directory ? 'folder' : 'file'} size={15} />
            <span>{entry.name}</span>
          </button>
          {entry.directory && expanded.has(entry.path) && (
            <Folder
              path={entry.path}
              depth={depth + 1}
              active={active}
              openFile={openFile}
              report={report}
            />
          )}
        </div>
      ))}
      {entries.length === 0 && <div className="tree-hint">Empty folder</div>}
      {entries.length === 4000 && (
        <div className="tree-hint">First 4,000 entries shown. Use Open File for more.</div>
      )}
    </>
  )
}
export function Tree({
  project,
  active,
  openFile,
  report,
}: {
  project: string
  active: string
  openFile: (path: string) => void
  report: (error: unknown) => void
}) {
  const [version, setVersion] = useState(0)
  return (
    <>
      <div className="section-label">
        Project index{' '}
        <button
          title="Refresh project tree"
          aria-label="Refresh project tree"
          onClick={() => setVersion((v) => v + 1)}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>
      <div className="tree-root">
        <Icon name="folder" size={17} />
        {project.split(/[\\/]/).pop()}
      </div>
      <div className="tree-scroll">
        <Folder
          key={`${project}:${version}`}
          path={project}
          depth={1}
          active={active}
          openFile={openFile}
          report={report}
        />
      </div>
      <div className="index-footer">
        <span className="tiny-dot" /> Filesystem · UTF-8 text files
      </div>
    </>
  )
}
