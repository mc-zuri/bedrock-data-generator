// recipes.json: the crafting grid's recipes the build's server sends in crafting_data (recipes.json.gz), in Java's form,
// as prismarine-recipe reads it, by the id of the item each makes (items.json's ids):
// - a shaped recipe: inShape, its rows top first (null: an empty slot); a shapeless one: ingredients;
// - an item: its id, or { id, metadata } where the recipe names a data value;
// - an ingredient that takes several items (an item tag, a complex alias: items.json.gz's tags and complex aliases)
//   makes one recipe per item, every slot of the ingredient the same item, the first ingredient's items varying slowest,
//   as Java's recipes.json has one per plank;
// - result: the first output, always with its metadata (prismarine-recipe takes a result without one for any data value):
//   the data value the crafted stack has, its own, or from 1.16.220, where the server sends a block item with its block
//   state, that state's (blocks.json.gz) for an item with variants (resultData);
// - outShape: what the grid's ingredients give back besides (the server's further outputs: cake's buckets, the honey
//   bottles' glass bottles), each on the slots of the ingredient it is the container of (milk_bucket -> bucket), as
//   Java's outShape puts an ingredient's crafting remainder. Only shaped recipes give something back.
// The grid's recipes are the crafting table's, and the deprecated block's (the grid's old recipes) but its furnaces'
// (from 1.26.20, minecraft:furnace_*). A recipe whose ingredient takes no item (molang) is left out; recipes that say
// the same are written once.
import type { BedrockData, Ingredient, Items, Recipe, RecipeStack } from '../bedrockData.ts'
import type { Generator } from './index.ts'
import { canonical, withoutNamespace } from './utils/json.ts'

export type RecipeItem = number | { id: number; metadata: number }

export interface RecipeResult {
  id: number
  metadata: number
  count: number
}

export interface JavaRecipe {
  inShape?: (RecipeItem | null)[][]
  outShape?: (RecipeItem | null)[][]
  ingredients?: RecipeItem[]
  result: RecipeResult
}

/**
 * The data value a recipe's result has: its block state's (Block::mData) where its item has variants, more than one
 * block state in the creative list (1.17's planks: one a wood), else its own (a tipped arrow's potion, a bed's colour; a
 * chest's block state is only its facing).
 */
function resultData(items: Items, byState: number[]): (o: RecipeStack) => number {
  const variants = new Map<string, Set<number>>()

  for (const { item, blockState } of items.creative) {
    if (blockState !== null) {
      variants.set(item, (variants.get(item) ?? new Set()).add(blockState))
    }
  }

  return (o) => {
    const states = variants.get(o.item)

    if (o.blockState === null || !states || states.size < 2) {
      return o.metadata
    }

    if (!states.has(o.blockState)) {
      throw new Error(`${o.item}: block state ${o.blockState} is none of its creative variants`)
    }

    return byState[o.blockState]
  }
}

type Taken = { name: string; metadata?: number }

class Resolver {
  readonly #ids = new Map<string, number>()
  readonly #tagged = new Map<string, string[]>()
  readonly #complex: Map<string, string[]>

  constructor({ items, complexAliases }: Items) {
    // a tag's items by name
    for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
      this.#ids.set(item.name, item.id)

      for (const tag of item.tags) {
        this.#tagged.set(tag, [...(this.#tagged.get(tag) ?? []), item.name])
      }
    }

    this.#complex = new Map(complexAliases.map((a) => [a.name, a.items]))
  }

  id(name: string): number {
    const id = this.#ids.get(name)

    if (id === undefined) {
      throw new Error(`no item ${name}`)
    }

    return id
  }

  item({ name, metadata }: Taken): RecipeItem {
    return metadata === undefined ? this.id(name) : { id: this.id(name), metadata }
  }

  /** The items an ingredient takes, by name and data value; none for a molang one. */
  takes(i: Ingredient): Taken[] {
    if ('item' in i) {
      return [{ name: i.item, metadata: i.metadata }]
    }

    if ('descriptor' in i) {
      const split = this.#complex.get(i.descriptor)

      if (!split) {
        return [{ name: i.descriptor, metadata: i.metadata }]
      }

      if (i.metadata === undefined) {
        return [...new Set(split)].map((name) => ({ name }))
      }

      const name = split.at(i.metadata)

      if (name === undefined || i.metadata < 0) {
        throw new Error(`complex alias ${i.descriptor} has no data value ${i.metadata}`)
      }

      return [{ name }]
    }

    if ('tag' in i) {
      const names = this.#tagged.get(i.tag)

      if (!names) {
        throw new Error(`no item has tag ${i.tag}`)
      }

      return names.map((name) => ({ name }))
    }

    if ('alias' in i) {
      const split = this.#complex.get(i.alias)

      if (!split) {
        throw new Error(`no complex alias ${i.alias}`)
      }

      return [...new Set(split)].map((name) => ({ name }))
    }

    return []
  }
}

function ingredientKey(i: Ingredient): string {
  return JSON.stringify({ ...i, count: undefined })
}

/** Every way to pick one item of each list, the first list varying slowest. */
function product<T>(lists: T[][]): T[][] {
  let out: T[][] = [[]]

  for (const list of lists) {
    out = out.flatMap((picked) => list.map((x) => [...picked, x]))
  }

  return out
}

/** The word a container's name ends with: an ingredient whose item ends with it is what gives it back. */
function containerWord(name: string): string {
  return withoutNamespace(name).split('_').at(-1) ?? ''
}

/** A recipe's distinct ingredients (by what they say, not their count), each with the items it takes. */
interface Ingredients {
  keys: string[]
  takes: Taken[][]
}

function slotCount(recipe: Recipe, key: string): number {
  return recipe.input.filter((i) => i && ingredientKey(i) === key).length
}

/** For each output after the first, the ingredient whose slots it is given back on: the one it is the container of. */
function givenBack(recipe: Recipe, extra: RecipeStack[], { keys, takes }: Ingredients): number[] {
  return extra.map((e) => {
    const word = containerWord(e.item)
    const containers = keys.filter(
      (k, n) => slotCount(recipe, k) === e.count && takes[n].every((t) => withoutNamespace(t.name) !== word && withoutNamespace(t.name).endsWith(`_${word}`)),
    )

    if (containers.length !== 1) {
      throw new Error(`${recipe.id}: ${e.count} ${e.item} given back, ${containers.length} ingredients it is the container of`)
    }

    return keys.indexOf(containers[0])
  })
}

function rows<T>(cells: T[], width: number, height: number): T[][] {
  return Array.from({ length: height }, (_, y) => cells.slice(y * width, (y + 1) * width))
}

function asItem({ id, metadata }: RecipeResult): RecipeItem {
  return metadata ? { id, metadata } : id
}

/** The recipes one crafting_data recipe is in Java's form, one a pick of its ingredients' items; none where one takes no item. */
function javaRecipes(recipe: Recipe, resolve: Resolver, stack: (o: RecipeStack) => RecipeResult): JavaRecipe[] {
  const ingredients: Ingredients = { keys: [], takes: [] }

  for (const i of recipe.input) {
    if (i && !ingredients.keys.includes(ingredientKey(i))) {
      ingredients.keys.push(ingredientKey(i))
      ingredients.takes.push(resolve.takes(i))
    }
  }

  if (ingredients.takes.some((t) => !t.length)) {
    return []
  }

  const [first, ...extra] = recipe.output
  const result = stack(first)
  const { width, height } = recipe

  function picked(i: Ingredient, pick: Taken[]): RecipeItem {
    return resolve.item(pick[ingredients.keys.indexOf(ingredientKey(i))])
  }

  if (width === undefined || height === undefined) {
    if (extra.length) {
      throw new Error(`${recipe.id}: a shapeless recipe gives ${extra.map((e) => e.item).join(', ')} back`)
    }

    return product(ingredients.takes).map((pick) => ({
      ingredients: recipe.input.flatMap((i) => (i ? [picked(i, pick)] : [])),
      result: { ...result },
    }))
  }

  const backOn = givenBack(recipe, extra, ingredients)
  const outShape = extra.length
    ? rows(
        recipe.input.map((i) => {
          const n = i ? backOn.indexOf(ingredients.keys.indexOf(ingredientKey(i))) : -1
          return n < 0 ? null : asItem(stack(extra[n]))
        }),
        width,
        height,
      )
    : undefined
  return product(ingredients.takes).map((pick) => ({
    inShape: rows(
      recipe.input.map((i) => (i ? picked(i, pick) : null)),
      width,
      height,
    ),
    ...(outShape ? { outShape } : {}),
    result: { ...result },
  }))
}

/** Whether a recipe is the crafting grid's */
function isGrid(r: Recipe): boolean {
  return r.block === 'crafting_table' || (r.block === 'deprecated' && !r.id.startsWith('minecraft:furnace_'))
}

function recipesJson(data: BedrockData, build: string): Record<string, JavaRecipe[]> {
  const items = data.items(build)
  const byState = data.blocks(build).blocks.flatMap((b) => b.states.map((s) => s.data))
  const resolve = new Resolver(items)
  const dataOf = resultData(items, byState)

  function stack(o: RecipeStack): RecipeResult {
    return { id: resolve.id(o.item), metadata: dataOf(o), count: o.count }
  }

  const out: Record<string, JavaRecipe[]> = {}
  const written = new Set<string>()
  // the grid's old recipes after its own
  const grid = data
    .recipes(build)
    .filter(isGrid)
    .sort((a, b) => Number(a.block === 'deprecated') - Number(b.block === 'deprecated'))

  for (const recipe of grid) {
    for (const r of javaRecipes(recipe, resolve, stack)) {
      const key = String(r.result.id)
      const text = `${key} ${JSON.stringify(r)}`

      if (!written.has(text)) {
        written.add(text)
        ;(out[key] ??= []).push(r)
      }
    }
  }

  return out
}

// minecraft-data's recipes are by an item id of 0 or more; a Bedrock block item past id 255 has a negative id
const RESULT_ID = '"^[0-9]+$": {'

export const recipes: Generator = {
  key: 'recipes',
  after: ['items', 'entities', 'biomes', 'blockCollisionShapes', 'blockStates', 'blocks'],
  has: (data, build) => data.has(build, 'recipes', 'items', 'blocks'),
  json(data, build) {
    // 2 spaces, no final newline: as minecraft-data writes it
    return JSON.stringify(recipesJson(data, build), null, 2)
  },
  meaning: canonical,
  schema: { file: 'recipes_schema.json', edit: (text) => text.replace(RESULT_ID, '"^-?[0-9]+$": {') },
}
