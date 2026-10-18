// tints.json: the colours the server tints with, which are those it draws its maps with (tints.json.gz; a dedicated
// server renders nothing, and the palettes the client tints its blocks from are never filled there), in
// minecraft-data's form: each group's colours with the keys that take them, in the order the colours come.
// - grass, foliage: each biome's (by its name), from the game's own Biome functions: a biome's custom colour where it
//   has one (mesa's), else the swamp's noise (at the origin), else the corner colours blended by its temperature and
//   downfall;
// - water: each biome's map water colour as the server sends it (biomes.json.gz, from 1.19.20), before that as the
//   agent reads it from the Biome;
// - redstone: the redstone wire's colour at each power (redstone_signal); none from 1.21.20, where the server keeps no
//   block colour (the client tints the wire);
// - constant: the block types the server tints with one colour wherever they are: the birch and the spruce leaves, from
//   1.20.71, where they are types of their own (before, one type, leaves, has every wood's states).
// No group has a default: the server has none to give.
import type { BedrockData } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical, withoutNamespace } from './utils/json.ts'

interface TintEntry<K> {
  keys: K[]
  color: number
}

export interface TintsJson {
  grass: { data: TintEntry<string>[] }
  foliage: { data: TintEntry<string>[] }
  water: { data: TintEntry<string>[] }
  redstone: { data: TintEntry<number>[] }
  constant: { data: TintEntry<string>[] }
}

/** the keys of each colour, in the order the colours first come */
function grouped<K>(entries: [K, number][]): TintEntry<K>[] {
  const byColour = new Map<number, K[]>()

  for (const [key, colour] of entries) {
    byColour.set(colour, [...(byColour.get(colour) ?? []), key])
  }

  return [...byColour].map(([color, keys]) => ({ keys, color }))
}

/** the redstone wire's colour by its power: its states' colours, each state's redstone_signal from the palette */
function redstoneByPower(data: BedrockData, build: string, colours: number[]): [number, number][] {
  if (!colours.length) {
    return []
  }

  const wire = data.palette(build).filter((s) => s.name === 'minecraft:redstone_wire')

  if (wire.length !== colours.length) {
    throw new Error(`${colours.length} redstone wire colours for ${wire.length} states`)
  }

  return wire
    .map((s, i): [number, number] => {
      const signal = s.states.redstone_signal?.value

      if (typeof signal !== 'number') {
        throw new Error('a redstone wire state without redstone_signal')
      }

      return [signal, colours[i]]
    })
    .sort((a, b) => a[0] - b[0])
}

function tintsJson(data: BedrockData, build: string): TintsJson {
  const tints = data.tints(build)
  const sentWater = new Map(data.biomes(build).flatMap((b) => (b.definition?.mapWaterColor === undefined ? [] : [[b.name, b.definition.mapWaterColor] as const])))
  const biomes = tints.biomes.map((b) => {
    const water = sentWater.get(b.name) ?? b.water

    if (water === undefined) {
      throw new Error(`biome ${b.name}: the server sends no water colour and the agent read none`)
    }

    return { ...b, water }
  })
  return {
    grass: { data: grouped(biomes.map((b) => [b.name, b.grass])) },
    foliage: { data: grouped(biomes.map((b) => [b.name, b.foliage])) },
    water: { data: grouped(biomes.map((b) => [b.name, b.water])) },
    redstone: { data: grouped(redstoneByPower(data, build, tints.redstone)) },
    constant: { data: grouped(tints.constant.map((c) => [withoutNamespace(c.name), c.color])) },
  }
}

// minecraft-data's tint groups have a colour at least; the server has none of the redstone wire from 1.21.20, and no block
// of one colour before 1.20.71
const DATA = `"data": {
          "type": "array",
          "minItems": 1,`

export const tints: Generator = {
  key: 'tints',
  after: ['sounds', 'particles', 'effects'],
  has: (data, build) => data.has(build, 'tints', 'biomes', 'blockPalette'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(tintsJson(data, build), null, 2)
  },
  meaning: canonical,
  schema: { file: 'tints_schema.json', edit: (text) => text.replaceAll(DATA, DATA.replace('"minItems": 1', '"minItems": 0')) },
}
