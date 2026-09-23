// enchantments.json: exactly the server's enchantments (enchantments.json of the agent), by its ids: name,
// maxLevel, tradeable, the weight of its frequency, the costs on the line of its costs per level, the
// language file's name; exclusions name enchantments of the file, never itself, both ways.
import { sameSet, unique, type Validator } from '../context.ts'

const WEIGHTS: Record<number, number> = { 30: 10, 10: 5, 3: 2, 1: 1 }

export const enchantments: Validator = (list: any[], { server, files, bad }) => {
  const own = server.enchantments() as any[]
  unique(list, e => e.id, 'enchantment id', bad)
  unique(list, e => e.name, 'enchantment', bad)
  sameSet(list.map(e => `${e.id} ${e.name}`), own.map(e => `${e.id} ${e.name}`), 'enchantments', bad)
  const byId = new Map(own.map(e => [e.id, e]))
  const byName = new Map(list.map(e => [e.name, e]))
  const lang = files('language')
  for (const e of list) {
    const s = byId.get(e.id)
    const at = `${e.name}:`
    for (const x of e.exclude) {
      if (x === e.name) bad(`${at} excludes itself`)
      else if (!byName.has(x)) bad(`${at} excludes ${x}, no enchantment`)
      else if (!byName.get(x).exclude.includes(e.name)) bad(`${at} excludes ${x}, which does not exclude it`)
    }
    if (!s) continue
    if (e.maxLevel !== s.maxLevel) bad(`${at} maxLevel ${e.maxLevel}, the server's ${s.maxLevel}`)
    if (e.tradeable !== s.tradeable) bad(`${at} tradeable ${e.tradeable}, the server's ${s.tradeable}`)
    if (e.weight !== WEIGHTS[s.frequency]) bad(`${at} weight ${e.weight}, the server's frequency ${s.frequency}`)
    for (const [k, costs] of [['minCost', s.minCost], ['maxCost', s.maxCost]] as const) {
      for (let level = 1; level <= s.maxLevel; level++) {
        if (e[k].a * level + e[k].b !== costs[level - 1]) bad(`${at} ${k} ${JSON.stringify(e[k])} at level ${level}: the server's ${costs[level - 1]}`)
      }
    }
    const displayName = lang[s.descriptionId]?.trim()
    if (e.displayName !== displayName) bad(`${at} displayName ${JSON.stringify(e.displayName)}, the language file's ${JSON.stringify(displayName)}`)
    if (e.curse !== (e.name === 'binding' || e.name === 'vanishing')) bad(`${at} curse ${e.curse}`)
  }
}
