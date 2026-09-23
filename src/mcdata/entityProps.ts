// The entities.json fields the server says, for every entity whichever way its entry was made (kept from
// minecraft-data or made by entities.ts), from the definitions in its vanilla behavior packs (packs.ts) and
// its en_US.lang:
// - width, height (and length, where the entry has one): the definition's minecraft:collision_box: an adult
//   component group's where there is one (the spawn event gives most mobs an adult or a baby group), else the
//   base components';
// - displayName: the language file's entity.<name>.name;
// - type and category: by the definition (entityKind: its families, spawn category, projectile component),
//   the latest build's where it has the entity (an entity is the same kind in every version; the older
//   definitions say less), in minecraft-data's words.
// An entity with no definition (item, painting, falling_block, ...: defined in code) keeps its entry's.
import type { Build } from '../config.ts'
import { behaviorPackDefinitions } from './packs.ts'


export function entityDefinitions (b: Build): Map<string, any> {
  return behaviorPackDefinitions(b, 'entities', j => j['minecraft:entity']?.description?.identifier?.replace(/^minecraft:/, ''))
}

export function collisionBox (e: any): { width: number, height: number } | undefined {
  const groups = Object.entries<any>(e.component_groups ?? {})
  const adult = groups.find(([name, g]) => /adult/.test(name) && !/baby/.test(name) && g['minecraft:collision_box'])
  const box = adult?.[1]['minecraft:collision_box'] ?? e.components?.['minecraft:collision_box']
  return typeof box?.width === 'number' && typeof box?.height === 'number' ? box : undefined
}

/** An entity definition's type and category (minecraft-data's words), undefined where it says neither. */
export function entityKind (e: any): { type: string, category: string } | undefined {
  if (!e) return undefined
  const groups = [e.components, ...Object.values<any>(e.component_groups ?? {})]
  const families = new Set<string>(groups.flatMap(c => c?.['minecraft:type_family']?.family ?? []))
  const spawn: string = e.description?.spawn_category ?? ''
  const has = (f: string) => families.has(f)
  if (has('player')) return { type: 'player', category: 'UNKNOWN' }
  if (groups.some(c => c?.['minecraft:projectile']) || has('projectile')) return { type: 'projectile', category: 'Projectiles' }
  if (has('minecart') || has('boat')) return { type: 'other', category: 'Vehicles' }
  if (has('armor_stand')) return { type: 'living', category: 'Immobile' }
  if (has('tnt')) return { type: 'other', category: 'Blocks' }
  if (has('inanimate') || has('lightning')) return { type: 'other', category: 'UNKNOWN' }
  if (spawn === 'monster' || has('monster')) return { type: 'hostile', category: 'Hostile mobs' }
  if (/water/.test(spawn) || has('fish') || has('aquatic')) return { type: 'water_creature', category: 'Passive mobs' }
  if (spawn === 'ambient') return { type: 'ambient', category: 'Passive mobs' }
  if (has('villager') || has('wandering_trader') || has('npc')) return { type: 'passive', category: 'Passive mobs' }
  if (spawn === 'creature' || has('animal')) return { type: 'animal', category: 'Passive mobs' }
  if (has('mob')) return { type: 'mob', category: 'Passive mobs' }
  return undefined
}

/** `list` (entities.json) with the server's fields set. */
export function withServerEntityFields (list: any[], defs: Map<string, any>, lang: Record<string, string>, reference: Map<string, any> = defs): any[] {
  return list.map(entry => {
    const out = { ...entry }
    const name = lang[`entity.${entry.name}.name`]
    if (name) out.displayName = name
    const def = defs.get(entry.name)?.['minecraft:entity']
    if (def) {
      const box = collisionBox(def)
      if (box) {
        out.width = box.width
        out.height = box.height
        // a Bedrock hitbox is square: its length is its width
        if (out.length != null) out.length = box.width
      }
    }
    const kind = entityKind(reference.get(entry.name)?.['minecraft:entity'] ?? def)
    if (kind) Object.assign(out, kind)
    else if (!out.type || out.type === 'UNKNOWN') Object.assign(out, { type: 'other', category: out.category ?? 'UNKNOWN' })
    return out
  })
}
