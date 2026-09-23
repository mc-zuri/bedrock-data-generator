// node tools/audit.ts: every file `pnpm mcdata` publishes, for every version of versions.json, against
// minecraft-data's schema, and against each other (drops, harvest tools, repair items and loot name items the
// version's items.json has; materials and enchantment exclusions resolve; every version resolves every key to
// a bedrock file). Prints each kind of problem with a few examples, then the count.
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { MINECRAFT_DATA_DIR, versions } from '../src/config.ts'
// ajv is a dependency of a dependency (the one minecraft-data's own tests use)
const require = createRequire(import.meta.url)
const pnpmStore = join(import.meta.dirname, '..', 'node_modules', '.pnpm')
const Ajv = require(join(pnpmStore, readdirSync(pnpmStore).find(d => /^ajv@6\./.test(d))!, 'node_modules', 'ajv'))
const D = MINECRAFT_DATA_DIR + '/data'
const P = JSON.parse(readFileSync(D + '/dataPaths.json', 'utf8')).bedrock
const ajv = new Ajv({ allErrors: true })
const schemas: Record<string, any> = {}
for (const f of readdirSync(D + '/../schemas').filter(f => f.endsWith('_schema.json'))) schemas[f.replace('_schema.json', '')] = ajv.compile(JSON.parse(readFileSync(D + '/../schemas/' + f, 'utf8')))
const read = (d: string, k: string) => JSON.parse(readFileSync(`${D}/${d}/${k}.json`, 'utf8'))
const problems: Record<string, string[]> = {}
const bad = (k: string, s: string) => (problems[k] ??= []).push(s)
const KEYS = ['attributes', 'blocks', 'blockStates', 'blockCollisionShapes', 'biomes', 'entities', 'items', 'materials', 'effects', 'enchantments', 'entityLoot', 'language', 'steve']
for (const b of versions) {
  const v = b.mcDataVersion, e = P[v]
  for (const k of KEYS) {
    if (!e[k]) { bad('missing', `${v} ${k}`); continue }
    if (!e[k].startsWith('bedrock/')) bad('not-bedrock', `${v} ${k}=${e[k]}`)
    const data = read(e[k], k)
    if (schemas[k] && !schemas[k](data)) bad('schema', `${v} ${k} ${JSON.stringify(schemas[k].errors[0]).slice(0, 150)}`)
  }
  const items = read(e.items, 'items'), itemIds = new Set(items.map((i: any) => i.id)), itemNames = new Set(items.map((i: any) => i.name))
  const blocks = read(e.blocks, 'blocks'), mats = read(e.materials, 'materials')
  for (const x of blocks) {
    for (const d of x.drops ?? []) if (!itemIds.has(typeof d === 'number' ? d : d.drop)) bad('block-drop', `${v} ${x.name} ${JSON.stringify(d)}`)
    for (const id of Object.keys(x.harvestTools ?? {})) if (!itemIds.has(+id)) bad('harvest', `${v} ${x.name} ${id}`)
    if (!(x.material in mats)) bad('material', `${v} ${x.name}`)
    if (!x.displayName) bad('block-name', `${v} ${x.name}`)
  }
  for (const i of items) {
    for (const r of i.repairWith ?? []) if (!itemNames.has(r)) bad('repairWith', `${v} ${i.name} ${r}`)
    if (!i.displayName) bad('item-name', `${v} ${i.name}`)
    if (typeof i.stackSize !== 'number' || i.stackSize < 1 || i.stackSize > 64) bad('stack', `${v} ${i.name} ${i.stackSize}`)
  }
  const ench = read(e.enchantments, 'enchantments'), enchNames = new Set(ench.map((x: any) => x.name))
  for (const x of ench) for (const ex of x.exclude) if (!enchNames.has(ex)) bad('ench-exclude', `${v} ${x.name} ${ex}`)
  for (const l of read(e.entityLoot, 'entityLoot')) for (const d of l.drops) if (!itemNames.has(d.item)) bad('loot-item', `${v} ${l.entity} ${d.item}`)
  const ents = read(e.entities, 'entities'), entNames = new Set(ents.map((x: any) => x.name))
  for (const l of read(e.entityLoot, 'entityLoot')) if (!entNames.has(l.entity)) bad('loot-entity', `${v} ${l.entity}`)
  const shapes = read(e.blockCollisionShapes, 'blockCollisionShapes')
  for (const x of blocks) if (!(x.name in shapes.blocks)) bad('shape-block', `${v} ${x.name}`)
}
for (const [k, l] of Object.entries(problems)) console.log(k.padEnd(14), l.length, l.slice(0, 6).join(' | '))
console.log('done', Object.values(problems).reduce((n, l) => n + l.length, 0))
