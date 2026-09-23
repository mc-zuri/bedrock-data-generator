// The registry (registry/, committed): what every published version has, by name, as ranges of versions:
// each block's states (every property, its type and the values it takes), each block's, item's, entity's,
// biome's, effect's and enchantment's id, each attribute, each material. It is written only on purpose
// (pnpm mcdata --accept), so a run that loses a block, a state value, an item, or moves an id fails the
// validation instead of being published; the change it asks to accept is its git diff.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, compareVersions, versions, writeAtomic } from '../config.ts'

export const REGISTRY_DIR = join(ROOT, 'registry')

/** A published version's files, parsed, by key. */
export type Files = (key: string) => any

type Value = unknown
/** name -> the ranges of versions (first, last, inclusive, in versions.json order) it has a value in */
type Ranges = Record<string, [string, string, Value][]>

const sortedValues = (values: unknown[]): unknown[] => [...values].sort((a: any, b: any) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)))

/** Each registry kind: what of a version's files it holds, by name. */
export const KINDS: Record<string, (files: Files) => Record<string, Value>> = {
  /** block -> property -> { type, values }: every value each property takes in the palette */
  blockStates: files => {
    const out: Record<string, Record<string, { type: string, values: unknown[] }>> = {}
    for (const s of files('blockStates')) {
      const block = out[s.name] ??= {}
      for (const [p, t] of Object.entries<any>(s.states)) {
        const prop = block[p] ??= { type: t.type, values: [] }
        if (!prop.values.includes(t.value)) prop.values.push(t.value)
      }
    }
    for (const block of Object.values(out)) for (const p of Object.values(block)) p.values = sortedValues(p.values)
    return Object.fromEntries(Object.entries(out).map(([n, b]) => [n, Object.fromEntries(Object.keys(b).sort().map(k => [k, b[k]]))]))
  },
  blocks: files => Object.fromEntries(files('blocks').map((b: any) => [b.name, b.id])),
  /** an item, or a variation (name:metadata) */
  items: files => {
    const out: Record<string, Value> = {}
    for (const i of files('items')) {
      out[i.name] = i.id
      for (const v of i.variations ?? []) out[`${v.name}:${v.metadata}`] = v.id
    }
    return out
  },
  entities: files => Object.fromEntries(files('entities').map((e: any) => [e.name, [e.id, e.internalId]])),
  biomes: files => Object.fromEntries(files('biomes').map((e: any) => [e.name, e.id])),
  effects: files => Object.fromEntries(files('effects').map((e: any) => [e.name, e.id])),
  enchantments: files => Object.fromEntries(files('enchantments').map((e: any) => [e.name, e.id])),
  attributes: files => Object.fromEntries(files('attributes').map((e: any) => [e.name, e.resource])),
  materials: files => Object.fromEntries(Object.keys(files('materials')).map(m => [m, true]))
}

/** The versions, oldest first: the order ranges are in. */
export const ORDER = [...versions].sort((a, b) => compareVersions(a.serverVersion, b.serverVersion)).map(b => b.mcDataVersion)
const index = (v: string): number => {
  const i = ORDER.indexOf(v)
  if (i < 0) throw new Error(`${v} is not in versions.json`)
  return i
}

const file = (kind: string): string => join(REGISTRY_DIR, `${kind}.json`)
const loaded = new Map<string, Ranges>()

function load (kind: string): Ranges {
  let r = loaded.get(kind)
  if (!r) {
    r = existsSync(file(kind)) ? JSON.parse(readFileSync(file(kind), 'utf8')) : {}
    loaded.set(kind, r!)
  }
  return r!
}

/** The versions the registry was made for. */
export function registryVersions (): string[] {
  const f = join(REGISTRY_DIR, 'versions.json')
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
}

/** What the registry says `kind` holds at version v: name -> value. */
export function registryAt (kind: string, v: string): Map<string, Value> {
  const i = index(v)
  const out = new Map<string, Value>()
  for (const [name, ranges] of Object.entries(load(kind))) {
    for (const [from, to, value] of ranges) if (index(from) <= i && i <= index(to)) out.set(name, value)
  }
  return out
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const short = (x: unknown): string => { const t = JSON.stringify(x); return t.length > 100 ? t.slice(0, 100) + '...' : t }

/** How a version's files differ from the registry: one line per name (missing, unknown, changed). */
export function registryProblems (v: string, files: Files): string[] {
  if (!registryVersions().includes(v)) return [`registry: has no ${v} (pnpm mcdata --accept, then review the registry/ diff)`]
  const out: string[] = []
  for (const [kind, extract] of Object.entries(KINDS)) {
    const want = registryAt(kind, v)
    const have = extract(files)
    for (const [name, value] of want) {
      if (!(name in have)) out.push(`registry ${kind}: ${name} missing`)
      else if (!same(have[name], value)) out.push(`registry ${kind}: ${name} is ${short(have[name])}, the registry has ${short(value)}`)
    }
    for (const name of Object.keys(have)) if (!want.has(name)) out.push(`registry ${kind}: ${name} is not in the registry`)
  }
  return out
}

/** The registry made from every version's files (`filesOf`): each kind's file text, and versions.json's. */
export function registryTexts (filesOf: (v: string) => Files): Record<string, string> {
  const out: Record<string, string> = {}
  const all = ORDER.map(v => ({ v, files: filesOf(v) }))
  for (const [kind, extract] of Object.entries(KINDS)) {
    const ranges: Ranges = {}
    all.forEach(({ v, files }, i) => {
      for (const [name, value] of Object.entries(extract(files))) {
        const list = ranges[name] ??= []
        const last = list.at(-1)
        if (last && index(last[1]) === i - 1 && same(last[2], value)) last[1] = v
        else list.push([v, v, value])
      }
    })
    const names = Object.keys(ranges).sort()
    out[kind] = '{\n' + names.map(n => `  ${JSON.stringify(n)}: ${JSON.stringify(ranges[n])}`).join(',\n') + '\n}\n'
  }
  out.versions = JSON.stringify(ORDER, null, 2) + '\n'
  return out
}

/** The committed registry's text of a kind (or versions), undefined where there is none. */
export const registryText = (kind: string): string | undefined => existsSync(file(kind)) ? readFileSync(file(kind), 'utf8').replace(/\r\n/g, '\n') : undefined

/**
 * Makes the registry again from every version's files (`filesOf`), and writes the kinds that changed.
 * Returns a summary of the changes, one line per kind that changed.
 */
export function writeRegistry (filesOf: (v: string) => Files): string[] {
  const summary: string[] = []
  for (const [kind, text] of Object.entries(registryTexts(filesOf))) {
    const old = registryText(kind)
    if (old === text) continue
    if (kind === 'versions') summary.push(`versions: ${ORDER.length}`)
    else {
      const before: Ranges = old ? JSON.parse(old) : {}
      const after: Ranges = JSON.parse(text)
      const added = Object.keys(after).filter(n => !(n in before)).length
      const removed = Object.keys(before).filter(n => !(n in after)).length
      const changed = Object.keys(after).filter(n => n in before && !same(before[n], after[n])).length
      summary.push(`${kind}: ${added} names added, ${removed} removed, ${changed} changed`)
    }
    mkdirSync(REGISTRY_DIR, { recursive: true })
    writeAtomic(file(kind), text)
    loaded.delete(kind)
  }
  return summary
}
