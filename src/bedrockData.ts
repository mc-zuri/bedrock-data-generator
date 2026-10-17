// A bedrock-data checkout, read as its README says (formatVersion 1). Only its releases are read: a preview is kept
// there by its downloads alone.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const FORMAT_VERSION = 1

export type Platform = 'linux' | 'windows'

export interface BuildJson {
  build: string
  version: string
  channel: 'release' | 'preview'
  binary: Partial<Record<Platform, { url: string; sha256: string; size: number }>>
  data?: {
    language?: { file: string; from: Platform }
  }
}

export interface Language {
  locale: 'en_US'
  /** each resource pack's strings, vanilla first */
  packs: Record<string, Record<string, string>>
}

interface VersionsJson {
  formatVersion: number
  release: { latest?: string; builds: string[] }
}

export class BedrockData {
  readonly root: string
  /** release builds, newest first */
  readonly releases: string[]
  private readonly builds = new Map<string, BuildJson | undefined>()

  constructor(root: string) {
    this.root = root
    const file = join(root, 'versions.json')
    if (!existsSync(file)) throw new Error(`no ${file}: is ${root} a bedrock-data checkout?`)
    const versions = JSON.parse(readFileSync(file, 'utf8')) as VersionsJson
    if (versions.formatVersion !== FORMAT_VERSION) throw new Error(`${file} is formatVersion ${versions.formatVersion}; this generator reads ${FORMAT_VERSION}`)
    this.releases = versions.release.builds
  }

  build(build: string): BuildJson | undefined {
    if (!this.builds.has(build)) {
      const file = join(this.root, 'release', build, 'build.json')
      this.builds.set(build, existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as BuildJson) : undefined)
    }
    return this.builds.get(build)
  }

  hasLanguage(build: string): boolean {
    return this.build(build)?.data?.language !== undefined
  }

  language(build: string): Language {
    const file = this.build(build)?.data?.language?.file
    if (file === undefined) throw new Error(`release/${build} has no language`)
    return JSON.parse(gunzipSync(readFileSync(join(this.root, 'release', build, file))).toString('utf8')) as Language
  }
}
