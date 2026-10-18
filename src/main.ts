import { BedrockData } from './bedrockData.ts'
import { ensureCheckout } from './checkout.ts'
import { BEDROCK_DATA_DIR, GENERATE, MINECRAFT_DATA_DIR, MINECRAFT_DATA_FORK, VERSIONS_FILE } from './config.ts'
import { DEFAULT_KEYS, generators, generatorsOf } from './generators/index.ts'
import { bedrockDataPaths, generate } from './publish.ts'
import { errorMessage } from './util.ts'
import { buildFor, compareVersions, loadPins } from './versions.ts'

interface Step {
  about: string
  run(keys: string[]): void
}

const steps: Record<string, Step> = {
  generate: { about: "every version's files (those named, else GENERATE's, else the pull request's) and dataPaths.json into the minecraft-data checkout", run: generateFiles },
  status: { about: 'each minecraft-data version, the build it is made from, and where its files are', run: status },
}

function generateFiles(keys: string[]): void {
  const gens = generatorsOf(keys.length ? keys : GENERATE)
  ensureCheckout(MINECRAFT_DATA_DIR, MINECRAFT_DATA_FORK)
  const data = new BedrockData(BEDROCK_DATA_DIR)
  console.log(`generate: ${data.root} -> ${MINECRAFT_DATA_DIR}: ${gens.map((g) => g.key).join(', ')}`)
  generate(MINECRAFT_DATA_DIR, { data, pins: loadPins(VERSIONS_FILE) }, gens)
  console.log(`  review: git -C "${MINECRAFT_DATA_DIR}" status`)
}

function status(): void {
  const paths = bedrockDataPaths(MINECRAFT_DATA_DIR)
  if (!paths) throw new Error(`no minecraft-data checkout at ${MINECRAFT_DATA_DIR} (pnpm generate clones one)`)
  const data = new BedrockData(BEDROCK_DATA_DIR)
  const pins = loadPins(VERSIONS_FILE)
  printTable([
    ['version', 'build', ...generators.map((g) => g.key)],
    ...Object.keys(paths)
      .sort(compareVersions)
      .map((v) => [v, buildFor(v, pins, data.releases) ?? '-', ...generators.map((g) => paths[v][g.key]?.replace('bedrock/', '') ?? '-')]),
  ])
}

function printTable(rows: string[][]): void {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)))
  for (const row of rows)
    console.log(
      row
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd(),
    )
}

function usage(): string {
  const width = Math.max(...Object.keys(steps).map((name) => name.length))
  return [
    'usage: pnpm <step> [files...]',
    ...Object.entries(steps).map(([name, step]) => `  ${name.padEnd(width)}  ${step.about}`),
    `files: ${generators.map((g) => g.key).join(', ')}, or all; none means GENERATE's (.env), else ${DEFAULT_KEYS.join(', ')}`,
  ].join('\n')
}

function main(args: string[]): number {
  const [name = '', ...rest] = args
  if (!Object.hasOwn(steps, name)) {
    console.error(usage())
    return 2
  }
  try {
    steps[name].run(rest)
    return 0
  } catch (e) {
    console.error(errorMessage(e))
    return 2
  }
}

process.exitCode = main(process.argv.slice(2))
