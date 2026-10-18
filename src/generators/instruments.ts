// instruments.json: the note block instruments, by the instrument a note block plays (enums.json.gz: the game's table of
// their sounds, its index the instrument):
// - name: the sound without "note." (bd, bassattack: the game has no other name for them, not Java's basedrum and bass);
// - sound: the sound, where the game's table holds it whole (from 1.19.60; before, it holds the name alone).
// The index is the id a note block sends (block_event): on gold, bell, 5 in 1.21.0 and 6 in 1.26.51, whose table has
// flute and bell the other way round. 1.21.50 to 1.26.20 (Linux's to 1.26.30) keep no such table: no file. The old file
// (1.17.0) was Java's.
import type { BedrockData } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'

export interface Instrument {
  id: number
  name: string
  sound?: string
}

function instrumentsJson(data: BedrockData, build: string): Instrument[] {
  return data.enums(build).instruments.map(({ id, name }) => (name.startsWith('note.') ? { id, name: name.slice('note.'.length), sound: name } : { id, name }))
}

export const instruments: Generator = {
  key: 'instruments',
  after: ['recipes'],
  has: (data, build) => data.has(build, 'enums'),
  says: (data, build) => data.enums(build).instruments.length > 0,
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(instrumentsJson(data, build), null, 2)
  },
  meaning: canonical,
}
