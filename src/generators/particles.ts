// particles.json: every particle type the game names (enums.json.gz: ParticleTypeMap), by the id the server sends a
// client for it, with the game's name for it ("bubble" 1, ...). The ids have gaps. From 1.21.60 the game keeps only its
// name -> id map, which names 90 twice (vaultconnection and windexplosion, 91 in 1.21.0): minecraft-data's ids are
// unique, so an id named twice keeps its first name in name order.
import type { EnumName } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'

/** `names` (by id, an id's names by name) with one name an id: its first. */
export function uniqueIds(names: EnumName[]): EnumName[] {
  return names.filter((e, i) => i === 0 || e.id !== names[i - 1].id).map(({ id, name }) => ({ id, name }))
}

export const particles: Generator = {
  key: 'particles',
  after: ['effects'],
  has: (data, build) => data.has(build, 'enums'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(uniqueIds(data.enums(build).particles), null, 2)
  },
  meaning: canonical,
}
