// Per-version pipeline settings, written the way native/bindings/Steps.cpp is: every entry states only
// what changed since the previous one, entries apply oldest-first up to the build, and anything an
// entry does not mention keeps its older value. The first entry is the complete baseline.
import { compareVersions } from './config.ts'

export interface Settings {
  /** packet ids the network step must see before it may finish */
  requiredPackets: Record<number, string>
  /** sent in the login; from 1.26.43 the server silently refuses bedrock-protocol's default DeviceOS 7 (Win10), 8 (Win32) works everywhere */
  skinData: { DeviceOS: number }
  /** old builds never report the spawn to bedrock-protocol: how long to wait for it once the required packets are in */
  spawnWaitMs: number
}

interface Step { since: string, set: Partial<Settings> }

const steps: Step[] = [
  {
    since: '1.16.201',
    set: {
      requiredPackets: {
        11: 'start_game',
        29: 'update_attributes',
        52: 'crafting_data',
        119: 'available_entity_identifiers',
        122: 'biome_definition_list',
        145: 'creative_content'
      },
      skinData: { DeviceOS: 8 },
      spawnWaitMs: 30_000
    }
  },
  {
    // the item table moved out of start_game into its own packet
    since: '1.21.60',
    set: {
      requiredPackets: {
        11: 'start_game',
        29: 'update_attributes',
        52: 'crafting_data',
        119: 'available_entity_identifiers',
        122: 'biome_definition_list',
        145: 'creative_content',
        162: 'item_registry'
      }
    }
  }
]

export function settingsFor (serverVersion: string): Settings {
  const out: Partial<Settings> = {}
  for (const step of [...steps].sort((a, b) => compareVersions(a.since, b.since))) {
    if (compareVersions(step.since, serverVersion) > 0) break
    Object.assign(out, step.set)
  }
  return out as Settings
}
