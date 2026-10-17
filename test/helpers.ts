import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

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
