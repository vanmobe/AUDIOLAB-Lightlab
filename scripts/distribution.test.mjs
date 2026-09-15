import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { hostRuntime, packageFiles, packagePath, verifyDistribution } from './distribution.mjs'

async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'lightlab-distribution-test-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const root = join(temp, 'package')
  await mkdir(root)
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const names = [
    `runtime/Lightflow.Runtime${suffix}`,
    `bin/node${suffix}`,
    'dist/index.html',
    'runtime-worker/dist/engine.mjs',
    'scripts/start-local.mjs',
    'scripts/local-launcher.mjs',
    'scripts/runtime-manager.mjs',
    'scripts/distribution.mjs',
  ]
  for (const name of names) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), `test fixture ${name}`)
  }
  const manifestPath = join(root, 'lightlab-distribution.json')
  const manifest = { format: 'lightlab-distribution', version: 1, rid: hostRuntime(), files: await packageFiles(root) }
  const publish = async () => writeFile(manifestPath, JSON.stringify(manifest))
  await publish()
  return { root, temp, manifestPath, manifest, publish }
}
test('verifies a complete host-native package and its required runtime path', async (t) => {
  const { root, manifest } = await fixture(t)
  const result = await verifyDistribution(root)
  assert.equal(result.rid, hostRuntime())
  assert.equal(result.files.length, manifest.files.length)
  assert.equal(result.runtime, join(root, `runtime/Lightflow.Runtime${process.platform === 'win32' ? '.exe' : ''}`))
})
test('detects changed bytes, extra files and missing shipped files', async (t) => {
  const { root } = await fixture(t),
    index = join(root, 'dist/index.html'),
    original = await readFile(index)
  await writeFile(index, 'tampered')
  await assert.rejects(verifyDistribution(root), /Distributiecontrole mislukt/)
  await writeFile(index, original)
  await writeFile(join(root, 'extra.txt'), 'unexpected')
  await assert.rejects(verifyDistribution(root), /Distributiecontrole mislukt/)
  await rm(join(root, 'extra.txt'))
  await rm(index)
  await assert.rejects(verifyDistribution(root), /Distributiecontrole mislukt/)
})
test('rejects omitted required components, duplicate entries and path traversal in a manifest', async (t) => {
  const { root, manifest, publish } = await fixture(t),
    original = structuredClone(manifest.files)
  manifest.files = manifest.files.filter((file) => file.path !== 'dist/index.html')
  await publish()
  await assert.rejects(verifyDistribution(root), /mist een vereist onderdeel/)
  manifest.files = [...original, original[0]]
  await publish()
  await assert.rejects(verifyDistribution(root), /Ongeldige distributiecontrole/)
  manifest.files = [{ ...original[0], path: '../outside' }, ...original.slice(1)]
  await publish()
  await assert.rejects(verifyDistribution(root), /Ongeldig pad/)
})
test('rejects unsupported or foreign runtime targets', async (t) => {
  assert.throws(() => hostRuntime('freebsd', 'x64'), /Niet-ondersteund/)
  assert.throws(() => hostRuntime('linux', 'ia32'), /Niet-ondersteund/)
  const { root, manifest, publish } = await fixture(t)
  manifest.rid = 'unsupported-x64'
  await publish()
  await assert.rejects(verifyDistribution(root), /niet geschikt/)
})
test(
  'rejects symlinked manifest and symlinked contents before following their targets',
  {
    skip:
      process.platform === 'win32' ? 'Windows symlink creation requires elevated/developer-mode permissions.' : false,
  },
  async (t) => {
    const { root, temp, manifestPath } = await fixture(t)
    const outside = join(temp, 'outside.json')
    await writeFile(outside, await readFile(manifestPath))
    await rm(manifestPath)
    await symlink(outside, manifestPath)
    await assert.rejects(verifyDistribution(root), /manifest ongeldig/)
    await rm(manifestPath)
    await writeFile(manifestPath, await readFile(outside))
    await symlink(outside, join(root, 'escape.json'))
    await assert.rejects(verifyDistribution(root), /symbolische links/)
  },
)
test('bounds manifest bytes and claimed total bytes', async (t) => {
  const { root, manifest, manifestPath, publish } = await fixture(t)
  await writeFile(manifestPath, ' '.repeat(1_000_001))
  await assert.rejects(verifyDistribution(root), /manifest ongeldig of te groot/)
  manifest.files[0].bytes = 600_000_001
  await publish()
  await assert.rejects(verifyDistribution(root), /verificatielimiet/)
})
test('preflights actual oversized files before hashing despite small claimed manifest sizes', async (t) => {
  const { root } = await fixture(t)
  const file = await open(join(root, 'dist/oversized.bin'), 'w')
  try {
    await file.truncate(600_000_001)
  } finally {
    await file.close()
  }
  await assert.rejects(verifyDistribution(root), /verificatielimiet/)
})
test('bounds manifest entry count, real directory count and nesting', async (t) => {
  const { root, manifest, publish } = await fixture(t)
  manifest.files = Array.from({ length: 2049 }, () => manifest.files[0])
  await publish()
  await assert.rejects(verifyDistribution(root), /manifest is ongeldig/)
  const countRoot = join(root, 'count')
  await mkdir(countRoot)
  for (let index = 0; index < 2049; index++) await mkdir(join(countRoot, `entry-${index}`))
  await assert.rejects(packageFiles(countRoot), /te veel bestanden/)
  const deepRoot = join(root, 'deep')
  await mkdir(join(deepRoot, ...Array.from({ length: 13 }, () => 'child')), { recursive: true })
  await assert.rejects(packageFiles(deepRoot), /te diep genest/)
})
test('rejects nonportable and escaped paths without resolving outside the root', () => {
  for (const path of ['', '/etc/passwd', '../outside', 'a/../b', 'a//b', 'a\\b', './x'])
    assert.throws(() => packagePath('/temporary-root', path), /Ongeldig pad/)
})
