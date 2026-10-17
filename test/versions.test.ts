import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFor, unpublished, type Pin } from '../src/versions.ts'

const RELEASES = ['1.26.52.3', '1.26.51.1', '1.21.50.10', '1.21.50.07', '1.21.42.01', '1.20.11.01', '1.16.201.02']

void test("a pinned version is made from its pin's build, linux's where it has one for each OS", () => {
  const pins = new Map<string, Pin>([
    ['1.20.10', '1.20.11.01'],
    ['1.21.50', { windows: '1.21.50.07', linux: '1.21.50.10' }],
    ['1.21.42', '1.21.42.01'],
  ])
  assert.equal(buildFor('1.20.10', pins, RELEASES), '1.20.11.01')
  assert.equal(buildFor('1.21.50', pins, RELEASES), '1.21.50.10')
  assert.equal(
    buildFor(
      '1.21.50',
      pins,
      RELEASES.filter((b) => b !== '1.21.50.10'),
    ),
    '1.21.50.07',
  )
  assert.equal(buildFor('1.21.42', pins, ['1.26.52.3']), undefined)
})

void test('an unpinned version is made from the newest release of its major.minor.patch', () => {
  const pins = new Map<string, Pin>()
  assert.equal(buildFor('1.26.52', pins, RELEASES), '1.26.52.3')
  assert.equal(buildFor('1.21.50', pins, RELEASES), '1.21.50.10')
  assert.equal(buildFor('1.16.201', pins, RELEASES), '1.16.201.02')
  assert.equal(buildFor('0.14', pins, RELEASES), undefined)
  assert.equal(buildFor('1.26.60', pins, RELEASES), undefined)
})

void test("a release minecraft-data has no version of yet is told; another build of a version's is not", () => {
  const pins = new Map<string, Pin>([['1.21.50', { windows: '1.21.50.07', linux: '1.21.50.10' }]])
  assert.deepEqual(unpublished(['0.14', '1.16.201', '1.21.50', '1.26.51'], pins, RELEASES), ['1.26.52.3', '1.21.42.01', '1.20.11.01'])
  assert.deepEqual(unpublished(['1.16.201', '1.20.10', '1.21.42', '1.21.50', '1.26.51', '1.26.52'], new Map([...pins, ['1.20.10', '1.20.11.01']]), RELEASES), [])
})
