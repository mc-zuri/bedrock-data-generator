// steve.json: the default skin a client of the version sends in its login (steve.json.gz: recorded from a client, its
// persona id a fixed one), written as minecraft-data keeps it: on one line, no final newline. A build without one keeps
// what the version points to.
import type { Generator } from './index.ts'
import { canonical } from './utils/json.ts'

export const steve: Generator = {
  key: 'steve',
  after: ['windows', 'protocol'],
  has: (data, build) => data.has(build, 'steve'),
  json(data, build) {
    return JSON.stringify(data.steve(build))
  },
  meaning: canonical,
}
