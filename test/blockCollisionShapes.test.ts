import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { BedrockData } from '../src/bedrockData.ts'
import { blockCollisionShapes } from '../src/generators/blockCollisionShapes.ts'
import { generate, type Committed } from '../src/publish.ts'
import { bedrockDataOf, minecraftDataOf, withBlockShapes } from './helpers.ts'

const CUBE = [[0, 0, 0, 1, 1, 1]]
const SLAB = [[0, 0, 0, 1, 0.5, 1]]
const CHEST = [[0.025, 0, 0.025, 0.975, Math.fround(0.95), 0.975]]

function dataWith(blocks: Record<string, number[][][]>): string {
  const root = bedrockDataOf({ '1.21.0.03': undefined })
  withBlockShapes(root, '1.21.0.03', blocks)
  return root
}

function generated(data: string, committed?: Committed, files: Record<string, string> = {}): string {
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } }, files)
  generate(mcData, { data: new BedrockData(data), pins: new Map(), committed }, [blockCollisionShapes])
  return readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', 'blockCollisionShapes.json'), 'utf8')
}

void test('each block is its states shape ids in runtime id order, each shape numbered as met, 0 none', () => {
  const data = dataWith({ air: [[]], stone: [CUBE], stone_slab: [SLAB, CUBE], chest: [CHEST] })
  assert.deepEqual(JSON.parse(generated(data)), {
    blocks: { air: [0], stone: [1], stone_slab: [2, 1], chest: [3] },
    shapes: { 0: [], 1: CUBE, 2: SLAB, 3: [[0.025, 0, 0.025, 0.975, 0.95, 0.975]] },
  })
})

void test('the committed file keeps its block order, shape ids and blocks written as one id', () => {
  const data = dataWith({ air: [[]], stone: [CUBE], stone_slab: [SLAB, SLAB] })
  const committedBlocks = JSON.stringify([{ name: 'stone' }, { name: 'air' }, { name: 'stone_slab' }])
  const committedShapes = JSON.stringify({ blocks: { stone: [7], air: [0], stone_slab: 3 }, shapes: { 0: [], 3: SLAB, 7: CUBE, 9: [[0, 0, 0, 1, 0.25, 1]] } })
  function committed(_: string, key: string): string | undefined {
    return key === 'blocks' ? committedBlocks : key === 'blockCollisionShapes' ? committedShapes : undefined
  }
  const text = generated(data, committed)
  assert.deepEqual(Object.keys((JSON.parse(text) as { blocks: object }).blocks), ['stone', 'air', 'stone_slab'])
  assert.deepEqual(JSON.parse(text), {
    blocks: { stone: [7], air: [0], stone_slab: 3 },
    // a shape no block has any more stays in the table
    shapes: { 0: [], 3: SLAB, 7: CUBE, 9: [[0, 0, 0, 1, 0.25, 1]] },
  })
})

void test('a file that says the same with other ids and in another order is left as it is', () => {
  const data = dataWith({ air: [[]], stone: [CUBE] })
  const written = '{\n\t"blocks": {\n\t\t"stone": [5],\n\t\t"air": [0]\n\t},\n\t"shapes": {\n\t\t"0": [],\n\t\t"5": [[0, 0, 0, 1, 1, 1]]\n\t}\n}'
  assert.equal(generated(data, undefined, { 'bedrock/1.21.0/blockCollisionShapes.json': written }), written)
})
