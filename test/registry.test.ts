// The registry (registry/): made for exactly versions.json, it is what the published files say (so it was
// accepted after the last change to them), and what it holds is consistent: each block's states are its
// blocks.json block's, every id once in a version, every state property with values of its type.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { KINDS, ORDER, registryAt, registryText, registryTexts, registryVersions } from '../src/validate/registry.ts'
import { files } from './helpers.ts'

describe('registry', () => {
  test('is made for every version of versions.json', () => {
    assert.deepEqual(registryVersions(), ORDER)
  })

  const made = registryTexts(files)
  for (const kind of Object.keys(KINDS)) {
    test(`${kind}.json is what the published files say`, () => {
      const committed = registryText(kind)
      assert.ok(committed, `registry/${kind}.json missing`)
      if (committed !== made[kind]) {
        const a: Record<string, unknown> = JSON.parse(committed), b: Record<string, unknown> = JSON.parse(made[kind])
        const differ = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(n => JSON.stringify(a[n]) !== JSON.stringify(b[n]))
        assert.fail(`${differ.length} name(s) differ (pnpm mcdata --accept after a change on purpose): ${differ.slice(0, 10).join(', ')}`)
      }
    })
  }

  test('each version: its blocks and block states name the same blocks', () => {
    for (const v of ORDER) {
      const a = [...registryAt('blocks', v).keys()].sort(), b = [...registryAt('blockStates', v).keys()].sort()
      assert.deepEqual(a, b, v)
    }
  })

  test('each version: no id twice', () => {
    for (const v of ORDER) {
      for (const kind of ['blocks', 'items', 'biomes', 'effects', 'enchantments']) {
        const ids = [...registryAt(kind, v).values()]
        assert.equal(new Set(ids).size, ids.length, `${v} ${kind}`)
      }
      const entities = [...registryAt('entities', v).values()] as [number, number][]
      assert.equal(new Set(entities.map(e => e[0])).size, entities.length, `${v} entity ids`)
      assert.equal(new Set(entities.map(e => e[1])).size, entities.length, `${v} entity internal ids`)
    }
  })

  test('block state values: some of each property, each of its type', () => {
    for (const v of [ORDER[0], ORDER.at(-1)!]) {
      for (const [block, props] of registryAt('blockStates', v) as Map<string, Record<string, { type: string, values: unknown[] }>>) {
        for (const [p, { type, values }] of Object.entries(props)) {
          assert.ok(values.length > 0, `${v} ${block}.${p}: no values`)
          const ok = type === 'byte' ? values.every(x => x === 0 || x === 1) : type === 'int' ? values.every(x => Number.isInteger(x)) : values.every(x => typeof x === 'string')
          assert.ok(ok, `${v} ${block}.${p}: ${type} ${JSON.stringify(values)}`)
        }
      }
    }
  })

  test('the blocks every version has', () => {
    for (const v of ORDER) {
      const blocks = registryAt('blockStates', v)
      for (const name of ['air', 'stone', 'dirt', 'water', 'lava', 'bedrock', 'obsidian', 'chest', 'furnace']) assert.ok(blocks.has(name), `${v}: no ${name}`)
      // renamed in 1.21.70
      assert.ok(blocks.has('grass') || blocks.has('grass_block'), `${v}: no grass block`)
    }
  })
})
