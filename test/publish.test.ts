import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { BedrockData } from '../src/bedrockData.ts'
import { language } from '../src/generators/language.ts'
import { generate, type Entry } from '../src/publish.ts'
import type { Pin } from '../src/versions.ts'
import { bedrockDataOf, minecraftDataOf } from './helpers.ts'

const STONE = { 'tile.stone.name': 'Stone' }
const STONE_AND_DIRT = { 'tile.stone.name': 'Stone', 'tile.dirt.name': 'Dirt' }

function dataPaths(mcData: string): Record<string, Entry> {
  return (JSON.parse(readFileSync(join(mcData, 'data', 'dataPaths.json'), 'utf8')) as { bedrock: Record<string, Entry> }).bedrock
}

function run(mcData: string, data: string, pins: [string, Pin][] = []): ReturnType<typeof generate> {
  return generate(mcData, { data: new BedrockData(data), pins: new Map(pins) }, [language])
}

void test('a version saying what the one before says points to its file; a change gets a file of its own', () => {
  const data = bedrockDataOf({ '1.21.0.03': STONE, '1.21.2.02': STONE, '1.21.20.03': STONE_AND_DIRT })
  const mcData = minecraftDataOf({
    '1.21.0': { protocol: 'bedrock/1.21.0', version: 'bedrock/1.21.0' },
    '1.21.2': { protocol: 'bedrock/1.21.2', version: 'bedrock/1.21.2' },
    '1.21.20': { protocol: 'bedrock/1.21.20', version: 'bedrock/1.21.20', language: 'bedrock/1.20.10' },
  })
  const counts = run(mcData, data).get('language')
  assert.deepEqual(counts, { new: 2, updated: 0, unchanged: 0, shared: 1, deleted: 0, notBuilt: 0, unsaid: 0 })
  const paths = dataPaths(mcData)
  assert.equal(paths['1.21.0'].language, 'bedrock/1.21.0')
  assert.equal(paths['1.21.2'].language, 'bedrock/1.21.0')
  assert.equal(paths['1.21.20'].language, 'bedrock/1.21.20')
  // a new key goes after version, as minecraft-data puts language
  assert.deepEqual(Object.keys(paths['1.21.0']), ['protocol', 'version', 'language'])
  assert.equal(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', 'language.json'), 'utf8'), JSON.stringify(STONE, null, 2))
  assert.ok(!existsSync(join(mcData, 'data', 'bedrock', '1.21.2', 'language.json')))
})

void test('a second run changes nothing', () => {
  const data = bedrockDataOf({ '1.21.0.03': STONE, '1.21.2.02': STONE_AND_DIRT })
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' }, '1.21.2': { version: 'bedrock/1.21.2' } })
  run(mcData, data)
  const before = readFileSync(join(mcData, 'data', 'dataPaths.json'), 'utf8')
  assert.deepEqual(run(mcData, data).get('language'), { new: 0, updated: 0, unchanged: 2, shared: 0, deleted: 0, notBuilt: 0, unsaid: 0 })
  assert.equal(readFileSync(join(mcData, 'data', 'dataPaths.json'), 'utf8'), before)
})

void test('a file no version points to any more is deleted; one that says the same in another order stays', () => {
  const data = bedrockDataOf({ '1.21.0.03': STONE_AND_DIRT, '1.21.2.02': STONE_AND_DIRT })
  const reordered = JSON.stringify({ 'tile.dirt.name': 'Dirt', 'tile.stone.name': 'Stone' }, null, 2)
  const mcData = minecraftDataOf(
    { '1.21.0': { version: 'bedrock/1.21.0', language: 'bedrock/1.21.0' }, '1.21.2': { version: 'bedrock/1.21.2', language: 'bedrock/1.21.2' } },
    { 'bedrock/1.21.0/language.json': reordered, 'bedrock/1.21.2/language.json': '{}' },
  )
  assert.deepEqual(run(mcData, data).get('language'), { new: 0, updated: 0, unchanged: 1, shared: 1, deleted: 1, notBuilt: 0, unsaid: 0 })
  assert.equal(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', 'language.json'), 'utf8'), reordered)
  assert.ok(!existsSync(join(mcData, 'data', 'bedrock', '1.21.2', 'language.json')))
  assert.equal(dataPaths(mcData)['1.21.2'].language, 'bedrock/1.21.0')
})

void test('a version made from no build is left as it is, and the next compares with what it points to', () => {
  const data = bedrockDataOf({ '1.21.2.02': STONE, '1.21.20.03': undefined })
  const mcData = minecraftDataOf(
    {
      '1.0': { protocol: 'bedrock/1.0' },
      '1.21.0': { version: 'bedrock/1.21.0', language: 'bedrock/1.20.10' },
      '1.21.2': { version: 'bedrock/1.21.2' },
      '1.21.20': { version: 'bedrock/1.21.20', language: 'bedrock/1.20.10' },
    },
    { 'bedrock/1.20.10/language.json': JSON.stringify(STONE, null, 2) },
  )
  assert.deepEqual(run(mcData, data).get('language'), { new: 0, updated: 0, unchanged: 0, shared: 1, deleted: 0, notBuilt: 3, unsaid: 0 })
  const paths = dataPaths(mcData)
  assert.deepEqual(paths['1.0'], { protocol: 'bedrock/1.0' })
  assert.equal(paths['1.21.2'].language, 'bedrock/1.20.10')
  assert.equal(paths['1.21.20'].language, 'bedrock/1.20.10')
})

void test("files are written in the checkout's line ending", () => {
  const data = bedrockDataOf({ '1.21.0.03': STONE_AND_DIRT })
  const mcData = minecraftDataOf({ '1.21.0': { version: 'bedrock/1.21.0' } }, {}, '\r\n')
  run(mcData, data)
  assert.ok(readFileSync(join(mcData, 'data', 'bedrock', '1.21.0', 'language.json'), 'utf8').includes('\r\n'))
  assert.ok(
    !readFileSync(join(mcData, 'data', 'dataPaths.json'), 'utf8')
      .replace(/\r\n/g, '')
      .includes('\n'),
  )
})

void test("versions.json's pins pick the build", () => {
  const data = bedrockDataOf({ '1.20.11.01': STONE, '1.20.10.02': STONE_AND_DIRT })
  const mcData = minecraftDataOf({ '1.20.10': { version: 'bedrock/1.20.10' } })
  run(mcData, data, [['1.20.10', '1.20.11.01']])
  assert.equal(readFileSync(join(mcData, 'data', 'bedrock', '1.20.10', 'language.json'), 'utf8'), JSON.stringify(STONE, null, 2))
})

void test('a bedrock-data checkout of another formatVersion is refused', () => {
  assert.throws(() => new BedrockData(bedrockDataOf({ '1.21.0.03': STONE }, 2)), /formatVersion 2/)
})
