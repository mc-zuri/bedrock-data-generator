import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function dir (name: string, fallback: string): string {
  const value = process.env[name] || fallback
  return isAbsolute(value) ? resolve(value) : resolve(ROOT, value)
}

function int (name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer, not ${process.env[name]}`)
  return value
}

export const SERVERS_DIR = dir('SERVERS_DIR', 'servers')
export const DATA_DIR = join(ROOT, 'data')
export const WORK_DIR = join(ROOT, 'work')
// the clones pnpm install makes (src/checkouts): package.json links bedrock-protocol and minecraft-data to them
export const CHECKOUTS_DIR = join(ROOT, 'checkouts')
export const BEDROCK_PROTOCOL_DIR = join(CHECKOUTS_DIR, 'bedrock-protocol')
export const NODE_MINECRAFT_DATA_DIR = join(CHECKOUTS_DIR, 'node-minecraft-data')
/** the minecraft-data repo (node-minecraft-data's submodule): data/dataPaths.json, data/bedrock/<version>/ */
export const MINECRAFT_DATA_DIR = join(NODE_MINECRAFT_DATA_DIR, 'minecraft-data')
export const NATIVE_BIN = join(ROOT, 'native', 'build', 'windows', 'x64', 'release')
export const SERVER_PORT_BASE = int('SERVER_PORT_BASE', 41032)
export const JOBS = int('JOBS', 4)
export const RELAY_PORT = int('RELAY_PORT', 19150)

export interface Build {
  /** the minecraft-data version (its protocol is the one this build speaks); also the servers/ folder name */
  mcDataVersion: string
  /** the exact BDS build, e.g. 1.21.42.01; also the data/ folder name */
  serverVersion: string
  /** the Java minecraft-data version blocks.json takes its block properties from */
  javaVersion: string
  /** the Java minecraft-data version items.json takes its item properties from, where it is not javaVersion */
  javaItemsVersion?: string
  /** GeyserMC/mappings-generator commit (generator_blocks.json); none: the v1 era, GeyserMC/mappings blocks.json */
  mg?: string
  /** GeyserMC/mappings commit (the Java -> Bedrock block map, and items.json the item map) */
  mappings: string
}

export const versions: Build[] = JSON.parse(readFileSync(join(ROOT, 'versions.json'), 'utf8'))

export const dataDir = (b: Build): string => join(DATA_DIR, b.serverVersion)
export const dataFile = (b: Build, name: string): string => join(dataDir(b), name)
export const workDir = (b: Build): string => join(WORK_DIR, b.serverVersion)

/** Missing parts count as 0, so "1.21.0" sorts before every 1.21.0.x build; "01" and "1" are equal. */
export function compareVersions (a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** Picks builds by mcDataVersion or serverVersion; no names = every build. */
export function selectBuilds (names: string[]): Build[] {
  if (!names.length) return versions
  return names.map(name => {
    const b = versions.find(v => v.mcDataVersion === name || compareVersions(v.serverVersion, name) === 0 && name.split('.').length === 4)
    if (!b) throw new Error(`${name} is not in versions.json`)
    return b
  })
}

export async function pool<T> (items: T[], jobs: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker))
}

/** Write through a temp file so an interrupted run never leaves a half file that a later run would skip over. */
export function writeAtomic (file: string, data: string | Buffer): void {
  writeFileSync(`${file}.tmp`, data)
  renameSync(`${file}.tmp`, file)
}

export const allExist = (files: string[]): boolean => files.every(f => existsSync(f))
