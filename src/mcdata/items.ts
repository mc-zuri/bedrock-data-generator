// items.json of a build: every item of the server's item registry, its properties from the Java item(s) it
// maps to through Geyser's item map, then the server's own (withServerItemFields: stack size, durability,
// name, from item_types.json). Ported from minecraft-data-extractor-legacy2
// src/generators/itemMap.ts and items.ts.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compareVersions, dataFile, type Build } from '../config.ts'
import { decodePackets } from '../nbt.ts'
import { ITEM_ORDER, ITEM_VARIATION_ORDER, orderKeys, shortenFloats, strip } from './format.ts'
import { withFields } from './blockProps.ts'

const require = createRequire(import.meta.url)
const { createDeserializer } = require('bedrock-protocol/src/transforms/serializer.js')

export interface ItemState { name: string, runtime_id: number, component_based: boolean, version?: unknown, nbt?: unknown }

/** The item registry the build's server sent (packets.nbt): in start_game until 1.21.50, its own packet after. */
export function itemStates (b: Build): ItemState[] {
  const { protocol, packets } = decodePackets(dataFile(b, 'packets.nbt'))
  const packet = packets.find(p => p.name === 'item_registry') ?? packets.find(p => p.name === 'start_game')
  if (!packet) throw new Error(`${b.serverVersion}: packets.nbt has neither item_registry nor start_game`)
  const itemstates = createDeserializer(protocol).parsePacketBuffer(packet.data).data.params.itemstates
  if (!itemstates) throw new Error(`${b.serverVersion}: ${packet.name} has no itemstates`)
  return itemstates
}

// Geyser's items.json pin can lag the registry: renamed ids (sealantern -> sea_lantern, scute -> turtle_scute,
// grass -> grass_block) and flattened ids (granite, *_planks kept their metadata but the registry still groups
// them under stone, planks). A bedrock_identifier the registry lacks is rewritten to a candidate it has
// (keeping bedrock_data), else skipped.
const ITEM_RENAME: Record<string, string> = {
  'minecraft:sealantern': 'minecraft:sea_lantern',
  'minecraft:scute': 'minecraft:turtle_scute',
  'minecraft:grass': 'minecraft:grass_block'
}
const STONE_TYPES = new Set(['granite', 'polished_granite', 'diorite', 'polished_diorite', 'andesite', 'polished_andesite'])
const PLANK_WOODS = new Set(['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'])

/** Bedrock item name -> [its data value, the Java item] for each Java item Geyser maps to it. */
export function bedrockToJavaItems (itemstates: ItemState[], geyser: Record<string, { bedrock_identifier?: string, bedrock_id?: number, bedrock_data?: number }>): Record<string, [string, string][]> {
  const byName = new Map(itemstates.map(s => [s.name, s]))
  const byRuntimeId = new Map(itemstates.map(s => [s.runtime_id, s]))
  const resolve = (bid: string): ItemState | undefined => {
    if (byName.has(bid)) return byName.get(bid)
    const candidates: string[] = []
    if (ITEM_RENAME[bid]) candidates.push(ITEM_RENAME[bid])
    const short = strip(bid)
    if (STONE_TYPES.has(short)) candidates.push('minecraft:stone')
    if (short.endsWith('_planks') && PLANK_WOODS.has(short.slice(0, -7))) candidates.push('minecraft:planks')
    return candidates.map(c => byName.get(c)).find(Boolean)
  }
  const b2j: Record<string, [string, string][]> = {}
  for (const [javaName, item] of Object.entries(geyser)) {
    // the older items.json (<= 1.17.0) names the Bedrock item by its runtime id, the newer by identifier;
    // the newer leave out a bedrock_data of 0 (legacy2 read that as NaN, written as "metadata": null)
    const mapped = item.bedrock_identifier != null ? resolve(item.bedrock_identifier) : byRuntimeId.get(item.bedrock_id!)
    if (!mapped) continue
    ;(b2j[strip(mapped.name)] ??= []).push([String(item.bedrock_data ?? 0), strip(javaName)])
  }
  return b2j
}

const titleCase = (str: string): string => str.replace(/\b\S/g, t => t.toUpperCase())
const VARIATION_KEYS = new Set(['metadata', 'id', 'displayName', 'name', 'stackSize', 'enchantCategories'])

/**
 * From 1.21.100 an item's id is its runtime id, and it carries the registry's nbt and version: the registry
 * a server sends is made from items.json (prismarine-registry's writeItemStates: runtime_id = id).
 */
export const itemsByRuntimeId = (mcDataVersion: string): boolean => compareVersions(mcDataVersion, '1.21.100') >= 0

/**
 * The items, sorted by id: the Java item's where there is one (the lowest data value's, the rest as its
 * variations), else from 9000; from 1.21.100 the registry's runtime id, with its nbt and version. Geyser's
 * map must hold exactly the Java version's items. (legacy2 means to give block items a blockStateId, but
 * matches "minecraft:" names against unprefixed ones, so never does; neither does this.)
 */
export function items (mcDataVersion: string, itemstates: ItemState[], geyser: Record<string, any>, javaItems: any[]): any[] {
  // air: Geyser prepends it, some Java versions list it and some do not
  const mappedJava = new Set(Object.keys(geyser).filter(k => k !== 'minecraft:air'))
  const expected = new Set(javaItems.filter(it => it.name !== 'air').map(it => `minecraft:${it.name}`))
  const missing = [...expected].filter(n => !mappedJava.has(n))
  const extra = [...mappedJava].filter(n => !expected.has(n))
  if (missing.length || extra.length) {
    throw new Error(`items: Geyser's map is not the Java items (${[missing.length ? `missing ${missing.slice(0, 5).join(', ')}` : '', extra.length ? `unexpected ${extra.slice(0, 5).join(', ')}` : ''].filter(Boolean).join('; ')})`)
  }
  const bedrock2Java = bedrockToJavaItems(itemstates, geyser)
  const javaByName = new Map(javaItems.map(e => [e.name, e]))
  const useRuntimeId = itemsByRuntimeId(mcDataVersion)
  let bedrockOnly = 9000

  // Geyser maps Java-only items onto a Bedrock stand-in of the same data (furnace_minecart onto
  // hopper_minecart, debug_stick onto stick, straw_bed onto bed 0): one Java item per data value, the one
  // of the Bedrock item's own name, else the oldest (lowest Java id)
  const javaId = (n: string) => javaByName.get(strip(n))?.id ?? Infinity
  const onePerData = (list: [string, string][] | undefined, bedrockName: string): [string, string][] => {
    if (!list) return []
    const best = new Map<string, [string, string]>()
    for (const m of list) {
      const cur = best.get(m[0])
      const better = !cur || (strip(m[1]) === bedrockName ? strip(cur[1]) !== bedrockName : strip(cur[1]) !== bedrockName && javaId(m[1]) < javaId(cur[1]))
      if (better) best.set(m[0], m)
    }
    return [...best.values()]
  }

  const list = itemstates.map(item => {
    const name = strip(item.name)
    const mapped = onePerData(bedrock2Java[name], name)
    let entry: any
    if (mapped.length > 1) {
      const variations = mapped.map(([data, java]) => ({ metadata: parseInt(data), ...javaByName.get(strip(java)) }))
      variations.sort((a, b) => a.metadata - b.metadata)
      const first = variations.shift()
      // the undefined keys only fix the key order
      entry = { id: undefined, displayName: undefined, name: undefined, stackSize: 1, ...first }
      entry.name = name
      entry.variations = variations
    } else {
      entry = { id: bedrockOnly++, stackSize: 1, ...(mapped.length ? javaByName.get(strip(mapped[0][1])) : undefined) }
      entry.name = name
    }
    if (useRuntimeId) {
      entry.id = item.runtime_id
      entry.nbt = item.nbt
      entry.version = item.version
    }
    return entry
  }).sort((a, b) => (a.id ?? 9999) - (b.id ?? 9999))

  for (const r of list) {
    r.displayName ??= titleCase(r.name.replace('item.', '').replace(/_/g, ' '))
    if (r.enchantCategories?.length) r.enchantCategories = [...new Set(r.enchantCategories)]
  }
  return list.map(item => {
    const o = orderKeys(item, ITEM_ORDER)
    // a variation has only what minecraft-data's schema allows it (legacy2 kept a Java item's maxDurability)
    if (Array.isArray(o.variations)) o.variations = o.variations.map((v: any) => Object.fromEntries(Object.entries(orderKeys(v, ITEM_VARIATION_ORDER)).filter(([k]) => VARIATION_KEYS.has(k))))
    return o
  })
}

export const itemsJson = (list: any[]): string => JSON.stringify(shortenFloats(list), null, 2)

export interface ItemType { maxStackSize: number, maxDamage: number, descriptionId?: string }

/** item_types.json by name without minecraft: (each item's stack size, durability, description id, as the agent read them). */
export function itemTypes (b: Build): Record<string, ItemType> {
  const types: Record<string, ItemType> = JSON.parse(readFileSync(dataFile(b, 'item_types.json'), 'utf8'))
  return Object.fromEntries(Object.entries(types).map(([n, t]) => [n.replace(/^minecraft:/, ''), t]))
}

/**
 * `list` (items.json, kept or made) with its repairWith naming Bedrock items (the Java ones Geyser maps them
 * to), and what the server says of each item: its stackSize, its maxDurability
 * (there where it has durability, and only there), its displayName: the language file's name for its
 * description id, else, for a block's item, for the block's (`blockNames`); not for an item with variations,
 * whose metadata 0 the game names by its own key (item.bed.white.name, not item.bed.name). The variations
 * keep theirs.
 */
export function withServerItemFields (list: any[], types: Record<string, ItemType>, lang: Record<string, string>, blockNames: Record<string, string> = {}, javaToBedrock: Map<string, string> = new Map()): any[] {
  const names = new Set(list.map(e => e.name))
  // a Java item a repair names, as the Bedrock item Geyser maps it to (oak_planks -> planks before 1.19.70)
  const repair = (r: string[] | undefined) => r && [...new Set(r.map(n => names.has(n) ? n : javaToBedrock.get(n)).filter((n): n is string => n !== undefined && names.has(n)))]
  const langName = (desc: string | undefined) => desc === undefined ? undefined : lang[desc.endsWith('.name') ? desc : `${desc}.name`]
  return list.map(entry => {
    const t = types[entry.name]
    if (!t) throw new Error(`items: the server has no item ${entry.name}`)
    const displayName = entry.variations?.length ? undefined : langName(t.descriptionId) ?? blockNames[entry.name]
    return withFields(entry, {
      ...(displayName ? { displayName } : {}),
      ...(entry.repairWith ? { repairWith: repair(entry.repairWith) } : {}),
      stackSize: t.maxStackSize,
      maxDurability: t.maxDamage > 0 ? t.maxDamage : undefined
    }, ITEM_ORDER)
  })
}
