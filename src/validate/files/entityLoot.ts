// entityLoot.json: one entry per entity of entities.json, in its order; every drop an item of items.json, its
// stack size range low to high; where the server is there, each entity's drops its loot table's.
import { entityLoot as lootOf } from '../../mcdata/entityLoot.ts'
import { sameData, type Validator } from '../context.ts'

export const entityLoot: Validator = (list: any[], { build, server, files, bad }) => {
  const entities: string[] = files('entities').map((e: any) => e.name)
  const order = list.map(l => l.entity)
  if (order.join() !== entities.join()) {
    const missing = entities.filter(n => !order.includes(n)), extra = order.filter(n => !entities.includes(n))
    bad(`entities are not entities.json's in its order${missing.length ? `: missing ${missing.slice(0, 8).join(', ')}` : ''}${extra.length ? `; no entity ${extra.slice(0, 8).join(', ')}` : ''}`)
  }
  const names = new Set<string>()
  for (const i of files('items')) {
    names.add(i.name)
    for (const v of i.variations ?? []) names.add(v.name)
  }
  const defs = server.entityDefinitions()
  if (defs) {
    const own = new Map(lootOf(build, files('entities'), defs, names).map(l => [l.entity, l.drops]))
    for (const l of list) if (own.has(l.entity) && !sameData(l.drops, own.get(l.entity))) bad(`${l.entity}: drops not its loot table's`)
  }
  for (const l of list) {
    for (const d of l.drops) {
      if (!names.has(d.item)) bad(`${l.entity}: drops ${d.item}, no item`)
      if (d.stackSizeRange[0] > d.stackSizeRange[1]) bad(`${l.entity}: ${d.item} stack size ${d.stackSizeRange.join('..')}`)
    }
  }
}
