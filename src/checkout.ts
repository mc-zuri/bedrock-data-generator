// The minecraft-data checkout `pnpm generate` writes into, on master. Cloned from PrismarineJS whatever a fork is
// called; MINECRAFT_DATA_FORK, where it is another repo, is its `origin`, PrismarineJS its `upstream`.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PRISMARINE_MINECRAFT_DATA } from './config.ts'

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
}

function sameRepo(a: string | undefined, b: string): boolean {
  function normalized(url: string): string {
    return url
      .toLowerCase()
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')
  }
  return a !== undefined && normalized(a) === normalized(b)
}

function remoteUrls(dir: string): Map<string, string> {
  const remotes = new Map<string, string>()
  for (const name of git(dir, ['remote']).split('\n').filter(Boolean)) remotes.set(name, git(dir, ['remote', 'get-url', name]).trim())
  return remotes
}

function useRemotes(dir: string, fork: string): void {
  if (sameRepo(fork, PRISMARINE_MINECRAFT_DATA)) return
  if (!remoteUrls(dir).has('upstream')) {
    if (sameRepo(remoteUrls(dir).get('origin'), PRISMARINE_MINECRAFT_DATA)) git(dir, ['remote', 'rename', 'origin', 'upstream'])
    else git(dir, ['remote', 'add', 'upstream', PRISMARINE_MINECRAFT_DATA])
  }
  const origin = remoteUrls(dir).get('origin')
  if (origin === undefined) git(dir, ['remote', 'add', 'origin', fork])
  else if (!sameRepo(origin, fork)) git(dir, ['remote', 'set-url', 'origin', fork])
}

/** Blobless: the history, each old file fetched when asked for. */
export function ensureCheckout(dir: string, fork: string): void {
  if (!existsSync(join(dir, '.git'))) {
    if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is no minecraft-data checkout`)
    console.log(`cloning ${PRISMARINE_MINECRAFT_DATA} into ${dir}`)
    execFileSync('git', ['clone', '--filter=blob:none', PRISMARINE_MINECRAFT_DATA, dir], { stdio: 'inherit' })
  }
  if (!existsSync(join(dir, 'data', 'dataPaths.json'))) throw new Error(`${dir} has no data/dataPaths.json: is it a minecraft-data checkout?`)
  useRemotes(dir, fork)
}
