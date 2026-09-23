// Compares exported block data with another copy (by default the bedrock-data repo, the exports made
// before this repo existed): byte-identical after gunzip, else how many states differ and the first few.
//   node tools/compare.ts [versions...] [--ref DIR]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataFile, selectBuilds } from '../src/config.ts'
import { gunzip, readNbt } from '../src/nbt.ts'

const args = process.argv.slice(2)
const refAt = args.indexOf('--ref')
const ref = refAt >= 0 ? args[refAt + 1] : 'D:/projects/mc-zuri2/bedrock-data/data'
const names = args.filter((a, i) => !a.startsWith('--') && (refAt < 0 || i !== refAt + 1))

const f32 = (v: unknown): unknown => (Array.isArray(v) ? v.map(f32) : typeof v === 'number' ? Math.fround(v) : v)
let different = 0
for (const b of selectBuilds(names)) {
  const report: string[] = []
  for (const [name, endian] of [['block_palette.nbt', 'big'], ['block-state-shapes.nbt', 'little']] as const) {
    const ours = dataFile(b, name)
    const theirs = join(ref, b.serverVersion, name)
    if (!existsSync(ours) || !existsSync(theirs)) {
      report.push(`${name}: ${existsSync(ours) ? 'no reference' : 'not exported'}`)
      continue
    }
    if (gunzip(readFileSync(ours)).equals(gunzip(readFileSync(theirs)))) {
      report.push(`${name}: identical`)
      continue
    }
    const a = readNbt(ours, endian), c = readNbt(theirs, endian)
    const la: any[] = a.blocks ?? a.shapes, lc: any[] = c.blocks ?? c.shapes
    const diffs: string[] = []
    let n = 0
    for (let i = 0; i < Math.max(la.length, lc.length); i++) {
      const x = JSON.stringify(f32(la[i])), y = JSON.stringify(f32(lc[i]))
      if (x !== y) {
        n++
        if (diffs.length < 3) diffs.push(`#${i} ours=${x?.slice(0, 200)} ref=${y?.slice(0, 200)}`)
      }
    }
    report.push(`${name}: ${la.length} vs ${lc.length} entries, ${n} differ${diffs.length ? '\n      ' + diffs.join('\n      ') : ''}`)
  }
  const same = report.every(r => r.endsWith('identical'))
  if (!same) different++
  console.log(`${b.serverVersion}: ${same ? 'identical' : '\n    ' + report.join('\n    ')}`)
}
console.log(`${different} builds differ`)
