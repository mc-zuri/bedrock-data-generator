// foods.json: every item a player eats, with items.json's id, name, displayName and stackSize, and its food as the server
// sends its minecraft:food component (items.json.gz: the item registry's from 1.21.60, item_component's from 1.18.11),
// or before 1.18.11, as its legacy food component has it:
// - foodPoints: its nutrition;
// - saturationRatio: twice its saturation modifier, and saturation: foodPoints times that, in floats as the game adds
//   them to a player's saturation (nutrition * modifier * 2), as minecraft-data has Java's;
// - effectiveQuality: foodPoints + saturation.
// A build whose server says neither has no file.
import nbt from 'prismarine-nbt'
import type { BedrockData, Item as RegistryItem } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { items, type Item } from './items.ts'
import { canonical, f32, withoutNamespace } from './utils/json.ts'

export interface Food {
  id: number
  name: string
  stackSize: number
  displayName: string
  foodPoints: number
  saturation: number
  effectiveQuality: number
  saturationRatio: number
}

interface ItemFood {
  /** "minecraft:apple" */
  name: string
  nutrition: number
  saturationModifier: number
}

/** Each food as the server says it: the components it sends (the item registry's, else item_component's), else the legacy ones. */
function itemFoods(registry: RegistryItem[]): ItemFood[] {
  const withNbt = registry.filter((i) => i.nbt !== undefined)
  const sentComponents = withNbt.length
    ? withNbt.map((i) => [i.name, i.nbt] as const)
    : registry.flatMap((i) => (i.components === undefined ? [] : [[i.name, i.components] as const]))
  const sent = sentComponents.flatMap(([name, tag]) => {
    const { components } = nbt.simplify(tag as nbt.NBT) as { components?: Record<string, unknown> }
    const food = components?.['minecraft:food'] as { nutrition?: unknown; saturation_modifier?: unknown } | undefined

    if (food === undefined) {
      return []
    }

    const { nutrition, saturation_modifier: saturationModifier } = food

    if (typeof nutrition !== 'number' || typeof saturationModifier !== 'number') {
      throw new Error(`${name}: a minecraft:food without nutrition or saturation_modifier`)
    }

    return [{ name, nutrition, saturationModifier }]
  })

  if (sent.length) {
    return sent
  }

  return registry.flatMap(({ name, food }) => (food ? [{ name, ...food }] : []))
}

function foodsJson(data: BedrockData, build: string, committed?: (key: string) => string | undefined): Food[] {
  const byName = new Map((JSON.parse(items.json(data, build, committed)) as Item[]).map((i) => [i.name, i]))
  return itemFoods(data.items(build).items)
    .map(({ name, nutrition, saturationModifier: written }) => {
      const item = byName.get(withoutNamespace(name))

      if (!item) {
        throw new Error(`${name}: no item`)
      }

      // the float the game multiplies by (bedrock-data writes a legacy one as its shortest decimal)
      const saturationModifier = Math.fround(written)
      const saturation = Math.fround(Math.fround(nutrition * saturationModifier) * 2)
      return {
        id: item.id,
        name: item.name,
        stackSize: item.stackSize,
        displayName: item.displayName,
        foodPoints: nutrition,
        saturation: f32(saturation),
        effectiveQuality: f32(Math.fround(nutrition + saturation)),
        saturationRatio: f32(Math.fround(saturationModifier * 2)),
      }
    })
    .sort((a, b) => a.id - b.id)
}

export const foods: Generator = {
  key: 'foods',
  after: ['items'],
  has: (data, build) => items.has(data, build),
  says: (data, build) => itemFoods(data.items(build).items).length > 0,
  json(data, build, committed) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(foodsJson(data, build, committed), null, 2)
  },
  meaning: canonical,
}
