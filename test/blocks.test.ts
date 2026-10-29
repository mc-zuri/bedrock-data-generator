import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
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
    enchantCategories: ['sword'],
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

void test('blocks_schema.json says blocks are unique by their ids, items_schema.json items by their names, once', () => {
  // the top of each as minecraft-data's schemas have it
  const cases = [
    [blocks, '  "type": "array",\n  "uniqueItems": true,\n  "uniqueItemProperties": ["id"],\n', '  "type": "array",\n  "uniqueItemProperties": ["id"],\n'],
    [items, '  "type": "array",\n  "uniqueItems": true,\n  "items" : {\n', '  "type": "array",\n  "uniqueItemProperties": ["name"],\n  "items" : {\n'],
  ] as const

  for (const [g, before, after] of cases) {
    assert.equal(g.schema?.edit(before), after, g.key)
    assert.equal(g.schema?.edit(after), after, `${g.key}, edited again`)
  }
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

void test("items.json: the game's name, its key translated where the server has none; an unnamed item none can get in title case, one the creative list has fails", () => {
  const data = bedrockDataOf({ '1.21.0.03': { 'tile.stone.name': 'Stone', 'tile.element.h.name': 'Hydrogen' } })
  withBlocks(data, '1.21.0.03', BLOCKS, ITEMS, [{ item: 'stone', blockState: 1 }])
  const file = join(data, 'release', '1.21.0.03', 'items.json.gz')
  function named(names: Record<string, string>): void {
    const json = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as { items: { name: string; descriptionName: string }[] }
    json.items = json.items.map((i) => ({ ...i, descriptionName: names[i.name] ?? i.descriptionName }))
    writeFileSync(file, gzipSync(JSON.stringify(json)))
  }
  function run(): Record<string, unknown>[] {
    const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } })
    generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, [items])
    return JSON.parse(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', 'items.json'), 'utf8')) as Record<string, unknown>[]
  }

  named({ 'minecraft:dirt': 'tile.element.h.name', 'minecraft:stick': 'item.stick.name', 'minecraft:shears': '' })
  const out = run()
  assert.deepEqual(
    [3, 4, 12].map((id) => out[id].displayName),
    ['Hydrogen', 'Stick', 'Shears'],
  )
  named({ 'minecraft:stone': 'tile.nothing.name' })
  assert.throws(run, /minecraft:stone, in the creative list, has no name: the game builds 'tile.nothing.name'/)
})

void test("blocks.json and items.json: what the game names nothing, the version's committed file's name for it, else its name in title case", () => {
  const data = bedrockDataOf({ '1.21.0.03': { 'tile.stone.name': 'Stone' } })
  withBlocks(data, '1.21.0.03', BLOCKS, ITEMS, [{ item: 'stone', blockState: 1 }])
  const file = join(data, 'release', '1.21.0.03', 'items.json.gz')
  const json = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as { items: { name: string; descriptionName: string }[] }
  const unnamed: Record<string, string> = { 'minecraft:dirt': '', 'minecraft:stick': 'item.stick.name' }
  json.items = json.items.map((i) => ({ ...i, descriptionName: unnamed[i.name] ?? i.descriptionName }))
  writeFileSync(file, gzipSync(JSON.stringify(json)))
  const committedFiles: Record<string, string> = {
    blocks: JSON.stringify([{ name: 'dirt', displayName: 'Dirt Block' }]),
    items: JSON.stringify([{ name: 'dirt', displayName: 'Coarse Dirt' }]),
  }
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } })
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: (_, key) => committedFiles[key] }, [blocks, items])

  function names(key: string): Record<string, unknown> {
    const out = JSON.parse(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', `${key}.json`), 'utf8')) as { name: string; displayName: string }[]
    return Object.fromEntries(out.map((e) => [e.name, e.displayName]))
  }

  assert.equal(names('blocks').dirt, 'Dirt Block')
  assert.equal(names('items').dirt, 'Coarse Dirt')
  assert.equal(names('items').stick, 'Stick')
  // the game's name over the committed one
  assert.equal(names('blocks').stone, 'Stone')
})
