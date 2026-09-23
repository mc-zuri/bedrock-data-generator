// Output formatting of the minecraft-data files, as minecraft-data-extractor-legacy2 (src/utils.ts) writes
// them, so regenerated files only differ where the data does.

export const strip = (key: string): string => key?.replace('minecraft:', '').split('[')[0]

/** Property order of items.json entries and of their variations. */
export const ITEM_ORDER = [
  'id', 'stackSize', 'name', 'displayName', 'nbt', 'version', 'metadata', 'variations', 'enchantCategories', 'repairWith', 'maxDurability',
  'durability', 'blockStateId'
] as const
export const ITEM_VARIATION_ORDER = ['metadata', 'id', 'displayName', 'name', 'stackSize', 'enchantCategories', 'maxDurability'] as const

/** Property order of blocks.json entries. */
export const BLOCK_ORDER = [
  'id', 'name', 'displayName', 'hardness', 'resistance', 'stackSize', 'diggable', 'material', 'transparent', 'emitLight', 'filterLight',
  'defaultState', 'minStateId', 'maxStateId', 'harvestTools', 'drops', 'boundingBox'
] as const

/** A copy of obj with the keys of `order` first, then the rest in their own order. */
export function orderKeys<T extends Record<string, unknown>> (obj: T, order: readonly string[]): T {
  const out: Record<string, unknown> = {}
  for (const key of order) if (key in obj) out[key] = obj[key]
  for (const key in obj) if (!(key in out)) out[key] = obj[key]
  return out as T
}

/** The shortest decimal that reads back as the same float32; any other number is returned as it is. */
export function f32 (value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) return value
  for (let precision = 1; precision < 17; precision++) {
    const candidate = Number(value.toPrecision(precision))
    if (Math.fround(candidate) === value) return candidate
  }
  return value
}

export function shortenFloats<T> (value: T): T {
  if (typeof value === 'number') return f32(value) as T
  if (Array.isArray(value)) return value.map(v => shortenFloats(v)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key in value as Record<string, unknown>) out[key] = shortenFloats((value as Record<string, unknown>)[key])
    return out as T
  }
  return value
}

/**
 * blockCollisionShapes.json: every object one key per line, the block state arrays (under "blocks") and the
 * shape box arrays (under "shapes") inline, so the file is one block / one shape per line; the blocks of
 * `multilineBlocks` one state per line, as an older file has one.
 */
export function collisionJSONStringify (obj: unknown, multilineBlocks: ReadonlySet<string> = new Set()): string {
  const indent = '\t'
  function value (v: any, depth: number, key: string | number | null, parentKey: string | number | null): string {
    if (v === null) return 'null'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) {
      const str = JSON.stringify(v).replace(/,/g, ', ')
      if (parentKey === 'blocks' && !multilineBlocks.has(key as string)) return str
      if (parentKey === 'shapes' && str.length < 10000) return str
      if (str.length < 100) return str
      const items = v.map((x, i) => value(x, depth + 1, i, key))
      return '[\n' + indent.repeat(depth + 1) + items.join(',\n' + indent.repeat(depth + 1)) + '\n' + indent.repeat(depth) + ']'
    }
    const keys = Object.keys(v)
    if (keys.length === 0) return '{}'
    const inline = JSON.stringify(v).replace(/:/g, ': ').replace(/,/g, ', ')
    if (inline.length < 100) return inline
    const entries = keys.map(k => indent.repeat(depth + 1) + JSON.stringify(k) + ': ' + value(v[k], depth + 1, k, key))
    return '{\n' + entries.join(',\n') + '\n' + indent.repeat(depth) + '}'
  }
  return value(obj, 0, null, null)
}
