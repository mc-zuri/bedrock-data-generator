// The entities.json fields the server says, for every entity whichever way its entry was made (kept from
// minecraft-data or made by entities.ts), from the definitions in its vanilla behavior packs (packs.ts) and
// its en_US.lang:
// - width, height (and length, where the entry has one): the definition's minecraft:collision_box: an adult
//   component group's where there is one (the spawn event gives most mobs an adult or a baby group), else the
//   base components';
// - displayName: the language file's entity.<name>.name;
// - type (where the entry has none, or UNKNOWN) and category (where it has none): from the definition's
//   spawn category and families, in minecraft-data's words (`other` for an entity with no definition).
// An entity with no definition (item, painting, falling_block, ...: defined in code) keeps its entry's.
import type { Build } from '../config.ts'
import { behaviorPackDefinitions } from './packs.ts'

const CATEGORY: Record<string, string> = { hostile: 'Hostile mobs', animal: 'Passive mobs', water_creature: 'Passive mobs', ambient: 'Passive mobs', passive: 'Passive mobs', projectile: 'Projectiles', player: 'UNKNOWN', other: 'UNKNOWN' }

export function entityDefinitions (b: Build): Map<string, any> {
  return behaviorPackDefinitions(b, 'entities', j => j['minecraft:entity']?.description?.identifier?.replace(/^minecraft:/, ''))
}

export function collisionBox (e: any): { width: number, height: number } | undefined {
  const groups = Object.entries<any>(e.component_groups ?? {})
  const adult = groups.find(([name, g]) => /adult/.test(name) && !/baby/.test(name) && g['minecraft:collision_box'])
  const box = adult?.[1]['minecraft:collision_box'] ?? e.components?.['minecraft:collision_box']
  return typeof box?.width === 'number' && typeof box?.height === 'number' ? box : undefined
}

function typeOf (e: any): string {
  const families = new Set<string>([e.components, ...Object.values<any>(e.component_groups ?? {})].flatMap(c => c?.['minecraft:type_family']?.family ?? []))
  const category: string = e.description?.spawn_category ?? ''
  if (families.has('player')) return 'player'
  if (e.components?.['minecraft:projectile']) return 'projectile'
  if (category === 'monster' || families.has('monster')) return 'hostile'
  if (/water|axolotl/.test(category)) return 'water_creature'
  if (category === 'ambient') return 'ambient'
  if (category === 'creature' || families.has('animal')) return 'animal'
  // the older definitions have no spawn category: a mob is all they say
  return families.has('mob') ? 'mob' : 'other'
}

/** `list` (entities.json) with the server's fields set. */
export function withServerEntityFields (list: any[], defs: Map<string, any>, lang: Record<string, string>): any[] {
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
      if (!out.type || out.type === 'UNKNOWN') out.type = typeOf(def)
    } else if (!out.type || out.type === 'UNKNOWN') out.type = 'other'
    if (out.category === undefined && out.type) out.category = CATEGORY[out.type] ?? 'UNKNOWN'
    return out
  })
}
