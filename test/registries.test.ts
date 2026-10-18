import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { BedrockData } from '../src/bedrockData.ts'
import { attributes } from '../src/generators/attributes.ts'
import { biomes } from '../src/generators/biomes.ts'
import { effects } from '../src/generators/effects.ts'
import type { Generator } from '../src/generators/index.ts'
import { instruments } from '../src/generators/instruments.ts'
import { mapIcons } from '../src/generators/mapIcons.ts'
import { particles } from '../src/generators/particles.ts'
import { recipes } from '../src/generators/recipes.ts'
import { sounds } from '../src/generators/sounds.ts'
import { steve } from '../src/generators/steve.ts'
import { tints } from '../src/generators/tints.ts'
import { generate, type Entry } from '../src/publish.ts'
import { bedrockDataOf, minecraftDataOf, withBlocks, withKind } from './helpers.ts'

const BUILD = '1.21.0.03'
const ENUMS = {
  sounds: [
    { id: 0, name: 'item.use.on' },
    { id: 1, name: 'hit' },
  ],
  particles: [
    { id: 1, name: 'bubble' },
    { id: 90, name: 'vaultconnection' },
    { id: 90, name: 'windexplosion' },
  ],
  containers: [],
  instruments: [
    { id: 0, name: 'note.harp' },
    { id: 1, name: 'note.bd' },
  ],
  mapDecorations: [],
  containerNames: [],
  explorationMarkers: [
    { id: 15, name: 'monument' },
    { id: 14, name: 'mansion' },
  ],
}

/** The release with what each test gives it, generated into a version of its own */
function release(kinds: Record<string, unknown>): string {
  const data = bedrockDataOf({ [BUILD]: { 'potion.moveSpeed': ' Speed', 'potion.poison': 'Poison', 'biome.plains.name': 'Plains' } })
  withBlocks(
    data,
    BUILD,
    [
      { name: 'air', id: 0 },
      { name: 'redstone_wire', id: 55, states: 2 },
    ],
    ['air'],
  )

  for (const [kind, value] of Object.entries(kinds)) {
    withKind(data, BUILD, kind, value)
  }

  return data
}

function generated(data: string, gens: Generator[], key: string): unknown {
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0', instruments: 'bedrock/1.17.0' } })
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, gens)
  const file = join(mcData, 'data', 'bedrock', '1.21.0', `${key}.json`)
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : undefined
}

void test("effects.json: each effect by id, its name in PascalCase, the language's name, bad where harmful", () => {
  const data = release({
    effects: {
      effects: [
        { id: 1, name: 'speed', descriptionId: 'potion.moveSpeed', harmful: false },
        { id: 2, name: 'fatal_poison', descriptionId: 'potion.poison', harmful: true },
      ],
    },
  })
  assert.deepEqual(generated(data, [effects], 'effects'), [
    { id: 1, name: 'Speed', displayName: 'Speed', type: 'good' },
    { id: 2, name: 'FatalPoison', displayName: 'Poison', type: 'bad' },
  ])
})

void test('particles.json and sounds.json: each name by id, an id named twice its first name', () => {
  const data = release({ enums: ENUMS })
  assert.deepEqual(generated(data, [particles], 'particles'), [
    { id: 1, name: 'bubble' },
    { id: 90, name: 'vaultconnection' },
  ])
  assert.deepEqual(generated(data, [sounds], 'sounds'), ENUMS.sounds)
})

void test("instruments.json: each instrument's sound by its id; a build with no table of them has no entry", () => {
  assert.deepEqual(generated(release({ enums: ENUMS }), [instruments], 'instruments'), [
    { id: 0, name: 'harp', sound: 'note.harp' },
    { id: 1, name: 'bd', sound: 'note.bd' },
  ])
  const data = release({ enums: { ...ENUMS, instruments: [] } })
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0', instruments: 'bedrock/1.17.0' } })
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, [instruments])
  const paths = (JSON.parse(readFileSync(join(mcData, 'data', 'dataPaths.json'), 'utf8')) as { bedrock: Record<string, Entry> }).bedrock
  assert.deepEqual(paths['1.21.0'], { version: 'bedrock/1.21.0' })
})

void test('mapIcons.json: before the types are named, the exploration markers by the names the next release gives them', () => {
  const data = bedrockDataOf({ [BUILD]: {}, '1.26.51.1': {} })
  withKind(data, BUILD, 'enums', ENUMS)
  const named = {
    ...ENUMS,
    mapDecorations: [...Array.from({ length: 14 }, (_, id) => ({ id, name: `Marker${id}` })), { id: 14, name: 'WoodlandMansion' }, { id: 15, name: 'OceanMonument' }],
  }
  withKind(data, '1.26.51.1', 'enums', named)
  assert.deepEqual(
    mapIcons.json(new BedrockData(data), BUILD),
    JSON.stringify(
      [
        { id: 14, name: 'WoodlandMansion' },
        { id: 15, name: 'OceanMonument' },
      ],
      null,
      2,
    ),
  )
})

void test('attributes.json: the player attributes by resource, named in camelCase', () => {
  const data = release({
    attributes: {
      attributes: [
        { name: 'minecraft:player.hunger', min: 0, max: 20, default: 20, value: 20 },
        { name: 'minecraft:movement', min: 0, max: 3.4028235e38, default: 0.1, value: 0.1 },
      ],
    },
  })
  assert.deepEqual(generated(data, [attributes], 'attributes'), [
    { resource: 'minecraft:movement', name: 'movement', min: 0, max: 3.4028235e38, default: 0.1 },
    { resource: 'minecraft:player.hunger', name: 'playerHunger', min: 0, max: 20, default: 20 },
  ])
})

const BIOMES = {
  biomes: [
    { name: 'plains', id: 1, definition: { temperature: 0.8, downfall: 0.4, depth: 0.125, rain: true, mapWaterColor: 0x44aff5, tags: ['plains', 'overworld'] } },
    { name: 'hell', id: 8, definition: { temperature: 2, downfall: 0, tags: ['nether'] } },
    { name: 'custom', id: 200 },
  ],
}

void test("biomes.json: each biome sent, by id, its category by its tags, the language's name else its own in title case", () => {
  assert.deepEqual(generated(release({ biomes: BIOMES }), [biomes], 'biomes'), [
    {
      id: 1,
      name: 'plains',
      category: 'plains',
      temperature: 0.8,
      has_precipitation: true,
      dimension: 'overworld',
      displayName: 'Plains',
      color: 0x44aff5,
      rainfall: 0.4,
      depth: 0.125,
    },
    { id: 8, name: 'hell', category: 'nether', temperature: 2, dimension: 'nether', displayName: 'Hell', color: 0, rainfall: 0 },
  ])
})

void test("tints.json: each group's colours with their keys, the water as the server sends it", () => {
  const data = release({
    biomes: BIOMES,
    tints: {
      biomes: [
        { name: 'plains', grass: 1, foliage: 2, water: 3 },
        { name: 'hell', grass: 1, foliage: 4, water: 5 },
      ],
      redstone: [],
      constant: [{ name: 'minecraft:birch_leaves', color: 7 }],
    },
  })
  assert.deepEqual(generated(data, [tints], 'tints'), {
    grass: { data: [{ keys: ['plains', 'hell'], color: 1 }] },
    foliage: {
      data: [
        { keys: ['plains'], color: 2 },
        { keys: ['hell'], color: 4 },
      ],
    },
    water: {
      data: [
        { keys: ['plains'], color: 0x44aff5 },
        { keys: ['hell'], color: 5 },
      ],
    },
    redstone: { data: [] },
    constant: { data: [{ keys: ['birch_leaves'], color: 7 }] },
  })
})

void test('the schemas take what the server says: no visibleInItemFrame, a negative result id, an empty tint group', () => {
  // as minecraft-data's schemas have them
  function data(key: string): string {
    return `"data": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": { "$ref": "#/definitions/${key}" }`
  }

  const cases = [
    [mapIcons, '    "required": ["id", "name", "visibleInItemFrame"],', '    "required": ["id", "name"],'],
    [recipes, '    "^[0-9]+$": {', '    "^-?[0-9]+$": {'],
    [
      tints,
      `${data('StringKeyTintEntry')}\n${data('IntegerKeyTintEntry')}`,
      `${data('StringKeyTintEntry')}\n${data('IntegerKeyTintEntry')}`.replaceAll('"minItems": 1', '"minItems": 0'),
    ],
  ] as const

  for (const [g, before, after] of cases) {
    assert.equal(g.schema?.edit(before), after, g.key)
    assert.equal(g.schema?.edit(after), after, `${g.key}, edited again`)
  }
})

void test('steve.json: the recorded skin on one line; a build without one keeps what the version points to', () => {
  const skin = { ArmSize: 'wide', SkinId: 'persona-123456789012345-0', SkinImageWidth: 64 }
  const out = generated(release({ steve: skin }), [steve], 'steve')
  assert.deepEqual(out, skin)
  const data = release({})
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0', steve: 'bedrock/1.16.201' } })
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed: () => undefined }, [steve])
  const paths = (JSON.parse(readFileSync(join(mcData, 'data', 'dataPaths.json'), 'utf8')) as { bedrock: Record<string, Entry> }).bedrock
  assert.equal(paths['1.21.0'].steve, 'bedrock/1.16.201')
})
