# bedrock-data-generator

Converts [bedrock-data](https://github.com/mc-zuri/bedrock-data) into
[minecraft-data](https://github.com/PrismarineJS/minecraft-data)'s Bedrock JSON files and updates `dataPaths.json`.
Data is extracted separately by [bedrock-data-extractor](https://github.com/mc-zuri/bedrock-data-extractor).

## Setup

Requires Node 24+, pnpm and git. Keep a bedrock-data checkout beside this repository; clone it if needed:

```sh
git clone https://github.com/mc-zuri/bedrock-data ../bedrock-data
pnpm install
cp .env.example .env
```

[.env.example](.env.example) documents the settings. Defaults: `BEDROCK_DATA_DIR=../bedrock-data` and
`MINECRAFT_DATA_DIR=repos/minecraft-data`. The first generation clones minecraft-data if missing.
Set `MINECRAFT_DATA_FORK` to your fork URL if needed.

## Usage

```sh
pnpm generate                  # configured files, or the five defaults below
pnpm generate language recipes # only these generators
pnpm generate all              # all 22 generators
pnpm status                    # versions, source builds and output paths
```

Set `GENERATE` in `.env` to comma-separated generator keys or `all` to replace the default selection.
Explicit command-line keys override `GENERATE`; use names without `.json`.

Generation edits the local checkout without committing or pushing. Review with `git -C repos/minecraft-data status`.

## Generators

Sync status below is the default when `GENERATE` is unset, defined in [src/generators/index.ts](src/generators/index.ts).
All listed generators are implemented; **No** means opt-in through `GENERATE` or `pnpm generate <key>`.
This selection also applies to the sync workflow unless its `GENERATE` repository variable overrides it.

| JSON file                   | Contents                                              | Sync by default |
| --------------------------- | ----------------------------------------------------- | --------------- |
| `blocks.json`               | Block properties, drops and harvest tools             | Yes             |
| `blockStates.json`          | Global block state palette                            | Yes             |
| `blockCollisionShapes.json` | Collision boxes for each block state                  | Yes             |
| `materials.json`            | Tool mining speeds by material                        | Yes             |
| `items.json`                | Item registry, stack sizes, durability and components | Yes             |
| `attributes.json`           | Joining player's attributes                           | No              |
| `biomes.json`               | Biome IDs, climate and properties                     | No              |
| `entities.json`             | Entity IDs, dimensions and categories                 | No              |
| `foods.json`                | Nutrition and saturation                              | No              |
| `recipes.json`              | Crafting grid recipes                                 | No              |
| `commands.json`             | Command tree, arguments and aliases                   | No              |
| `instruments.json`          | Note block instruments                                | No              |
| `enchantments.json`         | Enchantment levels, costs and compatibility           | No              |
| `effects.json`              | Mob effects and Bedrock IDs                           | No              |
| `particles.json`            | Particle types and IDs                                | No              |
| `sounds.json`               | Sound events and IDs                                  | No              |
| `tints.json`                | Colours used by the server for maps                   | No              |
| `mapIcons.json`             | Map decoration types                                  | No              |
| `steve.json`                | Default skin captured from a client                   | No              |
| `entityLoot.json`           | Entity loot from behavior packs                       | No              |
| `blockLoot.json`            | Block drops and loot probabilities                    | No              |
| `language.json`             | Vanilla English translations                          | No              |

## Output

Files go into `data/bedrock/<version>/` inside the minecraft-data checkout, with references in `data/dataPaths.json`.

- Versions use the exact builds pinned in [versions.json](versions.json), otherwise the newest release build with the same major.minor.patch. Previews are excluded.
- Only existing minecraft-data versions are updated. Missing source data keeps the existing output; an explicitly empty source can remove its entry, such as unavailable instruments.
- Identical data shares the previous version's file. Unreferenced generated files are removed, and rerunning with the same inputs changes nothing.
- Generators update schemas where needed to represent Bedrock data. Blocks are checked unique by ID and items by name rather than by Ajv's `uniqueItems`, which compares every entry with every other and pushes minecraft-data's test suite past its 40-second limit. Block and item IDs come from Bedrock; translations preserve embedded `=` and `#` that older minecraft-data files truncated.

See [bedrock-data's README](https://github.com/mc-zuri/bedrock-data#format) for source formats and
[minecraft-data's Bedrock documentation](https://github.com/PrismarineJS/minecraft-data/blob/master/doc/bedrock.md) for downstream usage.

## Automation

The [generate workflow](.github/workflows/generate.yml) runs every six hours, on pushes to `main`, or manually.
It generates and tests minecraft-data, then force-pushes changes to the fork's `bedrock-data-sync` branch.
A manual `base` input uses that fork branch as the base and writes `bedrock-data-sync-on-<base>`. Pull requests are opened manually.

Configure repository variables `BEDROCK_DATA_REPO` and `MINECRAFT_DATA_FORK` as `owner/repo`, optional `GENERATE`,
and secret `MINECRAFT_DATA_DEPLOY_KEY` with a write deploy key for the fork.

## Development

Run `pnpm verify` for type, lint and formatting checks, and `pnpm test` for fixture tests.
Generators live in [src/generators/](src/generators/); register additions in `index.ts` and add tests.
See [AGENTS.md](AGENTS.md) for contribution rules.
