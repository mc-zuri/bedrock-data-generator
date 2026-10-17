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
