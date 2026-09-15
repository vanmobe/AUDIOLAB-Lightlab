import { spawnSync } from 'node:child_process'
import { chmod, copyFile, cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { hostRuntime, packageFiles, verifyDistribution } from './distribution.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rid = hostRuntime()
// Host-native packaging preserves the installed Node provenance; cross-target builds run on that target host.
const destination = resolve(
  root,
  'output/releases',
  `Lightlab-${rid}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`,
)
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, timeout: 600_000 })
  if (result.error || result.status !== 0)
    throw new Error(`Distributiestap mislukt: ${command}. Onvolledige map: ${destination}`)
}
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 of hoger vereist voor bouwen.')
  await mkdir(destination, { recursive: true })
  run('dotnet', [
    'publish',
    'runtime',
    '-c',
    'Release',
    '-r',
    rid,
    '--self-contained',
    'true',
    '-p:PublishTrimmed=false',
    '-p:DebugType=None',
    '-p:DebugSymbols=false',
    '-o',
    resolve(destination, 'runtime'),
  ])
  for (const folder of ['bin', 'scripts', 'licenses']) await mkdir(resolve(destination, folder), { recursive: true })
  for (const folder of ['dist', 'runtime-worker/dist'])
    await cp(resolve(root, folder), resolve(destination, folder), {
      recursive: true,
      dereference: true,
      errorOnExist: true,
    })
  for (const name of ['start-local.mjs', 'local-launcher.mjs', 'runtime-manager.mjs', 'distribution.mjs'])
    await copyFile(resolve(root, 'scripts', name), resolve(destination, 'scripts', name))
  const node = await realpath(process.execPath)
  if (process.platform === 'darwin') {
    const linkage = spawnSync('/usr/bin/otool', ['-L', node], { encoding: 'utf8', timeout: 10_000 })
    if (
      linkage.status !== 0 ||
      linkage.stdout
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => !line.startsWith('/usr/lib/') && !line.startsWith('/System/Library/'))
    )
      throw new Error(
        'Node vereist niet-gebundelde bibliotheken. Bouw met de officiële zelfstandige Node-distributie (bijvoorbeeld via nvm), niet een Homebrew-build met externe libraries.',
      )
  }
  if (process.platform === 'linux') {
    const linkage = spawnSync('ldd', [node], { encoding: 'utf8', timeout: 10_000 })
    const allowed = /^(linux-vdso|lib(c|m|stdc\+\+|gcc_s|pthread|dl|rt)\.|\/.*ld-linux)/
    if (
      linkage.status !== 0 ||
      linkage.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => !allowed.test(line) || line.includes('not found'))
    )
      throw new Error(
        'Gebruik een officiële Node-binary met alleen systeemafhankelijkheden; deze Node-build vereist externe libraries.',
      )
  }
  await copyFile(node, resolve(destination, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'))
  const nodeLicense =
    process.env.LIGHTLAB_NODE_LICENSE ?? resolve(dirname(node), process.platform === 'win32' ? 'LICENSE' : '../LICENSE')
  await copyFile(nodeLicense, resolve(destination, 'licenses/NODE.txt'))
  const list = spawnSync('dotnet', ['--list-runtimes'], { encoding: 'utf8', timeout: 10_000 })
  const sharedPath = list.stdout?.match(/Microsoft\.NETCore\.App 10\.[^\n]*\[([^\]]+)\]/)?.[1]
  if (!sharedPath) throw new Error('Licentiemap van .NET 10 niet gevonden.')
  const dotnetRoot = resolve(sharedPath, '../..')
  await copyFile(resolve(dotnetRoot, 'LICENSE.txt'), resolve(destination, 'licenses/DOTNET.txt'))
  await copyFile(resolve(dotnetRoot, 'ThirdPartyNotices.txt'), resolve(destination, 'licenses/DOTNET-THIRD-PARTY.txt'))
  for (const name of ['react', 'react-dom', 'three'])
    await copyFile(resolve(root, 'node_modules', name, 'LICENSE'), resolve(destination, 'licenses', `${name}.txt`))
  const unixStart =
    '#!/bin/sh\nlightlab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1\n"$lightlab_dir/bin/node" "$lightlab_dir/scripts/start-local.mjs" --browser\nlightlab_result=$?\nif [ "$lightlab_result" -ne 0 ]; then printf "\\nLightlab kon niet starten. Druk op Enter om dit venster te sluiten."; read -r lightlab_reply; fi\nexit "$lightlab_result"\n'
  const entry =
    process.platform === 'win32'
      ? 'Start Lightlab.cmd'
      : process.platform === 'darwin'
        ? 'Start Lightlab.command'
        : 'Start Lightlab.sh'
  await writeFile(
    resolve(destination, entry),
    process.platform === 'win32'
      ? '@echo off\r\n"%~dp0bin\\node.exe" "%~dp0scripts\\start-local.mjs" --browser\r\nif errorlevel 1 pause\r\n'
      : unixStart,
  )
  if (process.platform !== 'win32') {
    await chmod(resolve(destination, entry), 0o755)
    await chmod(resolve(destination, 'bin/node'), 0o755)
  }
  await writeFile(
    resolve(destination, 'LEES MIJ.txt'),
    `LIGHTLAB — by Audiolab\n\n1. Kopieer de volledige map naar een lokale locatie. Houd alle bestanden samen.\n2. Start '${entry}'. Node en .NET zijn inbegrepen; geen installatie nodig.\n3. Houd het terminalvenster open. Ctrl+C stopt webapp en runtime.\n\nDeze distributie is voor ${rid}. Je browser bewaart shows per oorsprong: gebruik steeds http://127.0.0.1:5173. Exporteer/importeer om tussen browsers/computers of localhost en 127.0.0.1 te wisselen. Maak regelmatig een externe back-up.\n\nOllama en modellen zijn optioneel en NIET inbegrepen. Er wordt niets gedownload. Fysieke output begint uitgeschakeld. Sluit een eerdere Lightlab/devsessie bij bezette poorten; dit programma stopt geen vreemde processen.\n\nDit lokale pakket is niet met een externe uitgeversidentiteit ondertekend/notarized. Beheer toestemming volgens je OS-beleid; schakel beveiliging niet globaal uit. Controleer de herkomst voordat je het start.\n\nVerwijderen: verwijder uitsluitend deze distributiemap. Browsergegevens worden daardoor niet gewist. Nieuwe versie: sluit eerst Lightlab, pak de nieuwe map apart uit en bewaar de vorige map voor rollback. Exporteer shows vóór teruggaan naar een oudere versie.\n`,
  )
  const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
  await writeFile(
    resolve(destination, 'lightlab-distribution.json'),
    JSON.stringify(
      {
        format: 'lightlab-distribution',
        version: 1,
        appVersion: version,
        rid,
        builtAt: new Date().toISOString(),
        nodeVersion: process.version,
        nodeSource: 'Build-host Node executable; exact bytes included in file hashes',
        files: await packageFiles(destination),
      },
      null,
      2,
    ),
  )
  await verifyDistribution(destination)
  console.log(`Zelfstandig Lightlab-pakket geverifieerd: ${destination}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Distributie mislukt.')
  process.exitCode = 1
}
