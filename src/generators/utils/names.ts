import type { Language } from '../../bedrockData.ts'

/** Every string of the language's packs, a key of the vanilla pack's over the others' */
export function strings(language: Language): Map<string, string> {
  const out = new Map<string, string>()
  const packs = [language.packs.vanilla ?? {}, ...Object.entries(language.packs).flatMap(([name, pack]) => (name === 'vanilla' ? [] : [pack]))]

  for (const pack of packs) {
    for (const [key, value] of Object.entries(pack)) {
      if (!out.has(key)) {
        out.set(key, value)
      }
    }
  }

  return out
}

/** The name the language gives a description id ("tile.stone", "item.apple"); undefined where it has none. */
export function nameOf(strings: Map<string, string>, descriptionId: string): string | undefined {
  return strings.get(descriptionId.endsWith('.name') ? descriptionId : `${descriptionId}.name`)
}

/**
 * Where an item is named item.<x> (minecraft:item.wooden_door: the block form of the item <x>, a door's or a cauldron's),
 * the name the language gives the item <x>; undefined for another item, or where it has none.
 */
export function nameOfItemFor(strings: Map<string, string>, name: string, items: Map<string, { descriptionId: string }>): string | undefined {
  const of = /^(minecraft:)?item\.(.+)$/.exec(name)
  const item = of && items.get(`minecraft:${of[2]}`)
  return item ? nameOf(strings, item.descriptionId) : undefined
}

/** "light_blue_wool" -> "Light Blue Wool": the name of what the language does not name. */
export function titleCase(name: string): string {
  return name
    .replace(/^minecraft:/, '')
    .replace(/_/g, ' ')
    .replace(/\b\S/g, (c) => c.toUpperCase())
}

/** `entry` with its keys in `order`; a key left undefined is left out. */
export function ordered<T extends object>(entry: T, order: readonly (keyof T)[]): T {
  const out: Partial<T> = {}

  for (const key of order) {
    if (entry[key] !== undefined) {
      out[key] = entry[key]
    }
  }

  return out as T
}

/**
 * `entries` with each one's keys in the order the committed file writes the entry of the same name: a regenerated file
 * then differs from it only in what it says. A key that entry lacks goes after the last of its keys `order` puts before
 * it; an entry the committed file lacks keeps `order`.
 */
export function inCommittedKeyOrder<T extends { name: string }>(entries: T[], committed: string | undefined, order: readonly (keyof T & string)[]): T[] {
  const committedKeys = new Map<string, string[]>()

  for (const entry of committed === undefined ? [] : (JSON.parse(committed) as Record<string, unknown>[])) {
    if (typeof entry.name === 'string') {
      committedKeys.set(entry.name, Object.keys(entry))
    }
  }

  function rank(key: string): number {
    return order.indexOf(key as keyof T & string)
  }

  return entries.map((entry) => {
    const theirs = committedKeys.get(entry.name)

    if (!theirs) {
      return entry
    }

    const keys = theirs.filter((key) => key in entry)

    for (const key of Object.keys(entry)) {
      if (!keys.includes(key)) {
        keys.splice(keys.findLastIndex((k) => rank(k) < rank(key)) + 1, 0, key)
      }
    }

    return Object.fromEntries(keys.map((key) => [key, entry[key as keyof T]])) as unknown as T
  })
}
