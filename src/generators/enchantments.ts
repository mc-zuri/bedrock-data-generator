// enchantments.json: every enchantment the game has (enchantments.json.gz), by its id (Enchant::Type), as the game
// answers:
// - name: its own (binding, vanishing: not Java's binding_curse, vanishing_curse); displayName: the language's string
//   for its description id;
// - maxLevel; minCost and maxCost: the line a * level + b through the game's costs, checked on every level;
// - treasureOnly and discoverable: Enchant::isTreasureOnly and Enchant::isDiscoverable; tradeable: the game's flag;
// - curse: its description id is the game's enchantment.curse.*; no other answer of the game tells a curse;
// - exclude: the enchantments Enchant::isCompatibleWith refuses it;
// - category: the slots it can be put on, at an enchanting table or an anvil, named (utils/enchantSlots.ts); items.json
//   lists it in the enchantCategories of every item it can be put on;
// - weight: its frequency (common 30, uncommon 10, rare 3, very rare 1) as minecraft-data weighs those rarities (10, 5,
//   2, 1): its schema takes no weight above 10.
import type { BedrockData } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { enchantmentCategory } from './utils/enchantSlots.ts'
import { canonical } from './utils/json.ts'
import { strings } from './utils/names.ts'

export interface Enchantment {
  id: number
  name: string
  displayName: string
  maxLevel: number
  minCost: { a: number; b: number }
  maxCost: { a: number; b: number }
  treasureOnly: boolean
  curse: boolean
  exclude: string[]
  category: string
  weight: number
  tradeable: boolean
  discoverable: boolean
}

const WEIGHTS = new Map([
  [30, 10],
  [10, 5],
  [3, 2],
  [1, 1],
])

/** The line through the costs at levels 1, 2, ...: a * level + b. */
function line(costs: number[], what: string): { a: number; b: number } {
  const a = costs[1] - costs[0]
  const b = costs[0] - a

  if (costs.length < 2 || costs.some((cost, i) => cost !== a * (i + 1) + b)) {
    throw new Error(`${what} is not a line in the level: ${costs.join(', ')}`)
  }

  return { a, b }
}

function enchantmentsJson(data: BedrockData, build: string): Enchantment[] {
  const lang = strings(data.language(build))
  const { enchantments } = data.enchantments(build)
  const byId = new Map(enchantments.map((e) => [e.id, e]))
  return enchantments.map((e) => {
    const displayName = lang.get(e.descriptionId)?.trim()
    const weight = WEIGHTS.get(e.frequency)

    if (!displayName) {
      throw new Error(`${e.name}: the language has no ${e.descriptionId}`)
    }

    if (weight === undefined) {
      throw new Error(`${e.name}: frequency ${e.frequency}`)
    }

    return {
      id: e.id,
      name: e.name,
      displayName,
      maxLevel: e.maxLevel,
      minCost: line(e.minCost, `${e.name}'s min cost`),
      maxCost: line(e.maxCost, `${e.name}'s max cost`),
      treasureOnly: e.treasureOnly,
      curse: e.descriptionId.startsWith('enchantment.curse.'),
      exclude: e.incompatible.map((id) => {
        const other = byId.get(id)

        if (!other) {
          throw new Error(`${e.name}: no enchantment ${id} to exclude`)
        }

        return other.name
      }),
      category: enchantmentCategory(e),
      weight,
      tradeable: e.tradeable,
      discoverable: e.discoverable,
    }
  })
}

export const enchantments: Generator = {
  key: 'enchantments',
  after: ['materials', 'instruments', 'recipes', 'items'],
  has: (data, build) => data.has(build, 'enchantments', 'language'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(enchantmentsJson(data, build), null, 2)
  },
  meaning: canonical,
}
