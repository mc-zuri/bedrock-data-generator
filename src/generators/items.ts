// items.json: every item of the build's item registry by its runtime id (the id the server sends a client for it), from
// what bedrock-data says of it (items.json.gz, enchantments.json.gz, blocks.json.gz) and its language:
// - stackSize, and maxDurability where it wears out: Item::getMaxStackSize and Item::getMaxDamage;
// - displayName: the language's name (any pack's, the vanilla one's first) for its description id, else for its block's
//   (a block item), else (an item named item.<x>) the item <x>'s, else its name in title case;
// - enchantCategories: the names of the Item::getEnchantSlot slots it answers (all: the books), then the category of
//   every enchantment the game puts on it (utils/enchantSlots.ts);
// - repairWith: the items Item::isValidRepairItem takes;
// - blockStateId: the block state the creative list gives it, where it gives it one;
// - componentBased: as the item registry the server sends has it;
// - nbt and version: as the item registry has them (from 1.21.60).
// Items with data values (potions, the colours of a bed) are one entry: no variations. An item's keys are written in the
// order the version's committed file writes that item's.
import type { BedrockData, Items } from '../bedrockData.ts'
import { blockItemId } from './blocks.ts'
import type { Generator } from './index.ts'
import { itemEnchantCategories } from './utils/enchantSlots.ts'
import { canonical, withoutNamespace } from './utils/json.ts'
import { inCommittedKeyOrder, nameOf, nameOfItemFor, ordered, strings, titleCase } from './utils/names.ts'

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

function itemsJson(data: BedrockData, build: string): Item[] {
  const { items, creative } = data.items(build)
  const { enchantments } = data.enchantments(build)
  const lang = strings(data.language(build))
  const blocks = new Map(data.blocks(build).blocks.map((b) => [blockItemId(b), b]))
  const blockStates = creativeBlockStates(creative)
  const byName = new Map(items.map((i) => [i.name, i]))
  return items
    .map((item) => {
      const name = withoutNamespace(item.name)
      const block = blocks.get(item.id)
      return ordered<Item>(
        {
          id: item.id,
          stackSize: item.maxStackSize,
          name,
          displayName: nameOf(lang, item.descriptionId) ?? (block && nameOf(lang, block.descriptionId)) ?? nameOfItemFor(lang, item.name, byName) ?? titleCase(name),
          blockStateId: blockStates.get(item.name),
          enchantCategories: itemEnchantCategories(item.enchantSlots, item.name, enchantments),
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

export const items: Generator = {
  key: 'items',
  after: ['entities', 'biomes', 'blockCollisionShapes', 'blockStates', 'blocks'],
  has: (data, build) => data.has(build, 'items', 'enchantments', 'blocks', 'language'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(itemsJson(data, build), null, 2)
  },
  format(json, committed) {
    return JSON.stringify(inCommittedKeyOrder(JSON.parse(json) as Item[], committed('items'), ORDER), null, 2)
  },
  meaning: canonical,
  schema: { file: 'items_schema.json', edit: (text) => (text.includes('"componentBased"') ? text : text.replace(NBT, COMPONENT_BASED + NBT)) },
}
