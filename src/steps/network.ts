import { createClient, type Version } from 'bedrock-protocol'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JOBS, dataDir, dataFile, pool, writeAtomic, type Build } from '../config.ts'
import { encodePackets, type CapturedPacket } from '../nbt.ts'
import { serverExe, start, type RunningServer } from '../server.ts'
import { settingsFor, type Settings } from '../steps.ts'

const require = createRequire(import.meta.url)
const TIMEOUT_MS = 120_000
// after the spawn (or the spawn wait), for the packets the server sends right after it
const LINGER_MS = 5_000
export const PACKETS_FILE = 'packets.nbt'

/** Step 3: packets.nbt, the first raw packet of every id a client receives while joining each server. */
export async function network (builds: Build[], force: boolean): Promise<string[]> {
  const todo = builds.filter(b => force || !existsSync(dataFile(b, PACKETS_FILE)))
  console.log(`network: ${todo.length} to capture, ${builds.length - todo.length} already there, ${JOBS} servers at a time`)
  const failed: string[] = []
  await pool(todo, JOBS, async b => {
    const t0 = performance.now()
    const took = () => `${((performance.now() - t0) / 1000).toFixed(1)} s`
    let server: RunningServer | undefined
    try {
      if (!existsSync(serverExe(b))) throw new Error('no server (run pnpm servers)')
      server = await start(b)
      const { packets, decodeFailures } = await capture(b, settingsFor(b.serverVersion), server.port)
      mkdirSync(dataDir(b), { recursive: true })
      writeAtomic(dataFile(b, PACKETS_FILE), encodePackets(b.serverVersion, b.mcDataVersion, packets))
      console.log(`  ${b.serverVersion}: ${packets.length} packets (${took()})`)
      for (const f of decodeFailures) console.log(`  ${b.serverVersion}: bedrock-protocol could not decode ${f} (kept raw)`)
    } catch (e) {
      failed.push(b.serverVersion)
      console.error(`  ${b.serverVersion}: FAILED: ${e instanceof Error ? e.message : e} (${took()})`)
    } finally {
      await server?.kill()
    }
  })
  console.log(`network: ${todo.length - failed.length}/${todo.length} captured`)
  return failed
}

export function packetId (raw: Buffer): number {
  let value = 0
  for (let i = 0, shift = 0; i < raw.length && i < 5; i++, shift += 7) {
    value |= (raw[i] & 0x7f) << shift
    if (!(raw[i] & 0x80)) break
  }
  return value & 0x3ff
}

function protocolPacketNames (version: string): Record<string, string> {
  try {
    return require('minecraft-data')(`bedrock_${version}`).protocol.types.mcpe_packet[1][0].type[1].mappings
  } catch {
    return {}
  }
}

interface Captured {
  packets: CapturedPacket[]
  decodeFailures: string[]
}

// Joins with bedrock-protocol and keeps the raw bytes of the first packet of each id it receives, taken
// before decoding, so a packet bedrock-protocol cannot decode is captured all the same.
function capture (b: Build, settings: Settings, port: number): Promise<Captured> {
  const required = new Set(Object.keys(settings.requiredPackets).map(Number))
  return new Promise((resolve, reject) => {
    const client = createClient({
      host: '127.0.0.1', port, version: b.mcDataVersion as Version, username: 'bdg', offline: true, skipPing: true, skinData: settings.skinData
    } as any)
    const raw = new Map<number, Buffer>()
    const names = new Map<number, string>()
    const decodeFailures = new Set<string>()

    // not in bedrock-protocol's typings
    const conn = client as unknown as { readPacket (raw: Buffer): void }
    const readPacket = conn.readPacket.bind(client)
    let reading = -1 // 'packet' is emitted synchronously inside readPacket
    conn.readPacket = (buffer: Buffer) => {
      const id = packetId(buffer)
      if (!raw.has(id)) raw.set(id, Buffer.from(buffer))
      required.delete(id)
      if (required.size === 0) requiredDone()
      reading = id
      try {
        return readPacket(buffer)
      } finally {
        reading = -1
      }
    }
    client.on('packet', ({ data: { name } }: any) => {
      if (reading >= 0 && !names.has(reading)) names.set(reading, name)
    })
    client.on('error', (err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err))
      const where = /at Object\.(packet_\w+)/.exec(e.stack ?? '')?.[1] ?? 'unknown'
      decodeFailures.add(`${where}: ${e.message.split('\n')[0]}`)
    })

    let settled = false
    const close = () => {
      // close() removes every listener, but queued packets can still emit 'error', which would crash the process
      client.close()
      client.on('error', () => {})
    }
    const timer = setTimeout(() => {
      settled = true
      close()
      reject(new Error(`timed out; never received: ${[...required].map(id => settings.requiredPackets[id] ?? `id ${id}`).join(', ')}`))
    }, TIMEOUT_MS)
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      close()
      const known = protocolPacketNames(b.mcDataVersion)
      const packets = [...raw].map(([id, data]) => ({ id, name: names.get(id) ?? known[id] ?? `id_${id}`, data }))
      resolve({ packets, decodeFailures: [...decodeFailures] })
    }

    let spawned = false
    let lingering = false
    let done = false
    const linger = () => {
      if (lingering) return
      lingering = true
      setTimeout(finish, LINGER_MS)
    }
    function requiredDone () {
      if (done) return
      done = true
      if (spawned) linger()
      else setTimeout(linger, settings.spawnWaitMs)
    }
    client.on('spawn', () => {
      spawned = true
      if (done) linger()
    })
  })
}
