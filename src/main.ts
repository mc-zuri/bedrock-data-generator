// pnpm <step> [versions...] [--force]
//   servers   download the builds that are missing and apply server.properties
//   blocks    block_palette.nbt + block-state-shapes.nbt, by the native agent (pnpm build:native first)
//   network   packets.nbt: the first raw packet of every id a client receives while joining
//   recipes   recipes.json: every recipe the server sends (packets.nbt), whole, checked craftable with the item data
//   steve     steve.json: the skin a real client sends (manual: connect with Minecraft)
//   mcdata    (--accept: take the registry's differences) attributes.json, blocks.json, blockStates.json, blockCollisionShapes.json, biomes.json, entities.json, items.json, steve.json, language.json of every build into the minecraft-data checkout
//   validate  the published files through mcdata's validation (strict schemas, each file's validator, the registry)
//   all       servers, blocks, network, mcdata
//   status    which data files each build has
//   check     resolve native/bindings against every server exe without starting it
// Versions are mcDataVersion (1.21.42) or serverVersion (1.21.42.01); none = every build in versions.json.
import { selectBuilds } from './config.ts'
import { servers } from './steps/servers.ts'
import { blocks } from './steps/blocks.ts'
import { network } from './steps/network.ts'
import { steve } from './steps/steve.ts'
import { status } from './steps/status.ts'
import { check } from './steps/check.ts'
import { mcdata } from './steps/mcdata.ts'
import { validate } from './steps/validate.ts'
import { recipes } from './steps/recipes.ts'

const [command, ...rest] = process.argv.slice(2)
const force = rest.includes('--force')
const portArg = rest.find(a => a.startsWith('--port='))
const names = rest.filter(a => !a.startsWith('--'))

async function main (): Promise<string[]> {
  const builds = selectBuilds(names)
  switch (command) {
    case 'servers': return servers(builds)
    case 'blocks': return blocks(builds, force)
    case 'network': return network(builds, force)
    case 'steve': {
      if (builds.length !== 1) throw new Error('pnpm steve <version>: exactly one version')
      return steve(builds[0], force, portArg ? Number(portArg.slice(7)) : undefined)
    }
    case 'all': {
      const failed = new Set(await servers(builds))
      const ready = builds.filter(b => !failed.has(b.serverVersion))
      for (const v of await blocks(ready, force)) failed.add(v)
      for (const v of await network(ready, force)) failed.add(v)
      for (const v of await recipes(ready.filter(b => !failed.has(b.serverVersion) && !failed.has(b.mcDataVersion)))) failed.add(v)
      if (!failed.size) await mcdata()
      return [...failed]
    }
    case 'status': return status(builds)
    case 'check': return check(builds)
    case 'mcdata': return mcdata(rest.includes('--accept'))
    case 'validate': return validate(builds)
    case 'recipes': return recipes(builds)
    default:
      throw new Error(`unknown step ${command ?? '(none)'}: servers | blocks | network | steve | recipes | mcdata | validate | all | status | check`)
  }
}

try {
  const failed = await main()
  if (failed.length) {
    console.error(`failed: ${failed.join(', ')}`)
    process.exitCode = 1
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 2
}
