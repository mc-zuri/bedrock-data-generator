// The server's vanilla behavior packs: what the game itself defines in them (entities, biomes, items), for
// the generators to read instead of Java data. The server applies `vanilla`, then each `vanilla_<version>`
// in version order, a later definition of the same identifier replacing the earlier one. A pack keeps a kind
// either as a folder of .json files (older servers) or in `__brarchive/<kind>.brarchive` (newer ones).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { compareVersions, type Build } from '../config.ts'
import { serverDir } from '../server.ts'

/** A .brarchive: a 16-byte header (magic, entry count, version), 256-byte entries (name length, name, offset, size), then the data. */
export function readBrarchive (file: string): Map<string, string> {
  const buf = readFileSync(file)
  const count = buf.readUInt32LE(8)
  const dataStart = 16 + count * 256
  const out = new Map<string, string>()
  for (let i = 0; i < count; i++) {
    const at = 16 + i * 256
    const name = buf.subarray(at + 1, at + 1 + buf[at]).toString('utf8')
    const offset = buf.readUInt32LE(at + 248), size = buf.readUInt32LE(at + 252)
    out.set(name, buf.subarray(dataStart + offset, dataStart + offset + size).toString('utf8'))
  }
  return out
}

/** JSON as the game reads it: // and /* *\/ comments allowed, a trailing comma too. */
export function parseLenient (text: string): any {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      out += text.slice(start, i + 1)
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
    } else out += c
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1').replace(/^﻿/, ''))
}

const packVersion = (pack: string): string => pack === 'vanilla' ? '0' : pack.slice('vanilla_'.length)

function files (dir: string): string[] {
  return readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.json') ? [join(dir, f)] : [])
}

/**
 * The server's definitions of `kind` (`entities`, `biomes`, `items`), each JSON by the identifier `id` gives
 * it, the latest pack's where several packs define it.
 */
export function behaviorPackDefinitions (b: Build, kind: string, id: (json: any) => string | undefined): Map<string, any> {
  const root = join(serverDir(b), 'behavior_packs')
  if (!existsSync(root)) throw new Error(`${b.serverVersion}: no ${root} (pnpm servers)`)
  const packs = readdirSync(root).filter(p => p === 'vanilla' || /^vanilla_\d+(\.\d+)*$/.test(p)).sort((a, b) => compareVersions(packVersion(a), packVersion(b)))
  const out = new Map<string, any>()
  for (const pack of packs) {
    const texts: string[] = []
    const folder = join(root, pack, kind), archive = join(root, pack, '__brarchive', `${kind}.brarchive`)
    if (existsSync(folder)) for (const f of files(folder)) texts.push(readFileSync(f, 'utf8'))
    if (existsSync(archive)) texts.push(...readBrarchive(archive).values())
    for (const text of texts) {
      // the newer archives also hold definitions compiled to a binary form (MCB): not JSON, and left out
      if (text.startsWith('\x7fMCB')) continue
      const json = parseLenient(text)
      const key = id(json)
      if (key) out.set(key, json)
    }
  }
  return out
}

/** A file of the behavior packs by its pack-relative path (loot_tables/entities/zombie.json), the latest pack's. */
export function behaviorPackFile (b: Build, path: string): any | undefined {
  const root = join(serverDir(b), 'behavior_packs')
  const packs = readdirSync(root).filter(p => p === 'vanilla' || /^vanilla_\d+(\.\d+)*$/.test(p)).sort((a, b) => compareVersions(packVersion(b), packVersion(a)))
  for (const pack of packs) {
    const file = join(root, pack, ...path.split('/'))
    if (existsSync(file)) return parseLenient(readFileSync(file, 'utf8'))
  }
  return undefined
}
