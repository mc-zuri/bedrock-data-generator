// biomes.json of a build: every biome the server sends in biome_definition_list, with its Bedrock numeric id,
// its temperature and rainfall from the packet, the rest from the Java biome it maps to. Ported from
// minecraft-data-extractor-legacy2 src/generators/biomeMap.ts and biomes.ts.
import { createRequire } from 'node:module'
import nbt from 'prismarine-nbt'
import { dataFile, type Build } from '../config.ts'
import { decodePackets } from '../nbt.ts'
import { strip } from './format.ts'
import type { BiomeTable } from './inputs.ts'

const require = createRequire(import.meta.url)
const { createDeserializer } = require('bedrock-protocol/src/transforms/serializer.js')

/** Property order of biomes.json entries (legacy2 normalize.ts); any other property is an error. */
export const BIOME_ORDER = [
  'id', 'name', 'category', 'precipitation', 'depth', 'dimension', 'displayName', 'color', 'rainfall', 'temperature',
  'has_precipitation', 'child', 'climates', 'parent'
] as const

/**
 * The biome definitions the build's server sent (packets.nbt), by name without "minecraft:": until 1.21.70
 * one NBT compound per biome, from 1.21.80 a list of definitions naming themselves in a string list.
 */
export interface BiomeDefinition { temperature: number, downfall: number, depth?: number, rain?: number | boolean, tags?: string[] }

export function biomeDefinitions (b: Build): Record<string, BiomeDefinition> {
  const { protocol, packets } = decodePackets(dataFile(b, 'packets.nbt'))
  const packet = packets.find(p => p.name === 'biome_definition_list')
  if (!packet) throw new Error(`${b.serverVersion}: packets.nbt has no biome_definition_list`)
  const def = createDeserializer(protocol).parsePacketBuffer(packet.data).data.params
  if (def.nbt) return nbt.simplify(def.nbt)
  const out: Record<string, any> = {}
  // the newer form names its tags by their index in the string list too
  for (const d of def.biome_definitions) out[strip(def.string_list[d.name_index])] = { ...d, tags: d.tags?.map((t: number | string) => typeof t === 'number' ? def.string_list[t] : t) }
  return out
}

/**
 * The biomes sorted by id. The ids and the Java names come from PyMCTranslate's tables: Bedrock biome ->
 * universal -> Java (the snapshot of the build's Java version); a biome with no Java one keeps the defaults
 * (`warn` hears of them).
 */
export function biomes (defs: Record<string, BiomeDefinition>, bedrock: BiomeTable, java: BiomeTable, javaBiomes: any[], warn: (text: string) => void = () => {}): any[] {
  const javaByName = new Map(javaBiomes.map(jb => [jb.name, jb]))
  const bedrockOnly: string[] = []
  const list = Object.entries(defs).map(([name, def]) => {
    const id = bedrock.int_map[`minecraft:${name}`]
    if (id === undefined) throw new Error(`biomes: no Bedrock biome id for ${name}`)
    const javaName = java.universal2version[bedrock.version2universal[`minecraft:${name}`]]
    const javaBiome = javaName ? javaByName.get(strip(javaName)) : undefined
    if (!javaBiome) bedrockOnly.push(name)
    const entry: any = {
      id: undefined,
      name: undefined,
      category: '',
      precipitation: 'rain',
      depth: 0,
      dimension: 'overworld',
      displayName: name,
      color: 0,
      rainfall: 0,
      ...javaBiome
    }
    // from Java 1.19.4 has_precipitation replaces precipitation: no default "rain" beside it
    if (javaBiome && 'has_precipitation' in javaBiome && !('precipitation' in javaBiome)) delete entry.precipitation
    entry.id = id
    entry.name = name
    entry.temperature = def.temperature
    entry.rainfall = def.downfall
    const unknown = Object.keys(entry).filter(k => !(BIOME_ORDER as readonly string[]).includes(k))
    if (unknown.length) throw new Error(`biomes: ${name} has ${unknown.join(', ')}, which biomes.json does not`)
    return Object.fromEntries(BIOME_ORDER.filter(k => k in entry).map(k => [k, entry[k]]))
  })
  if (bedrockOnly.length) warn(`no Java biome (defaults) for ${bedrockOnly.join(', ')}`)
  return list.sort((a, b) => a.id - b.id)
}

/**
 * `list` (biomes.json, kept or made) with what the server's biome_definition_list says, where it says it:
 * - temperature, rainfall: the definition's temperature and downfall;
 * - dimension: its `nether` / `the_end` tag, else the overworld;
 * - category: by its tags (biomeCategory), where they say it;
 * - depth: its depth (sent from 1.21.60);
 * - has_precipitation / precipitation: its rain flag (sent from 1.21.60): snow where it rains below 0.15;
 * - parent: the Bedrock biome that names it its child (the older Java data names the Java parent);
 * - displayName: unique in a version: where several biomes have one name (a Java biome some Bedrock biomes
 *   map to, as desert_hills and desert to Java 1.18's desert, sulfur_caves to dripstone_caves), the biome of
 *   that name keeps it (else the lowest id), the others are named after themselves.
 */
/**
 * A biome's category by the tags the server gives it, in the latest Java data's scheme (Java's own changed
 * in 1.19: its snowy plains became plains, its frozen river ice), so every version says it alike; undefined
 * where no tag says it (pale_garden: the Java biome's then).
 */
export function biomeCategory (tags: ReadonlySet<string>): string | undefined {
  const has = (t: string) => tags.has(t)
  if (has('the_end')) return 'the_end'
  if (has('nether')) return 'nether'
  if (has('caves')) return 'underground'
  if (has('mooshroom_island')) return 'mushroom'
  if (has('beach')) return 'beach'
  if (has('river')) return has('frozen') ? 'ice' : 'river'
  if (has('ocean')) return 'ocean'
  if (has('mangrove_swamp') || has('flower_forest')) return 'forest'
  if (has('swamp')) return 'swamp'
  if (has('jungle')) return 'jungle'
  if (has('mesa')) return 'mesa'
  if (has('savanna')) return 'savanna'
  if (has('desert')) return 'desert'
  if (has('taiga')) return 'taiga'
  if (has('extreme_hills')) return has('forest') && !has('mutated') ? 'forest' : 'extreme_hills'
  if (has('grove') || has('cherry_grove')) return 'forest'
  if (has('mountains')) return has('frozen_peaks') ? 'ice' : 'mountain'
  if (has('ice_plains') || has('ice')) return has('mutated') ? 'ice' : 'plains'
  if (has('forest') || has('roofed')) return 'forest'
  if (has('plains')) return 'plains'
  return undefined
}

export function withServerBiomeFields (list: any[], defs: Record<string, BiomeDefinition>): any[] {
  const out = list.map(entry => {
    const def = defs[entry.name]
    if (!def) throw new Error(`biomes: the server sends no ${entry.name}`)
    const e = { ...entry, temperature: def.temperature, rainfall: def.downfall }
    const tags = new Set(def.tags ?? [])
    if (def.tags) e.dimension = tags.has('nether') ? 'nether' : tags.has('the_end') ? 'end' : 'overworld'
    e.category = biomeCategory(tags) ?? e.category
    if (typeof def.depth === 'number') e.depth = def.depth
    if (def.rain !== undefined) {
      const rain = Boolean(def.rain)
      if ('has_precipitation' in e) e.has_precipitation = rain
      if ('precipitation' in e) e.precipitation = !rain ? 'none' : def.temperature < 0.15 ? 'snow' : 'rain'
    }
    return e
  })
  const parentOf = new Map(out.filter(e => e.child !== undefined).map(e => [e.child, e.name]))
  for (const e of out) {
    if (e.parent === undefined) continue
    const parent = parentOf.get(e.id)
    if (parent === undefined) throw new Error(`biomes: ${e.name} has a parent, but no biome names it its child`)
    e.parent = parent
  }
  const byName = new Map<string, any[]>()
  for (const e of out) (byName.get(e.displayName) ?? byName.set(e.displayName, []).get(e.displayName)!).push(e)
  const title = (name: string) => name.replace(/_/g, ' ').replace(/\b\S/g, s => s.toUpperCase())
  for (const [displayName, group] of byName) {
    if (group.length < 2) continue
    const keeper = group.find(e => title(e.name) === displayName) ?? [...group].sort((a, b) => a.id - b.id)[0]
    for (const e of group) if (e !== keeper) e.displayName = title(e.name)
  }
  return out
}

export const biomesJson = (list: any[]): string => JSON.stringify(list, null, 2)
