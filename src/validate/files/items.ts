// items.json: exactly the server's item registry (item_registry / start_game), each id once (the variations'
// too); from 1.21.100 each item's id, nbt and version the registry's own; stackSize and maxDurability the
// server's (item_types.json; maxDurability there only where the item has durability); a name for every item;
// the repair items items of the version.
import { compareVersions } from '../../config.ts'
import { sameData, sameSet, unique, type Validator } from '../context.ts'

const bare = (n: string): string => n.replace(/^minecraft:/, '')

export const items: Validator = (list: any[], { v, server, files, bad }) => {
  const states = server.itemStates()
  const types = server.itemTypes()
  unique(list, i => i.name, 'item', bad)
  const all = list.flatMap(i => [i, ...(i.variations ?? [])])
  unique(all, i => i.id, 'item id', bad)
  for (const i of list) unique(i.variations ?? [], (x: any) => x.metadata, `${i.name}: variation metadata`, bad)
  sameSet(list.map(i => i.name), states.map(s => bare(s.name)), 'items', bad)

  const byRuntimeId = compareVersions(v, '1.21.100') >= 0
  const stateByName = new Map(states.map(s => [bare(s.name), s]))
  const names = new Set(all.map(i => i.name))
  const lang = files('language')
  for (const i of list) {
    const at = `${i.name}:`
    const s = stateByName.get(i.name)
    if (byRuntimeId && s) {
      if (i.id !== s.runtime_id) bad(`${at} id ${i.id}, its runtime id ${s.runtime_id}`)
      if (!sameData(i.nbt, s.nbt)) bad(`${at} nbt is not the registry's`)
      if (i.version !== s.version) bad(`${at} version ${i.version}, the registry's ${s.version}`)
    } else if (!byRuntimeId && ('nbt' in i || 'version' in i)) bad(`${at} has nbt / version before 1.21.100`)
    const t = types[i.name]
    if (!t) { bad(`${at} not in item_types.json`); continue }
    if (i.stackSize !== t.maxStackSize) bad(`${at} stackSize ${i.stackSize}, the server's ${t.maxStackSize}`)
    const durability = t.maxDamage > 0 ? t.maxDamage : undefined
    if (i.maxDurability !== durability) bad(`${at} maxDurability ${i.maxDurability}, the server's ${durability}`)
    for (const r of i.repairWith ?? []) if (!names.has(r)) bad(`${at} repaired with ${r}, no item`)
    // the language file's name of its description id (an item with variations: its metadata 0 has its own key)
    const desc = t.descriptionId
    const langName = desc === undefined ? undefined : lang[desc.endsWith('.name') ? desc : `${desc}.name`]
    if (!i.variations?.length && langName && i.displayName !== langName) bad(`${at} displayName ${JSON.stringify(i.displayName)}, the language file's ${JSON.stringify(langName)}`)
    // an item with variations is its lowest data value
    if (i.variations?.some((x: any) => x.metadata <= i.metadata)) bad(`${at} metadata ${i.metadata}, a variation's is not above it`)
  }
}
