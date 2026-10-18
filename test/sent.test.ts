import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { BedrockData } from '../src/bedrockData.ts'
import { commands, usageWords } from '../src/generators/commands.ts'
import { entities } from '../src/generators/entities.ts'
import { entityLoot } from '../src/generators/entityLoot.ts'
import { foods } from '../src/generators/foods.ts'
import type { Generator } from '../src/generators/index.ts'
import { recipes } from '../src/generators/recipes.ts'
import { generate } from '../src/publish.ts'
import { bedrockDataOf, minecraftDataOf, withBlocks, withKind } from './helpers.ts'

const BUILD = '1.21.0.03'
const ITEMS = ['air', 'oak_planks', 'birch_planks', 'stick', 'crafting_table', 'milk_bucket', 'bucket', 'cake', 'rotten_flesh', 'apple']

function release(kinds: Record<string, unknown>): string {
  const data = bedrockDataOf({ [BUILD]: { 'entity.zombie.name': 'Zombie', 'item.apple.name': 'Apple' } })
  withBlocks(data, BUILD, [{ name: 'air', id: 0 }], ITEMS)

  for (const [kind, value] of Object.entries(kinds)) {
    withKind(data, BUILD, kind, value)
  }

  return data
}

function generated(data: string, gens: Generator[], key: string): unknown {
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } })
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, gens)
  return JSON.parse(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', `${key}.json`), 'utf8')) as unknown
}

const ZOMBIE = {
  description: { identifier: 'minecraft:zombie', spawn_category: 'monster' },
  components: { 'minecraft:loot': { table: 'loot_tables/entities/zombie.json' }, 'minecraft:collision_box': { width: 0.6, height: 1.9 } },
}
const COW = {
  description: { identifier: 'minecraft:cow', spawn_category: 'creature' },
  component_groups: {
    'minecraft:cow_baby': { 'minecraft:collision_box': { width: 0.45, height: 0.7 } },
    'minecraft:cow_adult': { 'minecraft:collision_box': { width: 0.9, height: 1.3 }, 'minecraft:loot': { table: 'loot_tables/entities/cow.json' } },
  },
}
const ENTITIES = {
  entities: [
    { name: 'minecraft:zombie', id: 32, hasSpawnEgg: true, summonable: true },
    { name: 'minecraft:item', id: 64, hasSpawnEgg: false, summonable: false },
    { name: 'minecraft:cow', id: 11, hasSpawnEgg: true, summonable: true },
  ],
  definitions: { 'minecraft:cow': COW, 'minecraft:zombie': ZOMBIE },
  lootTables: {
    'loot_tables/entities/zombie.json': {
      pools: [{ rolls: 1, entries: [{ type: 'item', name: 'minecraft:rotten_flesh', functions: [{ function: 'set_count', count: { min: 0, max: 2 } }] }] }],
    },
    'loot_tables/entities/cow.json': { pools: [{ rolls: 1, entries: [{ type: 'item', name: 'minecraft:stick' }] }] },
  },
}

void test("entities.json: each entity in runtime id order, its adult's collision box and its kind by its definition", () => {
  assert.deepEqual(generated(release({ entities: ENTITIES }), [entities], 'entities'), [
    { id: 0, internalId: 11, name: 'cow', displayName: 'Cow', height: 1.3, width: 0.9, type: 'animal', category: 'Passive mobs' },
    { id: 1, internalId: 32, name: 'zombie', displayName: 'Zombie', height: 1.9, width: 0.6, type: 'hostile', category: 'Hostile mobs' },
    { id: 2, internalId: 64, name: 'item', displayName: 'Item', height: null, width: null, type: 'other', category: 'UNKNOWN' },
  ])
})

void test("entityLoot.json: each entity defined, with what its own table, or its adult group's, drops", () => {
  assert.deepEqual(generated(release({ entities: ENTITIES }), [entityLoot], 'entityLoot'), [
    { entity: 'cow', drops: [{ item: 'stick', dropChance: 1, stackSizeRange: [1, 1], metadata: 0 }] },
    { entity: 'zombie', drops: [{ item: 'rotten_flesh', dropChance: 1, stackSizeRange: [0, 2], metadata: 0 }] },
  ])
})

void test("recipes.json: the grid's recipes in Java's form, a tag one recipe per item by name, a container given back on its ingredient's slots", () => {
  const data = release({
    recipes: {
      recipes: [
        {
          type: 'shaped',
          id: 'minecraft:crafting_table',
          block: 'crafting_table',
          width: 2,
          height: 2,
          input: Array.from({ length: 4 }, () => ({ tag: 'minecraft:planks', count: 1 })),
          output: [{ item: 'minecraft:crafting_table', metadata: 0, count: 1, blockState: null }],
        },
        {
          type: 'shaped',
          id: 'minecraft:cake',
          block: 'crafting_table',
          width: 1,
          height: 2,
          input: [
            { item: 'minecraft:milk_bucket', count: 1 },
            { item: 'minecraft:apple', metadata: 3, count: 1 },
          ],
          output: [
            { item: 'minecraft:cake', metadata: 0, count: 1, blockState: null },
            { item: 'minecraft:bucket', metadata: 0, count: 1, blockState: null },
          ],
        },
        {
          type: 'shapeless',
          id: 'minecraft:stick',
          block: 'stonecutter',
          input: [{ item: 'minecraft:oak_planks', count: 1 }],
          output: [{ item: 'minecraft:stick', metadata: 0, count: 2, blockState: null }],
        },
      ],
    },
  })
  const items = new BedrockData(data).items(BUILD).items
  // the planks are tagged by the item registry
  items[1].tags = ['minecraft:planks']
  items[2].tags = ['minecraft:planks']
  const registry = { items, aliases: [], complexAliases: [], creative: [] }
  withKind(data, BUILD, 'items', registry)

  function planks(id: number): number[][] {
    return [
      [id, id],
      [id, id],
    ]
  }

  assert.deepEqual(generated(data, [recipes], 'recipes'), {
    4: [
      { inShape: planks(2), result: { id: 4, metadata: 0, count: 1 } },
      { inShape: planks(1), result: { id: 4, metadata: 0, count: 1 } },
    ],
    7: [{ inShape: [[5], [{ id: 9, metadata: 3 }]], outShape: [[6], [null]], result: { id: 7, metadata: 0, count: 1 } }],
  })
})

void test("commands.json: each command's usage lines merged into one tree, an alias redirecting, each parser's examples its enum's values", () => {
  const data = release({
    commands: {
      commands: [
        {
          name: 'gamemode',
          description: 'commands.gamemode.description',
          aliases: ['gm'],
          help: ['gamemode:', 'Sets a game mode.', 'Usage:', '- /gamemode <gameMode: GameMode> [player: target]', '- /gamemode <gameMode: int> [player: target]'],
        },
      ],
      enums: { GameMode: ['survival', 'creative'] },
    },
  })
  const out = generated(data, [commands], 'commands') as {
    root: { children: { name: string; redirects: string[]; children: { name: string; executable: boolean }[] }[] }
    parsers: unknown[]
  }
  assert.deepEqual(
    out.root.children.map((c) => [c.name, c.redirects]),
    [
      ['gamemode', []],
      ['gm', ['gamemode']],
    ],
  )
  assert.deepEqual(
    out.root.children[0].children.map((c) => [c.name, c.executable]),
    [
      ['gameMode', true],
      ['gameMode', true],
    ],
  )
  assert.deepEqual(out.parsers, [
    { parser: 'GameMode', modifier: null, examples: ['survival', 'creative'] },
    { parser: 'int', modifier: null, examples: [] },
    { parser: 'target', modifier: null, examples: [] },
  ])
  assert.deepEqual(usageWords('- /scoreboard objectives setdisplay <list|sidebar> [objective: string]'), [
    { choices: ['objectives'], optional: false },
    { choices: ['setdisplay'], optional: false },
    { choices: ['list', 'sidebar'], optional: false },
    { argument: { name: 'objective', type: 'string' }, optional: true },
  ])
})

void test("foods.json: each food the legacy food components say where the server sends none, with items.json's id and name", () => {
  const data = release({})
  const items = new BedrockData(data).items(BUILD)
  items.items[8].food = { nutrition: 4, saturationModifier: 0.1 }
  items.items[9].food = { nutrition: 4, saturationModifier: 0.3 }
  withKind(data, BUILD, 'items', items)
  assert.deepEqual(generated(data, [foods], 'foods'), [
    { id: 8, name: 'rotten_flesh', stackSize: 64, displayName: 'Rotten Flesh', foodPoints: 4, saturation: 0.8, effectiveQuality: 4.8, saturationRatio: 0.2 },
    { id: 9, name: 'apple', stackSize: 64, displayName: 'Apple', foodPoints: 4, saturation: 2.4, effectiveQuality: 6.4, saturationRatio: 0.6 },
  ])
})
