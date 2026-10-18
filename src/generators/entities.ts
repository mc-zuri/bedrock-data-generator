// entities.json: every entity the server sends a client in available_entity_identifiers (entities.json.gz), from what
// it says of each there, in its vanilla behavior packs' definitions and in its language:
// - id: its place in runtime id order, as minecraft-data's bedrock files number them (the packet's own order is a hash
//   map's, unlike from build to build); internalId: its runtime id, the numeric entity type;
// - displayName: the language's entity.<name>.name, else its name in title case;
// - width and height: its definition's minecraft:collision_box, an adult component group's where there is one (the
//   spawn event gives most mobs an adult or a baby group); null where it has none, or no definition (item,
//   falling_block, painting, leash_knot and others the game defines in code);
// - type and category: what its definition says it is (its families, spawn category, a projectile component), in
//   minecraft-data's words, but tnt other and UNKNOWN as Java's files have it since 1.17; other and UNKNOWN where it says
//   nothing.
// No length or offset: the server says neither.
import type { BedrockData, EntityDefinition } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical, withoutNamespace } from './utils/json.ts'
import { strings, titleCase } from './utils/names.ts'

export interface Entity {
  id: number
  internalId: number
  name: string
  displayName: string
  height: number | null
  width: number | null
  type: string
  category: string
}

interface Components {
  'minecraft:collision_box'?: { width?: unknown; height?: unknown }
  'minecraft:type_family'?: { family?: string[] }
  'minecraft:projectile'?: unknown
}

function collisionBox(definition: EntityDefinition | undefined): { width: number; height: number } | undefined {
  const groups = Object.entries(definition?.component_groups ?? {}) as [string, Components][]
  const adult = groups.find(([name, group]) => name.includes('adult') && !name.includes('baby') && group['minecraft:collision_box'])?.[1]
  const box = (adult ?? (definition?.components as Components | undefined))?.['minecraft:collision_box']
  return typeof box?.width === 'number' && typeof box.height === 'number' ? { width: box.width, height: box.height } : undefined
}

interface Said {
  /** whether one of its families is `family` */
  is: (family: string) => boolean
  spawn: string
  projectile: boolean
}

// what a definition says an entity is: the first that holds, in minecraft-data's words
const KINDS: [holds: (said: Said) => boolean, type: string, category: string][] = [
  [({ is }) => is('player'), 'player', 'UNKNOWN'],
  [({ is, projectile }) => projectile || is('projectile'), 'projectile', 'Projectiles'],
  [({ is }) => is('minecart') || is('boat'), 'other', 'Vehicles'],
  [({ is }) => is('armor_stand'), 'living', 'Immobile'],
  [({ is }) => is('inanimate') || is('lightning'), 'other', 'UNKNOWN'],
  [({ is, spawn }) => spawn === 'monster' || is('monster'), 'hostile', 'Hostile mobs'],
  [({ is, spawn }) => spawn.includes('water') || is('fish') || is('aquatic'), 'water_creature', 'Passive mobs'],
  [({ spawn }) => spawn === 'ambient', 'ambient', 'Passive mobs'],
  [({ is }) => is('villager') || is('wandering_trader') || is('npc'), 'passive', 'Passive mobs'],
  [({ is, spawn }) => spawn === 'creature' || is('animal'), 'animal', 'Passive mobs'],
  [({ is }) => is('mob'), 'mob', 'Passive mobs'],
]

function kind(definition: EntityDefinition | undefined): { type: string; category: string } {
  const components = [definition?.components, ...Object.values(definition?.component_groups ?? {})] as (Components | undefined)[]
  const families = new Set(components.flatMap((c) => c?.['minecraft:type_family']?.family ?? []))
  const said: Said = {
    is: (family) => families.has(family),
    spawn: definition?.description.spawn_category ?? '',
    projectile: components.some((c) => c?.['minecraft:projectile']),
  }
  const found = KINDS.find(([holds]) => holds(said))
  return found ? { type: found[1], category: found[2] } : { type: 'other', category: 'UNKNOWN' }
}

function entitiesJson(data: BedrockData, build: string): Entity[] {
  const { entities, definitions } = data.entities(build)
  const lang = strings(data.language(build))
  return [...entities]
    .sort((a, b) => a.id - b.id)
    .map((e, i) => {
      const name = withoutNamespace(e.name)
      const definition = definitions[e.name] as EntityDefinition | undefined
      const box = collisionBox(definition)
      return {
        id: i,
        internalId: e.id,
        name,
        displayName: lang.get(`entity.${name}.name`)?.trim() || titleCase(name),
        height: box?.height ?? null,
        width: box?.width ?? null,
        ...kind(definition),
      }
    })
}

export const entities: Generator = {
  key: 'entities',
  after: ['biomes', 'blockCollisionShapes', 'blockStates', 'blocks'],
  has: (data, build) => data.has(build, 'entities', 'language'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(entitiesJson(data, build), null, 2)
  },
  meaning: canonical,
}
