import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { emptySession, SessionStore, validateSession } from '../src/main/session.ts'

test('recovery saves are serialized and preserve unsaved buffers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gantry-session-'))
  try {
    const store = new SessionStore(root)
    const first = emptySession()
    first.documents.push({ id: 'one', path: '', content: 'unsaved — 🌻', saved: '', revision: '' })
    first.active = 'one'
    const second = structuredClone(first)
    second.documents[0].content += '\nsecond edit'
    await Promise.all([store.save(first), store.save(second)])
    assert.deepEqual(await store.load(), second)
    const malformed = structuredClone(second)
    malformed.preferences.indexWidth = -50
    assert.throws(() => validateSession(malformed), /Invalid panel/)
    await fs.writeFile(path.join(root, 'session.json'), '{broken')
    assert.deepEqual(await store.load(), emptySession())
    assert.ok((await fs.readdir(root)).some((file) => file.startsWith('session.json.recovery-')))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
