import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { SERVER_PORT_BASE, SERVERS_DIR, compareVersions, versions, type Build } from './config.ts'

const require = createRequire(import.meta.url)
const START_TIMEOUT_MS = 200_000

export const serverDir = (b: Build): string => join(SERVERS_DIR, b.mcDataVersion)
export const serverExe = (b: Build): string => join(serverDir(b), 'bedrock_server.exe')
// written after a download: the exact build this folder holds (folders other tools downloaded have none)
const marker = (b: Build): string => join(serverDir(b), '.bdg-build')

export function portOf (b: Build): number {
  const index = versions.findIndex(v => v.serverVersion === b.serverVersion)
  if (index < 0) throw new Error(`${b.serverVersion} is not in versions.json`)
  return SERVER_PORT_BASE + 2 * index
}

export function properties (b: Build): Record<string, string | number | boolean> {
  return {
    // a world of our own with a fixed seed: the shape calls read the world at one position
    'level-name': 'bdg',
    'level-seed': '20260728',
    gamemode: 'survival',
    difficulty: 'easy',
    'allow-cheats': true,
    'online-mode': false,
    'allow-list': false,
    'enable-lan-visibility': false,
    'default-player-permission-level': 'operator',
    'client-side-chunk-generation-enabled': false,
    'player-movement-action-direction-threshold': 0,
    'player-position-acceptance-threshold': 1000,
    'player-rewind-min-correction-delay-ticks': 10000,
    'player-rewind-history-size-ticks': 40,
    // 1.26.50 defaults to nethernet (WebRTC), which bedrock-protocol's client does not speak
    transport: 'raknet',
    'server-port': portOf(b),
    'server-portv6': portOf(b) + 1
  }
}

/** The build a folder holds: its marker, or undefined for a folder another tool downloaded. */
export function installedBuild (b: Build): string | undefined {
  return existsSync(marker(b)) ? readFileSync(marker(b), 'utf8').trim() : undefined
}

/** Downloads the exact build unless the folder already has a server. Returns true when it downloaded. */
export async function install (b: Build): Promise<boolean> {
  const held = installedBuild(b)
  if (held && compareVersions(held, b.serverVersion) !== 0) {
    throw new Error(`${serverDir(b)} holds ${held}, versions.json wants ${b.serverVersion}: delete the folder to download it`)
  }
  if (existsSync(serverExe(b))) return false
  const dir = serverDir(b)
  mkdirSync(dir, { recursive: true })
  const lock = join(dir, `.bds-download-${b.serverVersion}.lock`)
  writeFileSync(lock, `downloading at ${new Date().toISOString()}`)
  const zip = join(dir, 'bds.zip')
  const path = process.env.PATH
  try {
    if (existsSync(zip)) {
      // an earlier download that failed to unpack
      unzip(zip, dir)
    } else {
      // the downloader unpacks with `tar -xf`: on Windows that must be System32's bsdtar, which reads zip;
      // Git for Windows' GNU tar, first on PATH in a Git Bash shell, does not
      if (process.platform === 'win32') process.env.PATH = `${join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')};${path}`
      const { downloadServer } = require('minecraft-bedrock-server')
      await downloadServer(b.serverVersion, { root: dir, path: dir, platform: process.platform === 'win32' ? 'win32' : 'linux' })
    }
  } finally {
    process.env.PATH = path
    rmSync(lock, { force: true })
  }
  if (!existsSync(serverExe(b))) throw new Error(`${b.serverVersion}: downloaded, but there is no ${serverExe(b)}`)
  rmSync(join(dir, 'bds.zip'), { force: true })
  writeFileSync(marker(b), `${b.serverVersion}\n`)
  return true
}

/** Applies properties() to server.properties. Returns true when the file changed. */
export function configure (b: Build): boolean {
  const file = join(serverDir(b), 'server.properties')
  if (!existsSync(file)) throw new Error(`no ${file}: is the server installed?`)
  const before = readFileSync(file, 'utf8')
  let content = before
  for (const [key, value] of Object.entries(properties(b))) {
    const line = `${key}=${value}`
    const re = new RegExp(`^${key}=[^\r\n]*`, 'm') // keeps the file's line endings
    content = re.test(content) ? content.replace(re, line) : content.replace(/\r?\n?$/, `\n${line}\n`)
  }
  if (content === before) return false
  writeFileSync(file, content)
  return true
}

export interface RunningServer {
  port: number
  pid: number
  /** resolves when the server process exits, with its exit code */
  exited: Promise<number | null>
  /** asks the server to stop, and kills it after 5 s */
  stop (): Promise<void>
  /** kills it at once: nothing is saved */
  kill (): Promise<void>
}

/** Starts the server and resolves once it prints "Server started". `env` is added to the server's environment. */
export async function start (b: Build, env: Record<string, string> = {}): Promise<RunningServer> {
  if (!existsSync(serverExe(b))) throw new Error(`no ${serverExe(b)} (run pnpm servers)`)
  // another checkout sharing SERVERS_DIR may have rewritten the ports
  configure(b)
  const port = portOf(b)
  const child = spawn(serverExe(b), [], { cwd: serverDir(b), stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  child.stdin?.on('error', () => {})
  const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)))
  let tail = ''
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      kill(child)
      reject(new Error(`did not start within ${START_TIMEOUT_MS / 1000} s`))
    }, START_TIMEOUT_MS)
    child.stdout?.on('data', (data: Buffer) => {
      tail = (tail + data.toString()).slice(-4096)
      if (tail.includes('Server started')) {
        clearTimeout(timer)
        setTimeout(resolve, 500)
      }
    })
    child.once('error', e => {
      clearTimeout(timer)
      reject(e)
    })
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`exited with code ${code} before it started:\n${tail}`))
    })
  })
  child.stdout?.resume()
  child.stderr?.resume()
  const done = async () => { await exited }
  return {
    port,
    pid: child.pid!,
    exited,
    stop: async () => {
      if (child.exitCode !== null) return
      if (child.stdin?.writable) child.stdin.write('stop\n')
      const timer = setTimeout(() => kill(child), 5000)
      await done()
      clearTimeout(timer)
    },
    kill: async () => {
      if (child.exitCode !== null) return
      kill(child)
      await done()
    }
  }
}

function unzip (zip: string, dir: string): void {
  const [cmd, args] = process.platform === 'win32'
    ? [join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir]]
    : ['unzip', ['-o', '-q', zip, '-d', dir]]
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`could not unpack ${zip} (${cmd} exited with ${r.status ?? r.error})`)
}

function kill (child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}
