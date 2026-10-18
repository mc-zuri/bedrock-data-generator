// attributes.json: the attributes the server sends a joining player in update_attributes (attributes.json.gz), by
// resource:
// - resource: the game's name for it (minecraft:movement, minecraft:player.hunger);
// - name: that name without minecraft: in camelCase, as minecraft-data names attributes (player.hunger -> playerHunger);
// - min, max and default: as the server sends them.
// A mob's own attributes (a horse's jump strength) are not the player's: the server sends them only with that mob.
// The old files (1.16.201 to 1.19.63) were Java's.
import type { Generator } from './index.ts'
import { canonical, withoutNamespace } from './utils/json.ts'

export interface Attribute {
  resource: string
  name: string
  min: number
  max: number
  default: number
}

function camelCase(name: string): string {
  return name.replace(/[._]([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

export const attributes: Generator = {
  key: 'attributes',
  after: [],
  has: (data, build) => data.has(build, 'attributes'),
  json(data, build) {
    const out: Attribute[] = data
      .attributes(build)
      .map((a) => ({ resource: a.name, name: camelCase(withoutNamespace(a.name)), min: a.min, max: a.max, default: a.default }))
      .sort((a, b) => a.resource.localeCompare(b.resource))
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(out, null, 2)
  },
  meaning: canonical,
}
