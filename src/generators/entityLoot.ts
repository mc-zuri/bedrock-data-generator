// entityLoot.json: every entity the server's vanilla behavior packs define, by name, with what its loot table drops
// (entities.json.gz; flattened by utils/loot.ts): its components' table, else an adult group's (most animals: a baby
// drops nothing), else the first group's. An entity without a table in its packs drops nothing here: the game's code
// drops for those it drops for (a minecart its item, a piglin its bartering).
import type { EntityDefinition } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical, withoutNamespace } from './utils/json.ts'
import { lootDrops, lootItemName, type LootDrop } from './utils/loot.ts'

export interface EntityLootEntry {
  entity: string
  drops: LootDrop[]
}

function tableOf(components: Record<string, unknown> | undefined): string | undefined {
  const table = (components?.['minecraft:loot'] as { table?: unknown } | undefined)?.table
  return typeof table === 'string' ? table : undefined
}

/** The loot table an entity drops by. */
function lootTableOf(entity: EntityDefinition): string | undefined {
  const groups = Object.entries(entity.component_groups ?? {}).filter(([, group]) => tableOf(group))
  const group = groups.find(([name]) => name.includes('adult')) ?? groups.at(0)
  return tableOf(entity.components) ?? (group && tableOf(group[1]))
}

export const entityLoot: Generator = {
  key: 'entityLoot',
  after: ['version'],
  has: (data, build) => data.has(build, 'entities', 'items'),
  json(data, build) {
    const { definitions, lootTables } = data.entities(build)
    const itemName = lootItemName(data.items(build))
    const out: EntityLootEntry[] = Object.entries(definitions).map(([name, definition]) => {
      const path = lootTableOf(definition)
      const table = path === undefined ? undefined : lootTables[path]
      return { entity: withoutNamespace(name), drops: table ? lootDrops(table, (p) => lootTables[p], itemName) : [] }
    })
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(out, null, 2)
  },
  meaning: canonical,
}
