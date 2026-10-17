// language.json: the en_US strings of the vanilla resource pack

import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'

export const language: Generator = {
  key: 'language',
  after: ['version'],
  has: (data, build) => data.hasLanguage(build),
  json(data, build) {
    return JSON.stringify(data.language(build).packs.vanilla, null, 2)
  },
  meaning: canonical,
}
