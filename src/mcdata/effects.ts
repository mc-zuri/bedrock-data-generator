// effects.json of a build: every mob effect the server has (effects.json, exported by the agent), by its
// Bedrock id: its name as minecraft-data writes it (the resource name in PascalCase: fatal_poison ->
// FatalPoison), its display name from the language file (its description id), good or bad as the game marks
// it harmful. Bedrock numbers its effects its own way (25 is fatal_poison, 26 conduit_power, ...): the Java
// effects.json minecraft-data used for every bedrock version did not fit it.
import { readFileSync } from 'node:fs'
import { dataFile, type Build } from '../config.ts'

interface ServerEffect { id: number, descriptionId: string, name?: string, harmful: boolean }

const pascal = (s: string): string => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')

export function effects (b: Build, lang: Record<string, string>): any[] {
  const list: ServerEffect[] = JSON.parse(readFileSync(dataFile(b, 'effects.json'), 'utf8'))
  return list.map(e => {
    const displayName = lang[e.descriptionId]?.trim()
    if (!displayName) throw new Error(`effects: no name for ${e.descriptionId}`)
    // builds without a resource name: the display name's words
    return { id: e.id, name: pascal(e.name ?? displayName), displayName, type: e.harmful ? 'bad' : 'good' }
  })
}

export const effectsJson = (list: any[]): string => JSON.stringify(list, null, 2)
