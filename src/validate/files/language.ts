// language.json: the server's en_US.lang (where the server is there: exactly its keys and strings); a name
// for every effect and enchantment the server describes by a key (its description id), and for most blocks.
import { type Validator } from '../context.ts'

export const language: Validator = (lang: Record<string, string>, { server, bad }) => {
  const own = server.language()
  if (own) {
    const missing = Object.keys(own).filter(k => !(k in lang)), extra = Object.keys(lang).filter(k => !(k in own))
    const changed = Object.keys(own).filter(k => k in lang && lang[k] !== own[k])
    if (missing.length) bad(`${missing.length} keys of the server's en_US.lang missing (${missing.slice(0, 5).join(', ')})`)
    if (extra.length) bad(`${extra.length} keys the server's en_US.lang does not have (${extra.slice(0, 5).join(', ')})`)
    if (changed.length) bad(`${changed.length} strings not the server's (${changed.slice(0, 5).join(', ')})`)
  }
  const missing: string[] = []
  for (const e of server.effects()) if (!lang[e.descriptionId]) missing.push(e.descriptionId)
  for (const e of server.enchantments()) if (!lang[e.descriptionId]) missing.push(e.descriptionId)
  if (missing.length) bad(`no name for ${missing.length} description ids (${missing.slice(0, 8).join(', ')})`)
  const named = (d: string | undefined) => d !== undefined && lang[d.endsWith('.name') ? d : `${d}.name`] !== undefined
  // most blocks are named by their description id (every build names over 60%): a file that names few of
  // them is not the game's (an item's description id is often not a key: block items use their block's)
  const blocks = Object.values(server.blockTypes())
  const blockShare = blocks.filter(t => named(t.descriptionId)).length / blocks.length
  if (blockShare < 0.55) bad(`names only ${(blockShare * 100).toFixed(0)}% of the blocks`)
}
