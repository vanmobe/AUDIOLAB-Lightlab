import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { staticApplication } from './local-launcher.mjs'
import { request } from 'node:http'

test('local built app serves assets but rejects methods, foreign hosts and escaped/symlink paths', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'lightlab-server-test-'))
  const dist = join(temp, 'dist')
  await mkdir(dist)
  await mkdir(join(dist, 'assets'))
  await writeFile(join(dist, 'index.html'), '<h1>Lightlab</h1>')
  await writeFile(join(dist, 'assets/app.js'), 'export {}')
  await writeFile(join(temp, 'outside.txt'), 'private')
  const server = staticApplication(dist, 0)
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}`
    const get = (path, options = {}) => fetch(url + path, options)
    const index = await get('/')
    assert.equal(index.status, 200)
    assert.equal(index.headers.get('cache-control'), 'no-store')
    assert.equal(await index.text(), '<h1>Lightlab</h1>')
    assert.match((await get('/assets/app.js')).headers.get('content-type'), /javascript/)
    assert.equal((await get('/', { method: 'POST' })).status, 405)
    const foreign = await new Promise((resolve) => {
      const req = request(url, { headers: { Host: 'foreign.test' } }, (response) => {
        response.resume()
        resolve(response.statusCode)
      })
      req.end()
    })
    assert.equal(foreign, 403)
    assert.equal((await get('/%2e%2e%2foutside.txt')).status, 404)
    assert.equal((await get('/.env')).status, 404)
    if (process.platform !== 'win32') {
      await symlink(join(temp, 'outside.txt'), join(dist, 'escape.txt'))
      assert.equal((await get('/escape.txt')).status, 404)
    }
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(temp, { recursive: true })
  }
})
