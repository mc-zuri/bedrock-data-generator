// blockSelectionShapes.json: each state's selection box, the outline the game draws round the block a player looks at
// (bedrock-data's `outline`), in blockCollisionShapes.json's form: a shape id per state, `shapes` each id's boxes, 0
// being none. The layout of the Java files of minecraft-data's blockSelectionShapes.
import type { Generator } from './index.ts'
import { blocksOf, blocksOfJson, collisionJson, committedForm, plainForm, shapesByName, type CollisionShapes } from './blockCollisionShapes.ts'

export const blockSelectionShapes: Generator = {
  key: 'blockSelectionShapes',
  after: ['blockCollisionShapes', 'blockStates', 'blocks'],
  has: (data, build) => data.hasBlockShapes(build) && data.has(build, 'blocks'),
  json(data, build) {
    return collisionJson(
      blocksOf(data.blockShapes(build), data.blocks(build), (s) => (s.outline ? [s.outline] : [])),
      plainForm(),
    )
  },
  format(json, committed) {
    return collisionJson(blocksOfJson(json), committedForm(committed, 'blockSelectionShapes'))
  },
  meaning(json) {
    return JSON.stringify(shapesByName(JSON.parse(json) as CollisionShapes))
  },
}
