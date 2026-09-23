// pnpm validate [versions]: the checkout's published files of each build, through the validation pnpm mcdata
// runs before it writes (src/validate): every problem, by version and file; the versions with one fail.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Build } from '../config.ts'
import { DATA, formatProblems, publishedFiles, validateVersion } from '../validate/index.ts'

export async function validate (builds: Build[]): Promise<string[]> {
  const paths = JSON.parse(readFileSync(join(DATA, 'dataPaths.json'), 'utf8'))
  const failed: string[] = []
  for (const b of builds) {
    const problems = validateVersion(b, paths, publishedFiles(b.mcDataVersion, paths))
    if (problems.length) {
      failed.push(b.mcDataVersion)
      console.log(formatProblems(problems))
    } else console.log(`  ${b.mcDataVersion.padEnd(10)} ok`)
  }
  return failed
}
