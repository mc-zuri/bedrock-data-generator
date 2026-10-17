// A generator turns what bedrock-data has of a release build into one minecraft-data file of each version made from
// that build. Adding one: its module here, its entry in `generators`, and the bedrock-data file it reads (bedrock-data's
// README says each file's format).
import type { BedrockData } from '../bedrockData.ts'
import { language } from './language.ts'

export interface Generator {
  /** minecraft-data's name: data/bedrock/<version>/<key>.json, and that key of a dataPaths.json entry */
  key: string

  /** a new key goes after the first of these an entry has (else first): where minecraft-data puts it */
  after: string[]

  /** whether bedrock-data has what the file is made from for `build` */
  has(data: BedrockData, build: string): boolean

  /** The version's minecraft-data file, made from `build`: what versions are compared by. */
  json(data: BedrockData, build: string): string

  /** What a minecraft-data file says, however it is written: equal for files that say the same. */
  meaning(json: string): string
}

export const generators: Generator[] = [language]
