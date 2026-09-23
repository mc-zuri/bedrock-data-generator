// The blocks.json fields the server says (block_types.json, block-state-shapes.nbt, items.json), for every
// block of a build, whichever way its entry was made (kept from minecraft-data or made from the Java block):
// - displayName: the language file's name for the block's description id (tile.<...>.name), where it has one;
// - hardness, resistance: the default state's destroy speed and explosion resistance, as the game has them
//   (Bedrock's own: obsidian 35, not Java's 50; blocks the game defines by components keep their
//   explosion resistance a fifth of the legacy blocks' scale, as the server holds it);
// - diggable: a hardness of 0 or more, but not a liquid;
// - emitLight, filterLight: the default state's light emission and dampening; transparent: dampening below 15;
// - boundingBox: `empty` where the default state has no collision box, else `block`;
// - stackSize: the item of the block's name, where there is one;
// - drops: the Java block's drops as the Bedrock items Geyser maps them to (by name); a drop the version has
//   no item for (Java 1.17's raw_iron for 1.16's iron ore) is the block's own item, as is the drop of a block
//   with no Java block; the Java data is the only source (the server's block drops are code, not loot tables);
// - material, harvestTools: dig.ts.
import type { BlockType, Dig } from './dig.ts'

export interface ServerBlockType extends BlockType {
  hardness?: number
  explosionResistance?: number
  lightEmission?: number
  lightDampening?: number
  descriptionId?: string
}

const LIQUIDS = new Set(['water', 'flowing_water', 'lava', 'flowing_lava'])

export interface PropsInput {
  types: Record<string, ServerBlockType>
  /** the default state (runtime id) of a block */
  defaultState: (name: string) => number
  /** whether a state (runtime id) has no collision box */
  noCollision: (state: number) => boolean
  items: { id: number, name: string, stackSize: number }[]
  digs: Map<string, Dig>
  /** the Java block a Bedrock block maps to, and the Java items.json its drops are ids of */
  javaBlock: (name: string) => { drops?: unknown[] } | undefined
  javaItems: { id: number, name: string }[]
  /** Java item name -> the Bedrock item name Geyser maps it to */
  javaToBedrockItem: Map<string, string>
  /** the server's en_US.lang */
  lang: Record<string, string>
  warn?: (text: string) => void
}

/** The server's fields of each block, by name (without minecraft:); a field is undefined to be left out. */
export function serverBlockFields ({ types, defaultState, noCollision, items, digs, javaBlock, javaItems, javaToBedrockItem, lang, warn = () => {} }: PropsInput): Map<string, Record<string, unknown>> {
  const itemByName = new Map(items.map(i => [i.name, i]))
  const javaName = new Map(javaItems.map(i => [i.id, i.name]))
  const out = new Map<string, Record<string, unknown>>()
  for (const [name, t] of Object.entries(types)) {
    if (t.hardness === undefined || t.explosionResistance === undefined || t.lightEmission === undefined || t.lightDampening === undefined) {
      throw new Error(`block_types.json: ${name} has no hardness / light (pnpm blocks --force)`)
    }
    const dig = digs.get(name)!
    const own = itemByName.get(name)
    const java = javaBlock(name)
    let drops: number[]
    if (java) {
      drops = []
      for (const d of java.drops ?? []) {
        const id = typeof d === 'number' ? d : (d as any)?.drop?.id ?? (d as any)?.drop
        const jn = javaName.get(id)
        if (jn === 'air' || id === 0) continue
        const bedrock = jn === undefined ? undefined : itemByName.get(javaToBedrockItem.get(jn) ?? jn)
        if (bedrock) drops.push(bedrock.id)
        else if (own) drops.push(own.id)
        else warn(`${name}: drops Java ${jn ?? id}, no Bedrock item`)
      }
    } else {
      drops = own ? [own.id] : []
    }
    const displayName = t.descriptionId === undefined ? undefined : lang[t.descriptionId.endsWith('.name') ? t.descriptionId : `${t.descriptionId}.name`]
    out.set(name, {
      ...(displayName ? { displayName } : {}),
      hardness: t.hardness,
      resistance: t.explosionResistance,
      diggable: t.hardness >= 0 && !LIQUIDS.has(name),
      material: dig.material,
      transparent: t.lightDampening < 15,
      emitLight: t.lightEmission,
      filterLight: t.lightDampening,
      harvestTools: dig.harvestTools,
      drops: [...new Set(drops)],
      boundingBox: noCollision(defaultState(name)) ? 'empty' : 'block',
      ...(own ? { stackSize: own.stackSize } : {})
    })
  }
  return out
}

/**
 * A blocks.json entry with `fields` set: a key it has keeps its place (or goes, where the field is
 * undefined), a new one goes where `order` puts it.
 */
export function withFields (entry: Record<string, any>, fields: Record<string, unknown>, order: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {}
  const pending = Object.keys(fields).filter(k => !(k in entry) && fields[k] !== undefined)
  const place = (after: string) => {
    for (const k of [...pending]) {
      const i = order.indexOf(k)
      // right after the last key before it in `order` that the entry has
      const prev = order.slice(0, i).filter(p => p in entry || p in out).at(-1)
      if (prev === after) { out[k] = fields[k]; pending.splice(pending.indexOf(k), 1) }
    }
  }
  for (const [k, v] of Object.entries(entry)) {
    if (k in fields) { if (fields[k] !== undefined) out[k] = fields[k] } else out[k] = v
    place(k)
  }
  for (const k of pending) out[k] = fields[k]
  return out
}
