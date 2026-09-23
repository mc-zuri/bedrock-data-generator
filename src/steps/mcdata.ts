// Publishes every build's attributes, blocks, block states, collision shapes, biomes, entities, items, materials,
// steve skin and language (and, when PUBLISH_RECIPES / PUBLISH_BLOCK_MAPS, recipes and the Java <-> Bedrock block maps) into the minecraft-data
// checkout. Oldest build first, a file that says the same as the previous build's is not kept: its
// dataPaths.json entry points to the build that has it, so every file in data/bedrock/ is unique and every
// version resolves every key. Nothing is written until every version's files, as they would be, pass the
// validation (src/validate: the strict schemas, each file's validator, the registry); --accept takes the
// registry's differences as intended and writes the registry again from the new files.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { MINECRAFT_DATA_DIR, compareVersions, dataFile, versions, writeAtomic, type Build } from '../config.ts'
import { generateDataJs } from '../checkouts/mcdata.ts'
import { formatProblems, publishedFiles, validateVersion } from '../validate/index.ts'
import { writeRegistry } from '../validate/registry.ts'
import { normalizeSteveSkin } from '../steve-normalize.ts'
import { PLAIN_FORMAT, blockCollisionShapesJson, blockStatesJson, readBlockStates, type BlockState, type CollisionFormat } from '../mcdata/blocks.ts'
import { bedrockToJava, javaToBedrock } from '../mcdata/blockMap.ts'
import { blocks, blocksJson } from '../mcdata/blocksJson.ts'
import { BLOCK_ORDER, orderKeys, strip } from '../mcdata/format.ts'
import { attributes, attributesJson } from '../mcdata/attributes.ts'
import { biomeDefinitions, biomes, biomesJson, withServerBiomeFields } from '../mcdata/biomes.ts'
import { effects, effectsJson } from '../mcdata/effects.ts'
import { foods, foodsJson } from '../mcdata/foods.ts'
import { entityLoot, entityLootJson } from '../mcdata/entityLoot.ts'
import { enchantments, enchantmentsJson } from '../mcdata/enchantments.ts'
import { entities, entitiesJson, entityIdentifiers } from '../mcdata/entities.ts'
import { entityDefinitions, withServerEntityFields } from '../mcdata/entityProps.ts'
import { bedrockToJavaItems, itemStates, itemTypes, items, itemsByRuntimeId, itemsJson, withServerItemFields, type ItemState } from '../mcdata/items.ts'
import { language, languageJson } from '../mcdata/language.ts'
import { craftingData, recipes, recipesJson } from '../mcdata/recipes.ts'
import { dig, hasDiggerTags, materialsJson, referenceOf, type Reference } from '../mcdata/dig.ts'
import { serverBlockFields, withFields, type ServerBlockType } from '../mcdata/blockProps.ts'
import { readNbt } from '../nbt.ts'
import { BEDROCK_BIOMES, geyserBlocks, geyserItems, javaBiomes, javaBiomesSnapshot, javaBlocks, javaEntities, javaEnchantments, javaItems, pymctranslateBiomes } from '../mcdata/inputs.ts'
import stringify from 'json-stringify-pretty-compact'

const DATA = join(MINECRAFT_DATA_DIR, 'data')
// blocksJ2B.json / blocksB2J.json are not published for now: minecraft-data's stay as they are
const PUBLISH_BLOCK_MAPS = false
// recipes.json is not published for now either (it drops network ids, multi / smithing / brewing recipes)
const PUBLISH_RECIPES = false
const KEYS = ['blockStates', 'blockCollisionShapes'] as const
type ListKey = 'attributes' | 'biomes' | 'entities' | 'items'

/**
 * The same entry with attributes, blocks, blockStates, blockCollisionShapes, biomes, entities, items and
 * recipes first and together, as every minecraft-data entry that has them has them.
 */
function withBlockKeys (entry: Record<string, string>): Record<string, string> {
  const group = ['attributes', 'blocks', ...KEYS, 'biomes', 'entities', 'items', ...(PUBLISH_RECIPES ? ['recipes'] : [])]
  const out: Record<string, string> = {}
  for (const k of group) out[k] = entry[k] ?? ''
  for (const [k, v] of Object.entries(entry)) if (!group.includes(k)) out[k] = v
  return out
}

// What a file means, to compare builds by: blockStates.json's states in runtime id order (the order of the
// keys of a state's properties is only how it is written); for blockCollisionShapes.json each block's boxes
// per state, by name (the order of its blocks, and so the numbering of its shapes, says nothing).
const sameMeaning: Record<(typeof KEYS)[number], (json: string) => string> = {
  blockStates: json => JSON.stringify(JSON.parse(json).map((s: any) => [s.name, Object.keys(s.states).sort().map(k => [k, s.states[k]]), s.version])),
  blockCollisionShapes: json => {
    const c = JSON.parse(json)
    return JSON.stringify(Object.keys(c.blocks).sort().map(n => [n, c.blocks[n].map((id: number) => c.shapes[id])]))
  }
}

/** blocks.json as data: the entries with their keys sorted (the key order is only how a file is written). */
const blocksMeaning = (list: any[]): string => JSON.stringify(list.map(e => Object.fromEntries(Object.keys(e).sort().map(k => [k, e[k]]))))

/** A blocks.json has exactly the palette's blocks, each with its own state range (runtime ids). */
function fits (list: any[], states: BlockState[]): boolean {
  const names = new Set(states.map(s => s.name))
  if (list.length !== names.size) return false
  return list.every(e => names.has(e.name) &&
    states[e.minStateId]?.name === e.name && states[e.maxStateId]?.name === e.name &&
    states[e.minStateId - 1]?.name !== e.name && states[e.maxStateId + 1]?.name !== e.name &&
    e.defaultState >= e.minStateId && e.defaultState <= e.maxStateId)
}

/** biomes.json, entities.json as data: the entries by id, their keys sorted. */
const listMeaning = (list: any[]): string => JSON.stringify([...list].sort((a, b) => a.id - b.id).map(e => Object.fromEntries(Object.keys(e).sort().map(k => [k, e[k]]))))

/** A biomes.json has exactly the biomes the server sends, each with its Bedrock id, temperature and rainfall. */
function biomesFit (list: any[], generated: any[]): boolean {
  const byName = new Map(generated.map(e => [e.name, e]))
  return list.length === generated.length && list.every(e => {
    const g = byName.get(e.name)
    return g && e.id === g.id && e.temperature === g.temperature && e.rainfall === g.rainfall
  })
}

/** An attributes.json has exactly the attributes the server sends, each with its default, min and max. */
function attributesFit (list: any[], generated: any[]): boolean {
  const byResource = new Map(generated.map(e => [e.resource, e]))
  return list.length === generated.length && list.every(e => {
    const g = byResource.get(e.resource)
    return g && e.default === g.default && e.min === g.min && e.max === g.max
  })
}

/** An entities.json has exactly the entities the server sends, each with its runtime id and a hitbox. */
function entitiesFit (list: any[], generated: any[]): boolean {
  const byName = new Map(generated.map(e => [e.name, e]))
  return list.length === generated.length && list.every(e => byName.get(e.name)?.internalId === e.internalId && e.height != null && e.width != null)
}

/**
 * An items.json has exactly the registry's items; from 1.21.100 (see itemsByRuntimeId) each with its runtime
 * id, since the registry a server sends is made from it (before, ids are numbered as Java does); one entry
 * per data value, and its enchantment categories named.
 */
const itemsFit = (itemstates: ItemState[], byRuntimeId: boolean) => (list: any[]): boolean => {
  const byName = new Map(itemstates.map(s => [s.name.replace(/^minecraft:/, ''), s]))
  return list.length === itemstates.length && list.every(e => byName.has(e.name) && (!byRuntimeId || e.id === byName.get(e.name)!.runtime_id) &&
    // one entry per data value (no Java-only item Geyser put on a Bedrock stand-in), no unresolved tag names
    new Set([e.metadata ?? 0, ...(e.variations ?? []).map((v: any) => v.metadata)]).size === 1 + (e.variations?.length ?? 0) &&
    !JSON.stringify(e.enchantCategories ?? []).includes('tagkey['))
}

/** A Bedrock block state as the block maps write it: name[key=value,...], keys sorted, a byte as 0 / 1. */
const stateKey = (s: BlockState): string => `minecraft:${s.name}[${Object.keys(s.states).sort().map(k => {
  const t = s.states[k]
  return `${k}=${t.type === 'byte' ? (t.value ? 1 : 0) : t.value}`
}).join(',')}]`

/** blocksJ2B.json and blocksB2J.json name only Bedrock states the palette has (a boolean as true / false in J2B). */
function blockMapsFit (j2b: Record<string, string>, b2j: Record<string, string>, states: BlockState[]): boolean {
  const palette = new Set(states.map(stateKey))
  return Object.keys(b2j).every(k => palette.has(k)) && Object.values(j2b).every(s => palette.has(s.replace(/true/g, '1').replace(/false/g, '0')))
}

/** Puts `key` right after `after` in entry (in place), where entry lacks it. */
function placeAfter (entry: Record<string, string>, key: string, after: string): void {
  if (key in entry || !(after in entry)) return
  const rest = Object.entries(entry)
  for (const k of Object.keys(entry)) delete entry[k]
  for (const [k, value] of rest) {
    entry[k] = value
    if (k === after) entry[key] = ''
  }
}

/** Each block's default state (its runtime id) from block_types.json, by the name blocks.json has. */
function defaultStates (b: Build): (name: string) => number {
  const types: Record<string, { defaultBlockStateId: number }> = JSON.parse(readFileSync(dataFile(b, 'block_types.json'), 'utf8'))
  const byName = new Map(Object.entries(types).map(([n, t]) => [n.replace(/^minecraft:/, ''), t.defaultBlockStateId]))
  return name => {
    const id = byName.get(name)
    if (id === undefined) throw new Error(`${b.serverVersion}: block_types.json has no ${name}`)
    return id
  }
}

/** A blocks.json's text with every "defaultState" set to the game's, the rest of it as it is written. */
function withDefaultStates (text: string, defaults: (name: string) => number): { list: any[], json: string } {
  const list = JSON.parse(text)
  let i = 0
  const json = text.replace(/("defaultState"\s*:\s*)\d+/g, (_, key) => {
    const e = list[i++]
    e.defaultState = defaults(e.name)
    return key + e.defaultState
  })
  if (i !== list.length) throw new Error(`blocks.json: ${i} defaultState values for ${list.length} blocks`)
  return { list, json }
}

/** block_types.json by name without minecraft: (its default state's scalars, tags, whether it needs the right tool). */
function blockTypes (b: Build): Record<string, ServerBlockType> {
  const types: Record<string, ServerBlockType> = JSON.parse(readFileSync(dataFile(b, 'block_types.json'), 'utf8'))
  return Object.fromEntries(Object.entries(types).map(([n, t]) => [n.replace(/^minecraft:/, ''), t]))
}

/**
 * A blocks.json's text with every entry's fields set to the server's (blockProps.ts), the rest of it as it is
 * written: an entry that changes is written again in the file's own way (one key a line, or the compact form).
 */
function withServerFields (text: string, fields: Map<string, Record<string, unknown>>): { list: any[], json: string } {
  const list = JSON.parse(text)
  const plain = JSON.stringify(list, null, 2) === text.trimEnd()
  const spans: [number, number][] = []
  let depth = 0, inString = false, start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') { if (depth++ === 1) start = i }
    else if (c === '}' || c === ']') { if (--depth === 1) spans.push([start, i + 1]) }
  }
  if (spans.length !== list.length) throw new Error(`blocks.json: ${spans.length} entries read for ${list.length}`)
  let json = ''
  let at = 0
  spans.forEach(([from, to], i) => {
    const old = list[i]
    const entry = withFields(old, fieldsOf(fields, old.name), BLOCK_ORDER)
    list[i] = entry
    json += text.slice(at, from)
    if (JSON.stringify(entry) === JSON.stringify(old)) json += text.slice(from, to)
    else {
      const whole = plain ? JSON.stringify([entry], null, 2) : stringify([entry], { indent: 2, maxLength: 200 })
      json += whole.slice(whole.indexOf('{'), whole.lastIndexOf('}') + 1)
    }
    at = to
  })
  return { list, json: json + text.slice(at) }
}

/**
 * The Java version whose blocks.json drops stand for `javaVersion`'s: itself where its drops are real (stone
 * drops cobblestone), else the first later one of versions.json's Java versions that has them.
 */
async function javaDropsVersion (javaVersion: string): Promise<string> {
  const candidates = [...new Set(versions.map(v => v.javaVersion))].filter(j => compareVersions(j, javaVersion) >= 0).sort(compareVersions)
  for (const j of candidates) {
    const blocks = await javaBlocks(j), items = await javaItems(j)
    const cobblestone = items.find((i: any) => i.name === 'cobblestone')?.id
    const stone = blocks.find((x: any) => x.name === 'stone')
    if (cobblestone !== undefined && stone?.drops?.includes(cobblestone)) return j
  }
  throw new Error(`no Java version from ${javaVersion} on has block drops`)
}

/** The Geyser block map of a build (Java <-> Bedrock states), and each Bedrock block's Java block by name. */
async function javaBlockMap (b: Build) {
  const java = await javaBlocks(b.javaVersion)
  const j2b = await javaToBedrock(b.mcDataVersion, await geyserBlocks(b), java)
  const b2j = bedrockToJava(j2b)
  const javaByName = new Map(java.map(jb => [jb.name, jb]))
  const b2jName: Record<string, string> = {}
  for (const [k, jv] of Object.entries(b2j)) b2jName[strip(k)] ??= strip(jv)
  return { java, j2b, b2j, javaByName, b2jName }
}

/** Each block's name in the language file (its description id's), by block name, where it has one. */
function blockLangNames (b: Build, lang: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, t] of Object.entries(blockTypes(b))) {
    const d = t.descriptionId
    const n = d === undefined ? undefined : lang[d.endsWith('.name') ? d : `${d}.name`]
    if (n) out[name] = n
  }
  return out
}

const fieldsOf = (fields: Map<string, Record<string, unknown>>, name: string): Record<string, unknown> => {
  const f = fields.get(name)
  if (!f) throw new Error(`block_types.json has no ${name}`)
  return f
}

interface Head {
  /** the text of the file a version resolves `key` to in the checkout's HEAD (the published minecraft-data) */
  file: (mcDataVersion: string, key: string) => string | undefined
  /** where it is: its dataPaths.json value */
  dir: (mcDataVersion: string, key: string) => string | undefined
}

function head (): Head {
  const show = (path: string): string | undefined => {
    try {
      return execFileSync('git', ['show', `HEAD:data/${path}`], { cwd: MINECRAFT_DATA_DIR, maxBuffer: 1 << 30, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    } catch { return undefined }
  }
  const text = show('dataPaths.json')
  const paths = text ? JSON.parse(text).bedrock : {}
  const dir = (v: string, key: string): string | undefined => paths[v]?.[key]
  return {
    dir,
    file: (v, key) => {
      const d = dir(v, key)
      return d ? show(`${d}/${key}.json`)?.replace(/\r\n/g, '\n') : undefined
    }
  }
}

// How a version's blockCollisionShapes.json in the checkout's HEAD is written, to keep, since both forms are
// valid minecraft-data and regenerating a file in the other one would change every such line for nothing:
// - the older files write some blocks whose states all share one shape as that id alone ("web": 0);
// - 1.17.0 splits one array one state per line;
// - every file numbers its shapes its own way, some with shapes no block uses: a shape keeps its id, an
//   unused one stays (only from a table of the same boxes, see blockCollisionShapesJson).
function collisionFormat (h: Head, mcDataVersion: string): CollisionFormat {
  const text = h.file(mcDataVersion, 'blockCollisionShapes')
  if (!text) return PLAIN_FORMAT
  const { blocks, shapes } = JSON.parse(text)
  return {
    table: new Map(Object.entries<number[][]>(shapes).map(([id, boxes]) => [Number(id), boxes])),
    asNumber: new Set(Object.keys(blocks).filter(n => typeof blocks[n] === 'number')),
    multiline: new Set([...text.matchAll(/^\t\t"([^"]+)": \[\r?$/gm)].map(m => m[1]))
  }
}

export async function mcdata (accept = false): Promise<string[]> {
  const builds = [...versions].sort((a, b) => compareVersions(a.serverVersion, b.serverVersion))
  const missing = builds.filter(b => ['block_palette.nbt', 'block-state-shapes.nbt', 'block_types.json', 'item_types.json', 'item_aliases.json', 'effects.json', 'enchantments.json', 'packets.nbt'].some(f => !existsSync(dataFile(b, f))))
  if (missing.length) throw new Error(`mcdata: no block or packet data for ${missing.map(b => b.serverVersion).join(', ')} (pnpm blocks, pnpm network first)`)

  const pathsFile = join(DATA, 'dataPaths.json')
  const paths = JSON.parse(readFileSync(pathsFile, 'utf8'))
  const h = head()
  const previous: Record<string, { meaning: string, owner: string } | undefined> = {}
  let previousBlocks: { meaning: string, dir: string } | undefined
  const previousList: Partial<Record<ListKey, { meaning: string, dir: string }>> = {}
  let previousSteve: { meaning: string, dir: string } | undefined
  let previousLanguage: { text: string, dir: string } | undefined
  let previousRecipes: { text: string, dir: string } | undefined
  let previousMaterials: { meaning: string, dir: string } | undefined
  let previousEffects: { text: string, dir: string } | undefined
  let previousEnchantments: { text: string, dir: string } | undefined
  let previousEntityLoot: { text: string, dir: string } | undefined
  let previousFoods: { text: string, dir: string } | undefined
  const previousMap: Record<string, { meaning: string, dir: string } | undefined> = {}
  const bedrockBiomes = await pymctranslateBiomes(BEDROCK_BIOMES)
  const counts: Record<string, number> = { written: 0, unchanged: 0, shared: 0, deleted: 0 }

  // what this run writes (a text) or deletes (null), by file: written once every version validates
  const staged = new Map<string, string | null>()
  /** a file's text as this run leaves it (undefined: none) */
  const current = (file: string): string | undefined => {
    const s = staged.get(file)
    if (s !== undefined) return s ?? undefined
    return existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : undefined
  }
  const write = (file: string, json: string): string => {
    const old = current(file)
    if (old === json) {
      counts.unchanged++
      return 'same'
    }
    staged.set(file, json)
    counts.written++
    return old === undefined ? 'new' : 'updated'
  }
  const remove = (file: string): void => {
    if (current(file) === undefined) return
    staged.set(file, null)
    counts.deleted++
  }

  // the digs of the first build whose server tags its blocks by the tools that dig them, for the builds before it
  let reference: Reference | undefined
  const digReference = async (): Promise<Reference> => {
    if (reference) return reference
    const b = builds.find(x => hasDiggerTags(blockTypes(x)))
    if (!b) throw new Error('mcdata: no build tags its blocks by their tools')
    const { javaByName, b2jName } = await javaBlockMap(b)
    const items = itemStates(b).map(s => ({ id: s.runtime_id, name: strip(s.name) }))
    const digs = dig({ types: blockTypes(b), items, javaBlock: name => b2jName[name] === undefined ? undefined : javaByName.get(b2jName[name]), javaItems: await javaItems(b.javaVersion) })
    return (reference = referenceOf(digs.blocks, items))
  }

  for (const b of builds) {
    const v = b.mcDataVersion
    const states = readBlockStates(dataFile(b, 'block_palette.nbt'))
    const entry = withBlockKeys(paths.bedrock[v] ?? {})
    paths.bedrock[v] = entry
    const notes: string[] = []
    // attributes, biomes, entities and items.json: the one minecraft-data has for the version while it fits what the server
    // sends, else made by legacy2's generators: biomes from biome_definition_list (packets.nbt), PyMCTranslate's
    // ids and the Java biomes; entities from available_entity_identifiers and the Java entities
    // `fix` sets what the server says on whichever list is chosen; a kept file it changes is written again
    const listFile = (key: ListKey, generated: any[], fit: (list: any[], generated: any[]) => boolean, json: (list: any[]) => string, fix: (list: any[]) => any[] = l => l): any[] => {
      const headText = h.file(v, key)
      const kept = headText !== undefined && fit(JSON.parse(headText), generated)
      const base = kept ? JSON.parse(headText) : generated
      const final = fix(base)
      const asIs = kept && JSON.stringify(final) === JSON.stringify(base)
      const meaning = listMeaning(final)
      const prev = previousList[key]
      if (asIs && prev?.meaning !== meaning) {
        entry[key] = h.dir(v, key)!
        const onDisk = join(DATA, entry[key], `${key}.json`)
        if (current(onDisk) !== headText) throw new Error(`${v}: keeps ${entry[key]}/${key}.json, which this run has changed`)
        notes.push(`${key} kept (${entry[key].replace('bedrock/', '')})`)
      } else if (prev?.meaning === meaning) {
        entry[key] = prev.dir
        counts.shared++
        notes.push(`${key} = ${prev.dir.replace('bedrock/', '')}`)
      } else {
        const file = join(DATA, 'bedrock', v, `${key}.json`)
        // another version's file in this folder that no longer fits: every user of it gets its own
        const users = Object.entries<any>(paths.bedrock).filter(([u, e]) => u !== v && e[key] === `bedrock/${v}`).map(([u]) => u)
        const own = (t => t === undefined ? undefined : JSON.parse(t))(current(file))
        if (own && users.length && !fit(own, generated)) console.log(`  ${v}: ${key}.json replaced, also used by ${users.join(', ')}`)
        notes.push(`${key} ${write(file, json(final))}${kept ? ' (server fields)' : ''}`)
        entry[key] = `bedrock/${v}`
      }
      previousList[key] = { meaning, dir: entry[key] }
      return final
    }
    // items.json first: blocks.json and materials.json name its ids
    const registry = itemStates(b)
    const lang = language(b)
    // a Java item name -> the Bedrock item Geyser maps it to (block drops, repair items name Java items)
    const javaToBedrockItem = new Map<string, string>()
    for (const [bedrock, list] of Object.entries(bedrockToJavaItems(registry, await geyserItems(b)))) for (const [, javaName] of list) if (!javaToBedrockItem.has(javaName)) javaToBedrockItem.set(javaName, bedrock)
    const itemList = listFile('items', items(v, registry, await geyserItems(b), await javaItems(b.javaItemsVersion ?? b.javaVersion)), itemsFit(registry, itemsByRuntimeId(v)), itemsJson,
      list => withServerItemFields(list, itemTypes(b), lang, blockLangNames(b, lang), javaToBedrockItem))

    // blocks.json: the one minecraft-data has for the version while it fits the palette, else made by legacy2's
    // generator from the Geyser map and the Java blocks; either way with the game's default states and the
    // fields the server says (blockProps.ts: hardness, light, drops, material, harvestTools, ...), written
    // into the file's own text. What stays from the Java block: id, and displayName where the language file
    // has no name for the block.
    const defaults = defaultStates(b)
    const { java, j2b, b2j, javaByName, b2jName } = await javaBlockMap(b)
    const types = blockTypes(b)
    const digs = dig({
      types,
      items: itemList,
      javaBlock: name => b2jName[name] === undefined ? undefined : javaByName.get(b2jName[name]),
      javaItems: await javaItems(b.javaVersion),
      reference: await digReference(),
      warn: text => console.log(`  ${v}: dig: ${text}`)
    })
    const shapeRows: { collisionShape: unknown[] }[] = readNbt(dataFile(b, 'block-state-shapes.nbt'), 'little').shapes
    // drops from the Java data of the build's Java version, or of the next one whose drops are real (the
    // fork's 1.16.2 lists each block's own item, its 1.18 none), by the Java block's name
    const dropsVersion = await javaDropsVersion(b.javaVersion)
    const dropsBlocks = new Map((await javaBlocks(dropsVersion)).map(jb => [jb.name, jb]))
    const fields = serverBlockFields({
      types,
      defaultState: defaults,
      noCollision: state => shapeRows[state].collisionShape.length === 0,
      items: itemList,
      digs: digs.blocks,
      javaBlock: name => b2jName[name] === undefined ? undefined : dropsBlocks.get(b2jName[name]) ?? javaByName.get(b2jName[name]),
      javaItems: await javaItems(dropsVersion),
      javaToBedrockItem,
      lang,
      warn: text => console.log(`  ${v}: blocks.json: ${text}`)
    })
    let blockList: any[]
    let json: string
    const headBlocks = h.file(v, 'blocks')
    const kept = headBlocks !== undefined && fits(JSON.parse(headBlocks), states)
    if (kept) {
      ({ json } = withDefaultStates(headBlocks, defaults))
      ;({ list: blockList, json } = withServerFields(json, fields))
    } else {
      blockList = blocks(states, b2j, java, defaults, text => console.log(`  ${v}: blocks.json: ${text}`)).map(e => orderKeys(withFields(e, fieldsOf(fields, e.name), BLOCK_ORDER), BLOCK_ORDER))
      json = blocksJson(blockList)
    }
    if (!fits(blockList, states)) throw new Error(`${v}: blocks.json does not fit the palette`)
    const meaning = blocksMeaning(blockList)
    if (kept && json === headBlocks) {
      entry.blocks = h.dir(v, 'blocks')!
      notes.push(`blocks kept (${entry.blocks.replace('bedrock/', '')})`)
    } else if (previousBlocks?.meaning === meaning) {
      entry.blocks = previousBlocks.dir
      counts.shared++
      notes.push(`blocks = ${previousBlocks.dir.replace('bedrock/', '')}`)
    } else {
      const file = join(DATA, 'bedrock', v, 'blocks.json')
      // a version's own blocks.json is replaced only by one of the same blocks, unless no other version uses it
      const users = Object.entries<any>(paths.bedrock).filter(([u, e]) => u !== v && e.blocks === `bedrock/${v}`).map(([u]) => u)
      const own = (t => t === undefined ? undefined : JSON.parse(t))(current(file))
      if (own && users.length && !fits(own, states)) throw new Error(`${v}: its blocks.json does not fit its palette, and ${users.join(', ')} use it`)
      notes.push(`blocks ${write(file, json)}${kept ? ' (server fields)' : ''}`)
      entry.blocks = `bedrock/${v}`
    }
    previousBlocks = { meaning, dir: entry.blocks }

    // materials.json: each material's tool speeds (dig.ts), by the items.json ids
    {
      const materialsText = materialsJson(digs.materials)
      const meaning = JSON.stringify(Object.keys(digs.materials).sort().map(k => [k, digs.materials[k]]))
      placeAfter(entry, 'materials', 'instruments')
      placeAfter(entry, 'materials', 'items')
      const headDir = h.dir(v, 'materials'), headText = h.file(v, 'materials')
      const headMeaning = headText && headDir?.startsWith('bedrock/') ? (m => JSON.stringify(Object.keys(m).sort().map(k => [k, m[k]])))(JSON.parse(headText)) : undefined
      if (headMeaning === meaning && previousMaterials?.meaning !== meaning) {
        entry.materials = headDir!
        notes.push(`materials kept (${headDir!.replace('bedrock/', '')})`)
      } else if (previousMaterials?.meaning === meaning) {
        entry.materials = previousMaterials.dir
        counts.shared++
        notes.push(`materials = ${previousMaterials.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`materials ${write(join(DATA, 'bedrock', v, 'materials.json'), materialsText)}`)
        entry.materials = `bedrock/${v}`
      }
      previousMaterials = { meaning, dir: entry.materials }
    }

    // blockCollisionShapes.json lists the blocks in blocks.json order
    const names: string[] = blockList.map(e => e.name)
    const shapesFile = dataFile(b, 'block-state-shapes.nbt')
    const collisionArrays = blockCollisionShapesJson(shapesFile, states, names)
    const format = collisionFormat(h, v)
    const content: Record<string, string> = {
      blockStates: blockStatesJson(states),
      blockCollisionShapes: format === PLAIN_FORMAT ? collisionArrays : blockCollisionShapesJson(shapesFile, states, names, format)
    }
    // compared by the all-arrays form: the number form is only how a file is written
    const meanings: Record<string, string> = { blockStates: content.blockStates, blockCollisionShapes: collisionArrays }
    // a blockStates.json that says the same in HEAD stays as it is written there (1.19.80 and 1.20.0 list the
    // keys of a state's properties in another order)
    const headStates = h.file(v, 'blockStates')
    if (headStates && sameMeaning.blockStates(headStates) === sameMeaning.blockStates(content.blockStates)) content.blockStates = headStates

    for (const key of KEYS) {
      const file = join(DATA, 'bedrock', v, `${key}.json`)
      const prev = previous[key]
      const meaning = sameMeaning[key](meanings[key])
      if (prev?.meaning === meaning) {
        remove(file)
        entry[key] = `bedrock/${prev.owner}`
        counts.shared++
        notes.push(`${key} = ${prev.owner}`)
      } else {
        notes.push(`${key} ${write(file, content[key])}`) // like the existing files: no trailing newline
        entry[key] = `bedrock/${v}`
        previous[key] = { meaning, owner: v }
      }
    }
    listFile('attributes', attributes(b), attributesFit, attributesJson)
    const biomeDefs = biomeDefinitions(b)
    const biomeList = listFile('biomes', biomes(biomeDefs, bedrockBiomes, await pymctranslateBiomes(javaBiomesSnapshot(b.javaVersion)), await javaBiomes(b.javaVersion), text => console.log(`  ${v}: biomes.json: ${text}`)), biomesFit, biomesJson, list => withServerBiomeFields(list, biomeDefs))
    // the ids are PyMCTranslate's: where the agent read the server's own (biome_ids.json), they must be those
    if (existsSync(dataFile(b, 'biome_ids.json'))) {
      const serverIds: Record<string, number> = JSON.parse(readFileSync(dataFile(b, 'biome_ids.json'), 'utf8'))
      const wrong = biomeList.filter(e => serverIds[e.name] !== e.id)
      if (wrong.length) throw new Error(`${v}: biomes.json ids differ from the server's: ${wrong.slice(0, 5).map(e => `${e.name} ${e.id} (server ${serverIds[e.name]})`).join(', ')}`)
    }
    const entityDefs = entityDefinitions(b)
    const entityList = listFile('entities', entities(entityIdentifiers(b), await javaEntities(b.javaVersion)), entitiesFit, entitiesJson, list => withServerEntityFields(list, entityDefs, lang))

    // entityLoot.json: each entity's drops from the loot table its behavior pack definition names
    {
      const text = entityLootJson(entityLoot(b, entityList, entityDefs, new Set(itemList.map((i: any) => i.name)), t => console.log(`  ${v}: entityLoot.json: ${t}`)))
      placeAfter(entry, 'entityLoot', 'language')
      if (previousEntityLoot?.text === text) {
        entry.entityLoot = previousEntityLoot.dir
        counts.shared++
        notes.push(`entityLoot = ${previousEntityLoot.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`entityLoot ${write(join(DATA, 'bedrock', v, 'entityLoot.json'), text)}`)
        entry.entityLoot = `bedrock/${v}`
      }
      previousEntityLoot = { text, dir: entry.entityLoot }
    }

    // steve.json: the skin the build's own client sent (pnpm steve), the persona id anonymized, written as
    // minecraft-data has it (one line). A build without a capture shares the version before's.
    const steveFile = dataFile(b, 'steve.json')
    if (existsSync(steveFile)) {
      const skin = normalizeSteveSkin(JSON.parse(readFileSync(steveFile, 'utf8')))
      const meaning = JSON.stringify(Object.keys(skin).sort().map(k => [k, skin[k]]))
      if (previousSteve?.meaning === meaning) {
        entry.steve = previousSteve.dir
        counts.shared++
        notes.push(`steve = ${previousSteve.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`steve ${write(join(DATA, 'bedrock', v, 'steve.json'), JSON.stringify(skin))}`)
        entry.steve = `bedrock/${v}`
      }
      previousSteve = { meaning, dir: entry.steve }
    } else if (previousSteve) {
      entry.steve = previousSteve.dir
      counts.shared++
      notes.push(`steve = ${previousSteve.dir.replace('bedrock/', '')} (no capture)`)
    } else {
      throw new Error(`${v}: no steve.json (pnpm steve ${b.serverVersion})`)
    }

    // recipes.json: the recipes the server sends (crafting_data), as legacy2 makes them, in minecraft-data's form
    if (PUBLISH_RECIPES) {
    const recipesText = recipesJson(recipes(craftingData(b, registry), registry))
    if (previousRecipes?.text === recipesText) {
      entry.recipes = previousRecipes.dir
      counts.shared++
      notes.push(`recipes = ${previousRecipes.dir.replace('bedrock/', '')}`)
    } else {
      notes.push(`recipes ${write(join(DATA, 'bedrock', v, 'recipes.json'), recipesText)}`)
      entry.recipes = `bedrock/${v}`
    }
    previousRecipes = { text: recipesText, dir: entry.recipes }
    }

    // effects.json: the server's mob effects (the agent's effects.json), Bedrock's numbering
    {
      const text = effectsJson(effects(b, lang))
      placeAfter(entry, 'effects', 'enchantments')
      placeAfter(entry, 'effects', 'materials')
      if (previousEffects?.text === text) {
        entry.effects = previousEffects.dir
        counts.shared++
        notes.push(`effects = ${previousEffects.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`effects ${write(join(DATA, 'bedrock', v, 'effects.json'), text)}`)
        entry.effects = `bedrock/${v}`
      }
      previousEffects = { text, dir: entry.effects }
    }

    // enchantments.json: the server's enchantments (the agent's enchantments.json), Bedrock's numbering
    {
      const text = enchantmentsJson(enchantments(b, lang, await javaEnchantments(b.javaVersion)))
      placeAfter(entry, 'enchantments', 'materials')
      if (previousEnchantments?.text === text) {
        entry.enchantments = previousEnchantments.dir
        counts.shared++
        notes.push(`enchantments = ${previousEnchantments.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`enchantments ${write(join(DATA, 'bedrock', v, 'enchantments.json'), text)}`)
        entry.enchantments = `bedrock/${v}`
      }
      previousEnchantments = { text, dir: entry.enchantments }
    }

    // foods.json: the items the server says are food (its item registry, else its behavior packs), pc's form
    {
      const text = foodsJson(foods(b, itemList))
      placeAfter(entry, 'foods', 'enchantments')
      if (previousFoods?.text === text) {
        entry.foods = previousFoods.dir
        counts.shared++
        notes.push(`foods = ${previousFoods.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`foods ${write(join(DATA, 'bedrock', v, 'foods.json'), text)}`)
        entry.foods = `bedrock/${v}`
      }
      previousFoods = { text, dir: entry.foods }
    }

    // language.json: the en_US.lang of the server's vanilla resource pack, as legacy2 parses it
    const languageText = languageJson(language(b))
    if (previousLanguage?.text === languageText) {
      entry.language = previousLanguage.dir
      counts.shared++
      notes.push(`language = ${previousLanguage.dir.replace('bedrock/', '')}`)
    } else {
      notes.push(`language ${write(join(DATA, 'bedrock', v, 'language.json'), languageText)}`)
      entry.language = `bedrock/${v}`
    }
    previousLanguage = { text: languageText, dir: entry.language }

    // blocksJ2B.json / blocksB2J.json: legacy2's (the Geyser block map of the build, and it flipped), the one a
    // working proxy uses, where every Bedrock state in them is one of the palette's. The Geyser pin of some
    // builds predates their palette: there the ones minecraft-data has, if every Bedrock state in those is,
    // else legacy2's without the entries naming a state the palette lacks. (minecraft-data's own can be valid
    // names and still wrong: its 1.21.70 doors are turned 90 degrees, its 1.20.0 skulls keyed by Java 1.19.)
    if (PUBLISH_BLOCK_MAPS) {
    const headJ2B = h.file(v, 'blocksJ2B'), headB2J = h.file(v, 'blocksB2J')
    const ownValid = blockMapsFit(j2b, b2j, states)
    const mapsKept = !ownValid && headJ2B !== undefined && headB2J !== undefined && blockMapsFit(JSON.parse(headJ2B), JSON.parse(headB2J), states)
    if (!ownValid && !mapsKept) {
      const palette = new Set(states.map(stateKey))
      const dropped = Object.keys(b2j).filter(k => !palette.has(k)).length + Object.keys(j2b).filter(k => !palette.has(j2b[k].replace(/true/g, '1').replace(/false/g, '0'))).length
      for (const k of Object.keys(b2j)) if (!palette.has(k)) delete b2j[k]
      for (const k of Object.keys(j2b)) if (!palette.has(j2b[k].replace(/true/g, '1').replace(/false/g, '0'))) delete j2b[k]
      notes.push(`block maps: ${dropped} entries naming a state the palette lacks dropped`)
    }
    for (const [key, map, headText] of [['blocksB2J', b2j, headB2J], ['blocksJ2B', j2b, headJ2B]] as const) {
      placeAfter(entry, key, key === 'blocksB2J' ? 'steve' : 'blocksB2J')
      const text = mapsKept ? headText! : JSON.stringify(map, null, 2)
      const obj = JSON.parse(text)
      const meaning = JSON.stringify(Object.keys(obj).sort().map(k => [k, obj[k]]))
      const prev = previousMap[key]
      if (mapsKept && prev?.meaning !== meaning) {
        entry[key] = h.dir(v, key)!
        const onDisk = join(DATA, entry[key], `${key}.json`)
        if (current(onDisk) !== headText) throw new Error(`${v}: keeps ${entry[key]}/${key}.json, which this run has changed`)
        notes.push(`${key} kept (${entry[key].replace('bedrock/', '')})`)
      } else if (prev?.meaning === meaning) {
        entry[key] = prev.dir
        counts.shared++
        notes.push(`${key} = ${prev.dir.replace('bedrock/', '')}`)
      } else {
        notes.push(`${key} ${write(join(DATA, 'bedrock', v, `${key}.json`), text)}`)
        entry[key] = `bedrock/${v}`
      }
      previousMap[key] = { meaning, dir: entry[key] }
    }
    }

    console.log(`  ${v.padEnd(10)} ${notes.join(', ')}`)
  }
  // a version's own file that no version points to any more (it now shares an earlier one) goes
  const published = ['attributes', 'blocks', ...KEYS, 'biomes', 'entities', 'items', ...(PUBLISH_RECIPES ? ['recipes'] : []), 'materials', 'effects', 'enchantments', 'foods', 'entityLoot', 'steve', 'language', ...(PUBLISH_BLOCK_MAPS ? ['blocksB2J', 'blocksJ2B'] : [])]
  const used = new Set(Object.values<any>(paths.bedrock).flatMap(e => published.map(k => `${e[k]}/${k}.json`)))
  for (const b of builds) {
    for (const k of published) {
      const rel = `bedrock/${b.mcDataVersion}/${k}.json`
      if (!used.has(rel) && current(join(DATA, rel)) !== undefined) { remove(join(DATA, rel)); console.log(`  ${rel} deleted: no version uses it`) }
    }
  }

  // every version as the files would be: nothing is written where one fails
  const problems = builds.flatMap(b => validateVersion(b, paths, publishedFiles(b.mcDataVersion, paths, staged), { registry: !accept }))
  if (problems.length) throw new Error(`mcdata: nothing written, ${problems.length} problem(s):\n${formatProblems(problems)}${problems.some(p => p.key === 'registry') ? '\n(where the registry differences are intended: pnpm mcdata --accept, then review the registry/ diff)' : ''}`)
  for (const [file, text] of staged) {
    if (text === null) rmSync(file)
    else {
      mkdirSync(join(file, '..'), { recursive: true })
      writeAtomic(file, text)
    }
  }
  writeAtomic(pathsFile, JSON.stringify(paths, null, 2) + '\n')
  generateDataJs()
  if (accept) for (const line of writeRegistry(v => publishedFiles(v, paths))) console.log(`  registry: ${line}`)
  console.log(`mcdata: ${counts.written} files written, ${counts.unchanged} already current, ${counts.shared} shared with an earlier version (${counts.deleted} deleted)`)
  return []
}
