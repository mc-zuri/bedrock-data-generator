// What the game is known to do, in every version: the values a player sees (stone's hardness, what harvests
// obsidian, how long stone takes with a diamond pickaxe, a pearl's stack size, what a zombie drops) and the
// ids Bedrock has fixed (effects, enchantments, biomes, entity types). A generator change that makes any of
// them wrong in any version fails here, whatever the validators allow.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { compareVersions } from '../src/config.ts'
import { ORDER } from '../src/validate/registry.ts'
import { files } from './helpers.ts'

const at = (v: string, since: string) => compareVersions(v, since) >= 0

function world (v: string) {
  const f = files(v)
  const blocks: any[] = f('blocks'), items: any[] = f('items')
  const block = (...names: string[]) => {
    const b = blocks.find(x => names.includes(x.name))
    assert.ok(b, `${v}: no block ${names.join(' / ')}`)
    return b
  }
  const item = (name: string) => {
    const i = items.find(x => x.name === name)
    assert.ok(i, `${v}: no item ${name}`)
    return i
  }
  const itemName = new Map<number, string>(items.map(i => [i.id, i.name]))
  const tools = (b: any) => Object.keys(b.harvestTools ?? {}).map(id => itemName.get(Number(id))).sort()
  /** how long a block takes to break holding `tool` (none: by hand), in ms, as prismarine-block works it out */
  const digTime = (b: any, tool?: string) => {
    const id = tool === undefined ? undefined : item(tool).id
    const speed = (id !== undefined && f('materials')[b.material]?.[id]) || 1
    const harvests = !b.harvestTools || (id !== undefined && b.harvestTools[id])
    const damage = speed / b.hardness / (harvests ? 30 : 100)
    return damage > 1 ? 0 : Math.ceil(1 / damage) * 50
  }
  return { f, block, item, tools, digTime }
}

describe('blocks', () => {
  for (const v of ORDER) {
    test(v, () => {
      const { block, item, tools, digTime } = world(v)
      const stone = block('stone')
      assert.equal(stone.hardness, 1.5)
      assert.equal(stone.resistance, 6)
      assert.equal(stone.material, 'mineable/pickaxe')
      assert.deepEqual(stone.drops, [item('cobblestone').id])
      assert.ok(tools(stone).includes('wooden_pickaxe'), 'a wooden pickaxe harvests stone')
      assert.equal(digTime(stone, 'diamond_pickaxe'), 300)
      assert.equal(digTime(stone, 'wooden_pickaxe'), 1150)
      assert.equal(digTime(stone), 7500, 'stone by hand')

      const obsidian = block('obsidian')
      assert.equal(obsidian.hardness, 35, 'Bedrock obsidian (Java: 50)')
      assert.deepEqual(tools(obsidian), ['diamond_pickaxe', 'netherite_pickaxe'].filter(t => t !== 'netherite_pickaxe' || at(v, '1.16.0')))
      assert.equal(digTime(obsidian, 'diamond_pickaxe'), 6600)
      // not harvested: an iron pickaxe breaks it at a third of the speed
      assert.equal(digTime(obsidian, 'iron_pickaxe'), 29200)

      const iron = block('iron_ore')
      assert.ok(tools(iron).includes('stone_pickaxe') && !tools(iron).includes('wooden_pickaxe'), 'iron ore needs a stone pickaxe')
      const diamond = block('diamond_ore')
      assert.ok(tools(diamond).includes('iron_pickaxe') && !tools(diamond).includes('stone_pickaxe'), 'diamond ore needs an iron pickaxe')

      const dirt = block('dirt')
      assert.equal(dirt.material, 'mineable/shovel')
      assert.equal(dirt.harvestTools, undefined)
      assert.ok(digTime(dirt, 'iron_shovel') < digTime(dirt))

      const leaves = block('oak_leaves', 'leaves')
      assert.ok(leaves.material.split(';').includes('leaves') && leaves.material.includes('mineable/hoe'), leaves.material)
      assert.ok(digTime(leaves, 'shears') < digTime(leaves))

      const web = block('web', 'cobweb')
      assert.ok(tools(web).includes('shears') && tools(web).includes('iron_sword'), tools(web).join())
      assert.equal(digTime(web, 'shears'), 400)

      const log = block('oak_log', 'log')
      assert.ok(log.material.includes('mineable/axe'))
      assert.equal(log.harvestTools, undefined)

      assert.equal(block('glowstone').emitLight, 15)
      assert.equal(block('air').boundingBox, 'empty')
      assert.equal(block('bedrock').diggable, false)
      assert.equal(block('bedrock').hardness, -1)
      assert.equal(block('glass').transparent, true)
      assert.equal(block('water', 'flowing_water').diggable, false)
    })
  }
})

describe('block states', () => {
  for (const v of ORDER) {
    test(v, () => {
      const states: any[] = files(v)('blockStates')
      const of = (name: string) => states.filter(s => s.name === name)
      assert.equal(of('air').length, 1)
      const piston = of('piston')
      assert.deepEqual([...new Set(piston.map(s => s.states.facing_direction.value))].sort(), [0, 1, 2, 3, 4, 5])
      const wheat = of('wheat')
      assert.deepEqual(wheat.map(s => s.states.growth.value), [0, 1, 2, 3, 4, 5, 6, 7])
      // stone's variants were their own blocks from 1.20.50
      if (at(v, '1.20.50')) assert.equal(of('stone').length, 1)
      else assert.ok(of('stone').some(s => s.states.stone_type?.value === 'granite'))
    })
  }
})

describe('items', () => {
  for (const v of ORDER) {
    test(v, () => {
      const { item } = world(v)
      const pick = item('diamond_pickaxe')
      assert.equal(pick.stackSize, 1)
      assert.equal(pick.maxDurability, 1561)
      assert.deepEqual(pick.repairWith, ['diamond'])
      assert.ok(pick.enchantCategories?.length)
      assert.equal(item('wooden_pickaxe').maxDurability, 59)
      assert.equal(item('netherite_pickaxe').maxDurability, 2031)
      assert.equal(item('elytra').maxDurability, 432)
      for (const n of ['ender_pearl', 'egg', 'snowball', 'bucket']) assert.equal(item(n).stackSize, 16, n)
      for (const n of ['water_bucket', 'diamond_sword', 'elytra']) assert.equal(item(n).stackSize, 1, n)
      for (const n of ['stone', 'diamond', 'stick']) assert.equal(item(n).stackSize, 64, n)
      assert.equal(item('apple').maxDurability, undefined)
      assert.equal(item('diamond').displayName, 'Diamond')
    })
  }
})

describe('fixed ids', () => {
  const ENCHANTMENTS = ['protection', 'fire_protection', 'feather_falling', 'blast_protection', 'projectile_protection', 'thorns', 'respiration', 'depth_strider', 'aqua_affinity', 'sharpness', 'smite', 'bane_of_arthropods', 'knockback', 'fire_aspect', 'looting', 'efficiency', 'silk_touch', 'unbreaking', 'fortune', 'power', 'punch', 'flame', 'infinity', 'luck_of_the_sea', 'lure', 'frost_walker', 'mending', 'binding', 'vanishing', 'impaling', 'riptide', 'loyalty', 'channeling', 'multishot', 'piercing', 'quick_charge', 'soul_speed']
  const EFFECTS: [number, string, string][] = [[1, 'Speed', 'good'], [2, 'Slowness', 'bad'], [3, 'Haste', 'good'], [6, 'InstantHealth', 'good'], [7, 'InstantDamage', 'bad'], [10, 'Regeneration', 'good'], [19, 'Poison', 'bad'], [20, 'Wither', 'bad'], [25, 'FatalPoison', 'bad'], [26, 'ConduitPower', 'good']]
  const ENTITIES: [string, number][] = [['chicken', 10], ['cow', 11], ['pig', 12], ['sheep', 13], ['zombie', 32], ['creeper', 33], ['skeleton', 34], ['spider', 35]]
  const BIOMES: [string, number, string][] = [['ocean', 0, 'overworld'], ['plains', 1, 'overworld'], ['desert', 2, 'overworld'], ['forest', 4, 'overworld'], ['river', 7, 'overworld'], ['hell', 8, 'nether'], ['the_end', 9, 'end']]
  for (const v of ORDER) {
    test(v, () => {
      const f = files(v)
      const ench = new Map(f('enchantments').map((e: any) => [e.name, e.id]))
      ENCHANTMENTS.forEach((name, id) => assert.equal(ench.get(name), id, name))
      for (const [id, name, type] of EFFECTS) {
        const e = f('effects').find((x: any) => x.id === id)
        assert.deepEqual([e?.name, e?.type], [name, type], `effect ${id}`)
      }
      for (const [name, rid] of ENTITIES) assert.equal(f('entities').find((e: any) => e.name === name)?.internalId, rid, name)
      for (const [name, id, dimension] of BIOMES) {
        const b = f('biomes').find((x: any) => x.name === name)
        assert.ok(b, name)
        assert.deepEqual([b.id, b.dimension], [id, dimension], name)
      }
    })
  }
})

describe('entity loot', () => {
  for (const v of ORDER) {
    test(v, () => {
      const loot = new Map<string, string[]>(files(v)('entityLoot').map((l: any) => [l.entity, l.drops.map((d: any) => d.item)]))
      assert.ok(loot.get('zombie')?.includes('rotten_flesh'))
      assert.ok(loot.get('cow')?.includes('leather') && loot.get('cow')?.includes('beef'))
      assert.ok(loot.get('chicken')?.includes('feather'))
      assert.ok(loot.get('skeleton')?.includes('bone'))
      assert.deepEqual(loot.get('villager_v2') ?? [], [])
    })
  }
})

describe('foods', () => {
  for (const v of ORDER) {
    test(v, () => {
      const foods = new Map<string, any>(files(v)('foods').map((f: any) => [f.name, f]))
      const is = (name: string, points: number, saturation: number) => {
        const f = foods.get(name)
        assert.ok(f, `${v}: no food ${name}`)
        assert.deepEqual([f.foodPoints, f.saturation], [points, saturation], name)
      }
      is('apple', 4, 2.4)
      is('golden_apple', 4, 9.6)
      is('cooked_beef', 8, 12.8)
      is('bread', 5, 6)
      is('rotten_flesh', 4, 0.8)
      is('golden_carrot', 6, 14.4)
      is('sweet_berries', 2, 1.2)
      // the older builds name them by their older ids
      is(foods.has('enchanted_golden_apple') ? 'enchanted_golden_apple' : 'appleenchanted', 4, 9.6)
      is(foods.has('cooked_mutton') ? 'cooked_mutton' : 'muttoncooked', 6, 9.6)
      assert.ok(!foods.has('stick') && !foods.has('cake'))
      assert.ok(foods.size >= 39, `${v}: ${foods.size} foods`)
    })
  }
})

describe('attributes', () => {
  for (const v of ORDER) {
    test(v, () => {
      const a = new Map<string, any>(files(v)('attributes').map((x: any) => [x.name, x]))
      assert.deepEqual([a.get('health')?.default, a.get('health')?.max], [20, 20])
      assert.equal(Math.fround(a.get('movement')?.default), Math.fround(0.1))
      assert.deepEqual([a.get('playerHunger')?.default, a.get('playerHunger')?.max], [20, 20])
    })
  }
})
