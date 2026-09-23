// language.json of a build: the en_US strings of the vanilla resource pack its server ships
// (resource_packs/vanilla/texts/en_US.lang). Ported from minecraft-data-extractor-legacy2
// src/generators/language.ts.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Build } from '../config.ts'
import { serverDir } from '../server.ts'

export const langFile = (b: Build): string => join(serverDir(b), 'resource_packs', 'vanilla', 'texts', 'en_US.lang')

/**
 * The .lang as minecraft-data's extractor parses it: each line trimmed, a comment (from "#") cut, then split
 * on "=" keeping the first two fields (so a value's leading space stays, anything after a second "=" goes);
 * the key without trailing spaces.
 */
export function language (b: Build): Record<string, string> {
  const file = langFile(b)
  if (!existsSync(file)) throw new Error(`language: no ${file} (pnpm servers)`)
  const lang: Record<string, string> = {}
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim().replace(/#.*$/g, '').trim()
    if (!line) continue
    const [key, value] = line.split('=')
    if (value === undefined) continue
    // a key written "key =value" is the key (1.26.10's review.item.post.rating.submit.toast.error.line2.not.owned)
    lang[key.trimEnd()] = value
  }
  return lang
}

export const languageJson = (lang: Record<string, string>): string => JSON.stringify(lang, null, 2)
