import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { BedrockData } from '../src/bedrockData.ts'
import { blockLoot } from '../src/generators/blockLoot.ts'
import { blocks } from '../src/generators/blocks.ts'
import { blockStates } from '../src/generators/blockStates.ts'
import { enchantments } from '../src/generators/enchantments.ts'
import type { Generator } from '../src/generators/index.ts'
import { items } from '../src/generators/items.ts'
import { materials } from '../src/generators/materials.ts'
import { generate } from '../src/publish.ts'
import { bedrockDataOf, minecraftDataOf, withBlocks, type SampleBlock } from './helpers.ts'

const PICKAXES = { 'minecraft:wooden_pickaxe': 2, 'minecraft:stone_pickaxe': 4, 'minecraft:iron_pickaxe': 6, 'minecraft:golden_pickaxe': 12, 'minecraft:diamond_pickaxe': 8 }
const ITEMS = [
  'air',
  'stone',
  'cobblestone',
  'dirt',
  'stick',
  'diamond',
  'wooden_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'golden_pickaxe',
  'diamond_pickaxe',
  'diamond_sword',
  'shears',
  'white_wool_slab',
]
const BLOCKS: SampleBlock[] = [
  { name: 'air', id: 0, hardness: 0, dampening: 0, collides: false },
  {
    name: 'stone',
    id: 1,
    hardness: 1.5,
    requiresCorrectTool: true,
    speeds: PICKAXES,
    harvestedBy: ['minecraft:wooden_pickaxe', 'minecraft:diamond_pickaxe'],
    drops: ['minecraft:cobblestone'],
  },
  { name: 'dirt', id: 3, hardness: 0.5, states: 2, drops: ['minecraft:dirt'], stateDrops: { 1: ['minecraft:diamond'] } },
  { name: 'bedrock', id: 7, hardness: -1, drops: ['minecraft:stick'] },
  { name: 'white_wool_slab', id: 1000, loot: 'loot_tables/blocks/slab.json' },
]

function generated(gens: Generator[], key: string): unknown {
  const data = bedrockDataOf({ '1.21.0.03': { 'tile.stone.name': 'Stone', 'item.diamond_sword.name': 'Diamond Sword', 'enchantment.damage.all': 'Sharpness' } })
  withBlocks(data, '1.21.0.03', BLOCKS, ITEMS, [{ item: 'stone', blockState: 1 }])
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } })
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, gens)
  return JSON.parse(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', `${key}.json`), 'utf8')) as unknown
}

void test('blocks.json: each block by its numeric id, its runtime ids, material, harvest tools, drops and bounding box', () => {
  const out = generated([blocks], 'blocks') as Record<string, unknown>[]
  assert.deepEqual(
    out.map((b) => b.name),
    ['air', 'stone', 'dirt', 'bedrock', 'white_wool_slab'],
  )
  assert.deepEqual(out[1], {
    id: 1,
    name: 'stone',
    displayName: 'Stone',
    hardness: 1.5,
    resistance: 1,
    stackSize: 64,
    diggable: true,
    material: 'mineable/pickaxe',
    transparent: false,
    emitLight: 0,
    filterLight: 15,
    defaultState: 1,
    minStateId: 1,
    maxStateId: 1,
    harvestTools: { '6': true, '10': true },
    drops: [2],
    boundingBox: 'block',
  })
  // two states, its name in title case where the language has none
  assert.deepEqual([out[2].displayName, out[2].minStateId, out[2].maxStateId, out[2].drops], ['Dirt', 2, 3, [3, 5]])
  // a block no player can mine drops nothing; air collides with nothing and is no material's but the default
  assert.deepEqual([out[3].drops, out[3].diggable, out[0].boundingBox, out[0].material, out[0].transparent], [[], false, 'empty', 'default', true])
  // a data-driven block drops what its loot table names
  assert.deepEqual(out[4].drops, [4])
})

void test("blocks_schema.json takes a drop's negative item id, as minecraft-data's items_schema.json does", () => {
  const data = bedrockDataOf({ '1.21.0.03': {} })
  withBlocks(data, '1.21.0.03', BLOCKS, ITEMS, [])
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } })
  const schema = join(mcData, 'schemas', 'blocks_schema.json')
  mkdirSync(join(mcData, 'schemas'))
  // the drop's item id as minecraft-data's schema has it
  writeFileSync(
    schema,
    `{
                          "id": {
                            "type": "integer",
                            "minimum": 0
                          },
}`,
  )
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, [blocks])
  assert.equal(
    readFileSync(schema, 'utf8'),
    `{
                          "id": {
                            "description": "The dropped item's id (Bedrock edition also uses negative ids)",
                            "type": "integer"
                          },
}`,
  )
})

void test("materials.json: each material's speeds by item id, the default the speeds of air", () => {
  assert.deepEqual(generated([materials], 'materials'), { default: {}, 'mineable/pickaxe': { '6': 2, '7': 4, '8': 6, '9': 12, '10': 8 } })
})

void test('blockStates.json: the palette in runtime id order, without the namespace', () => {
  const out = generated([blockStates], 'blockStates') as { name: string; states: object; version: number }[]
  assert.equal(out.length, 6)
  assert.deepEqual(out[2], { name: 'dirt', states: { i: { type: 'int', value: 0 } }, version: 18168865 })
})

void test('items.json: each item by its runtime id, with its stack size, durability, enchant categories, repair items and creative block state', () => {
  const out = generated([items], 'items') as Record<string, unknown>[]
  assert.equal(out.length, ITEMS.length)
  assert.deepEqual(out[1], { id: 1, stackSize: 64, name: 'stone', displayName: 'Stone', blockStateId: 1, componentBased: false })
  assert.deepEqual(out[11], {
    id: 11,
    stackSize: 1,
    name: 'diamond_sword',
    displayName: 'Diamond Sword',
    enchantCategories: ['sword', 'sword+axe'],
    repairWith: ['diamond'],
    maxDurability: 1561,
    componentBased: false,
  })
})

void test("items_schema.json takes an item's componentBased, once", () => {
  const data = bedrockDataOf({ '1.21.0.03': {} })
  withBlocks(data, '1.21.0.03', BLOCKS, ITEMS, [])
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } })
  const schema = join(mcData, 'schemas', 'items_schema.json')
  mkdirSync(join(mcData, 'schemas'))
  // Bedrock's nbt as minecraft-data's schema has it
  const nbt = `      "nbt": {
        "description": "Default NBT data associated with this item (Bedrock edition)",
        "type": "object"
      },
`
  writeFileSync(schema, nbt)
  const sources = { data: new BedrockData(data), pins: new Map(), committed: () => undefined }
  generate(mcData, sources, [items])
  generate(mcData, sources, [items])
  assert.equal(
    readFileSync(schema, 'utf8'),
    `      "componentBased": {
        "description": "Whether the item is component-based, as the item registry the server sends has it (Bedrock edition)",
        "type": "boolean"
      },
${nbt}`,
  )
})

void test('enchantments.json: each enchantment by its id, its costs a line in the level, its weight by its frequency', () => {
  assert.deepEqual(generated([enchantments], 'enchantments'), [
    {
      id: 0,
      name: 'sharpness',
      displayName: 'Sharpness',
      maxLevel: 5,
      minCost: { a: 11, b: -10 },
      maxCost: { a: 11, b: 10 },
      treasureOnly: false,
      curse: false,
      exclude: [],
      category: 'sword+axe',
      weight: 5,
      tradeable: true,
      discoverable: true,
    },
  ])
})

void test("blockLoot.json: each block's default state's drops, then each state that drops otherwise, by name", () => {
  const out = generated([blockLoot], 'blockLoot') as { block: string; drops: unknown[]; states?: object }[]
  assert.deepEqual(
    out.map((e) => e.block),
    ['air', 'bedrock', 'dirt', 'dirt', 'stone', 'white_wool_slab'],
  )
  assert.deepEqual(out[2], { block: 'dirt', drops: [{ item: 'dirt', dropChance: 1, stackSizeRange: [1, 1], metadata: 0 }] })
  assert.deepEqual(out[3], { block: 'dirt', drops: [{ item: 'diamond', dropChance: 1, stackSizeRange: [1, 1], metadata: 0 }], states: { i: 1 } })
  // a block no player can mine drops nothing; a data-driven one what its loot table does
  assert.deepEqual(out[1].drops, [])
  assert.deepEqual(out[5].drops, [{ item: 'stick', dropChance: 1, stackSizeRange: [1, 1], metadata: 0 }])
})
