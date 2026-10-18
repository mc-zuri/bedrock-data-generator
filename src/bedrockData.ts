// A bedrock-data checkout, read as its README says (formatVersion 1). Only its releases are read: a preview is kept
// there by its downloads alone.
import nbt from 'prismarine-nbt'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const FORMAT_VERSION = 1

export type Platform = 'linux' | 'windows'

export interface BuildJson {
  build: string
  version: string
  channel: 'release' | 'preview'
  binary: Partial<Record<Platform, { url: string; sha256: string; size: number }>>
  data?: Partial<Record<'language' | 'blockPalette' | 'blockShapes' | 'blocks' | 'items' | 'enchantments', { file: string; from: Platform }>>
}

/** A block state as block_palette.nbt has it: its name, its properties as NBT tags, the block state version */
export interface BlockState {
  name: string
  states: Record<string, { type: string; value: unknown }>
  version: number
}

export interface Drop {
  item: string
  aux: number
  data: number
  minCount: number
  maxCount: number
  hits: number
}

/** What the game says of a block state (blocks.json.gz) */
export interface StateFacts {
  data: number
  hardness: number
  explosionResistance: number
  friction: number
  flameOdds: number
  burnOdds: number
  lightEmission: number
  lightDampening: number
  canContainLiquid: boolean
  mapColor: number[]
  destroySpeeds: Record<string, number>
  harvestedBy: string[]
  drops: { samples: number; items: Drop[] }
}

export interface BlockFacts {
  name: string
  id: number
  descriptionId: string
  tags: string[]
  requiresCorrectTool: boolean
  translucency: number
  /** an index into states */
  defaultState: number
  loot?: string[]
  states: StateFacts[]
}

export interface LootPool {
  entries?: { type?: string; name?: string; pools?: LootPool[] }[]
}

export interface BlockTypes {
  blocks: BlockFacts[]
  lootTables: Record<string, { pools?: LootPool[] }>
}

export interface Item {
  name: string
  id: number
  descriptionId: string
  maxStackSize: number
  maxDamage: number
  enchantSlots: number
  tags: string[]
  repairItems: string[]
  componentBased: boolean
  version?: string | number
  nbt?: unknown
}

export interface Items {
  items: Item[]
  aliases: { name: string; item: string }[]
  complexAliases: { name: string; items: string[] }[]
  /** the creative list, each stack's block state a runtime id */
  creative: { item: string; metadata: number; blockState: number | null; nbt?: unknown }[]
}

export interface Enchantment {
  id: number
  name: string
  descriptionId: string
  frequency: number
  tradeable: boolean
  primarySlots: number
  secondarySlots: number
  minLevel: number
  maxLevel: number
  minCost: number[]
  maxCost: number[]
  incompatible: number[]
  treasureOnly: boolean
  discoverable: boolean
}

export interface Enchantments {
  enchantments: Enchantment[]
}

/** [minX, minY, minZ, maxX, maxY, maxZ], in the block's own coordinates */
export type Box = number[]

export interface StateShapes {
  collision: Box[]
  visual: Box
  ui: Box
  outline: Box
  camera?: Box | null
}

/** Every block type in runtime id order, each with its states' shapes in the palette's order */
export interface BlockShapes {
  blocks: { name: string; states: StateShapes[] }[]
}

export interface Language {
  locale: 'en_US'
  /** each resource pack's strings, vanilla first */
  packs: Record<string, Record<string, string>>
}

interface VersionsJson {
  formatVersion: number
  release: { latest?: string; builds: string[] }
}

export class BedrockData {
  readonly root: string
  /** release builds, newest first */
  readonly releases: string[]
  private readonly builds = new Map<string, BuildJson | undefined>()

  constructor(root: string) {
    this.root = root
    const file = join(root, 'versions.json')
    if (!existsSync(file)) throw new Error(`no ${file}: is ${root} a bedrock-data checkout?`)
    const versions = JSON.parse(readFileSync(file, 'utf8')) as VersionsJson
    if (versions.formatVersion !== FORMAT_VERSION) throw new Error(`${file} is formatVersion ${versions.formatVersion}; this generator reads ${FORMAT_VERSION}`)
    this.releases = versions.release.builds
  }

  build(build: string): BuildJson | undefined {
    if (!this.builds.has(build)) {
      const file = join(this.root, 'release', build, 'build.json')
      this.builds.set(build, existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as BuildJson) : undefined)
    }
    return this.builds.get(build)
  }

  hasLanguage(build: string): boolean {
    return this.build(build)?.data?.language !== undefined
  }

  language(build: string): Language {
    const file = this.build(build)?.data?.language?.file
    if (file === undefined) throw new Error(`release/${build} has no language`)
    return JSON.parse(gunzipSync(readFileSync(join(this.root, 'release', build, file))).toString('utf8')) as Language
  }

  /** whether bedrock-data has every one of `kinds` for `build` */
  has(build: string, ...kinds: (keyof NonNullable<BuildJson['data']>)[]): boolean {
    const data = this.build(build)?.data
    return kinds.every((kind) => data?.[kind] !== undefined)
  }

  hasBlockShapes(build: string): boolean {
    return this.has(build, 'blockShapes')
  }

  private file(build: string, kind: keyof NonNullable<BuildJson['data']>): Buffer {
    const file = this.build(build)?.data?.[kind]?.file

    if (file === undefined) {
      throw new Error(`release/${build} has no ${kind}`)
    }

    return readFileSync(join(this.root, 'release', build, file))
  }

  private gunzippedJson<T>(build: string, kind: keyof NonNullable<BuildJson['data']>): T {
    return JSON.parse(gunzipSync(this.file(build, kind)).toString('utf8')) as T
  }

  blockShapes(build: string): BlockShapes {
    return this.gunzippedJson<BlockShapes>(build, 'blockShapes')
  }

  blocks(build: string): BlockTypes {
    return this.gunzippedJson<BlockTypes>(build, 'blocks')
  }

  items(build: string): Items {
    return this.gunzippedJson<Items>(build, 'items')
  }

  enchantments(build: string): Enchantments {
    return this.gunzippedJson<Enchantments>(build, 'enchantments')
  }

  /** Every block state, in runtime id order */
  palette(build: string): BlockState[] {
    const root = nbt.parseUncompressed(gunzipSync(this.file(build, 'blockPalette')), 'big') as { value: { blocks?: { value?: { value?: Record<string, { value: unknown }>[] } } } }
    const entries = root.value.blocks?.value?.value

    if (!Array.isArray(entries)) {
      throw new Error(`release/${build}: block_palette.nbt has no blocks list`)
    }

    return entries.map((entry) => ({ name: entry.name.value as string, states: entry.states.value as BlockState['states'], version: entry.version.value as number }))
  }
}
