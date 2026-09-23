// What digs a block and how fast: blocks.json's `material` and `harvestTools`, and materials.json (each
// material's tool speeds), all by the Bedrock item ids of the version's items.json.
//
// From the server where it says it (block_types.json, exported by the agent):
// - which tools dig a block: its minecraft:is_<tool>_item_destructible tags (from 1.21.50);
// - the tier a pickaxe needs: its <tier>_tier_destructible tags (from 1.21.50; the older <tier>_pick_diggable
//   do not tell it: iron and diamond ore carry the same ones);
// - whether it drops only with the right tool: its requiresCorrectToolForDrops (from 1.21.50).
// As the game uses them (DiggerItem::getDestroySpeed / canDestroySpecial, see bedrock-engine-v4's
// DigItems.cs): a digger mines at its tier's speed a block carrying its tool's tag, and harvests it if its
// tier's level passes the first tier tag the block has (stone > 0, iron > 1, diamond > 2, netherite > 3).
// From the Java block (the Geyser map) where the server does not say it: the tools and the tier before
// 1.21.50, whether a tool is needed before 1.21.50, and which parts of a material no digger makes it has
// (leaves, wool, cobweb, plants). Those parts' speeds are the game's, PARTS below, not a Java materials.json
// (the Java data has shears at 1 in several versions).
/** ItemTier: speed, level (VanillaItemTiers; the same rows DigItems.cs reads from the image). */
const TIERS: [string, number, number][] = [
  ['wooden', 2, 0], ['stone', 4, 1], ['copper', 5, 1], ['iron', 6, 2], ['golden', 12, 0], ['diamond', 8, 3], ['netherite', 9, 4]
]
/**
 * The speeds of the parts of a material no digger makes, by swords and shears. Swords as WeaponItem::
 * getDestroySpeed has them (DigItems.cs: 15 on cobweb, 30 on bamboo, 1.5 on plants and leaves); shears as
 * ShearsItem's (15 on cobweb and leaves, 5 on wool, 2 on vines), the same as Java's.
 */
const PARTS: Record<string, { sword?: number, shears?: number }> = {
  leaves: { sword: 1.5, shears: 15 },
  coweb: { sword: 15, shears: 15 },
  plant: { sword: 1.5 },
  gourd: { sword: 1.5 },
  vine_or_glow_lichen: { shears: 2 },
  wool: { shears: 5 },
  sword_efficient: { sword: 1.5 },
  sword_instantly_mines: { sword: 30 }
}
/** The diggers, in the order a material's name lists them. */
const FAMILIES = ['axe', 'hoe', 'pickaxe', 'shovel'] as const
type Family = (typeof FAMILIES)[number]
/** The tier tags in DiggerItem::canDestroySpecial's order, with the level a digger must pass. */
const TIER_GATES: [string, number][] = [['stone', 0], ['iron', 1], ['diamond', 2], ['netherite', 3]]
/** Java material names before 1.17, as the later ones call them. */
const JAVA_ALIASES: Record<string, string> = {
  rock: 'mineable/pickaxe', wood: 'mineable/axe', dirt: 'mineable/shovel', web: 'coweb', melon: 'gourd', UNKNOWN_MATERIAL: 'default',
  // and after 1.26.2 (wool stairs and slabs)
  shears_major_breaking_speed: 'wool'
}

export interface BlockType { tags?: string[], requiresCorrectToolForDrops?: boolean }
export interface Dig { material: string, harvestTools?: Record<string, true> }
export interface DigInput {
  /** block_types.json, by name without minecraft: */
  types: Record<string, BlockType>
  /** the version's items.json */
  items: { id: number, name: string }[]
  /** the Java block a Bedrock block maps to */
  javaBlock: (name: string) => { material?: string, harvestTools?: Record<string, boolean> } | undefined
  /** the Java items.json of the build's Java version (the Java block's harvestTools ids) */
  javaItems: { id: number, name: string }[]
  warn?: (text: string) => void
}

/** Every block's material and harvest tools (by name, without minecraft:), and the materials.json they name. */
export function dig ({ types, items, javaBlock, javaItems, warn = () => {} }: DigInput): { blocks: Map<string, Dig>, materials: Record<string, Record<string, number>> } {
  const itemId = new Map(items.map(i => [i.name, i.id]))
  const javaName = new Map(javaItems.map(i => [i.id, i.name]))
  const tools = (family: string) => TIERS.filter(([tier]) => itemId.has(`${tier}_${family}`)).map(([tier, speed, level]) => ({ id: itemId.get(`${tier}_${family}`)!, speed, level }))
  const swords = () => tools('sword').map(t => t.id)
  const byServer = Object.values(types).some(t => t.tags?.some(tag => /^minecraft:is_\w+_item_destructible$/.test(tag)))

  const blocks = new Map<string, Dig>()
  const materials: Record<string, Record<string, number>> = { default: {} }
  for (const [name, type] of Object.entries(types)) {
    const tags = new Set((type.tags ?? []).map(t => t.replace(/^minecraft:/, '')))
    const java = javaBlock(name)
    const javaParts = (java?.material ?? 'default').split(';').map(p => JAVA_ALIASES[p] ?? p)
    const families: Family[] = byServer
      ? FAMILIES.filter(f => tags.has(`is_${f}_item_destructible`))
      : FAMILIES.filter(f => javaParts.includes(`mineable/${f}`) || (f === 'pickaxe' && javaParts.some(p => /^incorrect_for_\w+_tool$/.test(p))))
    // the parts no digger makes, as Java names them
    const parts = javaParts.filter(p => p !== 'default' && !p.startsWith('mineable/') && !p.startsWith('incorrect_for_'))
    const material = [...parts, ...families.map(f => `mineable/${f}`)].join(';') || 'default'
    if (!(material in materials)) {
      const table: Record<string, number> = {}
      for (const part of parts) {
        const speeds = PARTS[part]
        if (!speeds) throw new Error(`materials.json: no speeds for the Java material ${part} (of ${name})`)
        if (speeds.sword) for (const id of swords()) table[id] = Math.max(table[id] ?? 0, speeds.sword)
        if (speeds.shears && itemId.has('shears')) table[itemId.get('shears')!] = Math.max(table[itemId.get('shears')!] ?? 0, speeds.shears)
      }
      for (const f of families) for (const t of tools(f)) table[t.id] = Math.max(table[t.id] ?? 0, t.speed)
      materials[material] = table
    }

    // the level a digger must pass: the first tier tag's, or below the lowest tier of the Java block's diggers
    const javaLevels = Object.keys(java?.harvestTools ?? {}).flatMap(id => {
      const tier = /^(\w+?)_(axe|hoe|pickaxe|shovel)$/.exec(javaName.get(Number(id)) ?? '')?.[1]
      const row = TIERS.find(([t]) => t === tier)
      return row ? [row[2]] : []
    })
    const gate = byServer ? (TIER_GATES.find(([tier]) => tags.has(`${tier}_tier_destructible`))?.[1] ?? -1) : javaLevels.length ? Math.min(...javaLevels) - 1 : -1
    const requires = type.requiresCorrectToolForDrops ?? java?.harvestTools !== undefined
    const entry: Dig = { material }
    if (requires) {
      const ids = new Set<number>()
      for (const f of families) for (const t of tools(f)) if (t.level > gate) ids.add(t.id)
      // what else harvests it: swords and shears (WeaponItem / ShearsItem::canDestroySpecial), where the
      // server tags it for them, else as the Java block has them
      if (byServer && (tags.has('is_sword_item_destructible') || name === 'web')) for (const id of swords()) ids.add(id)
      if (byServer && tags.has('is_shears_item_destructible') && itemId.has('shears')) ids.add(itemId.get('shears')!)
      for (const id of Object.keys(java?.harvestTools ?? {})) {
        const n = javaName.get(Number(id))
        if (n === undefined || /_(axe|hoe|pickaxe|shovel)$/.test(n)) continue
        if (byServer && /_sword$|^shears$/.test(n)) continue
        const bedrock = itemId.get(n)
        if (bedrock === undefined) warn(`${name}: no Bedrock ${n} to harvest it`)
        else ids.add(bedrock)
      }
      // none (bedrock, command blocks; before 1.21.50 a Java block no Bedrock tool digs): no harvestTools
      if (ids.size) entry.harvestTools = Object.fromEntries([...ids].sort((a, b) => a - b).map(id => [String(id), true as const]))
    }
    blocks.set(name, entry)
  }

  // default first, then as Java's materials.json orders them: the parts, the diggers, the rest as first used
  const order = ['default', ...Object.keys(PARTS), ...FAMILIES.map(f => `mineable/${f}`)]
  const rank = (k: string) => order.includes(k) ? order.indexOf(k) : order.length
  const sorted = Object.fromEntries(Object.keys(materials).map((k, i) => [k, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([k]) => [k, materials[k]]))

  const known = new Set(items.map(i => i.id))
  for (const [name, d] of blocks) for (const id of Object.keys(d.harvestTools ?? {})) if (!known.has(Number(id))) throw new Error(`${name}: harvest tool ${id} is no item`)
  for (const [k, table] of Object.entries(sorted)) for (const id of Object.keys(table)) if (!known.has(Number(id))) throw new Error(`materials.json ${k}: ${id} is no item`)
  return { blocks, materials: sorted }
}

export const materialsJson = (materials: Record<string, Record<string, number>>): string => JSON.stringify(materials, null, 2) + '\n'
