// The external inputs of blocks.json and biomes.json, downloaded once into work/ (as minecraft-data-extractor-legacy2's
// geyser-mappings.ts and java-data.ts do):
// - the Geyser Java -> Bedrock block state map of the build, pinned in versions.json:
//   no `mg`: GeyserMC/mappings blocks.json (v1); `mg`: GeyserMC/mappings-generator generator_blocks.json
//   (v2), or, when that ref no longer has it, GeyserMC/mappings blocks.nbt (v3);
// - Geyser's Java -> Bedrock item map (GeyserMC/mappings items.json) at the same `mappings` pin;
// - the Java blocks.json, biomes.json and entities.json of `javaVersion`, items.json of `javaItemsVersion`, from the mc-zuri/node-minecraft-data fork
//   (bedrock-v2), which has the Java versions upstream minecraft-data does not have yet;
// - for biomes.json, PyMCTranslate's biome tables (pymctranslate.ts in legacy2).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { WORK_DIR, type Build } from '../config.ts'

const RAW = 'https://raw.githubusercontent.com'
const JAVA_REPO = 'mc-zuri/node-minecraft-data'
const JAVA_REF = 'bedrock-v2'

async function fetchRaw (repo: string, ref: string, path: string, optional = false): Promise<Buffer | null> {
  const url = `${RAW}/${repo}/${ref}/${path}`
  const res = await fetch(url)
  if (optional && res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function save (file: string, data: Buffer): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
}

export type GeyserBlocks = { kind: 'v1', json: any } | { kind: 'v2', json: any } | { kind: 'v3', nbt: Buffer }

export async function geyserBlocks (b: Build): Promise<GeyserBlocks> {
  if (!b.mappings) throw new Error(`versions.json: ${b.mcDataVersion} has no Geyser mappings pin`)
  const dir = join(WORK_DIR, 'mappings', b.mcDataVersion)
  const v1 = join(dir, 'generator_blocks_v1.json'), v2 = join(dir, 'generator_blocks_v2.json'), v3 = join(dir, 'generator_blocks_v3.nbt')
  if (!b.mg) {
    if (!existsSync(v1)) save(v1, (await fetchRaw('GeyserMC/mappings', b.mappings, 'blocks.json'))!)
    return { kind: 'v1', json: JSON.parse(readFileSync(v1, 'utf8')) }
  }
  if (!existsSync(v2) && !existsSync(v3)) {
    const generated = await fetchRaw('GeyserMC/mappings-generator', b.mg, 'generator_blocks.json', true)
    if (generated) save(v2, generated)
    else save(v3, (await fetchRaw('GeyserMC/mappings', b.mappings, 'blocks.nbt'))!)
  }
  return existsSync(v2) ? { kind: 'v2', json: JSON.parse(readFileSync(v2, 'utf8')) } : { kind: 'v3', nbt: readFileSync(v3) }
}

let javaPaths: Record<string, Record<string, string>> | undefined
/** A Java minecraft-data file (`blocks`, `biomes`) of `javaVersion`, where the fork's dataPaths.json has it. */
async function javaResource (javaVersion: string, resource: string): Promise<any> {
  const pathsFile = join(WORK_DIR, 'java', 'dataPaths.json')
  if (!existsSync(pathsFile)) save(pathsFile, (await fetchRaw(JAVA_REPO, JAVA_REF, 'minecraft-data/data/dataPaths.json'))!)
  javaPaths ??= JSON.parse(readFileSync(pathsFile, 'utf8')).pc
  const dir = javaPaths![javaVersion]?.[resource]
  if (!dir) throw new Error(`java minecraft-data has no pc/${javaVersion} ${resource}`)
  const file = join(WORK_DIR, 'java', dir, `${resource}.json`)
  if (!existsSync(file)) save(file, (await fetchRaw(JAVA_REPO, JAVA_REF, `minecraft-data/data/${dir}/${resource}.json`))!)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export const javaBlocks = (javaVersion: string): Promise<any[]> => javaResource(javaVersion, 'blocks')
export const javaBiomes = (javaVersion: string): Promise<any[]> => javaResource(javaVersion, 'biomes')
export const javaEntities = (javaVersion: string): Promise<any[]> => javaResource(javaVersion, 'entities')

// PyMCTranslate's biome tables (Bedrock's numeric biome ids, the Java <-> Bedrock names), at legacy2's pin
// (pymctranslate.ts). The newest Bedrock snapshot keeps every older id, so it serves every build; the Java
// names are those of the build's Java version (legacy2 took the newest, whose renamed biomes, windswept_hills
// for mountains, the Java 1.16 and 1.17 data does not have).
const PYMCTRANSLATE_REPO = 'Amulet-Team/PyMCTranslate'
const PYMCTRANSLATE_REF = 'b05862d585cd06b6b49a693d6cfe8c2562a6ab26'
export const BEDROCK_BIOMES = 'bedrock_26_50'
const JAVA_SNAPSHOTS = [
  '1_16_0', '1_16_1', '1_16_2', '1_16_3', '1_16_4', '1_16_5', '1_17_0', '1_18_0', '1_19_0', '1_19_1', '1_19_2', '1_19_3',
  '1_19_4', '1_20_0', '1_20_1', '1_20_2', '1_20_3', '1_20_4', '1_20_5', '1_21_0', '1_21_2', '1_21_4', '1_21_5', '1_21_6',
  '1_21_7', '1_21_8', '1_21_9', '26_1', '26_2', '26_3'
]

/** The Java snapshot of `javaVersion`: the newest one not after it. */
export function javaBiomesSnapshot (javaVersion: string): string {
  const parts = (v: string) => v.split(/[._]/).map(Number)
  const cmp = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0); return 0 }
  const fit = JAVA_SNAPSHOTS.filter(s => cmp(parts(s), parts(javaVersion)) <= 0).at(-1)
  if (!fit) throw new Error(`no PyMCTranslate Java snapshot for ${javaVersion}`)
  return `java_${fit}`
}

export interface BiomeTable { int_map: Record<string, number>, version2universal: Record<string, string>, universal2version: Record<string, string> }

export async function pymctranslateBiomes (snapshot: string): Promise<BiomeTable> {
  const file = join(WORK_DIR, 'pymctranslate', `${snapshot}.json`)
  if (!existsSync(file)) save(file, (await fetchRaw(PYMCTRANSLATE_REPO, PYMCTRANSLATE_REF, `PyMCTranslate/json/versions/${snapshot}/__biome_data__.json`))!)
  return JSON.parse(readFileSync(file, 'utf8'))
}

export const javaItems = (javaVersion: string): Promise<any[]> => javaResource(javaVersion, 'items')
export const javaEnchantments = (javaVersion: string): Promise<any[]> => javaResource(javaVersion, 'enchantments')

/** Geyser's Java -> Bedrock item map at the build's `mappings` pin (GeyserMC/mappings items.json). */
export async function geyserItems (b: Build): Promise<Record<string, { bedrock_identifier?: string, bedrock_id?: number, bedrock_data: number }>> {
  const file = join(WORK_DIR, 'mappings', b.mcDataVersion, 'items_mappings.json')
  if (!existsSync(file)) save(file, (await fetchRaw('GeyserMC/mappings', b.mappings, 'items.json'))!)
  return JSON.parse(readFileSync(file, 'utf8'))
}
