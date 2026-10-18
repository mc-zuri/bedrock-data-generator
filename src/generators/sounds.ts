// sounds.json: every sound event the game names (enums.json.gz: LevelSoundEventMap), by the id the server sends a client
// for it in level_sound_event, with the game's name for it ("item.use.on" 0, ... "undefined" last). The ids have gaps.
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'
import { uniqueIds } from './particles.ts'

export const sounds: Generator = {
  key: 'sounds',
  after: ['particles', 'effects'],
  has: (data, build) => data.has(build, 'enums'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(uniqueIds(data.enums(build).sounds), null, 2)
  },
  meaning: canonical,
}
