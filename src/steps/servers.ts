import { SERVERS_DIR, type Build } from '../config.ts'
import { configure, install } from '../server.ts'

/** Step 1: download every build that is missing (one at a time: the downloader chdirs) and apply server.properties. */
export async function servers (builds: Build[]): Promise<string[]> {
  console.log(`servers: ${SERVERS_DIR}`)
  const failed: string[] = []
  let downloaded = 0
  for (const b of builds) {
    try {
      if (await install(b)) {
        downloaded++
        console.log(`  ${b.serverVersion}: downloaded`)
      }
      configure(b)
    } catch (e) {
      failed.push(b.serverVersion)
      console.error(`  ${b.serverVersion}: ${e instanceof Error ? e.message : e}`)
    }
  }
  console.log(`servers: ${builds.length - failed.length}/${builds.length} ready, ${downloaded} downloaded`)
  return failed
}
