// data/<build>/recipes.json against what a client needs to craft every recipe of the build: each ingredient
// takes at least one item (an item of the registry, an item tag some item carries, a complex alias whose
// items are items), each output is an item (its block state one of the palette's, of its hash), the recipes'
// network ids are 1 to n, each once (a furnace's before 1.26.20 has none: a furnace takes it by its input),
// a shaped recipe's grid is its width x height (at most 3 x 3), a shapeless one takes 1 to 9 items, a
// station is one the game has.
import { existsSync, readFileSync } from 'node:fs'
import { dataFile, type Build } from '../config.ts'
import type { Ingredient, Recipes } from '../mcdata/craft.ts'
import { stateHash } from '../mcdata/blocks.ts'
import { server } from './server.ts'

const STATIONS = new Set(['crafting_table', 'deprecated', 'stonecutter', 'cartography_table', 'smithing_table', 'furnace', 'blast_furnace', 'smoker', 'campfire', 'soul_campfire',
  'compound_creator', 'material_reducer', 'lab_table', 'crafter'])

/** Each item tag, the items that carry it (item_types.json). */
export function itemTags (b: Build): Map<string, string[]> {
  const types: Record<string, { tags?: string[] }> = JSON.parse(readFileSync(dataFile(b, 'item_types.json'), 'utf8'))
  const out = new Map<string, string[]>()
  for (const [name, t] of Object.entries(types)) for (const tag of t.tags ?? []) (out.get(tag) ?? out.set(tag, []).get(tag)!).push(name)
  return out
}

/**
 * The items an ingredient takes. A complex alias: the items it splits into; where the build has none of that
 * name (before 1.19.80 there is no complex alias map), the item of the name itself, with any data value
 * (minecraft:coal: coal and charcoal, its data 0 and 1). `isItem` says which names are items.
 */
export function itemsOf (i: Ingredient, tags: Map<string, string[]>, complex: Record<string, string[]>, isItem: (n: string) => boolean = () => true): string[] {
  if ('name' in i) return [i.name]
  if ('tag' in i) return tags.get(i.tag) ?? []
  if ('alias' in i) return complex[i.alias] ? [...new Set(complex[i.alias])] : isItem(i.alias) ? [i.alias] : []
  return []
}

export function recipeProblems (b: Build, r: Recipes, max = 50): string[] {
  const out: string[] = []
  const bad = (p: string) => { if (out.length < max) out.push(p) }
  const types: Record<string, unknown> = JSON.parse(readFileSync(dataFile(b, 'item_types.json'), 'utf8'))
  const complexFile = dataFile(b, 'complex_aliases.json')
  const complex: Record<string, string[]> = existsSync(complexFile) ? JSON.parse(readFileSync(complexFile, 'utf8')) : {}
  const tags = itemTags(b)
  const states = server(b).palette()
  const palette = states.length
  const isItem = (n: string) => n in types

  const takes = (i: Ingredient | undefined, what: string) => {
    if (!i) return
    if (!(i.count >= 1 && i.count <= 64)) bad(`${what}: count ${i.count}`)
    if ('molang' in i) { bad(`${what}: a molang ingredient (${i.molang}) no item table resolves`); return }
    const items = itemsOf(i, tags, complex, isItem)
    if (!items.length) bad(`${what}: ${JSON.stringify(i)} takes no item`)
    for (const n of items) if (!isItem(n)) bad(`${what}: ${n} is no item`)
  }
  const ids = new Set<number>()
  r.recipes.forEach((x, n) => {
    const what = `${x.type} ${x.id ?? x.uuid ?? n}`
    if (typeof x.networkId === 'number') {
      if (ids.has(x.networkId)) bad(`${what}: network id ${x.networkId} twice`)
      ids.add(x.networkId)
    } else if (x.type !== 'furnace') bad(`${what}: no network id`)
    if (x.type === 'multi') { if (!/^[0-9a-f-]{36}$/.test(x.uuid ?? '')) bad(`${what}: no uuid`); return }
    if (!x.block || !STATIONS.has(x.block)) bad(`${what}: station ${x.block}`)
    if (x.type === 'shaped' || x.type === 'shaped_chemistry') {
      if (!(x.width! >= 1 && x.width! <= 3 && x.height! >= 1 && x.height! <= 3)) bad(`${what}: ${x.width} x ${x.height}`)
      if (x.input?.length !== x.width! * x.height!) bad(`${what}: ${x.input?.length} slots for ${x.width} x ${x.height}`)
      if (!x.input?.some(i => i)) bad(`${what}: an empty grid`)
    } else if (x.type.startsWith('smithing')) {
      takes(x.base, `${what} base`)
      takes(x.addition, `${what} addition`)
      takes(x.template, `${what} template`)
    } else if (!(x.input && x.input.length >= 1 && x.input.length <= 9) || x.input.some(i => !i)) bad(`${what}: ${x.input?.length} inputs`)
    x.input?.forEach((i, s) => takes(i ?? undefined, `${what} slot ${s}`))
    if (x.type !== 'smithing_trim' && !x.output?.length) bad(`${what}: no output`)
    for (const o of x.output ?? []) {
      if (!isItem(o.name)) bad(`${what}: output ${o.name} is no item`)
      if (!(o.count >= 1 && o.count <= 64)) bad(`${what}: output count ${o.count}`)
      if (o.blockStateId !== undefined && !(o.blockStateId >= 0 && o.blockStateId < palette)) bad(`${what}: output block state ${o.blockStateId}`)
      else if (o.blockStateHash !== undefined && stateHash(states[o.blockStateId!]) !== o.blockStateHash) bad(`${what}: output block state ${o.blockStateId} is not of hash ${o.blockStateHash}`)
    }
  })
  for (const p of r.potions) for (const it of [p.input, p.reagent, p.output]) if (!isItem(it.name)) bad(`potion: ${it.name} is no item`)
  for (const p of r.potionContainers) for (const n of [p.input, p.reagent, p.output]) if (!isItem(n)) bad(`potion container: ${n} is no item`)
  if (!r.recipes.some(x => x.block === 'crafting_table')) bad('no crafting table recipe')
  // the server numbers its recipes 1 to n: another numbering is a misread packet
  const missing = [...Array(ids.size).keys()].map(k => k + 1).filter(k => !ids.has(k))
  if (missing.length) bad(`network ids are not 1 to ${ids.size}: ${missing.length} missing (${missing.slice(0, 5).join(', ')})`)
  return out
}
