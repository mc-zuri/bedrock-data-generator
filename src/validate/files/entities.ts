// entities.json: exactly the entities the server sends (available_entity_identifiers), each name, id and
// internal id once, the internal id the server's; the language file's name where it has one; a Bedrock
// hitbox square (length its width), and where the server is there, its definition's collision box and kind.
import { versions, compareVersions } from '../../config.ts'
import { collisionBox, entityKind } from '../../mcdata/entityProps.ts'
import { server as serverOf } from '../server.ts'
import { sameFloat, sameSet, unique, type Validator } from '../context.ts'

export const entities: Validator = (list: any[], { server, files, bad }) => {
  const ids = server.entityIds()
  unique(list, e => e.name, 'entity', bad)
  unique(list, e => e.id, 'entity id', bad)
  unique(list, e => e.internalId, 'entity internalId', bad)
  const rid = new Map(ids.map(e => [e.id.replace(/^minecraft:/, ''), e.rid]))
  sameSet(list.map(e => e.name), rid.keys(), 'entities', bad)
  const lang = files('language')
  const defs = server.entityDefinitions()
  for (const e of list) {
    const at = `${e.name}:`
    if (rid.has(e.name) && rid.get(e.name) !== e.internalId) bad(`${at} internalId ${e.internalId}, the server's ${rid.get(e.name)}`)
    const name = lang[`entity.${e.name}.name`]
    if (name && e.displayName !== name) bad(`${at} displayName ${JSON.stringify(e.displayName)}, the language file's ${JSON.stringify(name)}`)
    if (e.length !== undefined && e.length !== e.width) bad(`${at} length ${e.length}, its width ${e.width}`)
    const def = defs?.get(e.name)?.['minecraft:entity']
    const box = def && collisionBox(def)
    // its kind: the latest build's definition's (or its own), where the server is there
    const latest = defs && serverOf([...versions].sort((x, y) => compareVersions(x.serverVersion, y.serverVersion)).at(-1)!).entityDefinitions()
    const kind = defs && entityKind(latest?.get(e.name)?.['minecraft:entity'] ?? def)
    if (kind && (e.type !== kind.type || e.category !== kind.category)) bad(`${at} ${e.type} / ${e.category}, its definition says ${kind.type} / ${kind.category}`)
    if (box && (!sameFloat(e.width, box.width) || !sameFloat(e.height, box.height))) bad(`${at} ${e.width} x ${e.height}, its definition's collision box ${box.width} x ${box.height}`)
  }
}
