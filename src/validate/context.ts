// What a file's validator is given: the version, what its server says (data/<build>/), the version's other
// published files (for the names and ids a file refers to), and where to report what is wrong.
import type { Build } from '../config.ts'
import type { Files } from './registry.ts'
import type { Server } from './server.ts'

export interface Context {
  v: string
  build: Build
  server: Server
  /** the version's published files, parsed, by key */
  files: Files
  /** reports one thing wrong with the file */
  bad: (problem: string) => void
}

export type Validator = (data: any, ctx: Context) => void

/** The same number as a float32 (the files write the server's floats in their shortest float32 form). */
export const sameFloat = (a: unknown, b: unknown): boolean => typeof a === 'number' && typeof b === 'number' && (a === b || Math.fround(a) === Math.fround(b))

/** The same JSON data, a number the same float32 (the files write floats in their shortest float32 form). */
export function sameData (a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return sameFloat(a, b)
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameData(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every(k => k in b && sameData((a as any)[k], (b as any)[k]))
  }
  return a === b
}

/** Reports each value that `list` has more than once (by `key`). */
export function unique<T> (list: T[], key: (t: T) => unknown, what: string, bad: (p: string) => void): void {
  const seen = new Set<unknown>()
  for (const t of list) {
    const k = key(t)
    if (seen.has(k)) bad(`${what} ${JSON.stringify(k)} more than once`)
    seen.add(k)
  }
}

/** Reports the difference of two sets of names: what `want` has that `have` lacks, and the other way. */
export function sameSet (have: Iterable<string>, want: Iterable<string>, what: string, bad: (p: string) => void): void {
  const h = new Set(have), w = new Set(want)
  const missing = [...w].filter(n => !h.has(n)), extra = [...h].filter(n => !w.has(n))
  if (missing.length) bad(`${what}: missing ${missing.length} (${missing.slice(0, 8).join(', ')})`)
  if (extra.length) bad(`${what}: ${extra.length} not the server's (${extra.slice(0, 8).join(', ')})`)
}

/** The tools of the dig rules: <tier>_<kind>, and shears. */
export const TOOL = /^(wooden|stone|copper|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|hoe|sword)$|^shears$/
/** Bedrock's ItemTier speeds (DiggerItem::getDestroySpeed on a block of the tool's kind) and levels. */
export const TIERS: Record<string, { speed: number, level: number }> = {
  wooden: { speed: 2, level: 0 }, stone: { speed: 4, level: 1 }, copper: { speed: 5, level: 1 }, iron: { speed: 6, level: 2 },
  golden: { speed: 12, level: 0 }, diamond: { speed: 8, level: 3 }, netherite: { speed: 9, level: 4 }
}
