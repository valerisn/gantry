import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Files, within } from '../src/main/files.ts'

test('file authorization, UTF-8 preservation and conflicting saves', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gantry-files-'))
  try {
    const project = path.join(root, 'project')
    await fs.mkdir(project)
    const file = path.join(project, 'hello.ts')
    await fs.writeFile(file, '\uFEFF// Hello — 🌻\r\n')
    await fs.writeFile(path.join(root, 'outside.txt'), 'outside')
    const files = new Files()
    await files.select(project)
    const opened = await files.read(file)
    assert.equal(opened.content, '\uFEFF// Hello — 🌻\r\n')
    await assert.rejects(files.read(path.join(root, 'outside.txt')), /outside/)
    assert.equal(within(project, `${project}-other/file`), false)
    await fs.writeFile(file, 'external edit')
    assert.equal(await files.write(file, 'my edit', opened.revision), null)
    assert.equal(await fs.readFile(file, 'utf8'), 'external edit')
    const fresh = await files.read(file)
    assert.equal((await files.write(file, 'my edit', fresh.revision))?.content, 'my edit')
    await fs.writeFile(path.join(project, 'binary'), Buffer.from([0, 1, 2]))
    await assert.rejects(files.read(path.join(project, 'binary')), /binary/)
    await fs.writeFile(path.join(project, 'invalid'), Buffer.from([0xff, 0xfe]))
    await assert.rejects(files.read(path.join(project, 'invalid')), /UTF-8/)
    await fs.mkdir(path.join(project, 'node_modules'))
    await fs.writeFile(path.join(project, 'node_modules', 'hidden.ts'), 'hidden')
    assert.deepEqual(await files.search('hello'), [file])
    assert.deepEqual(await files.search('hidden'), [])
    const newFile = await files.grantSavePath(path.join(root, 'save-as.txt'))
    assert.ok(await files.write(newFile, 'new document', null))
    assert.equal((await files.read(newFile)).content, 'new document')
    assert.equal((await fs.readdir(project)).some(name => name.includes('.gantry-')), false)
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
