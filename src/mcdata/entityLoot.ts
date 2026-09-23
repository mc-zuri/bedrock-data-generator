// entityLoot.json of a build: every entity of entities.json with what it drops, from the loot table its
// definition in the server's behavior packs names (minecraft:loot: the base components', else an adult
// group's, else any group's), flattened as bedrock-data-extractor's extract_loot.py flattens a table:
// - dropChance: the product of the pool's and the entry's random chances and the entry's share of its pool's
//   weight (1/N for one of N alternatives); an item reached more than once combines as independent draws;
// - stackSizeRange: set_count's range, times the pool's rolls, raised by looting_enchant;
// - playerKill: where a killed_by_player(_or_pets) condition gates it; a drop gated on anything else (the
//   killer being a given mob, the entity's variant, being a baby, riding a chicken) is not listed;
// - metadata: set_data's value (0 without one).
// Nested pools and loot_table references are followed. An entity without a table drops nothing.
import { readFileSync } from 'node:fs'
import { dataFile, type Build } from '../config.ts'
import { behaviorPackFile } from './packs.ts'

const CHANCE: Record<string, string> = {
  random_chance: 'chance',
  random_chance_with_looting: 'chance',
  random_difficulty_chance: 'default_chance',
  random_regional_difficulty_chance: 'max_chance'
}
const bare = (s: unknown) => String(s ?? '').replace(/^minecraft:/, '')

function conditionChance (conditions: any[] | undefined): number {
  let p = 1
  for (const c of conditions ?? []) {
    const key = CHANCE[bare(c.condition)]
    const v = key ? c[key] : undefined
    if (typeof v === 'number') p *= v
  }
  return p
}
const byPlayer = (conditions: any[] | undefined) => (conditions ?? []).some(c => /^killed_by_player/.test(bare(c.condition)))
// a drop only a situation gives (the creeper's music discs when a skeleton kills it, a baby zombie's disc
// when it rides a chicken, a sheep's wool by its colour): not a drop minecraft-data's form can say
const byMob = (conditions: any[] | undefined) => (conditions ?? []).some(c => !(bare(c.condition) in CHANCE) && !/^killed_by_player/.test(bare(c.condition)))

function rolls (pool: any): [number, number] {
  const r = pool.rolls
  if (typeof r === 'number') return [r, r]
  if (r && typeof r === 'object') return [r.min ?? 1, r.max ?? 1]
  return [1, 1]
}

function entryCount (entry: any): [number, number, number] {
  let lo = 1, hi = 1, meta = Number(entry.auxVal ?? 0) || 0
  for (const fn of entry.functions ?? []) {
    const f = bare(fn.function), c = fn.count
    if (f === 'set_count') {
      if (typeof c === 'number') lo = hi = c
      else if (c && typeof c === 'object') { lo = c.min ?? 1; hi = c.max ?? 1 }
    } else if (f === 'looting_enchant') {
      hi += typeof c === 'number' ? c : (c?.max ?? 0)
      if (typeof fn.limit === 'number' && fn.limit > 0) hi = Math.min(hi, fn.limit)
    } else if ((f === 'set_data' || f === 'set_data_from_color_index') && typeof fn.data === 'number') meta = fn.data
  }
  return [lo, hi, meta]
}

export function lootDrops (b: Build, table: any, resolve: (item: string) => string = n => n): any[] {
  const acc = new Map<string, { item: string, meta: number, lo: number, hi: number, miss: number, player: boolean }>()
  const walk = (pools: any[] | undefined, chance: number, player: boolean, seen: Set<string>): void => {
    for (const pool of pools ?? []) {
      const entries: any[] = pool.entries ?? []
      const total = entries.reduce((s, e) => s + (Number(e.weight ?? 1) || 1), 0) || 1
      const [rlo, rhi] = rolls(pool)
      if (byMob(pool.conditions)) continue
      const pc = chance * conditionChance(pool.conditions), pp = player || byPlayer(pool.conditions)
      for (const e of entries) {
        if (byMob(e.conditions)) continue
        const ec = pc * ((Number(e.weight ?? 1) || 1) / total) * conditionChance(e.conditions)
        const ep = pp || byPlayer(e.conditions)
        if (e.type === 'item' && e.name) {
          const [lo, hi, meta] = entryCount(e)
          const item = resolve(bare(e.name)), key = `${item}:${meta}`
          const cur = acc.get(key)
          if (!cur) acc.set(key, { item, meta, lo: lo * rlo, hi: hi * rhi, miss: 1 - ec, player: ep })
          else { cur.lo = Math.min(cur.lo, lo * rlo); cur.hi = Math.max(cur.hi, hi * rhi); cur.miss *= 1 - ec; cur.player &&= ep }
        } else if (e.type === 'loot_table' && e.name && !seen.has(e.name)) {
          const sub = behaviorPackFile(b, e.name)
          if (sub) walk(sub.pools, ec, ep, new Set([...seen, e.name]))
        }
        walk(e.pools, ec, ep, seen)
      }
    }
  }
  walk(table.pools, 1, false, new Set())
  return [...acc.values()].sort((a, c) => a.item.localeCompare(c.item) || a.meta - c.meta).map(d => {
    const chance = Math.round((1 - d.miss) * 1e6) / 1e6
    return { item: d.item, dropChance: chance, stackSizeRange: [d.lo, d.hi], ...(d.player ? { playerKill: true } : {}), metadata: d.meta }
  })
}

function lootTableOf (def: any): string | undefined {
  const e = def?.['minecraft:entity']
  const groups = Object.entries<any>(e?.component_groups ?? {})
  return e?.components?.['minecraft:loot']?.table ??
    groups.find(([n, g]) => /adult/.test(n) && g['minecraft:loot'])?.[1]['minecraft:loot'].table ??
    groups.find(([, g]) => g['minecraft:loot'])?.[1]['minecraft:loot'].table
}

/** entityLoot.json for `entities` (entities.json) from their definitions (entityProps.ts entityDefinitions). */
/** The item_aliases.json the agent exported: an old item name the game still reads -> the item's name, both bare. */
export function itemAliases (b: Build): Record<string, string> {
  const raw: Record<string, string> = JSON.parse(readFileSync(dataFile(b, 'item_aliases.json'), 'utf8'))
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [bare(k), bare(v)]))
}

/**
 * entityLoot.json for `entities` (entities.json) from their definitions (entityProps.ts entityDefinitions).
 * A table naming an item by an old name (fish, muttonRaw, record_wait) names it as the game resolves it
 * (item_aliases.json); a table the definition names that no pack has (piglin's: its drops are code) is none.
 */
export function entityLoot (b: Build, entities: { name: string }[], defs: Map<string, any>, itemNames: Set<string>, warn: (text: string) => void = () => {}): any[] {
  const aliases = itemAliases(b)
  return entities.map(({ name }) => {
    const path = lootTableOf(defs.get(name))
    const table = path ? behaviorPackFile(b, path) : undefined
    // the game reads an item's name lowercased before it looks up an alias (netherStar -> netherstar -> nether_star)
    const drops = table ? lootDrops(b, table, item => itemNames.has(item) ? item : aliases[item.toLowerCase()] ?? item) : []
    for (const d of drops) if (!itemNames.has(d.item)) warn(`${name} drops ${d.item}, which items.json does not have`)
    return { entity: name, drops }
  })
}

export const entityLootJson = (list: any[]): string => JSON.stringify(list, null, 2)
