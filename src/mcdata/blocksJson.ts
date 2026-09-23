// blocks.json of a build: one entry per block, its state range in runtime ids, its properties from the Java
// block it maps to. Ported from minecraft-data-extractor-legacy2 src/generators/blocks.ts.
import assert from 'node:assert'
import stringify from 'json-stringify-pretty-compact'
import type { BlockState } from './blocks.ts'
import { BLOCK_ORDER, orderKeys, shortenFloats, strip } from './format.ts'

const sequential = (data: number[]): boolean => data.every((num, i) => i === data.length - 1 || num < data[i + 1])
const titleCase = (str: string): string => str.replace(/\b\S/g, t => t.toUpperCase())

/**
 * The blocks, sorted by id: the Java block's (through the Bedrock -> Java map) where there is one, so the order
 * is Java's. `defaultState` gives a block's default state (the game's, block_types.json; legacy2 took the
 * first); `warn` hears of a mapped Java block that the Java blocks.json lacks.
 */
export function blocks (states: BlockState[], bedrock2Java: Record<string, string>, javaBlocks: any[], defaultState: (name: string) => number, warn: (text: string) => void = () => {}): any[] {
  const mapB2J: Record<string, string> = {}
  for (const [k, v] of Object.entries(bedrock2Java)) mapB2J[strip(k)] ??= strip(v)

  const out: Record<string, any> = {}
  states.forEach((state, i) => {
    const name = strip(state.name)
    out[name] ??= { name, states: [] }
    out[name].states.push(i)
    const javaName = mapB2J[name]
    if (javaName) {
      const javaBlock = javaBlocks.find(jb => jb.name === javaName)
      if (javaBlock) out[name] = Object.assign({ ...javaBlock }, out[name])
      else warn(`no java block ${javaName} for ${name}`)
    }
  })

  // sorted by id: not the state id, the block id, kept the same as Java's where possible
  const fin = Object.values(out).sort((a, b) => (a.id ?? 999) - (b.id ?? 9999))
  for (const entry of fin) {
    assert(sequential(entry.states), JSON.stringify(entry))
    entry.id ??= undefined // sorting
    entry.minStateId = entry.states[0]
    entry.maxStateId = entry.states[entry.states.length - 1]
    delete entry.states
    entry.displayName ??= titleCase(entry.name.replace(/_/g, ' '))
    entry.id ??= entry.minStateId
    entry.defaultState = defaultState(entry.name)
    entry.hardness ??= 0
    entry.stackSize ??= 1
    entry.diggable ??= false
    entry.boundingBox ??= 'block'
    entry.drops ??= []
    entry.transparent ??= false
    entry.emitLight ??= 0
    entry.filterLight ??= 0
  }

  // two Bedrock blocks on one Java block would share its id: the later ones get new ones
  const usedIds = new Set()
  let di = 8000
  for (const entry of fin) {
    if (usedIds.has(entry.id)) entry.id = di++
    usedIds.add(entry.id)
  }
  return fin.map(entry => orderKeys(entry, BLOCK_ORDER))
}

export const blocksJson = (list: any[]): string => stringify(shortenFloats(list), { indent: 2, maxLength: 200 })
