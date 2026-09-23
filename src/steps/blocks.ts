import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { JOBS, NATIVE_BIN, allExist, dataDir, dataFile, pool, workDir, writeAtomic, type Build } from '../config.ts'
import { gzip, readNbt } from '../nbt.ts'
import { serverExe, start, type RunningServer } from '../server.ts'

const run = promisify(execFile)
const AGENT = join(NATIVE_BIN, 'bdg_agent.dll')
const INJECT = join(NATIVE_BIN, 'bdg_inject.exe')
const EXPORT_TIMEOUT_MS = 300_000
export const BLOCK_FILES = ['block_palette.nbt', 'block-state-shapes.nbt']
const TYPES_FILE = 'block_types.json'
const ITEMS_FILE = 'item_types.json'
const EFFECTS_FILE = 'effects.json'
const ENCHANTMENTS_FILE = 'enchantments.json'
const ALIASES_FILE = 'item_aliases.json'
const BIOMES_FILE = 'biome_ids.json'

/**
 * Step 2: block_palette.nbt + block-state-shapes.nbt + block_types.json (each type's default state, its
 * scalars and tags) + item_types.json (each item's max stack size, max damage, description id) + item_aliases.json (the old item
 * names the game still reads) + effects.json
 * (each mob effect) + enchantments.json, exported by the agent inside each server.
 */
export async function blocks (builds: Build[], force: boolean): Promise<string[]> {
  if (!existsSync(AGENT) || !existsSync(INJECT)) throw new Error(`no ${AGENT} (run pnpm build:native)`)
  const todo = builds.filter(b => force || !allExist([...BLOCK_FILES, TYPES_FILE, ITEMS_FILE, ALIASES_FILE, EFFECTS_FILE, ENCHANTMENTS_FILE].map(f => dataFile(b, f))))
  console.log(`blocks: ${todo.length} to export, ${builds.length - todo.length} already there, ${JOBS} servers at a time`)
  const failed: string[] = []
  await pool(todo, JOBS, async b => {
    const t0 = performance.now()
    const took = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`
    try {
      const states = await exportBuild(b)
      console.log(`  ${b.serverVersion}: ${states} states (${took()})`)
    } catch (e) {
      failed.push(b.serverVersion)
      console.error(`  ${b.serverVersion}: FAILED: ${e instanceof Error ? e.message : e} (${took()}, see ${join(workDir(b), 'agent.log')})`)
    }
  })
  console.log(`blocks: ${todo.length - failed.length}/${todo.length} exported`)
  return failed
}

async function exportBuild (b: Build): Promise<number> {
  if (!existsSync(serverExe(b))) throw new Error('no server (run pnpm servers)')
  const work = workDir(b)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  const result = join(work, 'result.txt')

  let server: RunningServer | undefined
  try {
    server = await start(b, { BDG_VERSION: b.serverVersion, BDG_OUT: work })
    await run(INJECT, [String(server.pid), AGENT]).catch((e: { stderr?: string }) => {
      throw new Error(`could not inject the agent: ${e.stderr?.trim() || e}`)
    })
    const exited = server.exited.then(code => code)
    const deadline = Date.now() + EXPORT_TIMEOUT_MS
    let gone: number | null | undefined
    exited.then(code => { gone = code })
    while (!existsSync(result)) {
      if (gone !== undefined) throw new Error(`the server exited (code ${gone}) before the export finished`)
      if (Date.now() > deadline) throw new Error(`no result within ${EXPORT_TIMEOUT_MS / 1000} s`)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } finally {
    // nothing to save: the world is not needed
    await server?.kill()
  }

  const text = readFileSync(result, 'utf8').trim()
  if (!text.startsWith('ok')) throw new Error(text.replace(/^FAILED: /, ''))
  const palette = readNbt(join(work, 'block_palette.nbt'), 'big').blocks as unknown[]
  const shapes = readNbt(join(work, 'block-state-shapes.nbt'), 'little').shapes as { blockStateId: number }[]
  if (palette.length !== shapes.length) throw new Error(`${palette.length} palette entries but ${shapes.length} shapes`)
  if (shapes.some((s, i) => s.blockStateId !== i)) throw new Error('blockStateId is not the index')
  // every block type once, its default state one of its own states. Named as the palette names it: before
  // 1.18.30 the registry's keys are lowercased (minecraft:concretepowder for minecraft:concretePowder).
  type BlockType = { defaultBlockStateHash: number, defaultBlockStateId: number, requiresCorrectToolForDrops?: boolean, tags?: string[] }
  const agentTypes: Record<string, BlockType> = JSON.parse(readFileSync(join(work, TYPES_FILE), 'utf8'))
  const names = new Set(palette.map((p: any) => p.name as string))
  const types: Record<string, BlockType> = {}
  for (const [key, t] of Object.entries(agentTypes)) {
    const name: string | undefined = (palette[t.defaultBlockStateId] as any)?.name
    if (name?.toLowerCase() !== key.toLowerCase()) throw new Error(`the default state of ${key} is state ${t.defaultBlockStateId}, a ${name}`)
    types[name] = t
  }
  if (Object.keys(types).length !== names.size) throw new Error(`${Object.keys(types).length} block types for ${names.size} block names`)
  const typesJson = JSON.stringify(Object.fromEntries(Object.keys(types).sort().map(n => [n, types[n]])), null, 2) + '\n'

  // every item once, by name; a stack size of 1 to 64
  type ItemType = { maxStackSize: number, maxDamage: number, descriptionId?: string }
  const itemTypes: Record<string, ItemType> = JSON.parse(readFileSync(join(work, ITEMS_FILE), 'utf8'))
  const bad = Object.entries(itemTypes).filter(([, t]) => t.maxStackSize < 1 || t.maxStackSize > 64 || t.maxDamage < 0)
  if (bad.length) throw new Error(`item_types.json: ${bad.slice(0, 5).map(([n, t]) => `${n} ${t.maxStackSize}/${t.maxDamage}`).join(', ')}`)
  const itemsJson = JSON.stringify(Object.fromEntries(Object.keys(itemTypes).sort().map(n => [n, itemTypes[n]])), null, 2) + '\n'

  mkdirSync(dataDir(b), { recursive: true })
  for (const f of BLOCK_FILES) writeAtomic(dataFile(b, f), gzip(readFileSync(join(work, f))))
  writeAtomic(dataFile(b, TYPES_FILE), typesJson)
  writeAtomic(dataFile(b, ITEMS_FILE), itemsJson)
  writeAtomic(dataFile(b, ALIASES_FILE), readFileSync(join(work, ALIASES_FILE), 'utf8'))
  // biome ids where the agent found the registry (a check on PyMCTranslate's), else none
  const biomeIds = join(work, BIOMES_FILE)
  if (existsSync(biomeIds)) writeAtomic(dataFile(b, BIOMES_FILE), readFileSync(biomeIds, 'utf8'))
  else rmSync(dataFile(b, BIOMES_FILE), { force: true })
  // effects numbered 1.., each once
  const effects: { id: number }[] = JSON.parse(readFileSync(join(work, EFFECTS_FILE), 'utf8'))
  if (effects.some((e, i) => e.id !== i + 1)) throw new Error('effects.json: ids are not 1..n')
  writeAtomic(dataFile(b, EFFECTS_FILE), JSON.stringify(effects, null, 2) + '\n')
  // enchantments numbered 0.., each once
  const enchantments: { id: number }[] = JSON.parse(readFileSync(join(work, ENCHANTMENTS_FILE), 'utf8'))
  if (enchantments.some((e, i) => e.id !== i)) throw new Error('enchantments.json: ids are not 0..n')
  writeAtomic(dataFile(b, ENCHANTMENTS_FILE), JSON.stringify(enchantments, null, 2) + '\n')
  // agent.log stays for reference
  for (const f of [...BLOCK_FILES, TYPES_FILE, ITEMS_FILE, ALIASES_FILE, EFFECTS_FILE, ENCHANTMENTS_FILE, BIOMES_FILE, 'result.txt']) rmSync(join(work, f), { force: true })
  return shapes.length
}
