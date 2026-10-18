# bedrock-data-generator

Turns [bedrock-data](https://github.com/mc-zuri/bedrock-data) (what each Bedrock Dedicated Server build says, kept by
[bedrock-data-extractor](../bedrock-data-extractor)) into [minecraft-data](https://github.com/PrismarineJS/minecraft-data)'s
bedrock files, for every version minecraft-data has, and keeps its `dataPaths.json` pointing at them.

What it generates so far:

| minecraft-data file         | from bedrock-data (`release/<build>/`)                                        |
| --------------------------- | ----------------------------------------------------------------------------- |
| `language.json`             | `language.json.gz`: the vanilla pack's en_US strings                          |
| `blocks.json`               | `blocks.json.gz`, `items.json.gz`, `block_shapes.json.gz`, `language.json.gz` |
| `blockStates.json`          | `block_palette.nbt`: every block state                                        |
| `materials.json`            | `blocks.json.gz`, `items.json.gz`: what each item digs at what speed          |
| `items.json`                | `items.json.gz`, `enchantments.json.gz`, `blocks.json.gz`, `language.json.gz` |
| `blockCollisionShapes.json` | `block_shapes.json.gz`: each block state's collision boxes                    |
| `attributes.json`           | `attributes.json.gz`: the player's attributes                                 |
| `biomes.json`               | `biomes.json.gz`, `language.json.gz`                                          |
| `entities.json`             | `entities.json.gz`, `language.json.gz`                                        |
| `foods.json`                | `items.json.gz` (and what items.json says of each food)                       |
| `recipes.json`              | `recipes.json.gz`, `items.json.gz`, `blocks.json.gz`                          |
| `commands.json`             | `commands.json.gz`: the commands and the console's help for each              |
| `instruments.json`          | `enums.json.gz`                                                               |
| `enchantments.json`         | `enchantments.json.gz`, `language.json.gz`                                    |
| `effects.json`              | `effects.json.gz`, `language.json.gz`                                         |
| `particles.json`            | `enums.json.gz`                                                               |
| `sounds.json`               | `enums.json.gz`                                                               |
| `tints.json`                | `tints.json.gz`, `biomes.json.gz`, `block_palette.nbt`                        |
| `mapIcons.json`             | `enums.json.gz`                                                               |
| `entityLoot.json`           | `entities.json.gz`, `items.json.gz`                                           |
| `blockLoot.json`            | `blocks.json.gz`, `items.json.gz`, `block_palette.nbt`                        |

## Setup

Node 24 and pnpm. A bedrock-data checkout next to this one (`BEDROCK_DATA_DIR`, default `../bedrock-data`); the
minecraft-data checkout is cloned from PrismarineJS (blobless) into `repos/minecraft-data` the first time:

```sh
git clone https://github.com/mc-zuri/bedrock-data ../bedrock-data
pnpm install
cp .env.example .env   # optional: BEDROCK_DATA_DIR, MINECRAFT_DATA_DIR, MINECRAFT_DATA_FORK
```

## Steps

```sh
pnpm generate            # every file of every version, and dataPaths.json, into the minecraft-data checkout
pnpm generate language   # only those named (language, blocks, items, recipes, ...)
pnpm status              # each version, the build it is made from, and where its files are
```

`generate` edits the checkout's working tree and never commits: review `git -C repos/minecraft-data status`. Running
it again changes nothing.

### Which build a version is made from

[versions.json](versions.json) pins the versions minecraft-data had when they were checked by hand
(`"1.21.42": "1.21.42.01"`). The build is not always the newest of its major.minor.patch (`1.20.10` is `1.20.11.01`),
and `1.21.50` is `1.21.50.07` on Windows but `1.21.50.10` on Linux (linux's is used where bedrock-data has both). A
version it does not pin is made from bedrock-data's newest release build of the same major.minor.patch, so a version
minecraft-data adds is covered as soon as bedrock-data has its build. Previews are never used.

A version made from no build bedrock-data has (0.14, 0.15 and 1.0 have no BDS; a build not extracted yet) is left as
it is, and so is a version whose build bedrock-data has nothing for a file of (mapIcons before any exploration map
marker is named). A version whose build says there is none (instruments from 1.21.50 to 1.26.20, and Linux's 1.26.30, which keep no table of
them) has no entry for it. A release build minecraft-data has no version of is reported: minecraft-data's own bedrock version bump adds
the version (its protocol and version files), never this.

### Deduplication

Versions are walked oldest first. A version whose file would say what the version before says gets none of its own:
its `dataPaths.json` entry points to that version's folder. Otherwise its file goes in `bedrock/<version>/`. A file
that already says the same (in any key order) is left as it is written; one no version points to any more is deleted.
A new key goes where minecraft-data puts it (`language` after `version`), in the checkout's line ending.

### language.json

The vanilla pack's strings, every key in the file's order, 2 spaces, no final newline. bedrock-data reads `.lang`
files as its README says, so a string with an `=` or a `#` of its own is whole. minecraft-data's earlier files were
made by splitting each line on every `=` and cutting at every `#`, which cut those strings short. Regenerating 1.16.201
to 1.26.51 changed 463 strings across 48 files, all of them that kind:

|                      | strings | example                                                          |
| -------------------- | ------- | ---------------------------------------------------------------- |
| an `=` in the string | 431     | `advMode.allEntities`: `"@e "` → `"@e = all entities"`           |
| a `#` in the string  | 32      | `gameTip.hotbar.touch`: `"Tap"` → `"Tap # in hotbar to hold it"` |

Its dedupe groups are the same as the monolith generator's (1.21.124 → 1.21.120, 1.26.45 → 1.26.40), and minecraft-data's
`tools/js` tests pass on the result.

### blocks.json

Every block type by its numeric id (`BlockLegacy::mID`), 2 spaces, no final newline:

| key                                                  | from                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName`                                        | the language's name (any pack's, the vanilla one's first) for its description id, else its item's (for an item named `item.<x>`, the item `<x>`'s), else its name in title case |
| `hardness`, `resistance`, `emitLight`, `filterLight` | its default state's destroy speed, explosion resistance, light emission and dampening                                                                                           |
| `transparent`                                        | its dampening below 15                                                                                                                                                          |
| `diggable`                                           | a hardness of 0 or more, and not a liquid                                                                                                                                       |
| `stackSize`                                          | its item's (a block id below 256 is its item's; another's item is 255 minus it), else the item of its name's                                                                    |
| `material`, `harvestTools`                           | what each item digs it at, and which items harvest it where it needs the right tool (below)                                                                                     |
| `defaultState`, `minStateId`, `maxStateId`           | runtime ids: blockStates.json's indexes                                                                                                                                         |
| `drops`                                              | every item the game drops for any of its states, mined with an empty hand (a data-driven block's: its loot tables'); none where it cannot be dug                                |
| `boundingBox`                                        | `empty` where its default state collides with nothing                                                                                                                           |

A drop with a data value is `{ drop: { id, metadata } }`: the data value a client is sent (from 1.16.220, where a
creative stack names the block it places, a block item's own data value; before, the data of the block it carries).
Item ids are the item registry's runtime ids (items.json's), Bedrock's own: minecraft-data's earlier bedrock blocks.json
named blocks by Java's ids and drops by Java's items. A block item past id 255 has a negative id, which in 1.16.201 and
1.16.210 a drop with a data value carries: `generate` widens minecraft-data's `schemas/blocks_schema.json` to take it,
as its `items_schema.json` does.

### materials.json

Each material's dig speeds by item id. A material is named from the speeds, as pc's materials.json names them:
`mineable/<tool>` for each digger whose every tier digs the block at its tier's speed (wood 2, stone 4, copper 5, iron
6, diamond 8, netherite 9, gold 12), and `coweb`, `sword_efficient`, `sword_instantly_mines`, `leaves`, `wool`,
`vine_or_glow_lichen` by the swords' and shears' speeds; `default` where nothing digs it faster than air. So
prismarine-block's dig time (materials[material][held item], harvesting where the block has no harvestTools or the item
is one) is the game's. Any other speed fails the build.

### blockStates.json

The palette in runtime id order, each name without its namespace, each property as its NBT tag, tabs.

### items.json

Every item of the registry by its runtime id, 2 spaces, each item's keys in the order the version's committed file
writes that item's: `stackSize` and `maxDurability` (`Item::getMaxStackSize`, `Item::getMaxDamage`), `displayName` (its
description id's, else its block's, else, for an item named `item.<x>` (a door's block form), the item `<x>`'s, else
title case), `enchantCategories` (the names of its enchant slots, then the category of every enchantment the game puts
on it), `repairWith`, `blockStateId` (the block state the creative list gives it, where it gives it one and no other),
`componentBased`, and from 1.21.60 `nbt` and `version` (as the item registry the server sends has them).
minecraft-data's `schemas/items_schema.json` has Bedrock's `nbt` and `version` but no `componentBased`: `generate` adds
it.

### blockCollisionShapes.json

`blocks`: each block (no namespace) with one shape id per state, in runtime id order; `shapes`: each id's boxes
(`[minX, minY, minZ, maxX, maxY, maxZ]`, each number the shortest decimal of its float32), 0 being none. Tabs, one block
or shape a line, no final newline.

A file is written in the form the checkout's committed file of the version gives it (`git show HEAD`), so that it
differs from it only in what it says: the blocks in the order of the version's `blocks.json` where that names the same
blocks (else runtime id order), each shape keeping its id in the committed table where the table holds most of the
shapes (a new one after its highest id; the table's shapes no block has any more stay), a block written as one id for
all its states (`"web": 0`) kept so, and a block split one state a line kept so. Files are compared by what they say:
each block's shapes, whatever the ids and order.

bedrock-data reads the shapes from its Linux servers (where a release has one). Up to 1.26.10 the Windows servers
differ from them in the last digit of a few floats (bedrock-data's README: Linux and Windows); from 1.26.20 they agree.
Here that is the chests: `0.95000005` high in every release (the Windows servers up to 1.26.10: `0.95`).

### attributes.json

The attributes the server sends a joining player, by resource (`minecraft:movement`), each named in camelCase without
its namespace (`player.hunger` -> `playerHunger`), with its min, max and default. A mob's own (a horse's jump strength)
are sent only with that mob. minecraft-data's earlier files (1.16.201 to 1.19.63) were Java's.

### biomes.json

Every biome the server sends a definition of, by the numeric id the registry gives it: its temperature, rainfall
(downfall), and from 1.19.20 `has_precipitation`, `depth` and `color` (its water's colour on a map; 0 before); its
dimension and category by its tags; `displayName` the language's `biome.<name>.name` (from 1.26.20), else its name in
title case.

### entities.json

Every entity the server sends a client, numbered in runtime id order (`internalId`: the runtime id): `displayName` the
language's `entity.<name>.name`, else title case; `width` and `height` its definition's collision box (an adult
component group's where there is one), null where it has none or no definition (an item, a painting: defined in code);
`type` and `category` by what its definition says (families, spawn category, a projectile component).

### foods.json

Every item a player eats, with its id, name, displayName and stackSize as items.json has them, and its food as the
server sends its `minecraft:food` component (the item registry's from 1.21.60, item_component's from 1.18.11), before
that as its legacy food component has it: `foodPoints` its nutrition, `saturationRatio` twice its saturation modifier,
`saturation` the two multiplied in floats as the game adds them to a player's, `effectiveQuality` their sum.

### recipes.json

The crafting grid's recipes (the crafting table's and the deprecated block's, but its furnaces') in Java's form, as
prismarine-recipe reads them, by the id of the item each makes: `inShape` for a shaped one, `ingredients` for a
shapeless one, an ingredient that takes several items (a tag, a complex alias) one recipe per item (by name, the first
ingredient varying slowest); `result` with its data value (a block item with variants: its block state's); `outShape`
what the grid gives back besides (cake's buckets), on the slots of the ingredient it is the container of. A recipe
whose ingredient is a molang expression is left out; recipes that say the same are written once. A Bedrock block item
past id 255 has a negative id, which minecraft-data's `schemas/recipes_schema.json` takes once `generate` widens it.

### commands.json

Every command the server sends, as minecraft-data's tree of nodes, from the console's help: one path a usage line,
merged where they agree; a literal word a literal node (and each of `<list|sidebar>`); `<name: type>` an argument node,
its parser the game's type name or enum name; executable where a usage line may end; an alias a literal node redirecting
to its command. `parsers`: each parser once, an enum's examples its values (sorted, as bedrock-data has them).

### instruments.json, particles.json, sounds.json, mapIcons.json

The game's own tables, by id: the note block instruments (`name` the sound without `note.`: `bd`, not Java's
`basedrum`; `sound` the sound where the table holds it whole, from 1.19.60), the particle types and the sound events
(an id the game names twice keeps its first name), and the map decoration types (from 1.26.40, every type the game's
reflection registers; before, only those exploration maps mark, named as the next release that names them does). The
server says nothing of a map icon's `visibleInItemFrame`: `generate` makes minecraft-data's `schemas/mapIcons_schema.json`
require it no more.

### enchantments.json and effects.json

Every enchantment by its id (`Enchant::Type`): `minCost` and `maxCost` the line through the game's costs at every level,
`weight` its frequency (30, 10, 3, 1) as minecraft-data weighs those rarities (10, 5, 2, 1), `curse` where its language
key is `enchantment.curse.*`, `exclude` those it does not go with, `category` its slots named (utils/enchantSlots.ts).
Every mob effect by the id the server sends: its name in PascalCase (`FatalPoison`), the language's name, bad where
harmful. minecraft-data's earlier effects.json was Java's, whose ids are not Bedrock's from 24 on.

### tints.json

The colours the server draws its maps with, each group's colours with the keys that take them: each biome's grass,
foliage and water (as the server sends it from 1.19.20), the redstone wire's at each power (none from 1.21.20, where
the server keeps no block colour), and the block types tinted with one colour wherever they are (the birch and spruce
leaves, from 1.20.71). No group has a default: the server has none. A group may be empty (the redstone wire's from
1.21.20): `generate` lets minecraft-data's `schemas/tints_schema.json` take it.

### entityLoot.json and blockLoot.json

What every entity the behavior packs define drops by its loot table (its own, else an adult group's), and what every
block drops when mined with an empty hand as the game draws it (blocks.json.gz's drops: by name, its default state's,
then each state that drops otherwise; a data-driven block by its loot table): `dropChance` the share of draws (or the
table's chances multiplied through), `stackSizeRange`, `metadata` as blocks.json's drops have it, `playerKill` where a
player must kill it. A drop gated on anything else (the killer, a variant, the tool) is left out.

### Against minecraft-data's earlier files

- `displayName` is the language's: where it names a block, item, biome or entity nothing (`moving_block`,
  `piston_arm_collision`, a music disc, a biome before 1.26.20), the name in title case, not an earlier file's.
- Ids are Bedrock's runtime ids: blocks' `BlockLegacy::mID`, items' and drops' the item registry's.
- What bedrock-data reads from its Linux servers is Linux's (bedrock-data's README: Linux and Windows): from 1.21.42 to
  1.26.10 the explosion resistance of 21 blocks (`4.2`, the Windows servers `4.2000003`), the chests' collision box,
  and the ids of some items (spears, bundles, trial keys, the wind charge), which each platform numbers in its own
  order.

## Workflows

- [generate](.github/workflows/generate.yml): every 6 hours, half an hour after the extractor's track (which also
  covers versions minecraft-data adds), on each push here, by hand, and by bedrock-data's notify-generator workflow on
  each commit there that changes a release, where that has a token to run it with. It generates into a fresh clone
  of upstream master, runs minecraft-data's `tools/js` tests, and force-pushes the result as one commit on the fork's
  `bedrock-data-sync` branch, only where that commit changes something the branch does not already carry. Opening the
  pull request to PrismarineJS is left to a person.
- [CI](.github/workflows/ci.yml): `pnpm verify` and `pnpm test`.

They need:

|                                    |                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| variable `BEDROCK_DATA_REPO`       | `mc-zuri/bedrock-data`                                                                 |
| variable `MINECRAFT_DATA_FORK`     | `mc-zuri/minecraft-data`                                                               |
| secret `MINECRAFT_DATA_DEPLOY_KEY` | the private half of a write deploy key of the fork: it can push there and nowhere else |

## Development

`pnpm verify` (tsc, oxlint, prettier) and `pnpm test` (node:test, on small bedrock-data and minecraft-data fixtures).
Node runs the `.ts` files as they are (type stripping): no build step.

|                      |                                                               |
| -------------------- | ------------------------------------------------------------- |
| `src/bedrockData.ts` | a bedrock-data checkout, as its README says (formatVersion 1) |
| `src/versions.ts`    | which release build each minecraft-data version is made from  |
| `src/publish.ts`     | the files of every version, deduplicated, and dataPaths.json  |
| `src/generators/`    | one module per minecraft-data file                            |
| `src/checkout.ts`    | the minecraft-data checkout and its remotes                   |
| `src/main.ts`        | the steps                                                     |

Adding a generator: its module in `src/generators/`, its entry in `generators`, the bedrock-data file it reads (whose
format bedrock-data's README says; a new one comes from the extractor first), and tests. A wrong value is fixed in the
generator, or in the extractor where bedrock-data has it wrong; never by editing minecraft-data's output.
