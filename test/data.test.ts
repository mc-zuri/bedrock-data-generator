// Every version's published files as the checkout has them: each passes its strict schema, its validator
// (what the server of the build says, what the version's other files have) and the registry. A regression in
// any file of any version fails its version here, with what is wrong.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { versions } from '../src/config.ts'
import { DATA, FILE_KEYS, formatProblems, validateVersion } from '../src/validate/index.ts'
import { ORDER } from '../src/validate/registry.ts'
import { files, paths } from './helpers.ts'

describe('every version validates', () => {
  for (const b of versions) {
    test(b.mcDataVersion, () => {
      const problems = validateVersion(b, paths, files(b.mcDataVersion))
      assert.equal(formatProblems(problems), '', `${problems.length} problem(s)`)
    })
  }
})

describe('dataPaths.json', () => {
  test('every version of versions.json is there, with every file a bedrock one that exists', () => {
    for (const b of versions) {
      const entry = paths.bedrock[b.mcDataVersion]
      assert.ok(entry, `${b.mcDataVersion}: no entry`)
      for (const key of FILE_KEYS) {
        assert.match(entry[key] ?? '', /^bedrock\//, `${b.mcDataVersion} ${key}`)
        assert.ok(existsSync(join(DATA, entry[key], `${key}.json`)), `${b.mcDataVersion}: ${entry[key]}/${key}.json`)
      }
    }
  })

  test('every published file is used by some version', () => {
    const used = new Set(Object.values<any>(paths.bedrock).flatMap(e => FILE_KEYS.map(k => `${e[k]}/${k}.json`)))
    for (const b of versions) {
      const dir = join(DATA, 'bedrock', b.mcDataVersion)
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) {
        const rel = `bedrock/${b.mcDataVersion}/${f}`
        if (FILE_KEYS.includes(f.replace(/\.json$/, ''))) assert.ok(used.has(rel), `${rel}: no version uses it`)
      }
    }
  })

  test('a version has its own file only where it differs from the version before\'s', () => {
    const order = ORDER
    const hash = (dir: string, key: string) => createHash('sha1').update(readFileSync(join(DATA, dir, `${key}.json`))).digest('hex')
    for (let i = 1; i < order.length; i++) {
      for (const key of FILE_KEYS) {
        const a = paths.bedrock[order[i - 1]][key], b = paths.bedrock[order[i]][key]
        if (a !== b) assert.notEqual(hash(a, key), hash(b, key), `${order[i]} ${key}: ${b} is the same as ${a}`)
      }
    }
  })
})
