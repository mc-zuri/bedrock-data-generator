import { Relay, type Version } from 'bedrock-protocol'
import { existsSync, mkdirSync } from 'node:fs'
import { RELAY_PORT, dataDir, dataFile, writeAtomic, type Build } from '../config.ts'
import { start } from '../server.ts'
import { normalizeSteveSkin } from '../steve-normalize.ts'

const WAIT_MS = 300_000
export const STEVE_FILE = 'steve.json'

// the skin a real client sends in its login, as bedrock-protocol names the fields
const SKIN_KEYS = [
  'AnimatedImageData', 'ArmSize', 'CapeData', 'CapeId', 'CapeImageHeight', 'CapeImageWidth', 'CapeOnClassicSkin',
  'PersonaPieces', 'PersonaSkin', 'PieceTintColors', 'PremiumSkin', 'SkinAnimationData', 'SkinColor', 'SkinData',
  'SkinGeometryData', 'SkinGeometryDataEngineVersion', 'SkinId', 'SkinImageHeight', 'SkinImageWidth', 'SkinResourcePatch'
]
const pickSkin = (o: Record<string, unknown>) => Object.fromEntries(SKIN_KEYS.filter(k => k in o).map(k => [k, o[k]]))

/** Step 4 (manual): starts the server behind a relay and saves the skin of the first Minecraft client that joins. */
export async function steve (b: Build, force: boolean, port = RELAY_PORT): Promise<string[]> {
  const file = dataFile(b, STEVE_FILE)
  if (existsSync(file) && !force) {
    console.log(`steve: ${file} already there (--force to capture again)`)
    return []
  }
  const server = await start(b)
  const relay = new Relay({
    version: b.mcDataVersion as Version,
    host: '0.0.0.0',
    port,
    offline: true,
    destination: { host: '127.0.0.1', port: server.port, offline: true }
  } as any)
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no client joined within ${WAIT_MS / 1000} s`)), WAIT_MS)
      relay.on('connect', (player: any) => {
        console.log('  a client connected, waiting for its login')
        player.on('login', () => {
          const skin = player.skinData
          if (!skin) return console.warn('  login without skin data')
          mkdirSync(dataDir(b), { recursive: true })
          writeAtomic(file, JSON.stringify(normalizeSteveSkin(pickSkin(skin)), null, 2))
          clearTimeout(timer)
          console.log(`  saved ${file} (SkinId ${skin.SkinId})`)
          resolve()
        })
      })
      ;(relay as any).on('error', (e: Error) => {
        clearTimeout(timer)
        reject(e)
      })
      relay.listen()
      console.log(`steve: in Minecraft ${b.mcDataVersion}, add the server 127.0.0.1:${port} and join it once (the default skin, not a custom one)`)
    })
  } finally {
    await (relay as any).close?.()
    await server.stop()
  }
  return []
}
