// blockStates.json and blockCollisionShapes.json of a build, as minecraft-data-extractor-legacy2
// (src/generators/blockMap.ts, collision.ts) writes them, from this repo's NBT.
import nbt from 'prismarine-nbt'
import { readFileSync } from 'node:fs'
import { gunzip, readNbt } from '../nbt.ts'
import { collisionJSONStringify, shortenFloats } from './format.ts'

export interface BlockState { name: string, states: Record<string, { type: string, value: unknown }>, version: number }

/** block_palette.nbt: one entry per state in runtime id order, the states as their NBT tags ({ type, value }). */
export function readBlockStates (paletteFile: string): BlockState[] {
  const raw: any = nbt.parseUncompressed(gunzip(readFileSync(paletteFile)), 'big')
  return raw.value.blocks.value.value.map((b: any) => ({ name: b.name.value.replace('minecraft:', ''), states: b.states.value, version: b.version.value }))
}

/**
 * A block state's network hash (what a server sends in place of a runtime id where it hashes them, as in
 * crafting_data's outputs from 1.20): FNV-1a 32 of the state's NBT, little-endian, { name, states } with
 * the states in key order (block_types.json's defaultBlockStateHash is each block's default state's).
 */
export function stateHash (state: BlockState): number {
  const states = Object.fromEntries(Object.keys(state.states).sort().map(k => [k, state.states[k]]))
  const root = { type: 'compound', name: '', value: { name: { type: 'string', value: `minecraft:${state.name}` }, states: { type: 'compound', value: states } } }
  let h = 0x811c9dc5
  for (const byte of nbt.writeUncompressed(root as any, 'little')) h = Math.imul(h ^ byte, 0x01000193) >>> 0
  return h
}

export const blockStatesJson = (states: BlockState[]): string => JSON.stringify(states, null, '\t')

/**
 * blockCollisionShapes.json: for each block, in blocks.json order, one shape id per state in runtime id order;
 * `shapes` maps an id to its boxes: 0 is no collision, the others are numbered as met. `format` keeps how
 * the version's existing file writes some blocks (both forms are valid minecraft-data).
 */
/** How an existing file writes some of its blocks, kept so a regenerated file only differs in its data. */
export interface CollisionFormat {
  /** written as one shape id when all their states have it ("web": 0) */
  asNumber: ReadonlySet<string>
  /** an array split one state per line */
  multiline: ReadonlySet<string>
  /** the shapes table there: a shape keeps its id, a new one gets a new id, the others stay as they are */
  table: ReadonlyMap<number, number[][]>
}
export const PLAIN_FORMAT: CollisionFormat = { asNumber: new Set(), multiline: new Set(), table: new Map() }

/** The key of a shape in CollisionFormat.shapeIds: its boxes as the file writes them. */
export const shapeKey = (shape: number[][]): string => JSON.stringify(shortenFloats(shape))

export function blockCollisionShapesJson (shapesFile: string, states: BlockState[], order: string[], format: CollisionFormat = PLAIN_FORMAT): string {
  const rows: any[] = readNbt(shapesFile, 'little').shapes
  if (rows.length !== states.length) throw new Error(`${shapesFile}: ${rows.length} shapes for ${states.length} states`)
  const byName = new Map<string, number[][][]>()
  rows.forEach((row, i) => {
    if (row.blockStateId !== i) throw new Error(`${shapesFile}: row ${i} is state ${row.blockStateId}`)
    const name = states[i].name
    const list = byName.get(name)
    if (list && states[i - 1].name !== name) throw new Error(`${shapesFile}: the states of ${name} are not contiguous`)
    if (list) list.push(row.collisionShape)
    else byName.set(name, [row.collisionShape])
  })
  // id 0 is no collision; the others keep the id the version's file gives them, or are numbered as met
  // (after those ids), so where air comes first a new file is numbered in the order the ids are met in.
  // The ids are only kept from a table of the same boxes: the older files hold Geyser's centre + size ones.
  // (a table can hold one shape twice, the same float written two ways: its first id)
  const tableIds = new Map([...format.table].reverse().map(([id, boxes]) => [shapeKey(boxes), id]))
  const distinct = new Set([...byName.values()].flat().map(shapeKey))
  const known = [...distinct].filter(k => tableIds.has(k)).length
  const keep = known * 2 >= distinct.size ? tableIds : new Map<string, number>()
  const shapes: Record<number, number[][]> = { 0: [] }
  const ids = new Map<string, number>([['[]', 0]])
  let next = Math.max(0, ...keep.values()) + 1
  const shapeId = (shape: number[][]): number => {
    const key = shapeKey(shape)
    let id = ids.get(key)
    if (id === undefined) {
      id = keep.get(key) ?? (keep.size ? next++ : ids.size)
      ids.set(key, id)
      shapes[id] = shape
    }
    return id
  }
  const out: Record<string, number | number[]> = {}
  for (const name of order) {
    const ids = byName.get(name)!.map(shapeId)
    // both forms are valid minecraft-data; the number only where the version's file already has it
    out[name] = format.asNumber.has(name) && ids.every(id => id === ids[0]) ? ids[0] : ids
  }
  // the table's shapes no block has (any more) stay too: a table may hold unused ones
  if (keep.size) for (const [id, boxes] of format.table) shapes[id] ??= boxes
  return collisionJSONStringify(shortenFloats({ blocks: out, shapes }), format.multiline)
}
