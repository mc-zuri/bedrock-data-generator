import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { NATIVE_BIN, type Build } from '../config.ts'
import { serverExe } from '../server.ts'

export const checkExe = join(NATIVE_BIN, 'bdg_check.exe')

/** Resolves native/bindings against each build's exe without starting it. Prints what does not resolve. */
export function check (builds: Build[]): string[] {
  if (!existsSync(checkExe)) throw new Error(`no ${checkExe} (run pnpm build:native)`)
  const failed: string[] = []
  const verbose = builds.length === 1
  for (const b of builds) {
    if (!existsSync(serverExe(b))) {
      failed.push(b.serverVersion)
      console.error(`  ${b.serverVersion}: no server (run pnpm servers)`)
      continue
    }
    const r = spawnSync(checkExe, [serverExe(b), b.serverVersion], { encoding: 'utf8' })
    const lines = r.stdout.trim().split('\n')
    const failures = lines.filter(l => l.startsWith('FAILED\t')).map(l => l.slice(7))
    if (verbose) for (const l of lines) console.log(`  ${l}`)
    if (r.status !== 0) {
      failed.push(b.serverVersion)
      console.error(`  ${b.serverVersion}: ${failures.join('; ') || r.stderr.trim() || `exit ${r.status}`}`)
    } else if (!verbose) {
      console.log(`  ${b.serverVersion}: ok`)
    }
  }
  console.log(`check: ${builds.length - failed.length}/${builds.length} resolve`)
  return failed
}
