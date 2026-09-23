import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BEDROCK_PROTOCOL_DIR, NODE_MINECRAFT_DATA_DIR, ROOT } from '../config.ts'

export function checkCheckouts (): void {
  for (const [what, dir, file] of [
    ['bedrock-protocol', BEDROCK_PROTOCOL_DIR, 'src/transforms/serializer.js'],
    ['node-minecraft-data', NODE_MINECRAFT_DATA_DIR, 'minecraft-data/data/dataPaths.json']
  ] as const) {
    if (!existsSync(join(dir, file))) throw new Error(`no ${what} checkout at ${dir} (missing ${file}): run pnpm install`)
  }
  // linked checkouts get no node_modules: bedrock-protocol's dependencies must resolve from this package
  const ours = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies ?? {}
  const theirs = JSON.parse(readFileSync(join(BEDROCK_PROTOCOL_DIR, 'package.json'), 'utf8')).dependencies ?? {}
  const missing = Object.keys(theirs).filter(d => !(d in ours))
  if (missing.length) throw new Error(`bedrock-protocol needs ${missing.join(', ')}: add ${missing.length > 1 ? 'them' : 'it'} to package.json dependencies`)
}

/** data.js lists every file of dataPaths.json: rebuild it whenever the data changes. */
export function generateDataJs (): void {
  execFileSync(process.execPath, [join(NODE_MINECRAFT_DATA_DIR, 'bin', 'generate_data.js')], { cwd: NODE_MINECRAFT_DATA_DIR, stdio: 'inherit' })
}
