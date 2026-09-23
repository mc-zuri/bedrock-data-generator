import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BEDROCK_PROTOCOL_DIR, NODE_MINECRAFT_DATA_DIR } from '../config.ts'

interface Checkout { url: string, dir: string, submodules: boolean, branch?: string }

const checkouts: Checkout[] = [
  { url: 'https://github.com/PrismarineJS/node-minecraft-data', dir: NODE_MINECRAFT_DATA_DIR, submodules: true },
  // the fork until PrismarineJS/bedrock-protocol has the nbtLoop size fix: without it level_event_generic never validates
  { url: 'https://github.com/mc-zuri/bedrock-protocol', dir: BEDROCK_PROTOCOL_DIR, submodules: false, branch: 'fix-nbtloop-size' }
]

/** Clones a checkout only when its dir is missing: an existing one is never touched (commit fixes in it). */
export function cloneCheckouts (): void {
  for (const { url, dir, submodules, branch } of checkouts) {
    if (!existsSync(dir)) {
      console.log(`cloning ${url}${branch ? ` (${branch})` : ''} into ${dir}`)
      const options = [...(submodules ? ['--recurse-submodules'] : []), ...(branch ? ['--branch', branch] : [])]
      execFileSync('git', ['clone', ...options, url, dir], { stdio: 'inherit' })
    } else if (submodules && !existsSync(join(dir, 'minecraft-data', 'data'))) {
      // cloned without --recurse-submodules: its submodule is still empty
      execFileSync('git', ['submodule', 'update', '--init'], { cwd: dir, stdio: 'inherit' })
    }
  }
}
