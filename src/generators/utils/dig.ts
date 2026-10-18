// What digs a block and how fast: blocks.json's material and harvestTools, and materials.json (each material's speeds by
// item id), from what bedrock-data says the game answers: each item's destroy speed on each block state, the items that
// harvest it, and whether it drops only with the right tool.
//
// prismarine-block breaks a block at materials[material][held item] (1 when absent), harvesting it when it has no
// harvestTools or the held item is one of them: the game's Player::getDestroyProgress with those two answers. So a
// block's harvestTools are the items that harvest it where it needs the right tool ({} where none does), and its
// material's speeds are the server's speeds on it.
//
// A material's name only has to be the same for blocks the items dig alike; it is made from the speeds, as pc names
// them: mineable/<tool> for each digger whose every tier digs the block at its tier's speed (wood 2, stone 4, copper 5,
// iron 6, diamond 8, netherite 9, gold 12), and the parts no digger makes by the swords' and shears' speeds beyond what
// they dig every block at (air's; before 1.21.50 a sword digs any block at 1.5):
//   swords 15: coweb; 1.5: sword_efficient; faster (bamboo: 10, 60, 30 as builds have it): sword_instantly_mines
//   shears 15: leaves (with swords at 1.5 too; with swords at 15: coweb); 5: wool; 2: vine_or_glow_lichen
// The mace digs as a sword where it does (1.20.80 - 1.21.2). Any other speed fails the build.
import type { BlockFacts, StateFacts } from '../../bedrockData.ts'
import { withoutNamespace } from './json.ts'

const TIERS: [tier: string, speed: number][] = [
  ['wooden', 2],
  ['stone', 4],
  ['copper', 5],
  ['iron', 6],
  ['golden', 12],
  ['diamond', 8],
  ['netherite', 9],
]
/** The diggers, in the order a material's name lists them. */
const DIGGERS = ['axe', 'hoe', 'pickaxe', 'shovel']
/** The parts no digger makes, in the order a material's name lists them (pc's materials.json's). */
const PARTS = ['leaves', 'wool', 'coweb', 'plant', 'gourd', 'vine_or_glow_lichen', 'sword_efficient', 'sword_instantly_mines']
/** materials.json's order: default first, then as pc's materials.json orders them, the rest as first met. */
const MATERIAL_ORDER = ['default', ...PARTS, ...DIGGERS.map((d) => `mineable/${d}`)]

function rank(material: string): number {
  return MATERIAL_ORDER.includes(material) ? MATERIAL_ORDER.indexOf(material) : MATERIAL_ORDER.length
}

export interface BlockMaterial {
  material: string
  /** the ids of the items that harvest it, where it drops only with the right tool */
  harvestTools?: Record<string, true>
}

export interface Materials {
  /** by block name, as the game names it */
  blocks: Map<string, BlockMaterial>
  /** each material's speeds by item id: default first, then as pc's materials.json orders them */
  materials: Record<string, Record<string, number>>
}

function isSword(item: string): boolean {
  return item.endsWith('_sword')
}

function idOf(item: string, itemId: Map<string, number>, block: string): number {
  const id = itemId.get(item)

  if (id === undefined) {
    throw new Error(`${item} digs ${block}, an item the registry does not have`)
  }

  return id
}

/** The speeds on `state` by item name without its namespace. */
function speedsOf(state: StateFacts, itemId: Map<string, number>, block: string): Map<string, number> {
  const speeds = new Map(Object.entries(state.destroySpeeds).map(([item, speed]) => [withoutNamespace(item), speed]))

  for (const item of speeds.keys()) {
    idOf(item, itemId, block)
  }

  return speeds
}

function materialName(block: string, speeds: Map<string, number>, baseline: Map<string, number>, itemId: Map<string, number>): string {
  const rest = new Map(speeds)
  const diggers: string[] = []

  for (const digger of DIGGERS) {
    const tools = TIERS.filter(([tier]) => itemId.has(`${tier}_${digger}`))

    if (tools.length && tools.every(([tier, speed]) => speeds.get(`${tier}_${digger}`) === speed)) {
      diggers.push(`mineable/${digger}`)

      for (const [tier] of tools) {
        rest.delete(`${tier}_${digger}`)
      }
    }
  }

  // the swords (and the mace where it digs as one) all dig alike
  const swords = [...rest.keys()].filter(isSword)
  const sword = swords.length ? rest.get(swords[0]) : undefined

  if (swords.some((s) => rest.get(s) !== sword)) {
    throw new Error(`${block}: the swords dig it at different speeds`)
  }

  const swordsDiffer = sword !== undefined && sword !== baseline.get(swords[0])

  for (const s of swords) {
    rest.delete(s)
  }

  if (rest.has('mace') && rest.get('mace') === sword) {
    rest.delete('mace')
  }

  const shears = rest.get('shears')
  rest.delete('shears')

  for (const [item, speed] of rest) {
    if (baseline.get(item) !== speed) {
      throw new Error(`${block}: ${item} digs it at ${speed}, which no material part says`)
    }
  }

  const parts: string[] = []

  if (swordsDiffer && sword === 15) {
    parts.push('coweb')
  } else if (swordsDiffer && sword === 1.5) {
    parts.push('sword_efficient')
  } else if (swordsDiffer && sword !== undefined && sword > 1.5) {
    parts.push('sword_instantly_mines')
  } else if (swordsDiffer) {
    throw new Error(`${block}: swords dig it at ${sword}`)
  }

  // leaves: shears at 15, swords at 1.5 (or at what they dig anything at)
  if (shears === 15 && swordsDiffer && sword === 1.5) {
    parts.splice(parts.indexOf('sword_efficient'), 1, 'leaves')
  } else if (shears === 15 && !(swordsDiffer && sword === 15)) {
    parts.push('leaves')
  } else if (shears === 5) {
    parts.push('wool')
  } else if (shears === 2) {
    parts.push('vine_or_glow_lichen')
  } else if (shears !== undefined && shears !== 15) {
    throw new Error(`${block}: shears dig it at ${shears}`)
  }

  parts.sort((a, b) => PARTS.indexOf(a) - PARTS.indexOf(b))
  return [...parts, ...diggers].join(';') || 'default'
}

/** The default state of `block`, which every state digs as (blocks.json has one entry for all of a block's states). */
function digState(block: BlockFacts): StateFacts {
  const state = block.states[block.defaultState]
  const digs = JSON.stringify([state.destroySpeeds, state.harvestedBy])
  const unlike = block.states.findIndex((s) => JSON.stringify([s.destroySpeeds, s.harvestedBy]) !== digs)

  if (unlike >= 0) {
    throw new Error(`${block.name}: its state ${unlike} digs unlike its default state`)
  }

  return state
}

export function materials(blocks: BlockFacts[], itemId: Map<string, number>): Materials {
  const air = blocks.find((b) => b.name === 'minecraft:air')

  if (!air) {
    throw new Error('no minecraft:air')
  }

  const baseline = speedsOf(digState(air), itemId, air.name)

  // by item id, as the schema writes a material's keys
  function table(speeds: Map<string, number>): Record<string, number> {
    const ids = [...speeds].map(([item, speed]) => [idOf(item, itemId, 'a block'), speed] as const).sort((a, b) => a[0] - b[0])
    return Object.fromEntries(ids.map(([id, speed]) => [String(id), speed]))
  }

  const out = new Map<string, BlockMaterial>()
  const byName: Record<string, Record<string, number>> = { default: table(baseline) }

  for (const block of blocks) {
    const state = digState(block)
    const speeds = speedsOf(state, itemId, block.name)
    const material = materialName(block.name, speeds, baseline, itemId)
    const speedTable = table(speeds)

    if (!(material in byName)) {
      byName[material] = speedTable
    } else if (JSON.stringify(byName[material]) !== JSON.stringify(speedTable)) {
      throw new Error(`${block.name}: its material ${material} has other speeds on another block`)
    }

    const entry: BlockMaterial = { material }

    if (block.requiresCorrectTool) {
      // none: a block nothing harvests (bedrock, command blocks)
      const ids = state.harvestedBy.map((item) => idOf(withoutNamespace(item), itemId, block.name)).sort((a, b) => a - b)
      entry.harvestTools = Object.fromEntries(ids.map((id) => [String(id), true as const]))
    }

    out.set(block.name, entry)
  }

  const names = Object.keys(byName)
  const sorted = names.map((name, i) => [name, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
  return { blocks: out, materials: Object.fromEntries(sorted.map(([name]) => [name, byName[name]])) }
}
