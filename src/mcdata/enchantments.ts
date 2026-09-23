// enchantments.json of a build: every enchantment the server has (enchantments.json, exported by the agent),
// by its Bedrock id. From the server: id, name (its string id), displayName (the language file's), maxLevel,
// minCost / maxCost (the line through its costs at levels 1 and 2, checked on every level), weight (its
// rarity: Bedrock's frequencies 30 / 10 / 3 / 1 in minecraft-data's Java scale, 10 / 5 / 2 / 1), tradeable, exclude (the enchantments of its compatibility group, 0 being none). From the Java
// enchantment of the same name (binding_curse, vanishing_curse for binding, vanishing) where there is one,
// what the game decides in code: category, treasureOnly, curse, discoverable, and the exclusions it adds
// (channeling / riptide, multishot / piercing) between enchantments Bedrock has.
import { readFileSync } from 'node:fs'
import { dataFile, type Build } from '../config.ts'

interface ServerEnchantment {
  id: number, name: string, descriptionId: string, frequency: number, tradeable: boolean, primarySlots: number,
  compatibility: number, maxLevel: number, minCost: number[], maxCost: number[]
}

const WEIGHTS: Record<number, number> = { 30: 10, 10: 5, 3: 2, 1: 1 }
const JAVA_NAMES: Record<string, string> = { binding: 'binding_curse', vanishing: 'vanishing_curse' }
/** A category for an enchantment Java does not have, by the item slots it applies to (EnchantSlot bits). */
const SLOT_CATEGORIES: [number, string][] = [
  [0xf, 'armor'], [0x1, 'armor_head'], [0x2, 'armor_chest'], [0x4, 'armor_feet'], [0x8, 'armor_legs'], [0x20, 'bow'],
  [0x1000, 'fishing_rod'], [0x8000, 'trident'], [0x10000, 'crossbow'], [0x400000, 'mace'], [0x800000, 'melee_spear']
]

function line (costs: number[], maxLevel: number, what: string): { a: number, b: number } {
  const a = costs[1] - costs[0], b = costs[0] - a
  for (let level = 1; level <= maxLevel; level++) {
    if (costs[level - 1] !== a * level + b) throw new Error(`enchantments: ${what} is not a line in the level (${costs.join(', ')})`)
  }
  return { a, b }
}

export function enchantments (b: Build, lang: Record<string, string>, javaEnchantments: any[]): any[] {
  const list: ServerEnchantment[] = JSON.parse(readFileSync(dataFile(b, 'enchantments.json'), 'utf8'))
  const javaByName = new Map(javaEnchantments.map(e => [e.name, e]))
  const toJava = (name: string) => JAVA_NAMES[name] ?? name
  const bedrockNames = new Set(list.map(e => toJava(e.name)))
  return list.map(e => {
    const displayName = lang[e.descriptionId]?.trim()
    if (!displayName) throw new Error(`enchantments: no name for ${e.descriptionId}`)
    const java = javaByName.get(toJava(e.name))
    const exclude = new Set(list.filter(o => o !== e && e.compatibility !== 0 && o.compatibility === e.compatibility).map(o => o.name))
    for (const x of java?.exclude ?? []) {
      const own = list.find(o => toJava(o.name) === x)
      if (own && bedrockNames.has(x)) exclude.add(own.name)
    }
    const category = java?.category ?? SLOT_CATEGORIES.find(([bits]) => e.primarySlots === bits)?.[1] ?? 'breakable'
    return {
      id: e.id,
      name: e.name,
      displayName,
      maxLevel: e.maxLevel,
      minCost: line(e.minCost, e.maxLevel, `${e.name} min cost`),
      maxCost: line(e.maxCost, e.maxLevel, `${e.name} max cost`),
      treasureOnly: java?.treasureOnly ?? false,
      curse: java?.curse ?? false,
      exclude: [...exclude],
      category,
      weight: WEIGHTS[e.frequency] ?? (() => { throw new Error(`enchantments: ${e.name} has frequency ${e.frequency}`) })(),
      tradeable: e.tradeable,
      discoverable: java?.discoverable ?? e.frequency > 0
    }
  })
}

export const enchantmentsJson = (list: any[]): string => JSON.stringify(list, null, 2)
