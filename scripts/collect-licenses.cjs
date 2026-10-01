const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const visited = new Set()
const notices = ['Gantry — third-party notices\n']

function collect(name, from) {
  const resolver = createRequire(path.join(from, 'package.json'))
  let directory
  try {
    directory = path.dirname(resolver.resolve(`${name}/package.json`))
  } catch {
    directory = path.dirname(resolver.resolve(name))
    while (!fs.existsSync(path.join(directory, 'package.json'))) directory = path.dirname(directory)
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
  const identity = `${pkg.name}@${pkg.version}`
  if (visited.has(identity)) return
  visited.add(identity)
  notices.push(
    `\n${'='.repeat(72)}\n${identity}\nLicense: ${pkg.license || 'See package notices'}\n`,
  )
  for (const file of fs.readdirSync(directory)) {
    if (
      /^(licen[cs]e|copying|notice)(\.|$)/i.test(file) &&
      fs.statSync(path.join(directory, file)).isFile()
    ) {
      notices.push(fs.readFileSync(path.join(directory, file), 'utf8'))
    }
  }
  for (const dependency of Object.keys(pkg.dependencies || {})) collect(dependency, directory)
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const dependency of Object.keys(pkg.dependencies)) collect(dependency, root)
fs.mkdirSync(path.join(root, 'out'), { recursive: true })
fs.writeFileSync(path.join(root, 'out', 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'))
console.log(`Collected notices for ${visited.size} dependencies.`)
