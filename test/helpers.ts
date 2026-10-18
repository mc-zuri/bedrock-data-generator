import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import nbt from 'prismarine-nbt'

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bedrock-data-generator-'))
}

/** A bedrock-data checkout of `releases` (build -> its vanilla strings; undefined: kept without language). */
export function bedrockDataOf(releases: Record<string, Record<string, string> | undefined>, formatVersion = 1): string {
  const root = tempDir()
  const builds = Object.keys(releases).reverse()
  writeFileSync(join(root, 'versions.json'), JSON.stringify({ formatVersion, release: { latest: builds[0], builds }, preview: { builds: [] } }))
  for (const [build, vanilla] of Object.entries(releases)) {
    const dir = join(root, 'release', build)
    mkdirSync(dir, { recursive: true })
    const json = {
      build,
      version: build.split('.').slice(0, 3).join('.'),
      channel: 'release',
      binary: {},
      ...(vanilla && { data: { language: { file: 'language.json.gz', from: 'linux' } } }),
    }
    writeFileSync(join(dir, 'build.json'), JSON.stringify(json))
    if (vanilla) writeFileSync(join(dir, 'language.json.gz'), gzipSync(JSON.stringify({ locale: 'en_US', packs: { vanilla, chemistry: { 'item.element_1.name': 'Hydrogen' } } })))
  }
  return root
}

/** A minecraft-data checkout's data/: dataPaths.json's bedrock section, and files (path under data/ -> text). */
export function minecraftDataOf(bedrock: Record<string, Record<string, string>>, files: Record<string, string> = {}, eol = '\n'): string {
  const root = tempDir()
  mkdirSync(join(root, 'data'), { recursive: true })
  writeFileSync(join(root, 'data', 'dataPaths.json'), (JSON.stringify({ pc: { '1.21.4': { blocks: 'pc/1.21.4' } }, bedrock }, null, 2) + '\n').replace(/\n/g, eol))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, 'data', path, '..'), { recursive: true })
    writeFileSync(join(root, 'data', path), text)
  }
  return root
}

/** `build` of the bedrock-data checkout at `root` given block shapes: each block's states' collision boxes. */
export function withBlockShapes(root: string, build: string, blocks: Record<string, number[][][]>): void {
  const dir = join(root, 'release', build)
  const file = join(dir, 'build.json')
  const json = JSON.parse(readFileSync(file, 'utf8')) as { data?: Record<string, unknown> }
  json.data = { ...json.data, blockShapes: { file: 'block_shapes.json.gz', from: 'linux' } }
  writeFileSync(file, JSON.stringify(json))
  const cube = [0, 0, 0, 1, 1, 1]
  const shapes = {
    blocks: Object.entries(blocks).map(([name, states]) => ({
      name: `minecraft:${name}`,
      states: states.map((collision) => ({ collision, visual: cube, ui: cube, outline: cube })),
    })),
  }
  writeFileSync(join(dir, 'block_shapes.json.gz'), gzipSync(JSON.stringify(shapes)))
}

function withData(root: string, build: string, kind: string, file: string, content: Buffer): void {
  const dir = join(root, 'release', build)
  const buildFile = join(dir, 'build.json')
  const json = JSON.parse(readFileSync(buildFile, 'utf8')) as { data?: Record<string, unknown> }
  json.data = { ...json.data, [kind]: { file, from: 'linux' } }
  writeFileSync(buildFile, JSON.stringify(json))
  writeFileSync(join(dir, file), content)
}

/** A block of the sample release: its name, numeric id, description id, states' facts */
export interface SampleBlock {
  name: string
  id: number
  states?: number
  hardness?: number
  dampening?: number
  requiresCorrectTool?: boolean
  speeds?: Record<string, number>
  harvestedBy?: string[]
  drops?: string[]
  /** a state's own drops, where they are not `drops` */
  stateDrops?: Record<number, string[]>
  loot?: string
  collides?: boolean
}

/**
 * `build` of the bedrock-data checkout at `root` given blocks (blocks.json.gz, block_shapes.json.gz, block_palette.nbt),
 * items (items.json.gz: `items` by name, each id its index) and enchantments
 */
export function withBlocks(root: string, build: string, blocks: SampleBlock[], items: string[], creative: { item: string; blockState: number | null }[] = []): void {
  const cube = [0, 0, 0, 1, 1, 1]
  const facts = {
    blocks: blocks.map((b) => ({
      name: `minecraft:${b.name}`,
      id: b.id,
      descriptionId: `tile.${b.name}`,
      tags: [],
      requiresCorrectTool: b.requiresCorrectTool ?? false,
      translucency: 0,
      defaultState: 0,
      ...(b.loot ? { loot: [b.loot] } : {}),
      states: Array.from({ length: b.states ?? 1 }, (_, state) => ({
        data: 0,
        hardness: b.hardness ?? 1,
        explosionResistance: 1,
        friction: 0.6,
        flameOdds: 0,
        burnOdds: 0,
        lightEmission: 0,
        lightDampening: b.dampening ?? 15,
        canContainLiquid: false,
        mapColor: [0, 0, 0, 0],
        destroySpeeds: b.speeds ?? {},
        harvestedBy: b.harvestedBy ?? [],
        drops: { samples: b.loot ? 0 : 64, items: (b.stateDrops?.[state] ?? b.drops ?? []).map((item) => ({ item, aux: 0, data: 0, minCount: 1, maxCount: 1, hits: 64 })) },
      })),
    })),
    lootTables: Object.fromEntries(blocks.flatMap((b) => (b.loot ? [[b.loot, { pools: [{ entries: [{ type: 'item', name: 'minecraft:stick' }] }] }] as const] : []))),
  }
  const shapes = {
    blocks: blocks.map((b) => ({
      name: `minecraft:${b.name}`,
      states: Array.from({ length: b.states ?? 1 }, () => ({ collision: b.collides === false ? [] : [cube], visual: cube, ui: cube, outline: cube })),
    })),
  }
  const registry = {
    items: items.map((name, id) => ({
      name: `minecraft:${name}`,
      id,
      descriptionId: `item.${name}`,
      descriptionName: name.replace(/_/g, ' ').replace(/\b\S/g, (c) => c.toUpperCase()),
      maxStackSize: name.endsWith('_sword') ? 1 : 64,
      maxDamage: name.endsWith('_sword') ? 1561 : 0,
      enchantSlots: name.endsWith('_sword') ? 16 : 0,
      tags: [],
      repairItems: name === 'diamond_sword' ? ['minecraft:diamond'] : [],
      componentBased: false,
    })),
    aliases: [],
    complexAliases: [],
    creative: creative.map((c) => ({ item: `minecraft:${c.item}`, metadata: 0, blockState: c.blockState })),
  }
  const enchantments = {
    enchantments: [
      {
        id: 0,
        name: 'sharpness',
        descriptionId: 'enchantment.damage.all',
        frequency: 10,
        tradeable: true,
        primarySlots: 16,
        secondarySlots: 512,
        minLevel: 1,
        maxLevel: 5,
        minCost: [1, 12, 23, 34, 45],
        maxCost: [21, 32, 43, 54, 65],
        incompatible: [],
        treasureOnly: false,
        discoverable: true,
      },
    ],
  }
  const states = blocks.flatMap((b) =>
    Array.from({ length: b.states ?? 1 }, (_, i) => ({
      name: { type: 'string', value: `minecraft:${b.name}` },
      states: { type: 'compound', value: b.states ? { i: { type: 'int', value: i } } : {} },
      version: { type: 'int', value: 18168865 },
    })),
  )
  const palette = nbt.writeUncompressed({ type: 'compound', name: '', value: { blocks: { type: 'list', value: { type: 'compound', value: states } } } } as nbt.NBT, 'big')
  withData(root, build, 'blocks', 'blocks.json.gz', gzipSync(JSON.stringify(facts)))
  withData(root, build, 'blockShapes', 'block_shapes.json.gz', gzipSync(JSON.stringify(shapes)))
  withData(root, build, 'items', 'items.json.gz', gzipSync(JSON.stringify(registry)))
  withData(root, build, 'enchantments', 'enchantments.json.gz', gzipSync(JSON.stringify(enchantments)))
  withData(root, build, 'blockPalette', 'block_palette.nbt', gzipSync(palette))
}

/** `build` of the bedrock-data checkout at `root` given one of the kinds read whole (biomes.json.gz: { biomes }) */
export function withKind(root: string, build: string, kind: string, value: unknown): void {
  withData(root, build, kind, `${kind}.json.gz`, gzipSync(JSON.stringify(value)))
}
