// data/<build>/recipes.json: every recipe the build's server sends in crafting_data (packets.nbt), whole, by
// item name, in one form for every protocol: what a client needs to craft each of them (with the item tags
// of item_types.json and the complex aliases of complex_aliases.json, which name the items an ingredient
// takes).
// - recipes: the crafting grid's and every other station's (shaped, shapeless, shulker_box: the user-data
//   ones, the chemistry ones, multi: the game's special ones by uuid, smithing_transform, smithing_trim,
//   furnace: a furnace, smoker, blast furnace or campfire's; from 1.26.20 the server sends those as
//   shapeless recipes of that block), each with its network id (what a craft request names), its id,
//   block (the station, or "deprecated"), priority, and for a shaped one its width, height and input row by
//   row (null: an empty slot);
// - an ingredient: { name, metadata? } (an item; no metadata: any), { tag } (any item with the tag),
//   { alias } (any item of the complex alias), or { molang }, each with its count;
// - an output: { name, metadata, count }, with its block's state where it has one (blockStateId, the
//   palette's runtime id; from 1.20 the server sends the state's hash, blockStateHash, too) and its nbt;
// - potions / potionContainers: the brewing stand's (input + reagent -> output), materialReducers the
//   material reducer's.
import { createRequire } from 'node:module'
import { dataFile, type Build } from '../config.ts'
import { decodePackets } from '../nbt.ts'
import { readBlockStates, stateHash } from './blocks.ts'
import { itemStates, type ItemState } from './items.ts'

const require = createRequire(import.meta.url)
const { createDeserializer } = require('bedrock-protocol/src/transforms/serializer.js')

export type Ingredient = ({ name: string, metadata?: number } | { tag: string } | { alias: string } | { molang: string }) & { count: number }
export interface Output { name: string, metadata: number, count: number, blockStateId?: number, blockStateHash?: number, nbt?: unknown }
export interface Recipe {
  networkId?: number
  type: string
  id?: string
  block?: string
  priority?: number
  uuid?: string
  width?: number
  height?: number
  input?: (Ingredient | null)[]
  output?: Output[]
  template?: Ingredient
  base?: Ingredient
  addition?: Ingredient
}
export interface Recipes {
  recipes: Recipe[]
  potions: { input: { name: string, metadata: number }, reagent: { name: string, metadata: number }, output: { name: string, metadata: number } }[]
  potionContainers: { input: string, reagent: string, output: string }[]
  materialReducers: unknown[]
}

/** crafting_data of a build, decoded (bigints as decimal strings). */
export function craftingPacket (b: Build, states: ItemState[] = itemStates(b)): any {
  const { protocol, packets } = decodePackets(dataFile(b, 'packets.nbt'))
  const packet = packets.find(p => p.name === 'crafting_data')
  if (!packet) throw new Error(`${b.serverVersion}: packets.nbt has no crafting_data`)
  const deserializer = createDeserializer(protocol)
  const shield = states.find(s => s.name === 'minecraft:shield')
  if (shield) deserializer.proto.setVariable('ShieldItemID', shield.runtime_id)
  const params = deserializer.parsePacketBuffer(packet.data).data.params
  return JSON.parse(JSON.stringify(params, (_k, v) => (typeof v?.valueOf?.() === 'bigint' ? v.toString() : v)))
}

const ANY = 32767
const ns = (n: string): string => (n.includes(':') ? n : `minecraft:${n}`)

export function recipesOf (b: Build): Recipes {
  const states = itemStates(b)
  const cd = craftingPacket(b, states)
  const byId = new Map(states.map(s => [s.runtime_id, s.name]))
  const palette = readBlockStates(dataFile(b, 'block_palette.nbt'))
  let byHash: Map<number, number> | undefined
  // a block_runtime_id: a state's hash (from 1.20), else its runtime id
  const blockState = (id: number, what: string): { blockStateId: number, blockStateHash?: number } => {
    byHash ??= new Map(palette.map((s, i) => [stateHash(s), i]))
    const hashed = byHash.get(id >>> 0)
    if (hashed !== undefined) return { blockStateId: hashed, blockStateHash: id >>> 0 }
    if (id >= 0 && id < palette.length) return { blockStateId: id }
    throw new Error(`${b.mcDataVersion}: ${what}: block ${id} is neither a state's hash nor a runtime id`)
  }
  const nameOf = (id: number, what: string): string => {
    const n = byId.get(id)
    if (n === undefined) throw new Error(`${b.mcDataVersion}: ${what}: no item of network id ${id}`)
    return n
  }

  // an ingredient in any protocol's form; null for an empty slot
  const ingredient = (i: any, what: string): Ingredient | null => {
    if (!i || i.type === 'invalid' || (i.type === undefined && !i.network_id && !i.descriptor)) return null
    const count: number = i.count ?? 1
    let t: string = i.type
    let v: any = i
    // the 1.26.40 schema's nested descriptor
    if (i.descriptor) {
      if (!i.descriptor.present) return null
      t = i.descriptor.descriptor?.type_name
      v = { ...i.descriptor.descriptor?.value, metadata: i.aux }
    } else if (t === 'valid') t = i.descriptor_type
    const meta = (m: number | undefined) => (m === undefined || m === ANY ? {} : { metadata: m })
    switch (t) {
      case undefined: // 1.16: { network_id, network_data }
      case 'int_id_meta':
        return { name: nameOf(v.network_id, what), ...meta(v.metadata ?? v.network_data), count }
      case 'name':
      case 'string_id_meta':
        return { name: ns(v.name), ...meta(v.metadata), count }
      case 'item_tag':
        return { tag: v.tag, count }
      case 'complex_alias':
        return { alias: ns(v.name), count }
      case 'molang':
        return { molang: v.expression, count }
      default:
        throw new Error(`${b.mcDataVersion}: ${what}: ingredient type ${t}`)
    }
  }
  const required = (i: any, what: string): Ingredient => {
    const x = ingredient(i, what)
    if (!x) throw new Error(`${b.mcDataVersion}: ${what}: no ingredient`)
    return x
  }

  // an output item: { network_id, count, metadata, block_runtime_id, extra }, or 1.16's { network_id, auxiliary_value: data << 8 | count }
  const output = (o: any, what: string): Output => {
    let metadata: number, count: number
    if (o.auxiliary_value !== undefined) {
      metadata = o.auxiliary_value >> 8
      count = o.auxiliary_value & 0xff
    } else {
      metadata = o.metadata ?? 0
      count = o.count ?? 1
    }
    const out: Output = { name: nameOf(o.network_id, what), metadata: metadata === ANY ? 0 : metadata, count }
    if (o.block_runtime_id) Object.assign(out, blockState(o.block_runtime_id, what))
    const nbt = o.extra?.nbt ?? o.nbt
    if (nbt !== undefined && (o.extra?.has_nbt ?? o.has_nbt)) out.nbt = nbt
    return out
  }

  const grid = (r: any, what: string): (Ingredient | null)[] => {
    const rows: any[] = Array.isArray(r.input[0]) ? r.input.flat() : r.input
    if (rows.length !== r.width * r.height) throw new Error(`${b.mcDataVersion}: ${what}: ${rows.length} slots for ${r.width} x ${r.height}`)
    return rows.map((i, n) => ingredient(i, `${what} slot ${n}`))
  }

  const recipes: Recipe[] = []
  const add = (type: string, r: any) => {
    const what = `${type} ${r.recipe_id ?? r.uuid ?? r.network_id}`
    const common = { networkId: r.network_id, type, ...(r.recipe_id !== undefined ? { id: r.recipe_id } : {}) }
    const station = { ...(r.block ?? r.tag ? { block: r.block ?? r.tag } : {}), ...(r.priority !== undefined ? { priority: r.priority } : {}) }
    switch (type) {
      case 'shaped':
      case 'shaped_chemistry':
        recipes.push({ ...common, ...station, width: r.width, height: r.height, input: grid(r, what), output: r.output.map((o: any) => output(o, what)), ...(r.uuid ? { uuid: r.uuid } : {}) })
        break
      case 'shapeless':
      case 'shapeless_chemistry':
      case 'shulker_box': {
        const input = r.input.map((i: any, n: number) => ingredient(i, `${what} input ${n}`))
        if (input.some((i: Ingredient | null) => i === null)) throw new Error(`${b.mcDataVersion}: ${what}: an empty input`)
        // from 1.26.20 a furnace's (smoker's, campfire's) recipes are shapeless ones of its block
        const kind = type === 'shapeless' && /^(furnace|smoker|blast_furnace|campfire|soul_campfire)$/.test(r.block) ? 'furnace' : type
        recipes.push({ ...common, type: kind, ...station, input, output: r.output.map((o: any) => output(o, what)), ...(r.uuid ? { uuid: r.uuid } : {}) })
        break
      }
      case 'multi':
        recipes.push({ networkId: r.network_id, type, uuid: r.uuid })
        break
      case 'smithing_transform':
        {
          // no template before 1.20 (1.19.60 - 1.19.80: base and addition only)
          const template = ingredient(r.template, what)
          recipes.push({ ...common, ...station, ...(template ? { template } : {}), base: required(r.base, what), addition: required(r.addition, what), output: [output(r.result, what)] })
        }
        break
      case 'smithing_trim':
        recipes.push({ ...common, ...station, template: required(r.template, what), base: required(r.input ?? r.base, what), addition: required(r.addition, what) })
        break
      case 'furnace':
      case 'furnace_with_metadata': {
        // no network id: a furnace takes these by what is put in it
        const metadata = r.input_meta ?? r.metadata
        const input: Ingredient = { name: nameOf(r.input_id, what), ...(metadata === undefined || metadata === ANY ? {} : { metadata }), count: 1 }
        recipes.push({ type: 'furnace', ...station, input: [input], output: [output(r.output, what)] })
        break
      }
      default:
        throw new Error(`${b.mcDataVersion}: recipe type ${type}`)
    }
  }
  if (cd.recipes) for (const r of cd.recipes) add(r.type, r.recipe)
  else {
    // 1.26.40: one array per type (minecraft-data's schema names them <type>_recipes, user data ones shulker_box_recipes)
    const TYPES: [string, string][] = [['shaped_recipes', 'shaped'], ['shapeless_recipes', 'shapeless'], ['multi_recipes', 'multi'], ['shulker_box_recipes', 'shulker_box'],
      ['shapeless_chemistry_recipes', 'shapeless_chemistry'], ['shaped_chemistry_recipes', 'shaped_chemistry'], ['smithing_transform_recipes', 'smithing_transform'], ['smithing_trim_recipes', 'smithing_trim']]
    const known = new Set([...TYPES.map(t => t[0]), 'potion_type_recipes', 'potion_container_recipes', 'material_reducers', 'clear_recipes'])
    const unknown = Object.keys(cd).filter(k => Array.isArray(cd[k]) && !known.has(k))
    if (unknown.length) throw new Error(`${b.mcDataVersion}: crafting_data has ${unknown.join(', ')}`)
    for (const [key, type] of TYPES) for (const r of cd[key] ?? []) add(type, r)
  }

  const item = (id: number, metadata: number | undefined, what: string) => ({ name: nameOf(id, what), metadata: metadata ?? 0 })
  return {
    recipes,
    potions: (cd.potion_type_recipes ?? []).map((p: any) => ({ input: item(p.input_item_id, p.input_item_meta, 'potion'), reagent: item(p.ingredient_id, p.ingredient_meta, 'potion'), output: item(p.output_item_id, p.output_item_meta, 'potion') })),
    potionContainers: (cd.potion_container_recipes ?? []).map((p: any) => ({ input: nameOf(p.input_item_id, 'potion container'), reagent: nameOf(p.ingredient_id, 'potion container'), output: nameOf(p.output_item_id, 'potion container') })),
    materialReducers: cd.material_reducers ?? []
  }
}

/** One recipe a line, the lists in the packet's order. */
export function recipesJson (r: Recipes): string {
  const list = (a: unknown[]) => a.length ? '[\n' + a.map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]' : '[]'
  return `{\n  "recipes": ${list(r.recipes)},\n  "potions": ${list(r.potions)},\n  "potionContainers": ${list(r.potionContainers)},\n  "materialReducers": ${list(r.materialReducers)}\n}\n`
}
