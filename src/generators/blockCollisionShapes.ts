// blockCollisionShapes.json: each block's shape id per state (runtime id order), its blocks in blocks.json's order (by
// the server's numeric block id), and `shapes`: each id's boxes ([minX, minY, minZ, maxX, maxY, maxZ]), 0 being none.
import type { Box, BlockShapes, BlockTypes, StateShapes } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { f32, withoutNamespace } from './utils/json.ts'

type Shape = Box[]

interface Block {
  name: string
  states: Shape[]
}

export interface CollisionShapes {
  blocks: Record<string, number | number[]>
  shapes: Record<string, Shape>
}

/** How the checkout's committed file writes the version's blocks, both forms being valid minecraft-data. */
interface Form {
  /** the committed shape table: a shape keeps its id there while most of the shapes are in it */
  table: Map<number, Shape>
  /** blocks written as one shape id for all their states ("web": 0) */
  asNumber: ReadonlySet<string>
  /** blocks whose array is split one state per line */
  multiline: ReadonlySet<string>
}

function shortened(shape: Shape): Shape {
  return shape.map((box) => box.map(f32))
}

function shapeKey(shape: Shape): string {
  return JSON.stringify(shortened(shape))
}

// in blocks.json's order: by the numeric id, whatever else the run writes or the checkout has; `shapeOf` picks the
// boxes of a state (its collision boxes, or blockSelectionShapes.ts' outline)
export function blocksOf(shapes: BlockShapes, types: BlockTypes, shapeOf: (state: StateShapes) => Shape = (s) => s.collision): Block[] {
  const ids = new Map(types.blocks.map((b) => [b.name, b.id]))
  return shapes.blocks
    .map((b) => ({ name: withoutNamespace(b.name), states: b.states.map(shapeOf), id: ids.get(b.name) ?? Infinity }))
    .sort((a, b) => a.id - b.id)
    .map(({ name, states }) => ({ name, states }))
}

export function plainForm(): Form {
  return { table: new Map(), asNumber: new Set(), multiline: new Set() }
}

export function committedForm(committed: (key: string) => string | undefined, key = 'blockCollisionShapes'): Form {
  const text = committed(key)

  if (text === undefined) {
    return plainForm()
  }

  const { blocks: written, shapes } = JSON.parse(text) as CollisionShapes

  return {
    table: new Map(Object.entries(shapes).map(([id, shape]) => [Number(id), shape])),
    asNumber: new Set(Object.keys(written).filter((name) => typeof written[name] === 'number')),
    multiline: new Set([...text.matchAll(/^\t\t"([^"]+)": \[$/gm)].map((m) => m[1])),
  }
}

// Only where the committed table holds most of the shapes: older files hold other boxes than the game's (a centre and
// a size). A table may hold one shape twice (the same float written two ways): its first id.
function keptTableIds(blocks: Block[], table: Map<number, Shape>): Map<string, number> {
  const tableIds = new Map([...table].reverse().map(([id, shape]) => [shapeKey(shape), id]))
  const distinct = new Set(blocks.flatMap((b) => b.states.map(shapeKey)))
  const known = [...distinct].filter((key) => tableIds.has(key)).length
  return known * 2 >= distinct.size ? tableIds : new Map<string, number>()
}

// 0 is no box. A shape keeps its id from the committed table, a new one goes after the table's highest id; without
// a table every id is numbered as met, in the blocks' order. The table's shapes no block has any more stay.
export function collisionJson(blocks: Block[], form: Form): string {
  const keptIds = keptTableIds(blocks, form.table)
  const shapes: Record<number, Shape> = { 0: [] }
  const ids = new Map([['[]', 0]])
  let next = Math.max(0, ...keptIds.values()) + 1

  function shapeId(shape: Shape): number {
    const key = shapeKey(shape)
    let id = ids.get(key)

    if (id === undefined) {
      id = keptIds.get(key) ?? (keptIds.size ? next++ : ids.size)
      ids.set(key, id)
      shapes[id] = shortened(shape)
    }

    return id
  }

  const out: Record<string, number | number[]> = {}

  for (const { name, states } of blocks) {
    const stateIds = states.map(shapeId)
    out[name] = form.asNumber.has(name) && stateIds.every((id) => id === stateIds[0]) ? stateIds[0] : stateIds
  }

  if (keptIds.size) {
    for (const [id, shape] of form.table) {
      shapes[id] ??= shortened(shape)
    }
  }

  return collisionJsonText({ blocks: out, shapes }, form.multiline)
}

export function shapesByName({ blocks, shapes }: CollisionShapes): [string, Shape | Shape[]][] {
  return Object.keys(blocks)
    .sort()
    .map((name) => {
      const ids = blocks[name]
      return [name, typeof ids === 'number' ? shapes[ids] : ids.map((id) => shapes[id])]
    })
}

/** A plain file (json()) back as each block's shapes per state. */
export function blocksOfJson(json: string): Block[] {
  const { blocks, shapes } = JSON.parse(json) as { blocks: Record<string, number[]>; shapes: Record<string, Shape> }
  return Object.entries(blocks).map(([name, ids]) => ({ name, states: ids.map((id) => shapes[id]) }))
}

// As minecraft-data writes it: every object one key per line, a block's ids (under "blocks") and a shape's boxes
// (under "shapes") inline, so one block or shape a line; the `multiline` blocks one state a line. No final newline.
function collisionJsonText(file: CollisionShapes, multiline: ReadonlySet<string>): string {
  function text(value: unknown, depth: number, key: string, parentKey: string): string {
    if (!value || typeof value !== 'object') {
      return JSON.stringify(value)
    }

    const indent = '\t'.repeat(depth + 1)

    if (Array.isArray(value)) {
      const inline = JSON.stringify(value).replace(/,/g, ', ')

      if (parentKey === 'blocks' && !multiline.has(key)) {
        return inline
      }

      if (parentKey === 'shapes' && inline.length < 10000) {
        return inline
      }

      if (inline.length < 100) {
        return inline
      }

      const items = value.map((item, i) => text(item, depth + 1, String(i), key))
      return `[\n${indent}${items.join(`,\n${indent}`)}\n${'\t'.repeat(depth)}]`
    }

    const entries = Object.entries(value)

    if (!entries.length) {
      return '{}'
    }

    const inline = JSON.stringify(value).replace(/:/g, ': ').replace(/,/g, ', ')

    if (inline.length < 100) {
      return inline
    }

    return `{\n${entries.map(([k, v]) => `${indent}${JSON.stringify(k)}: ${text(v, depth + 1, k, key)}`).join(',\n')}\n${'\t'.repeat(depth)}}`
  }

  return text(file, 0, '', '')
}

export const blockCollisionShapes: Generator = {
  key: 'blockCollisionShapes',
  after: ['blockStates', 'blocks', 'attributes'],
  has: (data, build) => data.hasBlockShapes(build) && data.has(build, 'blocks'),
  json(data, build) {
    return collisionJson(blocksOf(data.blockShapes(build), data.blocks(build)), plainForm())
  },
  format(json, committed) {
    return collisionJson(blocksOfJson(json), committedForm(committed))
  },
  meaning(json) {
    // the block order and the shape ids are only how a file is written; a block written as one id is compared as written
    return JSON.stringify(shapesByName(JSON.parse(json) as CollisionShapes))
  },
}
