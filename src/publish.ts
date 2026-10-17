// Each generator's file of every version minecraft-data has into its checkout, and dataPaths.json. Oldest version
// first, a version whose file would say what the previous version's says gets none of its own: its entry points to
// that version's. A file that already says the same stays as it is written; one no version points to any more is
// deleted. A version made from no build bedrock-data has (0.14, or one not extracted yet) is left as it is. Only what
// changes is printed. Nothing is committed.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BedrockData } from './bedrockData.ts'
import type { Generator } from './generators/index.ts'
import { buildFor, compareVersions, unpublished, type Pin } from './versions.ts'

/** a dataPaths.json version: each key the folder its file is in */
export type Entry = Record<string, string>
interface DataPaths {
  bedrock: Record<string, Entry>
}
export type Counts = Record<'new' | 'updated' | 'unchanged' | 'shared' | 'deleted' | 'notBuilt', number>

export interface Sources {
  data: BedrockData
  pins: Map<string, Pin>
}

function readIfExists(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

export function bedrockDataPaths(mcData: string): Record<string, Entry> | undefined {
  const text = readIfExists(join(mcData, 'data', 'dataPaths.json'))
  return text === undefined ? undefined : (JSON.parse(text) as DataPaths).bedrock
}

function withEol(text: string, eol: string): string {
  return eol === '\n' ? text : text.replace(/\n/g, eol)
}

/** A new key goes where minecraft-data has it: after the first of `after` the entry has. */
function withKey(entry: Entry, key: string, after: string[], dir: string): Entry {
  if (key in entry) return { ...entry, [key]: dir }
  const anchor = after.find((k) => k in entry)
  const out: Entry = anchor ? {} : { [key]: dir }
  for (const [k, v] of Object.entries(entry)) {
    out[k] = v
    if (k === anchor) out[key] = dir
  }
  return out
}

export function summary(c: Counts): string {
  return `${c.new} new, ${c.updated} updated, ${c.unchanged} unchanged, ${c.shared} shared with the version before, ${c.deleted} deleted, ${c.notBuilt} with no build in bedrock-data`
}

/** Every generator of `gens` into the minecraft-data checkout `mcData`. Returns each one's counts. */
export function generate(mcData: string, sources: Sources, gens: Generator[]): Map<string, Counts> {
  const file = join(mcData, 'data', 'dataPaths.json')
  const text = readFileSync(file, 'utf8')
  // files are written in the checkout's line ending: CRLF where git's core.autocrlf made it so
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const paths = JSON.parse(text) as DataPaths
  const versions = Object.keys(paths.bedrock).sort(compareVersions)
  const notBuilt = versions.filter((v) => buildFor(v, sources.pins, sources.data.releases) === undefined)
  if (notBuilt.length) console.log(`  no build in bedrock-data, left as they are: ${notBuilt.join(', ')}`)
  const ahead = unpublished(versions, sources.pins, sources.data.releases)
  if (ahead.length) console.warn(`  warning: minecraft-data has no version of ${ahead.join(', ')} yet: its own version bump adds one`)
  const counts = new Map<string, Counts>()
  for (const g of gens) {
    const c = publish(g, mcData, paths.bedrock, eol, sources)
    console.log(`${g.key}: ${summary(c)}`)
    counts.set(g.key, c)
  }
  const out = withEol(JSON.stringify(paths, null, 2) + '\n', eol)
  if (out !== text) writeFileSync(file, out)
  return counts
}

export function publish(g: Generator, mcData: string, bedrock: Record<string, Entry>, eol: string, { data, pins }: Sources): Counts {
  const counts: Counts = { new: 0, updated: 0, unchanged: 0, shared: 0, deleted: 0, notBuilt: 0 }
  function fileIn(dir: string): string {
    return join(mcData, 'data', dir, `${g.key}.json`)
  }
  function meaningIn(dir: string | undefined): string | undefined {
    const text = dir === undefined ? undefined : readIfExists(fileIn(dir))
    return text === undefined ? undefined : g.meaning(text)
  }
  const rewritten = new Set<string>()
  const generated: string[] = []
  const notBuilt: string[] = []
  let previous: { meaning: string; dir: string } | undefined

  for (const v of Object.keys(bedrock).sort(compareVersions)) {
    const entry = bedrock[v]
    const current: string | undefined = entry[g.key]
    const build = buildFor(v, pins, data.releases)
    if (build === undefined || !g.has(data, build)) {
      // left as it is: the next version compares with what this one points to
      counts.notBuilt++
      notBuilt.push(v)
      const meaning = meaningIn(current)
      previous = current === undefined || meaning === undefined ? undefined : { meaning, dir: current }
      continue
    }
    generated.push(v)
    const json = g.json(data, build)
    const meaning = g.meaning(json)
    const changes: string[] = []
    let dir: string
    if (previous?.meaning === meaning) {
      dir = previous.dir
      counts.shared++
    } else {
      dir = `bedrock/${v}`
      const old = readIfExists(fileIn(dir))
      const text = withEol(json, eol)
      if (old !== undefined && (old === text || g.meaning(old) === meaning)) {
        counts.unchanged++
      } else {
        mkdirSync(join(mcData, 'data', dir), { recursive: true })
        writeFileSync(fileIn(dir), text)
        rewritten.add(dir)
        counts[old === undefined ? 'new' : 'updated']++
        changes.push(old === undefined ? 'new file' : 'file updated')
      }
      previous = { meaning, dir }
    }
    if (dir !== current) {
      bedrock[v] = withKey(entry, g.key, g.after, dir)
      changes.push(`${current ?? 'no entry'} -> ${dir}`)
    }
    if (changes.length) console.log(`  ${v.padEnd(9)} ${g.key} (${build}): ${changes.join(', ')}`)
  }

  const used = new Set(Object.values(bedrock).map((e) => e[g.key]))
  for (const v of generated) {
    const dir = `bedrock/${v}`
    if (used.has(dir) || !existsSync(fileIn(dir))) continue
    rmSync(fileIn(dir))
    counts.deleted++
    console.log(`  ${dir}/${g.key}.json deleted: no version points to it`)
  }
  for (const v of notBuilt) {
    const dir = bedrock[v][g.key]
    if (dir !== undefined && rewritten.has(dir)) console.warn(`  warning: ${v} has no build and points to ${dir}/${g.key}.json, which this run rewrote`)
  }
  return counts
}
