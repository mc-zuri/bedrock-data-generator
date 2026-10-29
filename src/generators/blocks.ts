// blocks.json: every block type of the build by its numeric id, from what bedrock-data says the game answers of it
// (blocks.json.gz, items.json.gz, block_shapes.json.gz) and its language:
// - id: the block's numeric id (BlockLegacy::mID);
// - displayName: the language's name (any pack's, the vanilla one's first) for its description id, else its item's name
//   as the game builds it (bedrock-data's descriptionName; for an item named item.<x>, a door's block form, else the item
//   <x>'s); a block the game names nothing (lit_furnace, a double slab) the version's committed file's name for it, else
//   its name in title case;
// - hardness, resistance, emitLight, filterLight: its default state's destroy speed, explosion resistance, light
//   emission and light dampening; transparent: light passes it (dampening below 15);
// - diggable: a hardness of 0 or more, but not a liquid;
// - stackSize: its own item's (an id below 256 is its item's id; others' item is 255 minus it), else the item of its name's;
// - material, harvestTools: utils/dig.ts;
// - defaultState, minStateId, maxStateId: runtime ids;
// - boundingBox: empty where its default state collides with nothing, else block;
// - drops: every item the game drops for any of its states, mined with an empty hand, or for a data-driven block every
//   item its loot tables can drop; an item with a data value as { drop: { id, metadata } }, the data value a client is
//   sent (from 1.16.220, where a creative stack names the block it places, a block item's variant is the block it
//   carries). A block a player cannot mine (hardness below 0: bedrock, barriers, command blocks) drops nothing.
import type { BedrockData, BlockFacts, BlockTypes, Items, LootPool } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { materials } from './utils/dig.ts'
import { canonical, f32, withoutNamespace } from './utils/json.ts'
import { committedNames, gameNameOf, itemFor, nameOf, ordered, strings, titleCase } from './utils/names.ts'

export interface Block {
  id: number
  name: string
  displayName: string
  hardness: number
  resistance: number
  stackSize: number
  diggable: boolean
  material: string
  transparent: boolean
  emitLight: number
  filterLight: number
  defaultState: number
  minStateId: number
  maxStateId: number
  harvestTools?: Record<string, true>
  drops: (number | { drop: { id: number; metadata: number } })[]
  boundingBox: 'block' | 'empty'
}

const ORDER: (keyof Block)[] = [
  'id',
  'name',
  'displayName',
  'hardness',
  'resistance',
  'stackSize',
  'diggable',
  'material',
  'transparent',
  'emitLight',
  'filterLight',
  'defaultState',
  'minStateId',
  'maxStateId',
  'harvestTools',
  'drops',
  'boundingBox',
]

const LIQUIDS = new Set(['minecraft:water', 'minecraft:flowing_water', 'minecraft:lava', 'minecraft:flowing_lava'])

/** The item a block type is placed by: its id below 256, else 255 minus it */
export function blockItemId(block: BlockFacts): number {
  return block.id < 256 ? block.id : 255 - block.id
}

/** Every item a loot table can drop: its item entries, and those of the pools nested in it. */
function lootItems(pools: LootPool[] | undefined, out = new Set<string>()): Set<string> {
  for (const pool of pools ?? []) {
    for (const entry of pool.entries ?? []) {
      if (entry.type === 'item' && entry.name) {
        out.add(entry.name)
      }

      lootItems(entry.pools, out)
    }
  }

  return out
}

function dropsOf(block: BlockFacts, lootTables: BlockTypes['lootTables'], itemId: Map<string, number>, stacksCarryBlocks: boolean): Block['drops'] {
  function id(item: string): number {
    const found = itemId.get(withoutNamespace(item))

    if (found === undefined) {
      throw new Error(`${block.name} drops ${item}, which the item registry does not have`)
    }

    return found
  }

  const drawn = block.states.some((s) => s.drops.samples > 0)
  let dropped: { id: number; metadata: number }[]

  if (drawn) {
    dropped = block.states.flatMap((s) => s.drops.items.filter((d) => d.hits > 0).map((d) => ({ id: id(d.item), metadata: stacksCarryBlocks ? d.aux : d.data })))
  } else {
    // the game draws nothing for a data-driven block: its loot tables drop for it
    if (!block.loot) {
      throw new Error(`${block.name}: the game draws no drops and no loot table names it`)
    }

    dropped = block.loot.flatMap((path) => [...lootItems(lootTables[path]?.pools)].map((item) => ({ id: id(item), metadata: 0 })))
  }

  const unique = [...new Map(dropped.map((d) => [`${d.id}/${d.metadata}`, d])).values()].sort((a, b) => a.id - b.id || a.metadata - b.metadata)
  return unique.map((d) => (d.metadata ? { drop: d } : d.id))
}

function blocksJson(data: BedrockData, build: string, committed: (key: string) => string | undefined): Block[] {
  const { blocks, lootTables } = data.blocks(build)
  const items: Items = data.items(build)
  const shapes = data.blockShapes(build).blocks
  const lang = strings(data.language(build))
  const committedName = committedNames(committed('blocks'))
  const itemById = new Map(items.items.map((i) => [i.id, i]))
  const itemByName = new Map(items.items.map((i) => [i.name, i]))
  const itemId = new Map(items.items.map((i) => [withoutNamespace(i.name), i.id]))
  const dig = materials(blocks, itemId)
  // from 1.16.220 a creative stack names the block it places, and a block item's data value is the stack's own
  const stacksCarryBlocks = items.creative.some((c) => c.blockState !== null)

  if (shapes.length !== blocks.length) {
    throw new Error(`${blocks.length} block types, ${shapes.length} blocks of shapes`)
  }

  let firstState = 0
  return blocks
    .map((block, i) => {
      if (shapes[i].name !== block.name) {
        throw new Error(`block ${i}: ${block.name}, shapes of ${shapes[i].name}`)
      }

      const minStateId = firstState
      firstState += block.states.length
      const name = withoutNamespace(block.name)
      const item = itemById.get(blockItemId(block)) ?? itemByName.get(block.name)

      if (!item) {
        throw new Error(`${block.name} has no item`)
      }

      const def = block.states[block.defaultState]
      const material = dig.blocks.get(block.name)

      if (!material) {
        throw new Error(`${block.name} has no material`)
      }

      return ordered<Block>(
        {
          id: block.id,
          name,
          displayName:
            nameOf(lang, block.descriptionId) ?? gameNameOf(lang, item) ?? gameNameOf(lang, itemFor(item.name, itemByName)) ?? committedName.get(name) ?? titleCase(name),
          hardness: f32(def.hardness),
          resistance: f32(def.explosionResistance),
          stackSize: item.maxStackSize,
          diggable: def.hardness >= 0 && !LIQUIDS.has(block.name),
          material: material.material,
          transparent: def.lightDampening < 15,
          emitLight: def.lightEmission,
          filterLight: def.lightDampening,
          defaultState: minStateId + block.defaultState,
          minStateId,
          maxStateId: firstState - 1,
          harvestTools: material.harvestTools,
          drops: def.hardness < 0 ? [] : dropsOf(block, lootTables, itemId, stacksCarryBlocks),
          boundingBox: shapes[i].states[block.defaultState].collision.length ? 'block' : 'empty',
        },
        ORDER,
      )
    })
    .sort((a, b) => a.id - b.id)
}

// minecraft-data's drop id is 0 or more; a Bedrock block item past id 255 has a negative id, and in 1.16.201 and 1.16.210
// such a drop carries a data value ({ drop: { id, metadata } })
const DROP_ID = `"id": {
                            "type": "integer",
                            "minimum": 0
                          },`
const ANY_DROP_ID = `"id": {
                            "description": "The dropped item's id (Bedrock edition also uses negative ids)",
                            "type": "integer"
                          },`
// Ajv's uniqueItems compares every block with every other, 50 ms a Bedrock file in a suite that must finish in 40 s;
// unique ids already make every block unique
const EVERY_BLOCK_UNIQUE = `  "uniqueItems": true,
  "uniqueItemProperties": ["id"],`
const UNIQUE_IDS = `  "uniqueItemProperties": ["id"],`

export const blocks: Generator = {
  key: 'blocks',
  after: [],
  has: (data, build) => data.has(build, 'blocks', 'items', 'blockShapes', 'language'),
  json(data, build, committed = () => undefined) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(blocksJson(data, build, committed), null, 2)
  },
  meaning: canonical,
  schema: { file: 'blocks_schema.json', edit: (text) => text.replace(DROP_ID, ANY_DROP_ID).replace(EVERY_BLOCK_UNIQUE, UNIQUE_IDS) },
}
