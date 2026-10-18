// effects.json: every mob effect the game has (effects.json.gz), by the id the server sends a client for it:
// - name: its name in PascalCase, as minecraft-data writes effect names (fatal_poison -> FatalPoison);
// - displayName: the language's string for its description id, without the space some have before it;
// - type: bad where the game marks it harmful, else good.
// Every bedrock version used Java's effects.json before, whose ids are not Bedrock's from 24 on.
import type { BedrockData } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'
import { strings } from './utils/names.ts'

export interface Effect {
  id: number
  name: string
  displayName: string
  type: 'good' | 'bad'
}

function pascalCase(name: string): string {
  return name.replace(/(?:^|_)([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

function effectsJson(data: BedrockData, build: string): Effect[] {
  const lang = strings(data.language(build))
  return data.effects(build).map((e) => {
    const displayName = lang.get(e.descriptionId)?.trim()

    if (!displayName) {
      throw new Error(`effect ${e.name}: the language has no ${e.descriptionId}`)
    }

    return { id: e.id, name: pascalCase(e.name), displayName, type: e.harmful ? 'bad' : 'good' }
  })
}

export const effects: Generator = {
  key: 'effects',
  after: ['enchantments'],
  has: (data, build) => data.has(build, 'effects', 'language'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(effectsJson(data, build), null, 2)
  },
  meaning: canonical,
}
