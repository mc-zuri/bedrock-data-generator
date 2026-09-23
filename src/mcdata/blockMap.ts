// The Bedrock -> Java block state map blocks.json takes Java properties through, from the Geyser block map of
// the build. Ported from minecraft-data-extractor-legacy2 src/generators/blockMap.ts (buildJ2B, buildB2J).
import nbt from 'prismarine-nbt'
import type { GeyserBlocks } from './inputs.ts'

function concatStates (states: any, skipReplace = false): string {
  let str = ''
  if (!states) return str
  for (const key of Object.keys(states).sort()) {
    let val = states[key]
    if (!skipReplace) {
      if (val == 'true') val = 1 // eslint-disable-line eqeqeq
      if (val == 'false') val = 0 // eslint-disable-line eqeqeq
    }
    str += key + '=' + val + ','
  }
  return str.endsWith(',') ? str.slice(0, -1) : str
}

/** Java block state string -> Bedrock block state string. */
export async function javaToBedrock (mcDataVersion: string, geyser: GeyserBlocks, javaBlocks: any[]): Promise<Record<string, string>> {
  const j2b: Record<string, string> = {}
  if (geyser.kind === 'v1') {
    // GeyserMC/mappings blocks.json: keyed by the full java state; stateless blocks have no brackets
    for (const javaState in geyser.json) {
      const val = geyser.json[javaState]
      const javaKey = javaState.includes('[') ? javaState : javaState + '[]'
      j2b[javaKey] ??= val.bedrock_identifier + '[' + concatStates(val.bedrock_states) + ']'
    }
  } else if (geyser.kind === 'v2') {
    FIXUPS[mcDataVersion]?.(geyser.json.mappings)
    for (const key in geyser.json.mappings) {
      const val = geyser.json.mappings[key]
      const bedrockKey = 'minecraft:' + val.bedrock_state.bedrock_identifier + '[' + concatStates(val.bedrock_state.state) + ']'
      const javaKey = val.java_state.Name + '[' + concatStates(val.java_state.Properties, true) + ']'
      j2b[javaKey] ??= bedrockKey
    }
  } else {
    // GeyserMC/mappings blocks.nbt: `bedrock_mappings` entry N is the bedrock state of java state id N; a missing
    // identifier is the java block's own name. Bytes are booleans: read typed, to print true/false like v2.
    const { parsed } = await nbt.parse(geyser.nbt)
    const entries = (parsed.value as any).bedrock_mappings.value.value as any[]
    const states = javaBlockStates(javaBlocks)
    if (entries.length !== states.length) throw new Error(`blocks.nbt has ${entries.length} entries for ${states.length} java block states (bedrock ${mcDataVersion})`)
    for (const state of states) {
      const entry = entries[state.id] ?? {}
      const identifier: string = entry.bedrock_identifier?.value ?? `minecraft:${state.name}`
      const bedrockStates: Record<string, string> = {}
      for (const [key, tag] of Object.entries<any>(entry.state?.value ?? {})) {
        bedrockStates[key] = tag.type === 'byte' ? (tag.value ? 'true' : 'false') : String(tag.value)
      }
      const prefixed = identifier.startsWith('minecraft:') ? identifier : `minecraft:${identifier}`
      j2b[`minecraft:${state.name}[${concatStates(state.values, true)}]`] ??= `${prefixed}[${concatStates(bedrockStates, true)}]`
    }
  }
  return j2b
}

/** Bedrock block state string -> Java block state string: the flipped map, plus water and lava. */
export function bedrockToJava (j2b: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const key in j2b) map[j2b[key].replace(/true/g, '1').replace(/false/g, '0')] = key
  map['minecraft:flowing_water[liquid_depth=0]'] = 'minecraft:water[level=0]'
  map['minecraft:flowing_lava[liquid_depth=0]'] = 'minecraft:lava[level=0]'
  map['minecraft:air[]'] = 'minecraft:air[]'
  for (let i = 1; i <= 15; i++) map[`minecraft:water[liquid_depth=${i}]`] = `minecraft:water[level=${i}]`
  for (let i = 1; i <= 15; i++) map[`minecraft:lava[liquid_depth=${i}]`] = `minecraft:lava[level=${i}]`
  return map
}

// A java version's block states in state id order: the last property varies fastest; an int property is not
// necessarily 0-based (oak_leaves distance runs 1..7), so the declared values list wins.
function javaBlockStates (javaBlocks: any[]): Array<{ name: string, id: number, values: Record<string, string> }> {
  const out: Array<{ name: string, id: number, values: Record<string, string> }> = []
  for (const block of javaBlocks) {
    const props: any[] = block.states ?? []
    const count = block.maxStateId - block.minStateId + 1
    for (let i = 0; i < count; i++) {
      const values: Record<string, string> = {}
      let rem = i
      for (let p = props.length - 1; p >= 0; p--) {
        const prop = props[p]
        const vals: any[] = prop.values ?? (prop.type === 'bool' ? ['true', 'false'] : Array.from({ length: prop.num_values }, (_, n) => String(n)))
        values[prop.name] = String(vals[rem % prop.num_values])
        rem = Math.floor(rem / prop.num_values)
      }
      out.push({ name: block.name, id: block.minStateId + i, values })
    }
  }
  return out
}

interface Mapping {
  java_state: { Name: string, Properties?: Record<string, any> }
  bedrock_state: { bedrock_identifier: string, state?: Record<string, any> }
}

const SKULL_SPLIT: Record<string, string> = {
  'minecraft:skeleton_skull': 'skeleton_skull',
  'minecraft:skeleton_wall_skull': 'skeleton_skull',
  'minecraft:wither_skeleton_skull': 'wither_skeleton_skull',
  'minecraft:wither_skeleton_wall_skull': 'wither_skeleton_skull',
  'minecraft:zombie_head': 'zombie_head',
  'minecraft:zombie_wall_head': 'zombie_head',
  'minecraft:player_head': 'player_head',
  'minecraft:player_wall_head': 'player_head',
  'minecraft:creeper_head': 'creeper_head',
  'minecraft:creeper_wall_head': 'creeper_head',
  'minecraft:dragon_head': 'dragon_head',
  'minecraft:dragon_wall_head': 'dragon_head',
  'minecraft:piglin_head': 'piglin_head',
  'minecraft:piglin_wall_head': 'piglin_head'
}

// 1.21.40 split skulls, sponge and tnt; the 1.21.30 generator file it reuses still has them merged
function fix12142 (mappings: Mapping[]): void {
  for (const m of mappings) {
    const bs = m.bedrock_state
    if (bs.bedrock_identifier === 'skull') {
      const split = SKULL_SPLIT[m.java_state.Name]
      if (split) bs.bedrock_identifier = split
    }
    if (m.java_state.Name === 'minecraft:wet_sponge') bs.bedrock_identifier = 'wet_sponge'
    if (m.java_state.Name === 'minecraft:tnt' && m.java_state.Properties?.unstable === 'false') bs.bedrock_identifier = 'tnt'
    if ((bs.bedrock_identifier === 'cherry_wood' || bs.bedrock_identifier === 'mangrove_wood') && bs.state && bs.state.stripped_bit === false) delete bs.state.stripped_bit
  }
}

const FIXUPS: Record<string, (m: Mapping[]) => void> = { '1.21.42': fix12142 }
