import { existsSync } from 'node:fs'
import { dataFile, type Build } from '../config.ts'
import { installedBuild, serverExe } from '../server.ts'

const FILES = ['block_palette.nbt', 'block-state-shapes.nbt', 'packets.nbt', 'steve.json']

/** Prints one row per build: server installed, and which data files exist. Never fails. */
export function status (builds: Build[]): string[] {
  const head = ['build', 'server', ...FILES]
  const rows = builds.map(b => [
    b.serverVersion,
    existsSync(serverExe(b)) ? (installedBuild(b) ? 'yes' : 'reused') : '-',
    ...FILES.map(f => (existsSync(dataFile(b, f)) ? 'yes' : '-'))
  ])
  const width = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(width[i])).join('  '))
  return []
}
