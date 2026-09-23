// effects.json: exactly the server's mob effects (effects.json of the agent), by its ids; each name the
// resource name in PascalCase, each displayName the language file's, good or bad as the game marks it.
import { sameSet, unique, type Validator } from '../context.ts'

const pascal = (s: string): string => s.split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')

export const effects: Validator = (list: any[], { server, files, bad }) => {
  const own = server.effects()
  unique(list, e => e.id, 'effect id', bad)
  unique(list, e => e.name, 'effect', bad)
  sameSet(list.map(e => String(e.id)), own.map(e => String(e.id)), 'effect ids', bad)
  const byId = new Map(own.map(e => [e.id, e]))
  const lang = files('language')
  for (const e of list) {
    const s = byId.get(e.id)
    if (!s) continue
    const at = `${e.id} ${e.name}:`
    const displayName = lang[s.descriptionId]?.trim()
    if (e.displayName !== displayName) bad(`${at} displayName ${JSON.stringify(e.displayName)}, the language file's ${JSON.stringify(displayName)}`)
    if (e.name !== pascal(s.name ?? displayName ?? '')) bad(`${at} name, the server's ${s.name}`)
    if (e.type !== (s.harmful ? 'bad' : 'good')) bad(`${at} type ${e.type}, the server's harmful ${s.harmful}`)
  }
}
