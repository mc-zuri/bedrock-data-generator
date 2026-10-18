// materials.json: each material's speeds by item id, the materials blocks.json's blocks name (utils/dig.ts).
import type { Generator } from './index.ts'
import { materials as digMaterials } from './utils/dig.ts'
import { canonical, withoutNamespace } from './utils/json.ts'

export const materials: Generator = {
  key: 'materials',
  after: ['instruments', 'recipes', 'items'],
  has: (data, build) => data.has(build, 'blocks', 'items'),
  json(data, build) {
    const itemId = new Map(data.items(build).items.map((i) => [withoutNamespace(i.name), i.id]))
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(digMaterials(data.blocks(build).blocks, itemId).materials, null, 2)
  },
  meaning: canonical,
}
