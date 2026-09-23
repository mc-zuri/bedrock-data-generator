// entities.json of a build: every entity the server sends in available_entity_identifiers, numbered in the
// packet's order, its runtime id (rid) as internalId, its hitbox and kind from the table below or the Java
// entity it maps to. Ported from minecraft-data-extractor-legacy2 src/generators/entities.ts.
import { createRequire } from 'node:module'
import nbt from 'prismarine-nbt'
import { dataFile, type Build } from '../config.ts'
import { decodePackets } from '../nbt.ts'
import { strip } from './format.ts'

const require = createRequire(import.meta.url)
const { createDeserializer } = require('bedrock-protocol/src/transforms/serializer.js')

const titleCase = (str: string): string => str.split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')

// The packet has no hitboxes and no Java names, so legacy2 keeps them by hand: Bedrock hitboxes (length and
// offset are Bedrock's own), the Java name where the Bedrock id differs from it, and the whole hitbox of the
// Bedrock-only entities. A Java entity of the Bedrock id's own name comes first; height and width fall back
// to the Java entity's.
type EntityExtra = { java?: string, height?: number, width?: number, length?: number, offset?: number }
const ENTITY_REGISTRY: Record<string, EntityExtra> = {
  agent: { height: 0, width: 0 },
  area_effect_cloud: { height: 0.5, width: 1 },
  armor_stand: { height: 1.975, width: 0.5 },
  arrow: { height: 0.25, width: 0.25 },
  axolotl: { height: 0.42, width: 0.7, length: 0.7, offset: 0 },
  balloon: { height: 0, width: 0 },
  bat: { height: 0.9, width: 0.5 },
  bee: { height: 0.6, width: 0.6 },
  blaze: { height: 1.8, width: 0.6 },
  boat: { height: 0.6, width: 1.6, length: 1.6, offset: 0.35 },
  breeze_wind_charge_projectile: { java: 'breeze_wind_charge' },
  cat: { height: 0.35, width: 0.3 },
  cave_spider: { height: 0.5, width: 0.7 },
  chalkboard: { height: 0, width: 0 },
  chest_boat: { height: 0.455, width: 1.4 },
  chest_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  chicken: { height: 0.7, width: 0.4 },
  cod: { height: 0.25, width: 0.5 },
  command_block_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  copper_golem: { height: 0.98, width: 0.6 },
  cow: { height: 1.4, width: 0.9 },
  creeper: { height: 1.7, width: 0.6, length: 0.6, offset: 1.62 },
  dolphin: { height: 0.6, width: 0.9 },
  donkey: { height: 1.6, width: 1.3965 },
  dragon_fireball: { height: 1 },
  drowned: { height: 1.95, width: 0.6 },
  egg: { height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  elder_guardian: { height: 1.9975 },
  elder_guardian_ghost: { height: 0, width: 0 },
  ender_crystal: { java: 'end_crystal', height: 2, width: 2, length: 2, offset: 0 },
  ender_dragon: { height: 0, width: 0 },
  ender_pearl: { height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  enderman: { height: 2.9, width: 0.6 },
  endermite: { height: 0.3, width: 0.4 },
  evocation_fang: { java: 'evoker_fangs', height: 0.8, width: 0.5, length: 0.5, offset: 0 },
  evocation_illager: { java: 'evoker', height: 1.95, width: 0.6, length: 0.6, offset: 0 },
  eye_of_ender_signal: { java: 'eye_of_ender', height: 0.25, width: 0.25, length: 0, offset: 0 },
  falling_block: { height: 0.98, width: 0.98 },
  fireball: { height: 1 },
  fireworks_rocket: { java: 'firework_rocket', height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  fishing_hook: { java: 'fishing_bobber', height: 0, width: 0, length: 0, offset: 0 },
  fox: { height: 0.5, width: 1.25 },
  ghast: { height: 4 },
  glow_item_frame: { height: 0, width: 0 },
  glow_squid: { height: 0.8, width: 0.8, length: 0.8, offset: 0 },
  goat: { height: 1.3, width: 0.9, length: 0.9, offset: 0 },
  guardian: { height: 0.85 },
  hoglin: { height: 1.4, width: 1.3965, length: 1.3965, offset: 0 },
  hopper_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  horse: { height: 1.6, width: 1.3965 },
  husk: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  ice_bomb: { height: 0, width: 0 },
  iron_golem: { height: 2.7, width: 1.4 },
  item: { height: 0.25, width: 0.25, length: 0.25, offset: 0.125 },
  item_frame: { height: 0, width: 0 },
  leash_knot: { height: 0.5, width: 0.375 },
  lightning_bolt: { height: 0 },
  lingering_potion: { height: 0.25, width: 0.25 },
  llama: { height: 1.87, width: 0.9 },
  llama_spit: { height: 0.25 },
  magma_cube: { height: 0.51 },
  marker: { height: 0, width: 0, length: 0, offset: 0 },
  minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  mooshroom: { height: 1.4, width: 0.9 },
  moving_block: { height: 0, width: 0 },
  mule: { height: 1.6, width: 1.3965 },
  npc: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  ocelot: { height: 0.35, width: 0.3 },
  painting: { height: 0 },
  panda: { height: 1.25, width: 1.125, length: 1.825 },
  parrot: { height: 0.9, width: 0.5 },
  phantom: { height: 0.5, width: 0.9, length: 0.9, offset: 0.6 },
  pig: { height: 0.9 },
  piglin: { height: 1.95, width: 0.6, length: 0.6, offset: 0 },
  piglin_brute: { height: 1.95, width: 0.6, length: 0.6, offset: 0 },
  pillager: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  player: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  polar_bear: { height: 1.4, width: 1.3 },
  pufferfish: { height: 0.7, width: 0.7 },
  rabbit: { height: 0.5, width: 0.4 },
  ravager: { height: 1.9, width: 1.2 },
  salmon: { height: 0.5, width: 0.7 },
  sheep: { height: 1.3, width: 0.9 },
  shulker: { height: 1, width: 1 },
  shulker_bullet: { height: 0.3125 },
  silverfish: { height: 0.3, width: 0.4 },
  skeleton: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  skeleton_horse: { height: 1.6, width: 1.3965 },
  slime: { height: 0.51 },
  small_fireball: { height: 0.3125 },
  snow_golem: { height: 1.9, width: 0.7 },
  snowball: { height: 0.25 },
  spider: { height: 0.9, width: 1.4, length: 1.4, offset: 1 },
  splash_potion: { height: 0.25, width: 0.25, length: 0.25, offset: 0 },
  squid: { height: 0.8 },
  stray: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  strider: { height: 1.7, width: 0.9, length: 0, offset: 0 },
  sulfur_cube: { height: 0.49, width: 0.49 },
  thrown_trident: { java: 'trident', height: 0, width: 0, length: 0, offset: 0 },
  tnt: { height: 0.98, width: 0.98, length: 0.98, offset: 0 },
  tnt_minecart: { height: 0.7, width: 0.98, length: 0.98, offset: 0.35 },
  tripod_camera: { height: 0, width: 0 },
  tropicalfish: { java: 'tropical_fish', height: 0.6, width: 0.6, length: 0, offset: 0 },
  turtle: { height: 0.4, width: 1.2 },
  vex: { height: 0.8, width: 0.4 },
  villager_v2: { java: 'villager', height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  vindicator: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  wandering_trader: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  wind_charge_projectile: { java: 'wind_charge' },
  witch: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  wither: { height: 3.5, width: 0.9 },
  wither_skeleton: { height: 2.4, width: 0.7 },
  wither_skull: { height: 0.3125 },
  wither_skull_dangerous: { height: 0, width: 0 },
  wolf: { height: 0.85, width: 0.6 },
  xp_bottle: { java: 'experience_bottle', height: 0.25, width: 0.25, length: 0, offset: 0 },
  xp_orb: { java: 'experience_orb', height: 0, width: 0, length: 0, offset: 0 },
  zoglin: { height: 1.4, width: 1.3965, length: 1.3965, offset: 0 },
  zombie: { height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
  zombie_horse: { height: 1.6, width: 1.3965 },
  zombie_pigman: { java: 'zombified_piglin', height: 1.95, width: 0.6, length: 0.6, offset: 1.62 },
  zombie_villager_v2: { java: 'zombie_villager', height: 1.8, width: 0.6, length: 0.6, offset: 1.62 },
}

export interface EntityId { id: string, rid: number }

/** The entity identifiers the build's server sent (packets.nbt), in the packet's order. */
export function entityIdentifiers (b: Build): EntityId[] {
  const { protocol, packets } = decodePackets(dataFile(b, 'packets.nbt'))
  const packet = packets.find(p => p.name === 'available_entity_identifiers')
  if (!packet) throw new Error(`${b.serverVersion}: packets.nbt has no available_entity_identifiers`)
  return nbt.simplify(createDeserializer(protocol).parsePacketBuffer(packet.data).data.params.nbt).idlist
}

export function entities (idlist: EntityId[], javaEntities: any[]): any[] {
  const javaMap = new Map(javaEntities.map(e => [e.name, e]))
  return idlist.map((ent, ix) => {
    const name = strip(ent.id)
    const reg = ENTITY_REGISTRY[name]
    // a Java entity of the same name first, else the table's remap
    const java = javaMap.get(javaMap.has(name) ? name : (reg?.java ?? name))
    // the table's (Bedrock) hitbox first, Java's for the rest
    const height = reg?.height ?? java?.height
    const width = reg?.width ?? java?.width
    if (height == null || width == null) throw new Error(`entities: no height/width for ${ent.id}: add it to ENTITY_REGISTRY`)
    return {
      id: ix,
      internalId: ent.rid,
      name,
      displayName: java?.displayName ?? titleCase(name.replace(/_/g, ' ')),
      height,
      width,
      length: reg?.length,
      offset: reg?.offset,
      type: java?.type ?? '',
      category: java?.category
    }
  })
}

export const entitiesJson = (list: any[]): string => JSON.stringify(list, null, 2)
