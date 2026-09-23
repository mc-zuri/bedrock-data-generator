// What a build's server says, from this repo's data/<build>/ (committed): the ground truth the published
// files are checked against. Each part is read once, when first asked for.
import { existsSync, readFileSync } from 'node:fs'
import { dataFile, type Build } from '../config.ts'
import { attributes } from '../mcdata/attributes.ts'
import { readBlockStates, type BlockState } from '../mcdata/blocks.ts'
import { biomeDefinitions, type BiomeDefinition } from '../mcdata/biomes.ts'
import { entityIdentifiers, type EntityId } from '../mcdata/entities.ts'
import { itemStates, type ItemState } from '../mcdata/items.ts'
import { readNbt } from '../nbt.ts'

const bare = (name: string): string => name.replace(/^minecraft:/, '')
const json = (b: Build, file: string): any => JSON.parse(readFileSync(dataFile(b, file), 'utf8'))
const byBareName = <T>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).map(([n, t]) => [bare(n), t]))

export interface ServerBlockType {
  defaultBlockStateId: number
  hardness: number
  explosionResistance: number
  lightEmission: number
  lightDampening: number
  descriptionId?: string
  requiresCorrectToolForDrops?: boolean
  tags?: string[]
}

export interface ServerEffect { id: number, name: string, descriptionId: string, harmful: boolean }
export interface ServerEnchantment { id: number, name: string, descriptionId: string, frequency: number, tradeable: boolean, minLevel: number, maxLevel: number }

export interface Server {
  build: Build
  /** block_palette.nbt: one state per runtime id */
  palette: () => BlockState[]
  /** block-state-shapes.nbt: each state's collision boxes, by runtime id */
  shapes: () => number[][][]
  /** block_types.json by name without minecraft: */
  blockTypes: () => Record<string, ServerBlockType>
  /** item_types.json by name without minecraft: */
  itemTypes: () => Record<string, { maxStackSize: number, maxDamage: number, descriptionId?: string }>
  /** the item registry the server sends (item_registry, or start_game's itemstates) */
  itemStates: () => ItemState[]
  /** available_entity_identifiers */
  entityIds: () => EntityId[]
  /** biome_definition_list, by name */
  biomeDefinitions: () => Record<string, BiomeDefinition>
  /** biome_ids.json (the agent reads it where it finds the registry): name -> id */
  biomeIds: () => Record<string, number> | undefined
  /** update_attributes: each attribute once, as attributes.json names it */
  attributes: () => { name: string, resource: string, default: number, min: number, max: number }[]
  effects: () => ServerEffect[]
  enchantments: () => ServerEnchantment[]
}

const cache = new Map<string, Server>()

export function server (b: Build): Server {
  const cached = cache.get(b.serverVersion)
  if (cached) return cached
  const once = <T>(read: () => T): (() => T) => {
    let value: { v: T } | undefined
    return () => (value ??= { v: read() }).v
  }
  const s: Server = {
    build: b,
    palette: once(() => readBlockStates(dataFile(b, 'block_palette.nbt'))),
    shapes: once(() => readNbt(dataFile(b, 'block-state-shapes.nbt'), 'little').shapes.map((r: any) => r.collisionShape)),
    blockTypes: once(() => byBareName(json(b, 'block_types.json'))),
    itemTypes: once(() => byBareName(json(b, 'item_types.json'))),
    itemStates: once(() => itemStates(b)),
    entityIds: once(() => entityIdentifiers(b)),
    biomeDefinitions: once(() => biomeDefinitions(b)),
    biomeIds: once(() => existsSync(dataFile(b, 'biome_ids.json')) ? json(b, 'biome_ids.json') : undefined),
    attributes: once(() => attributes(b)),
    effects: once(() => json(b, 'effects.json')),
    enchantments: once(() => json(b, 'enchantments.json'))
  }
  cache.set(b.serverVersion, s)
  return s
}
