// blockLoot.json: what every block drops when a player mines it, as the game draws it (blocks.json.gz's drops): by block
// name, an entry a block for its default state's drops, then one a state that drops otherwise, with its states. Each
// item:
// - dropChance: the share of the draws that dropped it (draws of the game's own drop code, seeded: not a nominal chance;
//   gravel's flint reads about 0.097 of 8192 draws, where the game's code says 0.1);
// - stackSizeRange: the fewest and most in a draw that dropped it;
// - metadata: as blocks.json's drops have it (the data value a client is sent).
// The draws are with an empty hand: no silkTouch or noSilkTouch drops. A data-driven block drops what its loot table
// does (utils/loot.ts; the first of its tables, where its permutations have their own); a block no player can mine
// (hardness below 0) drops nothing, as blocks.json says. Every state of a block is drawn from the same seed as often, so
// a state drops otherwise only where the game's code does.
import type { BedrockData, StateFacts } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical, withoutNamespace } from './utils/json.ts'
import { lootDrops, lootItemName } from './utils/loot.ts'

export interface BlockLootDrop {
  item: string
  dropChance: number
  stackSizeRange: [number, number]
  metadata: number
}

export interface BlockLootEntry {
  block: string
  drops: BlockLootDrop[]
  states?: Record<string, unknown>
}

function blockLootJson(data: BedrockData, build: string): BlockLootEntry[] {
  const { blocks, lootTables } = data.blocks(build)
  const items = data.items(build)
  const palette = data.palette(build)
  const itemName = lootItemName(items)
  // from 1.16.220 a creative stack names the block it places, and a block item's data value is the stack's own
  const stacksCarryBlocks = items.creative.some((c) => c.blockState !== null)

  function dropsOf(state: StateFacts): BlockLootDrop[] {
    const { samples, items: drawn } = state.drops
    return drawn.map((d) => ({
      item: withoutNamespace(d.item),
      dropChance: Math.round((d.hits / samples) * 1e6) / 1e6,
      stackSizeRange: [d.minCount, d.maxCount],
      metadata: stacksCarryBlocks ? d.aux : d.data,
    }))
  }

  let firstState = 0
  const entries = blocks.map((type) => {
    const minStateId = firstState
    firstState += type.states.length
    const block = withoutNamespace(type.name)
    const def = type.states[type.defaultState]

    if (def.hardness < 0) {
      return [{ block, drops: [] }]
    }

    if (def.drops.samples === 0) {
      const path = type.loot?.[0]
      const table = path === undefined ? undefined : lootTables[path]

      if (!table) {
        throw new Error(`${type.name}: the game draws no drops and no loot table names it`)
      }

      return [{ block, drops: lootDrops(table, (p) => lootTables[p], itemName) }]
    }

    const byDefault = dropsOf(def)
    const otherwise = type.states.flatMap((s, i) => {
      const drops = dropsOf(s)
      return JSON.stringify(drops) === JSON.stringify(byDefault) ? [] : [{ state: minStateId + i, drops }]
    })
    return [
      { block, drops: byDefault },
      ...otherwise.map((s) => ({
        block,
        drops: s.drops,
        states: Object.fromEntries(Object.entries(palette[s.state].states).map(([name, tag]) => [name, tag.value])),
      })),
    ]
  })

  if (firstState !== palette.length) {
    throw new Error(`${firstState} block states, ${palette.length} in the palette`)
  }

  return entries.sort((a, b) => a[0].block.localeCompare(b[0].block)).flat()
}

export const blockLoot: Generator = {
  key: 'blockLoot',
  after: ['entityLoot', 'version'],
  has: (data, build) => data.has(build, 'blocks', 'items', 'blockPalette'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(blockLootJson(data, build), null, 2)
  },
  meaning: canonical,
}
