// items.json: every item of the build's item registry by its runtime id (the id the server sends a client for it), from
// what bedrock-data says of it (items.json.gz) and its language:
// - stackSize, and maxDurability where it wears out: Item::getMaxStackSize and Item::getMaxDamage;
// - displayName: its name as the game builds it (bedrock-data's descriptionName: a stack of one of it), the key that
//   builds translated by the language (any pack's) where the server's has none. One that no pack names is an item a
//   player cannot get (a technical block's, an old name the game still registers: the game shows its key): the version's
//   committed file's name for it, else its name in title case; one the creative list has fails;
// - enchantCategories: the names of the Item::getEnchantSlot slots it answers (all: the books; utils/enchantSlots.ts);
// - repairWith: the items Item::isValidRepairItem takes;
// - blockStateId: the block state the creative list gives it, where it gives it one;
// - componentBased: as the item registry the server sends has it;
// - nbt and version: as the item registry has them (from 1.21.60).
// Items with data values (potions, the colours of a bed) are one entry: no variations. An item's keys are written in the
// order the version's committed file writes that item's.
import type { BedrockData, Items } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { itemEnchantCategories } from './utils/enchantSlots.ts'
import { canonical, withoutNamespace } from './utils/json.ts'
import { committedNames, gameNameOf, inCommittedKeyOrder, ordered, strings, titleCase } from './utils/names.ts'

export interface Item {
  id: number
  stackSize: number
  name: string
  displayName: string
  blockStateId?: number
  enchantCategories?: string[]
  repairWith?: string[]
  maxDurability?: number
  componentBased: boolean
  nbt?: unknown
  version?: string | number
}

const ORDER: (keyof Item)[] = ['id', 'stackSize', 'name', 'displayName', 'blockStateId', 'enchantCategories', 'repairWith', 'maxDurability', 'componentBased', 'nbt', 'version']

/** Each item's block state, by name, where the creative list gives it one (and no other). */
function creativeBlockStates(creative: Items['creative']): Map<string, number> {
  const states = new Map<string, Set<number>>()

  for (const { item, blockState } of creative) {
    if (blockState !== null) {
      states.set(item, (states.get(item) ?? new Set()).add(blockState))
    }
  }

  return new Map([...states].filter(([, s]) => s.size === 1).map(([item, s]) => [item, [...s][0]]))
}

function noName(build: string, item: { name: string; descriptionName: string }): never {
  throw new Error(`release/${build}: ${item.name}, in the creative list, has no name: the game builds '${item.descriptionName}', which no language pack has`)
}

function itemsJson(data: BedrockData, build: string, committed: (key: string) => string | undefined): Item[] {
  const { items, creative } = data.items(build)
  const lang = strings(data.language(build))
  const committedName = committedNames(committed('items'))
  const blockStates = creativeBlockStates(creative)
  const obtainable = new Set(creative.map((c) => c.item))
  return items
    .map((item) => {
      const name = withoutNamespace(item.name)
      return ordered<Item>(
        {
          id: item.id,
          stackSize: item.maxStackSize,
          name,
          displayName: gameNameOf(lang, item) ?? (obtainable.has(item.name) ? noName(build, item) : (committedName.get(name) ?? titleCase(name))),
          blockStateId: blockStates.get(item.name),
          enchantCategories: itemEnchantCategories(item.enchantSlots, item.name),
          repairWith: item.repairItems.length ? item.repairItems.map(withoutNamespace) : undefined,
          maxDurability: item.maxDamage > 0 ? item.maxDamage : undefined,
          componentBased: item.componentBased,
          nbt: item.nbt,
          version: item.version,
        },
        ORDER,
      )
    })
    .sort((a, b) => a.id - b.id)
}

// minecraft-data's item has Bedrock's nbt and version, not componentBased: it goes before them
const NBT = `      "nbt": {
        "description": "Default NBT data associated with this item (Bedrock edition)",`
const COMPONENT_BASED = `      "componentBased": {
        "description": "Whether the item is component-based, as the item registry the server sends has it (Bedrock edition)",
        "type": "boolean"
      },
`
// unique names for uniqueItems: Ajv compares every item with every other, 85 ms a Bedrock file in a suite that must
// finish in 40 s. Not ids: minecraft-data's audit_blockitems.js adds to the items it loads, before they are checked, an
// item of each block no item names, with the block's id.
const EVERY_ITEM_UNIQUE = `  "type": "array",
  "uniqueItems": true,`
const UNIQUE_NAMES = `  "type": "array",
  "uniqueItemProperties": ["name"],`

export const items: Generator = {
  key: 'items',
  after: ['entities', 'biomes', 'blockCollisionShapes', 'blockStates', 'blocks'],
  has: (data, build) => data.has(build, 'items', 'language'),
  json(data, build, committed = () => undefined) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(itemsJson(data, build, committed), null, 2)
  },
  format(json, committed) {
    return JSON.stringify(inCommittedKeyOrder(JSON.parse(json) as Item[], committed('items'), ORDER), null, 2)
  },
  meaning: canonical,
  schema: {
    file: 'items_schema.json',
    edit: (text) => (text.includes('"componentBased"') ? text : text.replace(NBT, COMPONENT_BASED + NBT)).replace(EVERY_ITEM_UNIQUE, UNIQUE_NAMES),
  },
}
