import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, opendir } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'

export function hostRuntime(platform = process.platform, arch = process.arch) {
  const systems = { darwin: 'osx', win32: 'win', linux: 'linux' }
  if (!systems[platform] || !['arm64', 'x64'].includes(arch))
    throw new Error('Niet-ondersteund distributieplatform. Gebruik macOS, Windows of Linux op x64/arm64.')
  return `${systems[platform]}-${arch}`
}
export function packagePath(root, name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\\') ||
    name.split('/').some((part) => !part || part === '.' || part === '..') ||
    name.startsWith('/')
  )
    throw new Error('Ongeldig pad in distributiemanifest.')
  const path = resolve(root, name)
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Distributiepad buiten pakket.')
  return path
}
async function digest(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
export async function packageFiles(root) {
  const files = []
  let count = 0,
    bytes = 0
  async function walk(folder, depth) {
    if (depth > 12) throw new Error('Distributiemap te diep genest.')
    for await (const entry of await opendir(folder)) {
      if (++count > 2048) throw new Error('Distributie bevat te veel bestanden.')
      const file = resolve(folder, entry.name)
      if (entry.isSymbolicLink()) throw new Error('Distributie mag geen symbolische links bevatten.')
      if (entry.isDirectory()) await walk(file, depth + 1)
      else if (entry.isFile()) {
        const path = relative(root, file).split(sep).join('/')
        if (path === 'lightlab-distribution.json') continue
        const size = (await lstat(file)).size
        bytes += size
        if (bytes > 600_000_000) throw new Error('Distributie overschrijdt de verificatielimiet.')
        files.push({ path, bytes: size })
      } else throw new Error('Distributie bevat een niet-ondersteund bestandstype.')
    }
  }
  await walk(root, 0)
  // Preflight the entire actual tree before hashing, not just its claimed manifest sizes.
  const result = []
  for (const file of files) result.push({ ...file, sha256: await digest(packagePath(root, file.path)) })
  return result.sort((a, b) => a.path.localeCompare(b.path))
}
export async function verifyDistribution(root) {
  const manifestPath = resolve(root, 'lightlab-distribution.json')
  const manifestInfo = await lstat(manifestPath)
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 1_000_000)
    throw new Error('Distributiemanifest ongeldig of te groot.')
  const value = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (
    value.format !== 'lightlab-distribution' ||
    value.version !== 1 ||
    value.rid !== hostRuntime() ||
    !Array.isArray(value.files) ||
    value.files.length > 2048
  )
    throw new Error('Dit pakket is niet geschikt voor dit systeem of het manifest is ongeldig.')
  const seen = new Set()
  let total = 0
  for (const entry of value.files) {
    packagePath(root, entry.path)
    if (
      seen.has(entry.path) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('Ongeldige distributiecontrole.')
    seen.add(entry.path)
    total += entry.bytes
    if (total > 600_000_000) throw new Error('Distributie overschrijdt de verificatielimiet.')
  }
  const runtime = `runtime/Lightflow.Runtime${process.platform === 'win32' ? '.exe' : ''}`
  for (const required of [
    runtime,
    `bin/node${process.platform === 'win32' ? '.exe' : ''}`,
    'dist/index.html',
    'runtime-worker/dist/engine.mjs',
    'scripts/start-local.mjs',
    'scripts/local-launcher.mjs',
    'scripts/runtime-manager.mjs',
    'scripts/distribution.mjs',
  ])
    if (!seen.has(required)) throw new Error('Distributie mist een vereist onderdeel.')
  // Compare every shipped file, not only filenames listed in a potentially incomplete manifest.
  const actual = await packageFiles(root)
  if (JSON.stringify(actual) !== JSON.stringify([...value.files].sort((a, b) => a.path.localeCompare(b.path))))
    throw new Error(
      'Distributiecontrole mislukt. Pak een ongewijzigd Lightlab-pakket opnieuw uit; je browsergegevens blijven intact.',
    )
  return { ...value, runtime: packagePath(root, runtime) }
}
