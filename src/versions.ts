// Which release build each minecraft-data version is made from. versions.json pins the versions minecraft-data had
// when they were checked by hand: there the build is not always the newest of its major.minor.patch (1.20.10 is
// 1.20.11.01), and 1.21.50 is one build on Windows and another on Linux. A version it does not pin is made from the
// newest release build of the same major.minor.patch.
import { readFileSync } from 'node:fs'

/** A version's build, or where minecraft.net had it under another build for an OS, the build of each OS. */
export type Pin = string | Partial<Record<'windows' | 'linux', string>>

/** Part by part as numbers: missing parts count as 0, so 1.21.0 sorts before every 1.21.0.x build; 01 and 1 are equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

export function loadPins(file: string): Map<string, Pin> {
  const pins = new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, Pin>))
  for (const [version, pin] of pins)
    for (const build of typeof pin === 'string' ? [pin] : Object.values(pin))
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(build ?? '')) throw new Error(`${file}: ${version} needs an exact server build (major.minor.patch.build), not ${build}`)
  return pins
}

function majorMinorPatch(build: string): string {
  return build.split('.').slice(0, 3).map(Number).join('.')
}

/**
 * The release build of `releases` (bedrock-data's, newest first) that `version` is made from: its pin's (linux's
 * first, where it has one for each OS), else the newest of its major.minor.patch. Undefined where bedrock-data has
 * none of them.
 */
export function buildFor(version: string, pins: Map<string, Pin>, releases: string[]): string | undefined {
  const pin = pins.get(version)
  if (pin !== undefined) {
    const candidates = typeof pin === 'string' ? [pin] : [pin.linux, pin.windows]
    return candidates.find((build) => build !== undefined && releases.includes(build))
  }
  const wanted = majorMinorPatch(version)
  return releases.find((build) => majorMinorPatch(build) === wanted)
}

/** The release builds no version of `versions` is made from, nor would be: minecraft-data has no version of them yet. */
export function unpublished(versions: string[], pins: Map<string, Pin>, releases: string[]): string[] {
  const used = new Set(versions.map((v) => buildFor(v, pins, releases)))
  const versionsOf = new Set(versions.map(majorMinorPatch))
  const oldest = versions.map((v) => buildFor(v, pins, releases)).find((b) => b !== undefined)
  return releases.filter((b) => !used.has(b) && !versionsOf.has(majorMinorPatch(b)) && oldest !== undefined && compareVersions(b, oldest) > 0)
}
