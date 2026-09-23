// pnpm recipes [versions]: data/<build>/recipes.json, every recipe the build's server sends (mcdata/craft.ts),
// from its packets.nbt; written only where every recipe is craftable with the build's item data
// (validate/recipes.ts).
import { dataFile, writeAtomic, type Build } from '../config.ts'
import { recipesJson, recipesOf } from '../mcdata/craft.ts'
import { recipeProblems } from '../validate/recipes.ts'

export async function recipes (builds: Build[]): Promise<string[]> {
  const failed: string[] = []
  for (const b of builds) {
    try {
      const r = recipesOf(b)
      const problems = recipeProblems(b, r)
      if (problems.length) throw new Error(`${problems.length} problem(s): ${problems.slice(0, 5).join('; ')}`)
      writeAtomic(dataFile(b, 'recipes.json'), recipesJson(r))
      console.log(`  ${b.mcDataVersion.padEnd(10)} ${r.recipes.length} recipes, ${r.potions.length + r.potionContainers.length} brewing`)
    } catch (e) {
      failed.push(b.mcDataVersion)
      console.log(`  ${b.mcDataVersion.padEnd(10)} FAILED: ${e instanceof Error ? e.message : e}`)
    }
  }
  return failed
}
