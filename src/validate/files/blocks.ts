// blocks.json: exactly the palette's blocks, each with its own runtime id range and default state, and every
// field the server says as it says it (block_types.json, block-state-shapes.nbt); the items it names (drops,
// harvest tools) and its material exist in the version's items.json and materials.json; its tools are the
// ones its server tags name (before 1.21.50, where the server has no such tags, the ones the first build
// with them tags a block of its name, or all the blocks it became alike: planks as oak_planks, ...; dig.ts's
// referenceNames).
import { compareVersions, versions } from '../../config.ts'
import { hasDiggerTags, referenceNames } from '../../mcdata/dig.ts'
import { TIERS, TOOL, sameFloat, sameSet, unique, type Validator } from '../context.ts'
import { server as serverOf, type ServerBlockType } from '../server.ts'

const LIQUIDS = new Set(['water', 'flowing_water', 'lava', 'flowing_lava'])
const FAMILIES = ['pickaxe', 'axe', 'shovel', 'hoe']
const TIER_GATES: [string, number][] = [['stone', 0], ['iron', 1], ['diamond', 2], ['netherite', 3]]

/** What a block type's tags say of its digging: the tool kinds, the tier gate, whether it needs a tool. */
function digOf (t: ServerBlockType) {
  const tags = new Set((t.tags ?? []).map(x => x.replace(/^minecraft:/, '')))
  return {
    kinds: FAMILIES.filter(f => tags.has(`is_${f}_item_destructible`)),
    gate: TIER_GATES.find(([tier]) => tags.has(`${tier}_tier_destructible`))?.[1] ?? -1,
    requires: t.requiresCorrectToolForDrops
  }
}

/** The first build whose server tags its blocks by their tools: a block's dig there, by name (or its variants'). */
let reference: ((name: string) => ReturnType<typeof digOf> | undefined) | undefined
function referenceDig (name: string) {
  if (!reference) {
    const b = [...versions].sort((x, y) => compareVersions(x.serverVersion, y.serverVersion)).find(x => hasDiggerTags(serverOf(x).blockTypes()))!
    const types = serverOf(b).blockTypes()
    reference = n => {
      if (types[n]) return digOf(types[n])
      const splits = referenceNames(n, Object.keys(types)).map(k => digOf(types[k]))
      return splits.length && splits.every(d => JSON.stringify(d) === JSON.stringify(splits[0])) ? splits[0] : undefined
    }
  }
  return reference(name)
}

export const blocks: Validator = (list: any[], { server, files, bad }) => {
  const palette = server.palette()
  const types = server.blockTypes()
  const shapes = server.shapes()
  unique(list, b => b.name, 'block', bad)
  unique(list, b => b.id, 'block id', bad)
  sameSet(list.map(b => b.name), palette.map(s => s.name), 'blocks', bad)

  // each block's runtime ids: one contiguous run of the palette
  const range = new Map<string, [number, number]>()
  palette.forEach((s, i) => {
    const r = range.get(s.name)
    if (!r) range.set(s.name, [i, i])
    else if (r[1] === i - 1) r[1] = i
    else bad(`palette: the states of ${s.name} are not contiguous`)
  })

  const items: any[] = files('items')
  const itemById = new Map<number, string>()
  for (const i of items) {
    itemById.set(i.id, i.name)
    for (const v of i.variations ?? []) itemById.set(v.id, v.name)
  }
  const itemByName = new Map(items.map(i => [i.name, i]))
  const materials = files('materials')
  const lang = files('language')
  const byServer = hasDiggerTags(types)

  for (const b of list) {
    const at = `${b.name}:`
    const r = range.get(b.name)
    const t = types[b.name]
    if (!r || !t) { if (!t) bad(`${at} not in block_types.json`); continue }
    if (b.minStateId !== r[0] || b.maxStateId !== r[1]) bad(`${at} states ${b.minStateId}..${b.maxStateId}, the palette's ${r[0]}..${r[1]}`)
    if (b.defaultState !== t.defaultBlockStateId) bad(`${at} defaultState ${b.defaultState}, the server's ${t.defaultBlockStateId}`)
    if (b.defaultState < b.minStateId || b.defaultState > b.maxStateId) bad(`${at} defaultState ${b.defaultState} outside its states`)
    if (!sameFloat(b.hardness, t.hardness)) bad(`${at} hardness ${b.hardness}, the server's ${t.hardness}`)
    if (!sameFloat(b.resistance, t.explosionResistance)) bad(`${at} resistance ${b.resistance}, the server's ${t.explosionResistance}`)
    if (b.emitLight !== t.lightEmission) bad(`${at} emitLight ${b.emitLight}, the server's ${t.lightEmission}`)
    if (b.filterLight !== t.lightDampening) bad(`${at} filterLight ${b.filterLight}, the server's ${t.lightDampening}`)
    if (b.transparent !== t.lightDampening < 15) bad(`${at} transparent ${b.transparent} with filterLight ${t.lightDampening}`)
    if (b.diggable !== (t.hardness >= 0 && !LIQUIDS.has(b.name))) bad(`${at} diggable ${b.diggable} with hardness ${t.hardness}`)
    const box = shapes[t.defaultBlockStateId]?.length ? 'block' : 'empty'
    if (b.boundingBox !== box) bad(`${at} boundingBox ${b.boundingBox}, its default state's collision is ${box}`)
    const desc = t.descriptionId
    const langName = desc === undefined ? undefined : lang[desc.endsWith('.name') ? desc : `${desc}.name`]
    if (langName && b.displayName !== langName) bad(`${at} displayName ${JSON.stringify(b.displayName)}, the language file's ${JSON.stringify(langName)}`)
    const own = itemByName.get(b.name)
    if (own && b.stackSize !== own.stackSize) bad(`${at} stackSize ${b.stackSize}, its item's ${own.stackSize}`)
    for (const d of b.drops) if (!itemById.has(d)) bad(`${at} drops ${d}, no item`)
    if (!(b.material in materials)) bad(`${at} material ${b.material} is not in materials.json`)

    // the tools: every harvest tool an item that digs, of a kind the material has (or a sword or shears)
    const kinds = new Set(b.material.split(';').filter((p: string) => p.startsWith('mineable/')).map((p: string) => p.slice(9)))
    const harvest = Object.keys(b.harvestTools ?? {}).map(Number)
    for (const id of harvest) {
      const name = itemById.get(id)
      if (name === undefined) { bad(`${at} harvest tool ${id}, no item`); continue }
      if (!TOOL.test(name)) { bad(`${at} harvest tool ${name} is no tool`); continue }
      const kind = name.split('_').at(-1)!
      if (FAMILIES.includes(kind) && !kinds.has(kind)) bad(`${at} harvested by ${name}, its material ${b.material} has no ${kind}`)
    }
    const d = byServer ? digOf(t) : referenceDig(b.name)
    if (d) {
      // from the server's tags: the tools that dig it, the tier the diggers must pass, and whether it needs one
      const { kinds: serverKinds, gate, requires } = d
      const whose = byServer ? 'its tags say' : 'the reference build tags it'
      if ([...kinds].sort().join() !== [...serverKinds].sort().join()) bad(`${at} material ${b.material}, ${whose} ${serverKinds.join(', ') || 'no digger'}`)
      if (requires === false && b.harvestTools) bad(`${at} has harvestTools, ${whose} as needing none`)
      if (requires === true) {
        const want = serverKinds.flatMap(f => Object.entries(TIERS).filter(([, x]) => x.level > gate).map(([tier]) => `${tier}_${f}`)).filter(n => itemByName.has(n))
        const have = new Set(harvest.map(id => itemById.get(id)))
        const missing = want.filter(n => !have.has(n))
        if (missing.length) bad(`${at} needs a tool, harvestTools lacks ${missing.join(', ')}`)
        for (const n of have) {
          const m = /^(\w+?)_(pickaxe|axe|shovel|hoe)$/.exec(n ?? '')
          if (m && TIERS[m[1]] && TIERS[m[1]].level <= gate) bad(`${at} harvested by ${n}, below its tier`)
        }
      }
    }
  }
}
