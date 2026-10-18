import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Items, LootTable } from '../src/bedrockData.ts'
import { lootDrops, lootItemName } from '../src/generators/utils/loot.ts'

const ITEMS: Items = {
  items: ['cod', 'bone', 'arrow', 'wool'].map((name, id) => ({
    name: `minecraft:${name}`,
    id,
    descriptionId: `item.${name}`,
    descriptionName: `item.${name}.name`,
    maxStackSize: 64,
    maxDamage: 0,
    enchantSlots: 0,
    tags: [],
    repairItems: [],
    componentBased: false,
  })),
  aliases: [{ name: 'minecraft:fish', item: 'minecraft:cod' }],
  complexAliases: [],
  creative: [],
}

void test('a loot table: chances multiplied through pools and weights, counts by rolls and looting, situational drops left out', () => {
  const tables: Record<string, LootTable> = {
    'loot_tables/entities/skeleton.json': {
      pools: [
        {
          rolls: 1,
          entries: [
            {
              type: 'item',
              name: 'minecraft:bone',
              functions: [
                { function: 'set_count', count: { min: 0, max: 2 } },
                { function: 'looting_enchant', count: { min: 0, max: 1 } },
              ],
            },
          ],
        },
        {
          rolls: 1,
          conditions: [{ condition: 'killed_by_player' }, { condition: 'random_chance', chance: 0.5 }],
          entries: [
            { type: 'item', name: 'minecraft:arrow', weight: 1 },
            { type: 'empty', weight: 1 },
          ],
        },
        { rolls: 1, conditions: [{ condition: 'is_baby' }], entries: [{ type: 'item', name: 'minecraft:wool' }] },
        { rolls: 2, entries: [{ type: 'loot_table', name: 'loot_tables/fish.json' }] },
      ],
    },
    'loot_tables/fish.json': { pools: [{ rolls: 1, entries: [{ type: 'item', name: 'Fish', functions: [{ function: 'set_data', data: 3 }] }] }] },
  }
  assert.deepEqual(
    lootDrops(tables['loot_tables/entities/skeleton.json'], (p) => tables[p], lootItemName(ITEMS)),
    [
      { item: 'arrow', dropChance: 0.25, stackSizeRange: [1, 1], playerKill: true, metadata: 0 },
      { item: 'bone', dropChance: 1, stackSizeRange: [0, 3], metadata: 0 },
      { item: 'cod', dropChance: 1, stackSizeRange: [1, 1], metadata: 3 },
    ],
  )
})

void test('an item no name or alias of the registry names fails', () => {
  assert.throws(() => lootItemName(ITEMS)('minecraft:emerald'), /does not have/)
})
