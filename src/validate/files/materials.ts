// materials.json: every material a block of blocks.json has, and only those; each one's speeds exactly what
// its parts give (the game's: a digger of its kind at its tier's speed, swords and shears on the parts no
// digger makes, the fastest where two parts name one item), by the version's item ids.
import { TIERS, sameSet, type Validator } from '../context.ts'

/** The speeds of the parts no digger makes (WeaponItem / ShearsItem::getDestroySpeed). */
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

export const materials: Validator = (data: Record<string, Record<string, number>>, { files, bad }) => {
  const blocks: any[] = files('blocks')
  sameSet(Object.keys(data), ['default', ...blocks.map(b => b.material)], 'materials', bad)
  const itemId = new Map<string, number>()
  for (const i of files('items')) itemId.set(i.name, i.id)
  const tiered = (kind: string) => Object.entries(TIERS).filter(([tier]) => itemId.has(`${tier}_${kind}`)).map(([tier, t]) => [itemId.get(`${tier}_${kind}`)!, t.speed] as const)

  for (const [material, table] of Object.entries(data)) {
    const want: Record<string, number> = {}
    const set = (id: number, speed: number) => { want[id] = Math.max(want[id] ?? 0, speed) }
    for (const part of material === 'default' ? [] : material.split(';')) {
      if (part.startsWith('mineable/')) for (const [id, speed] of tiered(part.slice(9))) set(id, speed)
      else {
        const p = PARTS[part]
        if (!p) { bad(`${material}: no speeds known for ${part}`); continue }
        if (p.sword) for (const [id] of tiered('sword')) set(id, p.sword)
        if (p.shears && itemId.has('shears')) set(itemId.get('shears')!, p.shears)
      }
    }
    for (const [id, speed] of Object.entries(table)) if (want[id] !== speed) bad(`${material}: item ${id} at ${speed}, the game's ${want[id] ?? 'none'}`)
    for (const id of Object.keys(want)) if (!(id in table)) bad(`${material}: item ${id} missing (${want[id]})`)
  }
}
