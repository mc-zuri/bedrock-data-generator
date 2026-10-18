// blockStates.json: every block state of the build in runtime id order (a state's index is its runtime id): the
// palette, named without "minecraft:", each property as its NBT tag.
import type { BlockState } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { withoutNamespace } from './utils/json.ts'

export const blockStates: Generator = {
  key: 'blockStates',
  after: ['blocks', 'attributes'],
  has: (data, build) => data.has(build, 'blockPalette'),
  json(data, build) {
    const states = data.palette(build).map((s) => ({ name: withoutNamespace(s.name), states: s.states, version: s.version }))
    // tabs, no final newline: as minecraft-data writes it
    return JSON.stringify(states, null, '\t')
  },
  meaning(json) {
    // the property order is only how a file is written (1.19.80's lists some in another order)
    return JSON.stringify(
      (JSON.parse(json) as BlockState[]).map((s) => [
        s.name,
        Object.keys(s.states)
          .sort()
          .map((k) => [k, s.states[k]]),
        s.version,
      ]),
    )
  },
}
