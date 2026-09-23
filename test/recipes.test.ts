// data/<build>/recipes.json, for every build: what its packets say (made again from packets.nbt, the same),
// every recipe craftable with the build's item data (validate/recipes.ts), the recipes a player knows there;
// and the validation catches what it is for.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { compareVersions, dataFile, versions } from '../src/config.ts'
import { recipesJson, recipesOf, type Recipes } from '../src/mcdata/craft.ts'
import { itemTags, itemsOf, recipeProblems } from '../src/validate/recipes.ts'

const at = (v: string, since: string) => compareVersions(v, since) >= 0
const read = (b: (typeof versions)[number]): Recipes => JSON.parse(readFileSync(dataFile(b, 'recipes.json'), 'utf8'))

describe('recipes.json: the packets\' recipes, all craftable', () => {
  for (const b of versions) {
    test(b.mcDataVersion, () => {
      const text = readFileSync(dataFile(b, 'recipes.json'), 'utf8').replace(/\r\n/g, '\n')
      assert.equal(text, recipesJson(recipesOf(b)), 'not what packets.nbt gives (pnpm recipes)')
      assert.deepEqual(recipeProblems(b, JSON.parse(text)), [])
    })
  }
})

describe('recipes a player knows', () => {
  for (const b of versions) {
    test(b.mcDataVersion, () => {
      const v = b.mcDataVersion
      const r = read(b)
      const tags = itemTags(b)
      let complex: Record<string, string[]> = {}
      try { complex = JSON.parse(readFileSync(dataFile(b, 'complex_aliases.json'), 'utf8')) } catch {}
      const makes = (name: string, block = 'crafting_table') => r.recipes.filter(x => x.block === block && x.output?.some(o => o.name === name))
      const takes = (x: (typeof r.recipes)[number], item: string) => (x.input ?? []).some(i => i && itemsOf(i, tags, complex, () => true).includes(item))

      // sticks: 4 from two planks, any planks (one item, minecraft:planks, before 1.20.50)
      const planks = at(v, '1.20.50') ? 'minecraft:oak_planks' : 'minecraft:planks'
      const sticks = makes('minecraft:stick')
      assert.ok(sticks.some(x => x.output![0].count === 4 && takes(x, planks)), `${v}: no sticks from planks`)
      // the crafting table from 4 planks, a 2 x 2 grid
      assert.ok(makes('minecraft:crafting_table').some(x => x.type === 'shaped' && x.width === 2 && x.height === 2), `${v}: no crafting table`)
      // a furnace from 8 cobblestone, a chest from 8 planks
      assert.ok(makes('minecraft:furnace').some(x => x.input!.filter(i => i && itemsOf(i, tags, complex).includes('minecraft:cobblestone')).length === 8), `${v}: no furnace`)
      assert.ok(makes('minecraft:chest').length, `${v}: no chest`)
      // tools of every tier
      for (const tool of ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'iron_sword', 'bow', 'shears']) assert.ok(makes(`minecraft:${tool}`).length, `${v}: no ${tool}`)
      // smelting: iron ore to an ingot in a furnace and a blast furnace, beef in a smoker
      for (const block of ['furnace', 'blast_furnace']) assert.ok(r.recipes.some(x => x.type === 'furnace' && x.block === block && x.output![0].name === 'minecraft:iron_ingot' && takes(x, 'minecraft:iron_ore')), `${v}: no iron in a ${block}`)
      assert.ok(r.recipes.some(x => x.type === 'furnace' && x.block === 'smoker' && x.output![0].name === 'minecraft:cooked_beef'), `${v}: no smoker beef`)
      // the stonecutter, the smithing table (netherite from 1.16), brewing
      assert.ok(r.recipes.some(x => x.block === 'stonecutter'), `${v}: no stonecutter recipe`)
      // the smithing table's upgrades: recipes the server sends from 1.18.11 (before, the game does them in code)
      if (at(v, '1.18.11')) assert.ok(makes('minecraft:netherite_pickaxe', 'smithing_table').length, `${v}: no netherite pickaxe`)
      else assert.ok(!r.recipes.some(x => x.block === 'smithing_table'), `${v}: smithing recipes before 1.18.11`)
      assert.ok(r.potions.length > 100 && r.potionContainers.length === 2, `${v}: brewing ${r.potions.length} / ${r.potionContainers.length}`)
      // the game's special recipes (firework, map cloning, repair, ...)
      assert.ok(r.recipes.filter(x => x.type === 'multi').length >= 12, `${v}: multi recipes`)
      // the tags the recipes name: planks and logs, where they are tags
      if (r.recipes.some(x => x.input?.some(i => i && 'tag' in i && i.tag === 'minecraft:planks'))) assert.ok(tags.get('minecraft:planks')!.includes(planks), `${v}: the planks tag`)
    })
  }
})

describe('the recipe validation catches', () => {
  const b = versions.find(x => x.mcDataVersion === '1.26.51')!
  const fresh = () => JSON.parse(readFileSync(dataFile(b, 'recipes.json'), 'utf8')) as Recipes
  const cases: [string, (r: Recipes) => void][] = [
    ['an ingredient that is no item', r => { r.recipes.find(x => x.type === 'shaped')!.input![0] = { name: 'minecraft:unobtainium', count: 1 } }],
    ['a tag no item carries', r => { r.recipes.find(x => x.type === 'shaped')!.input![0] = { tag: 'minecraft:nothing', count: 1 } }],
    ['an alias of no items', r => { r.recipes.find(x => x.type === 'shaped')!.input![0] = { alias: 'minecraft:nothing', count: 1 } }],
    ['an output that is no item', r => { r.recipes.find(x => x.type === 'shaped')!.output![0].name = 'minecraft:unobtainium' }],
    ['a network id twice', r => { r.recipes[1].networkId = r.recipes[0].networkId }],
    ['a grid not its size', r => { r.recipes.find(x => x.type === 'shaped')!.width = 1 }],
    ['a station there is none of', r => { r.recipes.find(x => x.type === 'shaped')!.block = 'workbench' }],
    ['a block state not of its hash', r => { const o = r.recipes.flatMap(x => x.output ?? []).find(o => o.blockStateHash !== undefined)!; o.blockStateId = o.blockStateId! + 1 }],
    ['a shapeless recipe of no items', r => { r.recipes.find(x => x.type === 'shapeless')!.input = [] }],
    ['a network id out of 1 to n', r => { r.recipes.find(x => x.networkId !== undefined)!.networkId = 999999 }]
  ]
  test('nothing, unbroken', () => assert.deepEqual(recipeProblems(b, fresh()), []))
  for (const [what, apply] of cases) {
    test(what, () => {
      const r = fresh()
      apply(r)
      assert.ok(recipeProblems(b, r).length > 0)
    })
  }
})
