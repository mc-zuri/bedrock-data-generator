// language.json: the server's en_US.lang; a name for every block, item, entity, effect and enchantment the
// server describes by a key (its description id) where the game has one: the keys the other files' names
// come from are there.
import { type Validator } from '../context.ts'

export const language: Validator = (lang: Record<string, string>, { server, bad }) => {
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
