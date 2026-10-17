/** The shortest decimal that reads back as the same float32; any other number is returned as it is. */
export function f32(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) {
    return value
  }

  for (let precision = 1; precision < 17; precision++) {
    const candidate = Number(value.toPrecision(precision))

    if (Math.fround(candidate) === value) {
      return candidate
    }
  }

  return value
}

/** "minecraft:stone" -> "stone": minecraft-data's names have no namespace. */
export function withoutNamespace(name: string): string {
  return name.replace(/^minecraft:/, '')
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, sortedKeys((value as Record<string, unknown>)[k])]),
  )
}

export function canonical(json: string): string {
  return JSON.stringify(sortedKeys(JSON.parse(json)))
}
