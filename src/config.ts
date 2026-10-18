import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function pathSetting(name: string, fallback: string): string {
  const value = process.env[name] || fallback
  return isAbsolute(value) ? resolve(value) : resolve(ROOT, value)
}

export const PRISMARINE_MINECRAFT_DATA = 'https://github.com/PrismarineJS/minecraft-data'

// the bedrock-data checkout the files are made from
export const BEDROCK_DATA_DIR = pathSetting('BEDROCK_DATA_DIR', '../bedrock-data')
// the minecraft-data checkout they are written into
export const MINECRAFT_DATA_DIR = pathSetting('MINECRAFT_DATA_DIR', join('repos', 'minecraft-data'))
// a fork it is made `origin` for; PrismarineJS's own where unset
export const MINECRAFT_DATA_FORK = process.env.MINECRAFT_DATA_FORK || PRISMARINE_MINECRAFT_DATA
// the files `pnpm generate` writes where it names none: generators' keys, comma-separated, or all; unset, those of the
// pull request open to PrismarineJS (generators/index.ts: DEFAULT_KEYS)
export const GENERATE = (process.env.GENERATE ?? '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean)
// the minecraft-data version -> exact build pins
export const VERSIONS_FILE = join(ROOT, 'versions.json')
