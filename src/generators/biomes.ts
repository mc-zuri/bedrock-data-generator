// biomes.json: every biome the server sends in biome_definition_list (biomes.json.gz), by the numeric id the game gives
// it (the packet never sends a vanilla biome's id: the agent reads it from the registry), from what the packet says of
// it:
// - temperature and rainfall: its temperature and downfall;
// - has_precipitation, depth and color (its water's colour on a map) where the server sends them (from 1.19.20); before,
//   color is 0, which the server does not say;
// - dimension: nether or the_end where its tags say so, else overworld;
// - category: what its tags say it is, in minecraft-data's words; none where they say nothing of it;
// - displayName: the language's biome.<name>.name (from 1.26.20), else its name in title case.
import type { BedrockData } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'
import { ordered, strings, titleCase } from './utils/names.ts'

export interface Biome {
  id: number
  name: string
  category: string
  temperature: number
  has_precipitation?: boolean
  dimension: string
  displayName: string
  color: number
  rainfall: number
  depth?: number
}

const ORDER: (keyof Biome)[] = ['id', 'name', 'category', 'temperature', 'has_precipitation', 'dimension', 'displayName', 'color', 'rainfall', 'depth']

// a biome's category by the first of its tags that says one, in minecraft-data's words
const CATEGORIES: [test: (has: (tag: string) => boolean) => boolean, category: (has: (tag: string) => boolean) => string][] = [
  [(has) => has('the_end'), () => 'the_end'],
  [(has) => has('nether'), () => 'nether'],
  [(has) => has('caves'), () => 'underground'],
  [(has) => has('mooshroom_island'), () => 'mushroom'],
  [(has) => has('beach'), () => 'beach'],
  [(has) => has('river'), (has) => (has('frozen') ? 'ice' : 'river')],
  [(has) => has('ocean'), () => 'ocean'],
  [(has) => has('mangrove_swamp') || has('flower_forest'), () => 'forest'],
  [(has) => has('swamp'), () => 'swamp'],
  [(has) => has('jungle'), () => 'jungle'],
  [(has) => has('mesa'), () => 'mesa'],
  [(has) => has('savanna'), () => 'savanna'],
  [(has) => has('desert'), () => 'desert'],
  [(has) => has('taiga'), () => 'taiga'],
  [(has) => has('extreme_hills'), (has) => (has('forest') && !has('mutated') ? 'forest' : 'extreme_hills')],
  [(has) => has('grove') || has('cherry_grove'), () => 'forest'],
  [(has) => has('mountains'), (has) => (has('frozen_peaks') ? 'ice' : 'mountain')],
  [(has) => has('ice_plains') || has('ice'), (has) => (has('mutated') ? 'ice' : 'plains')],
  [(has) => has('forest') || has('roofed'), () => 'forest'],
  [(has) => has('plains'), () => 'plains'],
]

/** A biome's category by its tags; undefined where no tag says it. */
function biomeCategory(tags: ReadonlySet<string>): string | undefined {
  function has(tag: string): boolean {
    return tags.has(tag)
  }

  const found = CATEGORIES.find(([test]) => test(has))
  return found?.[1](has)
}

function biomesJson(data: BedrockData, build: string): Biome[] {
  const lang = strings(data.language(build))
  return data
    .biomes(build)
    .flatMap(({ id, name, definition: d }) => {
      if (!d) {
        return []
      }

      const tags = new Set(d.tags)
      return [
        ordered<Biome>(
          {
            id,
            name,
            category: biomeCategory(tags) ?? 'none',
            temperature: d.temperature,
            has_precipitation: d.rain,
            dimension: tags.has('nether') ? 'nether' : tags.has('the_end') ? 'the_end' : 'overworld',
            displayName: lang.get(`biome.${name}.name`)?.trim() || titleCase(name),
            color: d.mapWaterColor ?? 0,
            rainfall: d.downfall,
            depth: d.depth,
          },
          ORDER,
        ),
      ]
    })
    .sort((a, b) => a.id - b.id)
}

export const biomes: Generator = {
  key: 'biomes',
  after: ['blockCollisionShapes', 'blockStates', 'blocks'],
  has: (data, build) => data.has(build, 'biomes', 'language'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(biomesJson(data, build), null, 2)
  },
  meaning: canonical,
}
