# External data sources

Every value in `output/minecraft-data/` originates outside this repo. This page catalogs each
external source: where it comes from, how it's fetched and pinned, what it lands as in `data/`, and
which output files depend on it.

Nothing in `output/` is authored by hand — the generators (`src/generators/`) only join, remap, and
reshape these external inputs. Pins for every source live in [`src/versions.ts`](../src/versions.ts),
one row per Bedrock version.

> For per-output-file field references, see [minecraft-data/index.md](minecraft-data/index.md).

## Pipeline overview

The full run is `node main.ts` ([`main.ts`](../main.ts)), four stages:

1. **`setupBedrockServers()`** — download + configure a BDS for each version.
2. **`exportNetworkData()`** — boot each BDS, connect a client, capture packets → `data/bedrock/<ver>/`.
3. **`downloadExternalData()`** — fetch PyMCTranslate, Java minecraft-data, Geyser mappings, bedrock-data.
4. **`generateData()`** — run the generators per version → `output/`.

All HTTP downloads go through [`src/download.ts`](../src/download.ts) (`download` = fail on non-2xx,
`tryDownload` = null on 404 for optional files, `githubRaw` = build a `raw.githubusercontent.com`
URL). GitHub sources are pinned to an immutable **commit SHA** (or fixed branch) so a regenerate is
reproducible.

---

## 1. Bedrock Dedicated Server (BDS)

|               |                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **What**      | The official Minecraft Bedrock Dedicated Server binary, per version.                                                                     |
| **Origin**    | Mojang/Microsoft, downloaded via the `minecraft-bedrock-server` npm package.                                                             |
| **Pinned by** | `serverVersion` in `versions.ts` (the real build, e.g. `1.26.30.5`).                                                                     |
| **Code**      | [`src/server/external-server.ts`](../src/server/external-server.ts) (`ExternalServer.ensureInstalled` → `bedrockServer.downloadServer`). |
| **Lands in**  | `servers/<mcDataVersion>/` (executable, `server.properties`, bundled resource packs).                                                    |

The BDS is both the **packet source** (stage 2 connects to it) and the source of the **vanilla
resource pack** used for `language.json`.

**Feeds:** every packet-capture file (below) + `language.json`.

---

## 2. Bedrock packet captures (live server)

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **What**     | Network packets emitted by the running BDS on client login.                                                              |
| **Origin**   | The BDS from source #1, captured with the `bedrock-protocol` npm client.                                                 |
| **Code**     | [`src/server/packet-exporter.ts`](../src/server/packet-exporter.ts) (`PacketExporter`), driven by `exportNetworkData()`. |
| **Lands in** | `data/bedrock/<mcDataVersion>/*.json`.                                                                                   |

Captured packets → files (`EXPORT_DEFS`):

| Packet                                                              | File                                | Feeds output                 |
| ------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| `start_game` (`.itemstates`, ≤1.21.50) / `item_registry` (1.21.60+) | `item_registry.json`                | `items.json`, `recipes.json` |
| `crafting_data`                                                     | `crafting_data.json`                | `recipes.json`               |
| `available_entity_identifiers`                                      | `available_entity_identifiers.json` | `entities.json`              |
| `biome_definition_list`                                             | `biome_definition_list.json`        | `biomes.json`                |
| `update_attributes`                                                 | `player_attributes.json`            | `attributes.json`            |

> **Breakpoint:** the item registry moved out of `start_game` into its own `item_registry` packet at
> **1.21.60** (handled by `minVersion`/`maxVersion` in `EXPORT_DEFS`).

---

## 3. bedrock-data (block palette + collision shapes)

|               |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| **What**      | Per-version Bedrock block palette and per-state collision shapes, captured from the game. |
| **Origin**    | GitHub `mc-zuri/bedrock-data`, branch `main`, laid out by **real server build**.          |
| **Pinned by** | `serverVersion` (path is `data/<serverVersion>/<file>`).                                  |
| **Code**      | [`src/bedrock-data.ts`](../src/bedrock-data.ts) (`BedrockData`).                          |
| **Lands in**  | `data/bedrock/<mcDataVersion>/`.                                                          |

| File                     | Format            | Feeds                                                                               |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------- |
| `block_palette.nbt`      | big-endian NBT    | `blockStates.json` (state names/ids in runtime order) → consumed by all block files |
| `block-state-shapes.nbt` | little-endian NBT | `blockCollisionShapes.json` (authoritative, preferred over Geyser)                  |

**Feeds:** `blockStates.json`, `blocks.json`, `blocksJ2B.json`, `blocksB2J.json`,
`blockCollisionShapes.json` (and indirectly `items.json` via `blockStateId`).

---

## 4. Geyser mappings & mappings-generator

|               |                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| **What**      | Java↔Bedrock block & item correspondence tables, and (older) collision data.                                    |
| **Origin**    | GitHub `GeyserMC/mappings` and `GeyserMC/mappings-generator`.                                                   |
| **Pinned by** | `mappings` (commit on `GeyserMC/mappings`) and `mg` (commit on `GeyserMC/mappings-generator`) in `versions.ts`. |
| **Code**      | [`src/geyser-mappings.ts`](../src/geyser-mappings.ts) (`GeyserMappings`).                                       |
| **Lands in**  | `data/bedrock/<mcDataVersion>/`.                                                                                |

| Geyser file                                | Saved as                   | When                          | Feeds                                           |
| ------------------------------------------ | -------------------------- | ----------------------------- | ----------------------------------------------- |
| `mappings/items.json`                      | `items_mappings.json`      | always                        | `items.json` (Java↔Bedrock item map)            |
| `mappings/blocks.json`                     | `generator_blocks_v1.json` | `mg` empty (≤1.20.80, **v1**) | `blocksJ2B.json`/`blocksB2J.json`, collision v1 |
| `mappings-generator/generator_blocks.json` | `generator_blocks_v2.json` | `mg` set (1.21.0+, **v2**)    | `blocksJ2B.json`/`blocksB2J.json`               |
| `mappings/collision.json`                  | `collision.json`           | optional, v1 era              | `blockCollisionShapes.json` (fallback)          |
| `mappings/collisions.nbt`                  | `collisions.nbt`           | optional, v2 era              | `blockCollisionShapes.json` (fallback)          |

> **Breakpoint:** the **v1 → v2** split at **1.21.0**. `mg: ""` selects the legacy
> `GeyserMC/mappings` `blocks.json`; a non-empty `mg` selects the newer mappings-generator output.
> Collision files are optional (`tryDownload`, may 404) — bedrock-data (#3) is the preferred
> collision source.

**Feeds:** `blocksJ2B.json`, `blocksB2J.json`, `items.json`, `blockCollisionShapes.json` (fallback).

---

## 5. Java minecraft-data

|               |                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| **What**      | The Java Edition `minecraft-data` dataset — used to enrich Bedrock entries with Java-derived fields. |
| **Origin**    | GitHub `mc-zuri/node-minecraft-data`, branch `bedrock-v2`, dir `minecraft-data/data/`.               |
| **Pinned by** | `javaVersion` (blocks/biomes/entities) and `javaItemsVersion` (items) in `versions.ts`.              |
| **Code**      | [`src/java-data.ts`](../src/java-data.ts) (`downloadJavaData`).                                      |
| **Lands in**  | `data/java/<dir>/<resource>.json`, mirroring upstream's `dataPaths.json` layout.                     |

Resources downloaded: `biomes`, `blocks`, `entities`, `items` (`.json`) per involved Java version.
Because upstream shares files across versions via `dataPaths.json` (e.g. `pc/1.20.3`'s biomes live in
`pc/1.20.2`), the downloader resolves every `(version, resource)` through `dataPaths.json` and stores
files under their canonical dir; `data/java/dataPaths.json` is saved so the generators
(`Generator.javaResource`) resolve reads identically.

| Resource   | Feeds                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| `blocks`   | `blocks.json` (hardness, resistance, material, harvestTools, drops, …)     |
| `items`    | `items.json` (displayName, stackSize, enchantCategories, maxDurability, …) |
| `entities` | `entities.json` (type, category, displayName; height/width fallback)       |
| `biomes`   | `biomes.json` (category, precipitation, depth, dimension, color, …)        |

> **Breakpoint:** `javaItemsVersion` overrides `javaVersion` for items when a Bedrock version pairs
> its blocks and items with different Java versions (e.g. `1.20.80` blocks=1.20.5, items=1.20.4).

---

## 6. PyMCTranslate (biome id tables)

|               |                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What**      | Universal biome translation tables (numeric ids + Java↔Bedrock biome mapping).                                                                             |
| **Origin**    | GitHub `gentlegiantJGC/PyMCTranslate`, pinned commit.                                                                                                      |
| **Pinned by** | A single fixed commit in [`src/pymctranslate.ts`](../src/pymctranslate.ts) (latest snapshot is a superset of older ones, so one pair serves all versions). |
| **Lands in**  | `data/pymctranslate/java_26_2.json`, `data/pymctranslate/bedrock_26_30.json` (the `__biome_data__.json` snapshots).                                        |

**Feeds:** `biomes.json` (Bedrock biome ids + the intermediate biome J2B/B2J maps from `biomeMap.ts`).

---

## 7. Vanilla resource pack (localization)

|               |                                                                          |
| ------------- | ------------------------------------------------------------------------ |
| **What**      | The canonical en_US localization strings.                                |
| **Origin**    | Shipped **inside** each BDS download (source #1) — no separate download. |
| **Code**      | [`src/generators/language.ts`](../src/generators/language.ts).           |
| **Read from** | `servers/<mcDataVersion>/resource_packs/vanilla/texts/en_US.lang`.       |

**Feeds:** `language.json` (parsed `key=value` `.lang` → flat map).

---

## Source → output matrix

| Output file                 | Bedrock packets | bedrock-data | Geyser | Java mc-data | PyMCTranslate | Resource pack |
| --------------------------- | :-------------: | :----------: | :----: | :----------: | :-----------: | :-----------: |
| `blockStates.json`          |                 |      ●       |        |              |               |               |
| `blocks.json`               |                 |      ●       |   ●    |      ●       |               |               |
| `blocksJ2B.json`            |                 |              |   ●    |              |               |               |
| `blocksB2J.json`            |                 |              |   ●    |              |               |               |
| `blockCollisionShapes.json` |                 |      ●       |   ○    |              |               |               |
| `items.json`                |        ●        |      ●       |   ●    |      ●       |               |               |
| `entities.json`             |        ●        |              |        |      ●       |               |               |
| `biomes.json`               |        ●        |              |        |      ●       |       ●       |               |
| `recipes.json`              |        ●        |              |        |              |               |               |
| `attributes.json`           |        ●        |              |        |              |               |               |
| `language.json`             |                 |              |        |              |               |       ●       |
| `steve.json`                |        ●        |              |        |              |               |               |

● = primary source ○ = fallback only

> `steve.json` comes from a separate one-off capture ([`captureSteve.ts`](../captureSteve.ts)) that
> relays a real client login through the BDS to grab the default skin payload into
> `data/bedrock/<ver>/steve.json`.

## Libraries that parse these formats

| Package                         | Role                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `minecraft-bedrock-server`      | Download/run BDS (source #1).                                        |
| `bedrock-protocol`              | Packet client/relay for captures (sources #2, steve).                |
| `prismarine-nbt`                | Parse `.nbt` (palette, collision shapes, biome list, entity idlist). |
| `json-stringify-pretty-compact` | Compact-but-readable JSON serialization of outputs.                  |

## Reproducibility & validation

- Every GitHub source is pinned to an immutable commit; BDS/Java pairings are explicit in
  `versions.ts` — a regenerate from the same pins reproduces the same `output/`.
- [`src/normalize.ts`](../src/normalize.ts) enforces a canonical property order per output file and
  **throws on any unregistered field**, so a new packet/mapping field can't silently leak into the
  output without being added to the registry deliberately.
