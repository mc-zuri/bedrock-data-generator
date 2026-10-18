// What a loot table of the server's behavior packs drops, in the form of minecraft-data's blockLoot.json and
// entityLoot.json drops:
// - dropChance: the product of the pool's and the entry's random chances and the entry's share of its pool's weight (1/N
//   for one of N alternatives); an item reached more than once combines as independent draws;
// - stackSizeRange: set_count's range times the pool's rolls, its top raised by looting_enchant;
// - playerKill: where a killed_by_player(_or_pets) condition gates it; a drop gated on anything else (the killer being a
//   given mob, the entity's variant, being a baby, the tool) is left out: minecraft-data's form cannot say it;
// - metadata: set_data's value (0 without one).
// Nested pools and loot_table entries are followed.
import type { Items, LootCondition, LootEntry, LootPool, LootTable } from '../../bedrockData.ts'
import { withoutNamespace } from './json.ts'

export interface LootDrop {
  item: string
  dropChance: number
  stackSizeRange: [number, number]
  playerKill?: true
  metadata: number
}

// the key of each random chance condition that holds its chance (random_difficulty_chance's default, the regional one's most)
const CHANCE: Record<string, string> = {
  random_chance: 'chance',
  random_chance_with_looting: 'chance',
  random_difficulty_chance: 'default_chance',
  random_regional_difficulty_chance: 'max_chance',
}

function conditionName(c: LootCondition): string {
  return withoutNamespace(c.condition ?? '')
}

function chanceOf(conditions: LootCondition[] | undefined): number {
  let p = 1

  for (const c of conditions ?? []) {
    const key = CHANCE[conditionName(c)] as string | undefined
    const chance = key === undefined ? undefined : c[key]

    if (typeof chance === 'number') {
      p *= chance
    }
  }

  return p
}

function killedByPlayer(conditions: LootCondition[] | undefined): boolean {
  return (conditions ?? []).some((c) => conditionName(c).startsWith('killed_by_player'))
}

function situational(conditions: LootCondition[] | undefined): boolean {
  return (conditions ?? []).some((c) => !(conditionName(c) in CHANCE) && !conditionName(c).startsWith('killed_by_player'))
}

function range(value: number | { min?: number; max?: number } | undefined): [number, number] {
  if (typeof value === 'number') {
    return [value, value]
  }

  return [value?.min ?? 1, value?.max ?? 1]
}

function entryCount(entry: LootEntry): { min: number; max: number; metadata: number } {
  let [min, max] = [1, 1]
  let metadata = 0

  for (const f of entry.functions ?? []) {
    const name = withoutNamespace(f.function ?? '')

    if (name === 'set_count') {
      ;[min, max] = range(f.count)
    } else if (name === 'looting_enchant') {
      max += range(f.count)[1]

      if (typeof f.limit === 'number' && f.limit > 0) {
        max = Math.min(max, f.limit)
      }
    } else if ((name === 'set_data' || name === 'set_data_from_color_index') && typeof f.data === 'number') {
      metadata = f.data
    }
  }

  return { min, max, metadata }
}

/** An item a table names (minecraft:fish, muttonRaw) by its name in items.json, as the game reads it: lowercased for its aliases. */
export function lootItemName(items: Items): (name: string) => string {
  const names = new Set(items.items.map((i) => i.name))
  const aliases = new Map(items.aliases.map((a) => [a.name.toLowerCase(), a.item]))
  return (name) => {
    const full = name.includes(':') ? name : `minecraft:${name}`
    const item = names.has(full) ? full : aliases.get(full.toLowerCase())

    if (item === undefined) {
      throw new Error(`a loot table drops ${name}, which the item registry does not have`)
    }

    return withoutNamespace(item)
  }
}

export function lootDrops(table: LootTable, tableAt: (path: string) => LootTable | undefined, itemName: (name: string) => string): LootDrop[] {
  const found = new Map<string, { item: string; metadata: number; min: number; max: number; miss: number; playerKill: boolean }>()

  function walk(pools: LootPool[] | undefined, chance: number, playerKill: boolean, seen: Set<string>): void {
    for (const pool of pools ?? []) {
      if (situational(pool.conditions)) {
        continue
      }

      const entries = pool.entries ?? []
      const total = entries.reduce((sum, e) => sum + (e.weight ?? 1), 0) || 1
      const [minRolls, maxRolls] = range(pool.rolls)
      const poolChance = chance * chanceOf(pool.conditions)
      const poolPlayer = playerKill || killedByPlayer(pool.conditions)

      for (const entry of entries) {
        if (situational(entry.conditions)) {
          continue
        }

        const entryChance = poolChance * ((entry.weight ?? 1) / total) * chanceOf(entry.conditions)
        const entryPlayer = poolPlayer || killedByPlayer(entry.conditions)

        if (entry.type === 'item' && entry.name) {
          const { min, max, metadata } = entryCount(entry)
          const item = itemName(entry.name)
          const key = `${item}:${metadata}`
          const drop = found.get(key)

          if (!drop) {
            found.set(key, { item, metadata, min: min * minRolls, max: max * maxRolls, miss: 1 - entryChance, playerKill: entryPlayer })
          } else {
            drop.min = Math.min(drop.min, min * minRolls)
            drop.max = Math.max(drop.max, max * maxRolls)
            drop.miss *= 1 - entryChance
            drop.playerKill &&= entryPlayer
          }
        } else if (entry.type === 'loot_table' && entry.name && !seen.has(entry.name)) {
          walk(tableAt(entry.name)?.pools, entryChance, entryPlayer, new Set([...seen, entry.name]))
        }

        walk(entry.pools, entryChance, entryPlayer, seen)
      }
    }
  }

  walk(table.pools, 1, false, new Set())
  return [...found.values()]
    .sort((a, b) => a.item.localeCompare(b.item) || a.metadata - b.metadata)
    .map((d) => ({
      item: d.item,
      dropChance: Math.round((1 - d.miss) * 1e6) / 1e6,
      stackSizeRange: [d.min, d.max],
      ...(d.playerKill ? { playerKill: true as const } : {}),
      metadata: d.metadata,
    }))
}
