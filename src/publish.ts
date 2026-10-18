// Each generator's file of every version minecraft-data has into its checkout, and dataPaths.json. Oldest version
// first, a version whose file would say what the previous version's says gets none of its own: its entry points to
// that version's. A file that already says the same stays as it is written; one no version points to any more is
// deleted. A version made from no build bedrock-data has (0.14, or one not extracted yet) is left as it is. Only what
// changes is printed. Nothing is committed.
import { execFileSync } from 'node:child_process'
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

/** A version's file of `key` as the checkout's HEAD has it; undefined where it has none. */
export type Committed = (version: string, key: string) => string | undefined

export interface Sources {
  data: BedrockData
  pins: Map<string, Pin>
  /** default: the checkout's HEAD */
  committed?: Committed
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

function showCommitted(mcData: string, path: string): string | undefined {
  try {
    return execFileSync('git', ['-C', mcData, 'show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n')
  } catch {
    return undefined
  }
}

/** The checkout's HEAD, each file read once: it stays as it is while generate runs. */
export function committedFiles(mcData: string): Committed {
  const texts = new Map<string, string | undefined>()

  function show(path: string): string | undefined {
    if (!texts.has(path)) {
      texts.set(path, showCommitted(mcData, path))
    }

    return texts.get(path)
  }

  const dataPaths = show('data/dataPaths.json')
  const entries = dataPaths === undefined ? {} : (JSON.parse(dataPaths) as DataPaths).bedrock

  return (version, key) => {
    const dir = entries[version]?.[key]
    return dir === undefined ? undefined : show(`data/${dir}/${key}.json`)
  }
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
  const head = sources.committed ?? committedFiles(mcData)
  // a key a generator before wrote: its file as this run left it (blockCollisionShapes follows the blocks.json written)
  const written = new Set<string>()
  function committed(version: string, key: string): string | undefined {
    if (!written.has(key)) {
      return head(version, key)
    }

    const dir = paths.bedrock[version]?.[key]
    return dir === undefined ? undefined : readIfExists(join(mcData, 'data', dir, `${key}.json`))?.replace(/\r\n/g, '\n')
  }
  for (const g of gens) {
    const c = publish(g, mcData, paths.bedrock, eol, { ...sources, committed })
    console.log(`${g.key}: ${summary(c)}`)
    counts.set(g.key, c)
    written.add(g.key)
    if (g.schema) widenSchema(mcData, g.schema)
  }
  const out = withEol(JSON.stringify(paths, null, 2) + '\n', eol)
  if (out !== text) writeFileSync(file, out)
  return counts
}

/** The checkout's schemas/<file>, where it has it, as `edit` makes it (in its own line endings), written where that changes it */
function widenSchema(mcData: string, { file, edit }: NonNullable<Generator['schema']>): void {
  const path = join(mcData, 'schemas', file)
  const text = readIfExists(path)
  if (text === undefined) return
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const out = withEol(edit(text.replace(/\r\n/g, '\n')), eol)
  if (out !== text) {
    writeFileSync(path, out)
    console.log(`  schemas/${file} written`)
  }
}

export function publish(g: Generator, mcData: string, bedrock: Record<string, Entry>, eol: string, { data, pins, committed = () => undefined }: Sources): Counts {
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
      const text = withEol(g.format ? g.format(json, (key) => committed(v, key)) : json, eol)
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
