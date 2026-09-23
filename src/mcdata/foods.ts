// foods.json of a build: every item the server says is food, by the version's items.json, in pc's form. The
// server says it in its item registry (each item's minecraft:food component, sent from 1.21.60), else in
// the item definitions of its behavior packs (their minecraft:food component: the saturation modifier a
// number, or before 1.20 one of the game's names for one). Bedrock's saturation, as Java's: nutrition *
// modifier * 2; pc calls the modifier * 2 the saturationRatio.
import nbt from 'prismarine-nbt'
import type { Build } from '../config.ts'
import { itemAliases } from './entityLoot.ts'
import { f32 } from './format.ts'
import { itemStates } from './items.ts'
import { behaviorPackDefinitions } from './packs.ts'

/** The game's named saturation modifiers (FoodSaturationModifier). */
const MODIFIERS: Record<string, number> = { poor: 0.1, low: 0.3, normal: 0.6, good: 0.8, max: 1, supernatural: 1.2 }

export interface Food { nutrition: number, modifier: number }

const bare = (n: string): string => n.replace(/^minecraft:/, '')

/** Each food item's nutrition and saturation modifier, by item name, and where the server says it. */
export function serverFoods (b: Build): { source: 'registry' | 'behavior packs', foods: Map<string, Food> } {
  const states = itemStates(b)
  const names = new Set(states.map(s => bare(s.name)))
  const fromRegistry = new Map<string, Food>()
  for (const s of states) {
    const food = s.nbt ? (nbt.simplify(s.nbt as any) as any)?.components?.['minecraft:food'] : undefined
    if (food) fromRegistry.set(bare(s.name), { nutrition: food.nutrition, modifier: f32(food.saturation_modifier) })
  }
  if (fromRegistry.size) return { source: 'registry', foods: fromRegistry }
  // the packs name some items by an older id (appleEnchanted, muttonCooked, clownfish): the item's name in
  // lower case, else the item it is an alias of
  const aliases = itemAliases(b)
  const out = new Map<string, Food>()
  for (const [id, def] of behaviorPackDefinitions(b, 'items', j => j['minecraft:item']?.description?.identifier)) {
    const food = def['minecraft:item']?.components?.['minecraft:food']
    if (!food) continue
    const lower = bare(id).toLowerCase()
    const name = names.has(bare(id)) ? bare(id) : names.has(lower) ? lower : aliases[lower]
    if (name === undefined || !names.has(name)) throw new Error(`foods: the packs' ${id} is no item of the registry`)
    const modifier = typeof food.saturation_modifier === 'number' ? food.saturation_modifier : MODIFIERS[food.saturation_modifier]
    if (modifier === undefined) throw new Error(`foods: ${id} has the saturation modifier ${food.saturation_modifier}`)
    out.set(name, { nutrition: food.nutrition, modifier })
  }
  return { source: 'behavior packs', foods: out }
}

/** A number as it is written: without the float noise of a product (4 * 0.6 = 2.4). */
const round = (x: number): number => Number(x.toFixed(6))

/** foods.json: the version's food items in items.json order. */
export function foods (b: Build, items: any[]): any[] {
  const { foods: own } = serverFoods(b)
  const out: any[] = []
  for (const i of items) {
    const f = own.get(i.name)
    if (!f) continue
    const saturationRatio = round(f.modifier * 2)
    const saturation = round(f.nutrition * saturationRatio)
    out.push({ id: i.id, name: i.name, stackSize: i.stackSize, displayName: i.displayName, foodPoints: f.nutrition, saturation, effectiveQuality: round(f.nutrition + saturation), saturationRatio })
  }
  const missing = [...own.keys()].filter(n => !items.some(i => i.name === n))
  if (missing.length) throw new Error(`foods: no item in items.json for ${missing.join(', ')}`)
  return out
}

export const foodsJson = (list: any[]): string => JSON.stringify(list, null, 2)
