// A generator turns what bedrock-data has of a release build into one minecraft-data file of each version made from
// that build. Adding one: its module here, its entry in `generators`, and the bedrock-data file it reads (bedrock-data's
// README says each file's format).
import type { BedrockData } from '../bedrockData.ts'
import { attributes } from './attributes.ts'
import { biomes } from './biomes.ts'
import { blockCollisionShapes } from './blockCollisionShapes.ts'
import { blockLoot } from './blockLoot.ts'
import { blocks } from './blocks.ts'
import { blockStates } from './blockStates.ts'
import { commands } from './commands.ts'
import { effects } from './effects.ts'
import { enchantments } from './enchantments.ts'
import { entities } from './entities.ts'
import { entityLoot } from './entityLoot.ts'
import { foods } from './foods.ts'
import { instruments } from './instruments.ts'
import { items } from './items.ts'
import { language } from './language.ts'
import { mapIcons } from './mapIcons.ts'
import { materials } from './materials.ts'
import { particles } from './particles.ts'
import { recipes } from './recipes.ts'
import { sounds } from './sounds.ts'
import { steve } from './steve.ts'
import { tints } from './tints.ts'

export interface Generator {
  /** minecraft-data's name: data/bedrock/<version>/<key>.json, and that key of a dataPaths.json entry */
  key: string

  /** a new key goes after the first of these an entry has (else first): where minecraft-data puts it */
  after: string[]

  /** whether bedrock-data has what the file is made from for `build`; where not, the version keeps what it points to */
  has(data: BedrockData, build: string): boolean

  /** whether what bedrock-data has of `build` says what the file holds (always, where absent); where not, the version has no entry */
  says?(data: BedrockData, build: string): boolean

  /** The version's minecraft-data file, made from `build`: what versions are compared by. */
  json(data: BedrockData, build: string): string

  /** What a minecraft-data file says, however it is written: equal for files that say the same. */
  meaning(json: string): string

  /**
   * The file as it is written, in the form the checkout's committed files of the version give it (`committed`: a key's
   * file there, or as this run wrote it where a generator before this one did): written so, a regenerated file differs
   * from the committed one only in what it says. Without it, json() is written.
   */
  format?(json: string, committed: (key: string) => string | undefined): string

  /** minecraft-data's schema of the file (schemas/<file>), where it must take more than it does: the edited text */
  schema?: { file: string; edit: (text: string) => string }
}

// blockCollisionShapes after blocks: it writes its blocks in the order of the version's blocks.json
export const generators: Generator[] = [
  attributes,
  blocks,
  blockStates,
  blockCollisionShapes,
  biomes,
  entities,
  items,
  foods,
  recipes,
  commands,
  instruments,
  materials,
  enchantments,
  effects,
  particles,
  sounds,
  tints,
  mapIcons,
  steve,
  entityLoot,
  blockLoot,
  language,
]
