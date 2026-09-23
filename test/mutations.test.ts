// The validators catch what they are for: each case breaks one thing in a copy of a version's files (a state
// value no block has, a hardness not the server's, a tool that is no tool, an item gone, ...) and the
// validation of the copy must name the file. The copy unbroken validates.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { compareVersions } from '../src/config.ts'
import { formatProblems, validateVersion } from '../src/validate/index.ts'
import { server } from '../src/validate/server.ts'
import { build, copy, paths } from './helpers.ts'

type Data = Record<string, any>
interface Case {
  what: string
  /** the file the validation must name */
  key: string
  /** only for versions from this one */
  since?: string
  /** only where the server itself is there (servers/, SERVERS_DIR) */
  packs?: boolean
  apply: (d: Data) => void
}

const find = <T>(list: T[], pick: (t: T) => boolean, what: string): T => {
  const t = list.find(pick)
  if (!t) throw new Error(`no ${what}`)
  return t
}
const block = (d: Data, name: string) => find<any>(d.blocks, b => b.name === name, name)
const item = (d: Data, name: string) => find<any>(d.items, i => i.name === name, name)
const itemId = (d: Data, name: string) => item(d, name).id

const CASES: Case[] = [
  // blockStates.json
  {
    what: 'a state value the block does not have',
    key: 'blockStates',
    apply: d => {
      const s = find<any>(d.blockStates, s => Object.values<any>(s.states).some(t => t.type === 'int'), 'int state')
      Object.values<any>(s.states).find(t => t.type === 'int').value = 250
    }
  },
  { what: 'a property the block does not have', key: 'blockStates', apply: d => { d.blockStates[0].states.bogus_bit = { type: 'byte', value: 0 } } },
  { what: 'a state gone', key: 'blockStates', apply: d => { d.blockStates.pop() } },
  { what: 'a state twice', key: 'blockStates', apply: d => { d.blockStates[1] = structuredClone(d.blockStates[0]) } },
  { what: 'a byte state written as an int', key: 'blockStates', apply: d => { Object.values<any>(find<any>(d.blockStates, s => Object.values<any>(s.states).some(t => t.type === 'byte'), 'byte state').states).find(t => t.type === 'byte').type = 'int' } },
  { what: 'a state value not a name', key: 'blockStates', apply: d => { Object.values<any>(find<any>(d.blockStates, s => Object.values<any>(s.states).some(t => t.type === 'string'), 'string state').states).find(t => t.type === 'string').value = 'North Side' } },
  { what: 'a block renamed', key: 'blockStates', apply: d => { for (const s of d.blockStates) if (s.name === 'stone') s.name = 'stones' } },
  // blocks.json
  { what: 'a hardness not the server\'s', key: 'blocks', apply: d => { block(d, 'stone').hardness = 99 } },
  { what: 'a resistance not the server\'s', key: 'blocks', apply: d => { block(d, 'obsidian').resistance = 1 } },
  { what: 'a light not the server\'s', key: 'blocks', apply: d => { block(d, 'glowstone').emitLight = 3 } },
  { what: 'a block gone', key: 'blocks', apply: d => { d.blocks.splice(d.blocks.indexOf(block(d, 'dirt')), 1) } },
  { what: 'a default state outside the block', key: 'blocks', apply: d => { const b = block(d, 'stone'); b.defaultState = b.maxStateId + 1 } },
  { what: 'a state range shifted', key: 'blocks', apply: d => { const b = block(d, 'dirt'); b.minStateId++; b.maxStateId++ } },
  { what: 'a harvest tool that is no tool', key: 'blocks', apply: d => { block(d, 'obsidian').harvestTools[itemId(d, 'stick')] = true } },
  { what: 'a harvest tool that is no item', key: 'blocks', apply: d => { block(d, 'obsidian').harvestTools['99999'] = true } },
  { what: 'obsidian harvested by an iron pickaxe', key: 'blocks', apply: d => { block(d, 'obsidian').harvestTools[itemId(d, 'iron_pickaxe')] = true } },
  { what: 'stone harvestable by hand', key: 'blocks', apply: d => { delete block(d, 'stone').harvestTools } },
  { what: 'a drop that is no item', key: 'blocks', apply: d => { block(d, 'stone').drops = [99999] } },
  { what: 'a material of the wrong tool', key: 'blocks', apply: d => { block(d, 'stone').material = 'mineable/axe' } },
  { what: 'a material materials.json lacks', key: 'blocks', apply: d => { block(d, 'stone').material = 'wool;mineable/shovel' } },
  { what: 'a Java material', key: 'blocks', apply: d => { block(d, 'stone').material = 'incorrect_for_wooden_tool' } },
  { what: 'a field blocks.json does not have', key: 'blocks', apply: d => { block(d, 'stone').foo = 1 } },
  { what: 'a light above 15', key: 'blocks', apply: d => { block(d, 'stone').filterLight = 16 } },
  { what: 'no displayName', key: 'blocks', apply: d => { delete block(d, 'stone').displayName } },
  { what: 'displayNames not the language file\'s', key: 'blocks', apply: d => { for (const b of d.blocks) b.displayName = `${b.displayName} Rock` } },
  { what: 'a stack size no item has', key: 'blocks', apply: d => { block(d, 'stone').stackSize = 32 } },
  { what: 'a bounding box not its collision', key: 'blocks', apply: d => { block(d, 'air').boundingBox = 'block' } },
  { what: 'an id twice', key: 'blocks', apply: d => { block(d, 'dirt').id = block(d, 'stone').id } },
  // items.json
  { what: 'an item gone', key: 'items', apply: d => { d.items.splice(d.items.indexOf(item(d, 'apple')), 1) } },
  { what: 'a stack size not the server\'s', key: 'items', apply: d => { item(d, 'diamond_pickaxe').stackSize = 64 } },
  { what: 'a durability not the server\'s', key: 'items', apply: d => { item(d, 'diamond_pickaxe').maxDurability = 100 } },
  { what: 'a durability on an item with none', key: 'items', apply: d => { item(d, 'apple').maxDurability = 5 } },
  { what: 'a repair item that is no item', key: 'items', apply: d => { item(d, 'diamond_pickaxe').repairWith = ['unobtainium'] } },
  { what: 'an enchant category that is none', key: 'items', apply: d => { item(d, 'diamond_pickaxe').enchantCategories = ['cheese'] } },
  { what: 'an id twice', key: 'items', apply: d => { item(d, 'apple').id = item(d, 'stick').id } },
  { what: 'an id not the runtime id', key: 'items', since: '1.21.100', apply: d => { item(d, 'apple').id += 10000 } },
  { what: 'nbt not the registry\'s', key: 'items', since: '1.21.100', apply: d => { item(d, 'apple').nbt.value = {} } },
  // materials.json
  { what: 'a speed not the tier\'s', key: 'materials', apply: d => { const t = d.materials['mineable/pickaxe']; t[Object.keys(t)[0]] = 3 } },
  { what: 'a tool gone', key: 'materials', apply: d => { const t = d.materials['mineable/pickaxe']; delete t[Object.keys(t)[0]] } },
  { what: 'a tool of another kind', key: 'materials', apply: d => { d.materials['mineable/pickaxe'][itemId(d, 'diamond_axe')] = 8 } },
  { what: 'a material no block has', key: 'materials', apply: d => { d.materials['wool;mineable/shovel'] = { 1: 2 } } },
  { what: 'a material gone', key: 'materials', apply: d => { delete d.materials['mineable/shovel'] } },
  // blockCollisionShapes.json
  { what: 'a box not the server\'s', key: 'blockCollisionShapes', apply: d => { d.blockCollisionShapes.shapes[d.blockCollisionShapes.blocks.stone[0] ?? d.blockCollisionShapes.blocks.stone] = [[0, 0, 0, 1, 0.5, 1]] } },
  { what: 'a block gone', key: 'blockCollisionShapes', apply: d => { delete d.blockCollisionShapes.blocks.dirt } },
  { what: 'a shape that is not in the table', key: 'blockCollisionShapes', apply: d => { d.blockCollisionShapes.blocks.stone = 99999 } },
  { what: 'a state short', key: 'blockCollisionShapes', apply: d => { const k = Object.keys(d.blockCollisionShapes.blocks).find(n => Array.isArray(d.blockCollisionShapes.blocks[n]) && d.blockCollisionShapes.blocks[n].length > 1)!; d.blockCollisionShapes.blocks[k].pop() } },
  // biomes.json
  { what: 'an id moved', key: 'registry', apply: d => { find<any>(d.biomes, b => b.name === 'plains', 'plains').id = 200 } },
  { what: 'a temperature not the server\'s', key: 'biomes', apply: d => { find<any>(d.biomes, b => b.name === 'desert', 'desert').temperature = 0.1 } },
  { what: 'a biome gone', key: 'biomes', apply: d => { d.biomes.pop() } },
  { what: 'a category that is none', key: 'biomes', apply: d => { d.biomes[0].category = 'lava' } },
  { what: 'a dimension not its tags\'', key: 'biomes', apply: d => { find<any>(d.biomes, b => b.name === 'hell', 'hell').dimension = 'overworld' } },
  // entities.json
  { what: 'an internal id not the server\'s', key: 'entities', apply: d => { find<any>(d.entities, e => e.name === 'zombie', 'zombie').internalId = 9999 } },
  { what: 'an entity gone', key: 'entities', apply: d => { d.entities.splice(d.entities.findIndex((e: any) => e.name === 'zombie'), 1) } },
  { what: 'a type that is none', key: 'entities', apply: d => { d.entities[0].type = 'monster' } },
  { what: 'a displayName not the language file\'s', key: 'entities', apply: d => { find<any>(d.entities, e => e.name === 'zombie', 'zombie').displayName = 'Walker' } },
  // effects.json
  { what: 'good made bad', key: 'effects', apply: d => { find<any>(d.effects, e => e.name === 'Speed', 'Speed').type = 'bad' } },
  { what: 'an effect gone', key: 'effects', apply: d => { d.effects.pop() } },
  { what: 'an id moved', key: 'effects', apply: d => { find<any>(d.effects, e => e.name === 'Speed', 'Speed').id = 99 } },
  // enchantments.json
  { what: 'a weight not its frequency\'s', key: 'enchantments', apply: d => { find<any>(d.enchantments, e => e.name === 'protection', 'protection').weight = 1 } },
  { what: 'an exclusion that is no enchantment', key: 'enchantments', apply: d => { d.enchantments[0].exclude.push('super_sharpness') } },
  { what: 'an exclusion one way', key: 'enchantments', apply: d => { find<any>(d.enchantments, e => e.name === 'protection', 'protection').exclude = [] } },
  { what: 'a max level not the server\'s', key: 'enchantments', apply: d => { d.enchantments[0].maxLevel = 9 } },
  { what: 'a cost not the server\'s', key: 'enchantments', apply: d => { d.enchantments[0].minCost.b += 1 } },
  // foods.json
  { what: 'food points not the server\'s', key: 'foods', since: '1.21.60', apply: d => { find<any>(d.foods, f => f.name === 'apple', 'apple').foodPoints = 5 } },
  { what: 'a saturation not points x ratio', key: 'foods', apply: d => { find<any>(d.foods, f => f.name === 'apple', 'apple').saturation = 3 } },
  { what: 'a ratio no modifier gives', key: 'foods', apply: d => { find<any>(d.foods, f => f.name === 'apple', 'apple').saturationRatio = 0.7 } },
  { what: 'a food that is no item', key: 'foods', apply: d => { d.foods[0].name = 'unobtainium' } },
  { what: 'a food gone', key: 'registry', apply: d => { d.foods.pop() } },
  { what: 'an id not its item\'s', key: 'foods', apply: d => { d.foods[0].id += 1 } },
  // entityLoot.json
  { what: 'a drop that is no item', key: 'entityLoot', apply: d => { find<any>(d.entityLoot, l => l.drops.length, 'loot').drops[0].item = 'unobtainium' } },
  { what: 'an entity gone', key: 'entityLoot', apply: d => { d.entityLoot.pop() } },
  { what: 'a stack size range backwards', key: 'entityLoot', apply: d => { find<any>(d.entityLoot, l => l.drops.length, 'loot').drops[0].stackSizeRange = [3, 1] } },
  { what: 'a chance above 1', key: 'entityLoot', apply: d => { find<any>(d.entityLoot, l => l.drops.length, 'loot').drops[0].dropChance = 2 } },
  // attributes.json
  { what: 'a default not the server\'s', key: 'attributes', apply: d => { find<any>(d.attributes, a => a.name === 'health', 'health').default = 10 } },
  { what: 'an attribute gone', key: 'attributes', apply: d => { d.attributes.pop() } },
  // language.json
  { what: 'an effect\'s name gone', key: 'language', apply: d => { delete d.language['potion.moveSpeed'] } },
  { what: 'most of it gone', key: 'language', apply: d => { d.language = Object.fromEntries(Object.entries(d.language).slice(0, 100)) } },
  { what: 'an item name not the language file\'s', key: 'items', apply: d => { item(d, 'diamond').displayName = 'Gem' } },
  // what the server's packs and language file say (where the server is there)
  { what: 'a string not the server\'s', key: 'language', packs: true, apply: d => { d.language['potion.moveSpeed'] = 'Fast' } },
  { what: 'a key the server does not have', key: 'language', packs: true, apply: d => { d.language['bogus.key'] = 'x' } },
  { what: 'a hitbox not its definition\'s', key: 'entities', packs: true, apply: d => { find<any>(d.entities, e => e.name === 'zombie', 'zombie').height = 3 } },
  { what: 'a drop chance not its loot table\'s', key: 'entityLoot', packs: true, apply: d => { find<any>(d.entityLoot, l => l.entity === 'zombie', 'zombie').drops[0].dropChance = 0.123 } },
  // steve.json
  { what: 'an image short', key: 'steve', apply: d => { d.steve.SkinData = d.steve.SkinData.slice(0, 1000) } },
  { what: 'a real persona id', key: 'steve', apply: d => { if (!d.steve.PersonaSkin) d.steve.PersonaSkin = true; d.steve.SkinId = 'persona-437vsr5lh19kek5q-3' } },
  { what: 'a field more', key: 'steve', apply: d => { d.steve.Extra = 1 } }
]

for (const v of ['1.16.201', '1.20.80', '1.21.50', '1.26.51']) {
  describe(`${v}: the validation catches`, () => {
    const b = build(v)
    test('nothing, unbroken', () => {
      const { files } = copy(v)
      assert.equal(formatProblems(validateVersion(b, paths, files)), '')
    })
    for (const c of CASES) {
      if (c.since && compareVersions(v, c.since) < 0) continue
      if (c.packs && !server(b).language()) continue
      test(`${c.key}: ${c.what}`, () => {
        const { data, files } = copy(v)
        c.apply(data)
        const problems = validateVersion(b, paths, files)
        assert.ok(problems.some(p => p.key === c.key), `no ${c.key} problem; got: ${formatProblems(problems) || 'none'}`)
      })
    }
    test('dataPaths: a file with no path', () => {
      const { files } = copy(v)
      const broken = structuredClone(paths)
      delete broken.bedrock[v].materials
      assert.ok(validateVersion(b, broken, files).some(p => p.key === 'materials'))
    })
  })
}
