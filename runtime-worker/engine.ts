import { once } from 'node:events'
import { createEngineProtocol } from './protocol'

const maximumLineBytes = 2 * 1024 * 1024
const handle = createEngineProtocol()
let parts: Buffer[] = [], length = 0
let failed = false
function stop() {
  if (!failed) process.stderr.write('Engine gestopt: protocol- of streamfout.\n')
  failed = true
  process.exitCode = 1
  process.stdin.destroy()
}
// Closing the companion's read pipe must not produce an uncaught Node stack trace.
process.stdout.on('error', stop)

async function reply(line: Buffer) {
  let input: unknown
  try { input = JSON.parse(line.toString('utf8')) } catch { input = undefined }
  if (!process.stdout.write(JSON.stringify(handle(input)) + '\n')) await once(process.stdout, 'drain')
}

try {
  for await (const chunk of process.stdin) {
    const buffer = chunk as Buffer
    let start = 0
    while (start < buffer.length) {
      const newline = buffer.indexOf(10, start)
      const end = newline < 0 ? buffer.length : newline
      const part = buffer.subarray(start, end)
      length += part.length
      if (length > maximumLineBytes) throw new Error()
      parts.push(part)
      if (newline >= 0) {
        await reply(Buffer.concat(parts, length))
        parts = []; length = 0
      }
      start = end + 1
    }
  }
  // EOF without a newline is a complete final message, not a timer or a keepalive.
  if (length) await reply(Buffer.concat(parts, length))
} catch {
  stop()
}
