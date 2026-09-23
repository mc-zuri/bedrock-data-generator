// biomes.json: exactly the biomes the server sends (biome_definition_list), each name and id once, each id
// the server's own where the agent read them (biome_ids.json); temperature and rainfall the definition's;
// the dimension the one its tags name; a child a biome of the file, whose parent it is; displayNames unique.
import { sameFloat, sameSet, unique, type Validator } from '../context.ts'

export const biomes: Validator = (list: any[], { server, bad }) => {
  const defs = server.biomeDefinitions()
  const ids = server.biomeIds()
  unique(list, b => b.name, 'biome', bad)
  unique(list, b => b.id, 'biome id', bad)
  unique(list, b => b.displayName, 'biome displayName', bad)
  sameSet(list.map(b => b.name), Object.keys(defs), 'biomes', bad)
  const byId = new Map(list.map(b => [b.id, b]))
  const parentOf = new Map(list.filter(b => b.child !== undefined).map(b => [b.child, b.name]))
  for (const b of list) {
    const at = `${b.name}:`
    if (ids && ids[b.name] !== undefined && ids[b.name] !== b.id) bad(`${at} id ${b.id}, the server's ${ids[b.name]}`)
    const def = defs[b.name]
    if (!def) continue
    if (!sameFloat(b.temperature, def.temperature)) bad(`${at} temperature ${b.temperature}, the server's ${def.temperature}`)
    if (!sameFloat(b.rainfall, def.downfall)) bad(`${at} rainfall ${b.rainfall}, the server's ${def.downfall}`)
    if (def.tags) {
      const tags = new Set(def.tags)
      const dimension = tags.has('nether') ? 'nether' : tags.has('the_end') ? 'end' : 'overworld'
      if (b.dimension !== dimension) bad(`${at} dimension ${b.dimension}, its tags say ${dimension}`)
    }
    if (typeof def.depth === 'number' && !sameFloat(b.depth, def.depth)) bad(`${at} depth ${b.depth}, the server's ${def.depth}`)
    if (def.rain !== undefined) {
      const rain = Boolean(def.rain)
      if ('has_precipitation' in b && b.has_precipitation !== rain) bad(`${at} has_precipitation ${b.has_precipitation}, the server's ${rain}`)
      if ('precipitation' in b && (b.precipitation !== 'none') !== rain) bad(`${at} precipitation ${b.precipitation}, the server's rain ${rain}`)
    }
    if (!('precipitation' in b) && !('has_precipitation' in b)) bad(`${at} has neither precipitation nor has_precipitation`)
    if (b.child !== undefined && !byId.has(b.child)) bad(`${at} child ${b.child} is no biome`)
    // a mutated biome's parent: the biome that names it its child
    if (b.parent !== undefined && b.parent !== parentOf.get(b.id)) bad(`${at} parent ${b.parent}, the biome whose child it is: ${parentOf.get(b.id)}`)
    if (b.child !== undefined && byId.get(b.child)?.parent !== undefined && byId.get(b.child).parent !== b.name) bad(`${at} child ${b.child} names another parent`)
  }
}
