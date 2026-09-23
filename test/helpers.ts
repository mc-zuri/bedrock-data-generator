// What the tests share: the checkout's dataPaths.json, a version's published files, and a copy of them to
// break on purpose.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { versions, type Build } from '../src/config.ts'
import { DATA, FILE_KEYS, publishedFiles } from '../src/validate/index.ts'
import type { Files } from '../src/validate/registry.ts'

export const paths = JSON.parse(readFileSync(join(DATA, 'dataPaths.json'), 'utf8'))

export const build = (v: string): Build => {
  const b = versions.find(x => x.mcDataVersion === v)
  if (!b) throw new Error(`${v} is not in versions.json`)
  return b
}

const cache = new Map<string, Files>()
export const files = (v: string): Files => {
  let f = cache.get(v)
  if (!f) cache.set(v, f = publishedFiles(v, paths))
  return f
}

/** A deep copy of every file of a version, to change: `data[key]`; `files` reads it. */
export function copy (v: string): { data: Record<string, any>, files: Files } {
  const data = Object.fromEntries(FILE_KEYS.map(k => [k, structuredClone(files(v)(k))]))
  return { data, files: (k: string) => data[k] }
}
