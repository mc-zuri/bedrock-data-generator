// Validates a version's published minecraft-data files: each against its strict schema (schemas/), its own
// validator (files/: what the server says, the names and ids the other files have), and the registry
// (registry/: what the version had when it was last accepted). `pnpm mcdata` runs it on every version before
// it writes anything; `pnpm test` on the checkout as it is.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MINECRAFT_DATA_DIR, versions, type Build } from '../config.ts'
import type { Context, Validator } from './context.ts'
import { registryProblems, type Files } from './registry.ts'
import { schemaProblems } from './schema.ts'
import { server } from './server.ts'
import { attributes } from './files/attributes.ts'
import { biomes } from './files/biomes.ts'
import { blockCollisionShapes } from './files/blockCollisionShapes.ts'
import { blocks } from './files/blocks.ts'
import { blockStates } from './files/blockStates.ts'
import { effects } from './files/effects.ts'
import { enchantments } from './files/enchantments.ts'
import { entities } from './files/entities.ts'
import { entityLoot } from './files/entityLoot.ts'
import { items } from './files/items.ts'
import { language } from './files/language.ts'
import { materials } from './files/materials.ts'
import { steve } from './files/steve.ts'

export const DATA = join(MINECRAFT_DATA_DIR, 'data')

/** Every file a bedrock version must resolve, and its validator. */
export const VALIDATORS: Record<string, Validator> = {
  attributes, blocks, blockStates, blockCollisionShapes, biomes, entities, items, materials, effects, enchantments, entityLoot, language, steve
}
export const FILE_KEYS = Object.keys(VALIDATORS)

/** Reads a version's files through dataPaths.json; `overlay` (absolute path -> text) holds files not yet written. */
export function publishedFiles (v: string, paths: any, overlay: ReadonlyMap<string, string | null> = new Map()): Files {
  const cache = new Map<string, any>()
  return key => {
    if (cache.has(key)) return cache.get(key)
    const dir = paths.bedrock[v]?.[key]
    if (!dir) throw new Error(`${v}: dataPaths.json has no ${key}`)
    const file = join(DATA, dir, `${key}.json`)
    const staged = overlay.get(file)
    if (staged === null || (staged === undefined && !existsSync(file))) throw new Error(`${v}: ${dir}/${key}.json does not exist`)
    const data = JSON.parse(staged ?? readFileSync(file, 'utf8'))
    cache.set(key, data)
    return data
  }
}

export interface Problem { v: string, key: string, text: string }

/**
 * Everything wrong with version v's files: `files` reads them (publishedFiles). `registry: false` leaves out
 * the registry (a run that is to accept its changes). At most `max` problems per file.
 */
export function validateVersion (b: Build, paths: any, files: Files, { registry = true, max = 50 } = {}): Problem[] {
  const v = b.mcDataVersion
  const out: Problem[] = []
  const entry = paths.bedrock[v]
  if (!entry) return [{ v, key: 'dataPaths', text: 'no entry' }]
  for (const key of FILE_KEYS) {
    const report = (text: string) => { if (out.filter(p => p.key === key).length < max) out.push({ v, key, text }) }
    if (!entry[key]) { report('dataPaths.json has no path'); continue }
    if (!entry[key].startsWith('bedrock/')) report(`dataPaths.json points to ${entry[key]}, not a bedrock file`)
    let data: any
    try { data = files(key) } catch (e) { report(e instanceof Error ? e.message : String(e)); continue }
    const shape = schemaProblems(key, data)
    for (const p of shape) report(`schema: ${p}`)
    // a file of the wrong shape: its own validator would only repeat it
    if (shape.length) continue
    const ctx: Context = { v, build: b, server: server(b), files, bad: report }
    try { VALIDATORS[key](data, ctx) } catch (e) { report(`validator failed: ${e instanceof Error ? e.stack : e}`) }
  }
  if (registry) {
    try { for (const text of registryProblems(v, files)) out.push({ v, key: 'registry', text }) } catch (e) { out.push({ v, key: 'registry', text: String(e) }) }
  }
  return out
}

/** Every version of versions.json, as the checkout has them. */
export function validateAll (options: { registry?: boolean } = {}): Problem[] {
  const paths = JSON.parse(readFileSync(join(DATA, 'dataPaths.json'), 'utf8'))
  return versions.flatMap(b => validateVersion(b, paths, publishedFiles(b.mcDataVersion, paths), options))
}

export function formatProblems (problems: Problem[], perKey = 5): string {
  const groups = new Map<string, Problem[]>()
  for (const p of problems) (groups.get(`${p.v} ${p.key}`) ?? groups.set(`${p.v} ${p.key}`, []).get(`${p.v} ${p.key}`)!).push(p)
  return [...groups].map(([k, list]) => `${k}: ${list.length} problem(s)\n${list.slice(0, perKey).map(p => `    ${p.text}`).join('\n')}`).join('\n')
}
