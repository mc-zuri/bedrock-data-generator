# bedrock-data-generator

Exports, from every Bedrock Dedicated Server build in [versions.json](versions.json) (the bedrock
versions [minecraft-data](https://github.com/PrismarineJS/minecraft-data/tree/master/data/bedrock) has):

| file in `data/<serverVersion>/` | what | how |
|---|---|---|
| `block_palette.nbt` | every block state (`name`, `states`, `version`), in runtime id order | agent inside the server |
| `block-state-shapes.nbt` | collision, UI and visual boxes of every block state | agent inside the server |
| `block_types.json` | every block type's default state, hardness, resistance, light, description id, tags, whether it needs the right tool | agent inside the server |
| `item_types.json` | every item's max stack size, max damage, description id | agent inside the server |
| `item_aliases.json` | the old item names the game still reads (loot tables' `fish`, `muttonRaw`) | agent inside the server |
| `effects.json` | every mob effect: id, names, harmful | agent inside the server |
| `enchantments.json` | every enchantment: id, names, rarity, slots, group, levels, costs | agent inside the server |
| `biome_ids.json` | every biome's numeric id (where the agent finds the registry: 28 of the builds) | agent inside the server |
| `packets.nbt` | the first raw packet of each id a client receives while joining | bedrock-protocol client |
| `steve.json` | the default skin a real client sends | relay + a real Minecraft client |

Everything is committed. A step skips a build whose files are already there, so a checkout only ever
exports what is new.

## Steps

```
pnpm install               # also clones checkouts/node-minecraft-data and checkouts/bedrock-protocol if missing
pnpm build:native          # xmake + MSVC: native/build/windows/x64/release/bdg_{agent.dll,inject.exe,check.exe}
pnpm servers [versions]    # download the exact builds into servers/ (or SERVERS_DIR, see .env.example)
pnpm blocks  [versions]    # everything the agent exports (the table above)
pnpm network [versions]    # packets.nbt
pnpm steve   <version>     # steve.json: join 127.0.0.1:19150 with Minecraft <version> when asked
pnpm mcdata [--accept]     # the minecraft-data files of every build into the minecraft-data checkout (Publishing, below)
pnpm validate [versions]   # the published files through the validation pnpm mcdata runs (Validation, below)
pnpm test                  # the tests: every version validates, the validators catch what they are for, known facts
pnpm all     [versions]    # servers, blocks, network, then mcdata
pnpm status  [versions]    # which files each build has
pnpm check   [versions]    # resolve the native bindings against the server exes without starting them
```

Versions are an mcDataVersion (`1.21.42`) or a serverVersion (`1.21.42.01`); none means all of them.
`--force` exports again over existing files.

## Formats

All NBT files are gzip-compressed; `prismarine-nbt`'s `parse` detects both.

- **`block_palette.nbt`**, big-endian: `{ blocks: [{ name, states, version }] }`. Each entry is the
  state's own CompoundTag, written by the game. The index is the block's runtime id.
- **`block-state-shapes.nbt`**, little-endian: `{ shapes: [{ blockStateHash?, blockStateId, collisionShape,
  uiShape, visualShape }] }`. `blockStateId` is the index into `blocks`. `blockStateHash` (a Long holding
  the uint32 network hash) exists from 1.19.80, when network ids became hashes. A box is
  `[minX, minY, minZ, maxX, maxY, maxZ]`; `collisionShape` is a list of boxes, possibly empty.
- **`block_types.json`**: `{ "<name>": { defaultBlockStateHash, defaultBlockStateId, hardness, explosionResistance,
  lightEmission, lightDampening, descriptionId, requiresCorrectToolForDrops?, tags? } }` by name, as
  bedrock-data-extractor writes it: the type's default state (`BlockLegacy::mDefaultState`, which must be one of
  its own states) by its network id (the hash from 1.19.80, the runtime id before) and by its runtime id, the
  index in `blocks` of `block_palette.nbt`; that state's destroy speed, explosion resistance, light emission and
  dampening (on the `BlockLegacy` before 1.19, the resistance stored times 5 there until 1.20.10; on the
  `Block` after); the translation stem (`mDescriptionId`, `tile.stone`); whether it drops only when mined with
  the right tool (`mRequiresCorrectToolForDrops`, from 1.21.50: the bit the build's binding names, else the one
  bit set for a dozen blocks that need a pickaxe and clear for a dozen that do not; builds before have none); its tags (`mTags`,
  sorted, left out when none), such as `minecraft:is_pickaxe_item_destructible` and
  `minecraft:iron_tier_destructible` (from 1.21.50) or `minecraft:iron_pick_diggable`. The name is the
  palette's (before 1.18.30 the registry keys are lowercased).
- **`item_types.json`**: `{ "<name>": { maxStackSize, maxDamage, descriptionId } }`: each registered item's
  stack size and durability as the game answers them (`getMaxStackSize`, `getMaxDamage`) and its translation
  stem (`item.diamond_sword`, `tile.stone`).
- **`item_aliases.json`**: `{ "<old name>": "<name>" }`, the item registry's alias map.
- **`effects.json`**: `[{ id, descriptionId, name?, harmful }]` by Bedrock effect id (from 1), `name` the
  resource name where the build has one.
- **`enchantments.json`**: `[{ id, name, descriptionId, frequency, tradeable, primarySlots, secondarySlots,
  compatibility, minLevel, maxLevel, minCost, maxCost }]` by Bedrock enchantment id (from 0), the costs for
  each level from 1 to the max (at least 2).
- **`packets.nbt`**, little-endian: `{ version, protocol, packets: [{ id, name, data }] }`. `data` is the
  packet as the server sent it (varint id, then the body), kept before decoding, so a packet
  bedrock-protocol cannot decode is there too. Decode with `bedrock-protocol`'s serializer for `protocol`.
- **`steve.json`**: the 20 skin fields of the login, the persona id made deterministic.

## How blocks are exported

`pnpm blocks` starts the server with `BDG_VERSION`/`BDG_OUT` in its environment, waits for
`Server started`, and loads `bdg_agent.dll` into it with `bdg_inject.exe`. The agent hooks `Level::tick`
and, on the next ticks, with the game blocked on it:

1. finds the real Level behind the tick, the overworld Dimension, and its BlockSource;
2. reaches the block type registry (a Level member, the Level getter, or the static map);
3. walks it in order; for each state it serialises the state's CompoundTag, and calls the
   `addCollisionShapes`, `getVisualShape` and `getUIShape` virtuals;
4. writes both files and `result.txt`;
5. finds the item registry, the alias map, the mob effects and the enchantments by what they contain, not by
   per-build offsets (`native/export/Items.cpp`, `Effects.cpp`, `Enchantments.cpp`): the item vector is the
   vector of Items named `minecraft:*` that includes the diamond sword and stone (a static in the image's
   data on older builds, on the heap after); an item's fields are the offsets that give the values certain
   items have on every build (a diamond sword stacks to 1 and lasts 1561 uses), and every such value must
   fit exactly one offset. Durability and stack size are the game's virtuals (`getMaxDamage`,
   `getMaxStackSize`, at the slots bedrock-data-extractor's configs name, checked on known items): fishing
   rods and buckets override the fields. Where a build has no stack size slot, the field and the one override
   (a bucket stacks to 16, a filled one to 1), which agrees with the call on every build that has one.

`collisionShape` is what the game's movement code collides with: `BlockSource::fetchCollisionShapes`
calls `addCollisionShapes` for each block an entity overlaps, and nothing else. The boxes come back in
world coordinates, so the call is made at the origin (the block's own exact floats) and again one chunk
away; a box that stays at the same world place wherever the block is sits at the world origin, never at
the block, and is dropped. The game makes such boxes in two ways:
- before 1.18.11, `BlockLegacy::addCollisionShapes` ignores `getCollisionShape`'s `false` and pushes its
  unit-cube default: buttons, scaffolding, the thinnest snow layers, fire (until 1.20.61), moving blocks;
- a box never offset by the position: pressure plates before 1.19.50 (`getCollisionShape` returns the
  visual shape as is), the end portal frame's eye (`EndPortalFrameBlock::addAABBs`, every build).

Node then kills the server, checks that both files agree, and gzips them into `data/`. The agent's log
stays in `work/<serverVersion>/agent.log`.

## Compared with the earlier data

`node tools/compare.ts` compares with `D:/projects/mc-zuri2/bedrock-data/data` (bedrock-data-extractor's
exports). Every palette is byte-identical after gunzip, and so are `uiShape` and `visualShape` of every
build. `collisionShape` differs where the extractor (whose code this export started from) was wrong:

| blocks | builds | earlier data | this export | why |
|---|---|---|---|---|
| buttons, scaffolding, 6 snow layers | 1.16.201 - 1.18.0 | `[0,0,0,1,1,1]` | `[]` | the phantom unit cube (above) |
| fire, soul fire | 1.16.201 - 1.20.50 | `[0,0,0,1,1,1]` | `[]` | the phantom unit cube |
| pressure plates | 1.16.201 - 1.19.40 | the plate | `[]` | the plate is never offset by the position |
| end portal frame with an eye | every build | base + eye | base | the eye is never offset by the position |
| shulker boxes | 1.16.201 - 1.17.30 | `[]` | `[0,0,0,1,1,1]` | both calls faulted on a wrong BlockSource |
| piston arm collision | 1.16.201 - 1.17.30 | `[0,0,0,1,1,1]` | `[]` | `addAABBs`, taken after the fault |

The earlier data of 1.16.201, 1.17.30, 1.17.40, 1.18.0, 1.18.11, 1.18.30, 1.21.2 and 1.26.40 was made with
`addAABBs` throughout, so there it has the geometry instead (a button's outline, no pressure plate).

The extractor, and this export until these fixes, had three defects:
- **a wrong BlockSource on 1.16.201 - 1.17.30:** the first "BlockSource-like" member of the Dimension
  (a vtable with enough functions) is another object (on 1.17.30 the `OverworldBrightnessRamp`). The calls that read the world at
  the probe position then faulted (shulker boxes, piston arms, moving blocks). `Dimension::mBlockSource`
  is now bound from each PDB (`Dimension::init`, `getBlockSourceFromMainChunkSource`), and a BlockSource
  is recognised by its `Level` and `Dimension` references;
- **mixed methods:** where `addCollisionShapes` faulted, or answered nothing for a block the bound
  `Block::mSolid` called solid, the box came from `addAABBs`, which is geometry, not collision. The
  "solid" case never happens with the right AABB stride (28 bytes before 1.17.30); `Block::mSolid` was
  wrong on 1.16.x, 1.18.30 and 1.21.111 - 1.21.120, and eight builds of the earlier data are `addAABBs`
  throughout. Both are gone: only `addCollisionShapes`, and a fault fails the export;
- **phantom boxes** kept as if they were the block's (above).

Every remaining change of a block's collision between builds is the game's own (mud, soul sand, farmland
and dirt path at 1.19.50, ladders, snow and powder snow at 1.20.30, candles at 1.18.11, stairs at 1.26.51).

## Adding a server build

1. Add `{ "mcDataVersion", "serverVersion" }` to [versions.json](versions.json).
2. `pnpm servers <version>` and `pnpm check <version>`. Every binding resolving means nothing moved.
3. Otherwise add a step at the end of [native/bindings/Steps.cpp](native/bindings/Steps.cpp) with only
   what changed: a new pattern for a function that moved, a slot or offset that changed.

   ```cpp
   BDG_BINDINGS("1.26.60.2") {
       r.slot(n::LevelGetBlockTypeRegistry, 392);
       r.function(n::LevelTick, "55 56 57 53 48 81 EC ? ? ? ? 48 8D AC 24");
   }
   ```

   Steps apply oldest first up to the running build, so everything a step leaves out carries over
   ([Bindings.h](native/bindings/Bindings.h)). `bdg_check.exe <exe> --find "<pattern>" [rel32At]` tries a
   pattern without rebuilding. Vtable slots and member offsets cannot be read from the exe; take them
   from a symbol dump of the build (endstone, LeviLamina) and confirm them with a real export.
4. `pnpm build:native && pnpm all <version>`, then commit `data/<serverVersion>/`.

Per-version settings of the TypeScript side (which packets the network step waits for, the login's
DeviceOS) are written the same way in [src/steps.ts](src/steps.ts).

`native/bindings/Steps.cpp` was generated once from bedrock-data-extractor's per-build configs by
[tools/migrate/make_steps.py](tools/migrate/make_steps.py) (patterns made and checked on each build's exe);
[tools/migrate/verify.py](tools/migrate/verify.py) confirms every resolved address equals those configs.
[tools/compare.ts](tools/compare.ts) compares exports with an older copy of the data.

## Checkouts

`bedrock-protocol` and `minecraft-data` are local clones in `checkouts/`, which `pnpm install` makes when
they are missing (`src/checkouts`) and `package.json` links to:

| checkout | repository |
|---|---|
| `checkouts/node-minecraft-data` | PrismarineJS/node-minecraft-data, with its `minecraft-data` submodule |
| `checkouts/bedrock-protocol` | mc-zuri/bedrock-protocol, branch `fix-nbtloop-size` (until upstream has the nbtLoop size fix) |

Both are used as they are: fix them, and commit, in the checkout. An existing checkout is never touched.
`pnpm install` also rebuilds node-minecraft-data's `data.js` (a linked package never runs its `prepare`).

## Publishing to minecraft-data

`pnpm mcdata` writes, for every build in `versions.json`, oldest first, into
`checkouts/node-minecraft-data/minecraft-data/data/`:

- `bedrock/<version>/attributes.json`: the player attributes the server sends in `update_attributes`
  (legacy2's attributes generator: once each, `name` the camel-cased `resource`, its default, min, max);
  kept from minecraft-data only while it has exactly those;
- `bedrock/<version>/blockStates.json`: the palette in runtime id order, each state's properties as their
  NBT tags (`{ type, value }`);
- `bedrock/<version>/blocks.json`: one entry per block, `minStateId`..`maxStateId` its states in
  `blockStates.json`, the other fields as below;
- `bedrock/<version>/materials.json`: each material a block names, its tools' speeds by `items.json` id;
- `bedrock/<version>/blockCollisionShapes.json`: `blocks` maps each block name to one shape id per state
  (state `minStateId + i` is entry `i`), in `blocks.json` order, `shapes` maps an id to its boxes; id 0 is
  no collision;
- `bedrock/<version>/biomes.json`: every biome the server sends in `biome_definition_list` (`packets.nbt`),
  sorted by its Bedrock id, the fields as below;
- `bedrock/<version>/entities.json`: every entity the server sends in `available_entity_identifiers`, `id`
  its index in the packet, `internalId` its runtime id, the fields as below;
- `bedrock/<version>/entityLoot.json`: each entity's drops, from the loot table its behavior pack
  definition names (below);
- `bedrock/<version>/effects.json`: every mob effect by its Bedrock id (`effects.ts`): `name` the resource
  name in PascalCase (as pc writes them: `FatalPoison`), `displayName` the language file's, `type` bad where
  the game marks it harmful (minecraft-data had Java's pc/1.17 for every bedrock version, whose ids after 24
  are not Bedrock's);
- `bedrock/<version>/enchantments.json`: every enchantment by its Bedrock id (`enchantments.ts`), below;
- `bedrock/<version>/items.json`: every item of the server's item registry (`start_game` until 1.21.50,
  `item_registry` after); from 1.21.100 `id` is the runtime id, with the registry's `nbt` and `version`,
  since prismarine-registry's `writeItemStates` makes the registry a server sends from it; the fields as
  below;
- `bedrock/<version>/recipes.json` (off for now, `PUBLISH_RECIPES` in `src/steps/mcdata.ts`;
  minecraft-data's are left as they are): the recipes the server sends in `crafting_data`, as legacy2's
  recipe generator makes them, in minecraft-data's form (a shapeless crafting table recipe typed
  `crafting_table_shapeless`, an ingredient's metadata left out where it is 0 or 32767, an output's where
  it is 32767; a `deprecated` recipe is a crafting table's), which gives minecraft-data's 1.18.0 to 1.19.20
  files byte for byte. Like those, it keys recipes by their place in the packet, not their network id, and
  leaves out multi, smithing and brewing recipes;
- `bedrock/<version>/steve.json`: the skin the version's client sends (`pnpm steve`), on one line, the
  persona id (the capturing account's PlayFab id) replaced by a fixed one; a build without a capture shares
  the version before's;
- `bedrock/<version>/blocksJ2B.json` / `blocksB2J.json` (off for now, `PUBLISH_BLOCK_MAPS` in
  `src/steps/mcdata.ts`; minecraft-data's are left as they are): Java block state -> Bedrock block state, and
  flipped (plus water and lava), as legacy2's blockMap generator makes them from the build's Geyser block map
  (the same map blocks.json uses; byte for byte legacy2's output). Where the build's Geyser pin predates its
  palette (some of their Bedrock states are not the palette's), the ones minecraft-data has if all of theirs
  are (1.18.11, 1.18.30), else legacy2's without those entries (1.19.70, 1.20.10 to 1.20.40, 1.26.0).
  minecraft-data's own are not kept otherwise: valid names can still be wrong (its 1.21.70 doors were turned
  90 degrees, its 1.20.0 skulls keyed by Java 1.19 states);
- `bedrock/<version>/language.json`: the `en_US.lang` of the server's vanilla resource pack as key/value
  pairs, parsed as legacy2 (and minecraft-data's earlier extractor) parse it.

### Validation

Nothing `pnpm mcdata` makes is written until every version's files, as they would be, pass the validation
([src/validate](src/validate)); a run with a problem writes nothing and lists it. `pnpm validate` runs it
on the checkout as it is, `pnpm test` too (and more, below). For each file of each version:

- its strict JSON schema, [schemas/](schemas) (`<file>.schema.json`, the shared pieces in
  `common.schema.json`): every field typed and ranged, no field the file does not have, every name and
  enum value of a known form (a material is `default` or known parts joined by `;`, an entity `type`, a
  biome `category`, an enchant category, a state value is 0 / 1 for a byte);
- its own validator, [src/validate/files](src/validate/files) (`<file>.ts`), against what the build's
  server says ([data/](data), committed: `block_palette.nbt`, `block-state-shapes.nbt`, `block_types.json`,
  `item_types.json`, `effects.json`, `enchantments.json`, `biome_ids.json`, the packets) and the version's
  other files: `blockStates` is the palette state for state, each block one run, each property's values
  the full product; `blocks` are exactly the palette's, each field the server says is the server's (state
  range, default state, hardness, resistance, light, collision, the language file's name), every drop and
  harvest tool an item, every harvest tool a tool of a kind its material has, the tools and tier the ones
  the server's tags (before 1.21.50 the reference build's) name; `blockCollisionShapes` is each state's
  boxes as the server has them; `items` are exactly the server's item registry (from 1.21.100 id, nbt,
  version the registry's), stack size and durability the server's; `materials` has exactly the materials
  blocks name, each speed the game's for its item; `biomes`, `entities`, `effects`, `enchantments`,
  `attributes` are exactly what the server sends, with its values; `entityLoot` names the version's
  entities and items; `language` names what the server describes; `steve` is a whole, anonymized skin;
- the registry, [registry/](registry): each block's states (every property, its type, every value it
  takes), each block's, item's, entity's, biome's, effect's and enchantment's id, each attribute and
  material, as ranges of versions. It is what the published files said when their changes were last
  accepted: a run that loses a block, a state value or an item, or moves an id, fails; `pnpm mcdata
  --accept` takes such differences as intended, writes the files and the registry again, and the change to
  review is the registry's git diff.

`pnpm test` ([test/](test), `node --test`):
- `data.test.ts`: every version validates, every published file is used, none is its version before's;
- `registry.test.ts`: the registry is what the published files say, for exactly `versions.json`, and it
  holds together (each version's blocks and block states the same blocks, no id twice);
- `mutations.test.ts`: for four versions across the range, each of some 75 breaks (a state value no block
  has, a hardness not the server's, obsidian harvested by an iron pickaxe, an item gone, a speed not the
  tier's, a box not the server's, a biome id moved, ...) made in a copy of the files must be caught, in the
  file it is in;
- `facts.test.ts`: what the game is known to do, in every version (stone takes 300 ms with a diamond
  pickaxe, obsidian 6600 ms and only diamond and netherite pickaxes harvest it, a diamond pickaxe lasts
  1561 uses, pearls stack to 16, a zombie drops rotten flesh, Bedrock's fixed effect, enchantment, biome and
  entity ids).

### Where each field comes from

The rule is: the server's own data wherever it has it (the agent's exports, the packets it sends, its
behavior packs, its language file), the Java data only for what the server does not hold as data (or holds
only in code), and a stated rule where a version's server says less than a later one's.

**blocks.json**, every entry, whichever way it was made (below):
- `hardness`, `resistance`: the default state's destroy speed and explosion resistance (Bedrock's own:
  obsidian 35, not Java's 50; the blocks the game defines by components hold their explosion resistance a
  fifth of the legacy blocks' scale, as the server has it);
- `diggable`: a hardness of 0 or more, but not a liquid;
- `emitLight`, `filterLight`: the default state's light emission and dampening; `transparent`: a dampening
  below 15;
- `boundingBox`: `empty` where the default state has no collision box, else `block`;
- `displayName`: the language file's name for the block's description id, where it has one;
- `stackSize`: the stack size of the item of the block's name, where there is one;
- `material`, `harvestTools`: below (the server's tags);
- `drops`: the Java block's drops as the Bedrock items Geyser maps them to by name (the server's block
  drops are code, not loot tables), else the block's own item;
- `id`: the Java block's (legacy2's numbering).

**items.json**: `stackSize`, `maxDurability` (there where the item has durability, and only there) and
`displayName` (the language file's name for the item's description id, else the block's for a block item;
not for an item with variations, whose metadata 0 the game names by its own key) from `item_types.json`;
`metadata`, `variations`, `enchantCategories`, `repairWith` from the Java items Geyser maps to it: one
Java item per Bedrock data value, the one of the Bedrock item's name, else the oldest (Geyser also maps
Java-only items onto a Bedrock stand-in: furnace_minecart onto hopper_minecart).

**entities.json**: `width`, `height` (and `length`) from the definition's `minecraft:collision_box` in the
server's behavior packs (an adult group's, else the base one); `displayName` the language file's; `type` and
`category` from the Java entity, else the definition's spawn category and families. An entity defined in
code (item, painting, falling_block) keeps its table values.

**biomes.json**: `temperature`, `rainfall`, and from 1.21.60 `depth` and the rain flag, from the packet;
`dimension` from its tags; the id from PyMCTranslate, checked by `pnpm mcdata` against the server's own
(`biome_ids.json`) wherever the agent found the registry (1.16.201 - 1.19.21, 1.21.90 on; 1.19.30 - 1.21.80
keep it where the search does not reach, and bedrock-data-extractor's ids for those, read through fixed
addresses, are PyMCTranslate's too); `category`, `color`, `precipitation` before 1.21.60 from the Java biome;
a display name several biomes would share through their Java biome goes to the one of that name, the others
are named after themselves.

**enchantments.json**: from the server the id, name, displayName, maxLevel, minCost / maxCost (the line
through the level costs, checked on every level), weight (its rarity: Bedrock's frequencies 30 / 10 / 3 / 1
in the schema's Java scale, 10 / 5 / 2 / 1), tradeable, and exclude (its compatibility group); from the Java
enchantment of the same name what the game decides in code: category, treasureOnly, curse, discoverable,
and its extra exclusions (channeling / riptide, multishot / piercing).

**entityLoot.json**: each entity's loot table as bedrock-data-extractor's `extract_loot.py` flattens one
(chances multiplied through pools and weights, stack sizes from `set_count` and looting, `playerKill` where a
`killed_by_player` condition gates a drop), old item names resolved through `item_aliases.json`, and drops
that need a situation minecraft-data cannot state (a given killer, a variant, a baby) left out.

**Not generated** (minecraft-data's are left as they are): `instruments`, `windows` (the server holds no
table of them to read: the instrument names exist only inside its sound events), `blockLoot` (block drops are
code), `recipes` and the block maps (made, but off: see above), and the protocol files.

`blocks.json` is the one minecraft-data already has for the version while it fits the palette (exactly its
blocks, each with its own state range), its fields then set as above. Otherwise it is made the way minecraft-data-extractor-legacy2 makes
it (`src/mcdata/blocksJson.ts`, `blockMap.ts`): Geyser's Java to Bedrock block map of the build (pinned
by `mg` / `mappings` in `versions.json`: GeyserMC/mappings `blocks.json`, mappings-generator
`generator_blocks.json` or mappings `blocks.nbt`), flipped, gives each block its Java block, whose
properties and id it takes from the Java `blocks.json` of `javaVersion` (from the mc-zuri/node-minecraft-data
fork, branch `bedrock-v2`, which has the Java versions upstream lacks); the blocks are sorted by that id.
Downloads are cached in `work/mappings/` and `work/java/`.

`material`, `harvestTools` and `materials.json` (`src/mcdata/dig.ts`) are by the version's `items.json` ids
(the Java ones minecraft-data had are no Bedrock items). They follow the game (`DiggerItem::getDestroySpeed`
/ `canDestroySpecial`): a digger (pickaxe, axe, shovel, hoe) mines at its tier's speed (wood 2, stone 4,
copper 5, iron 6, diamond 8, netherite 9, gold 12) a block with its `is_<tool>_item_destructible` tag, and
harvests it if its tier passes the block's first `<tier>_tier_destructible` tag. The server's tags give the
tools and the tier from 1.21.50, its `requiresCorrectToolForDrops` whether a block needs one from 1.21.50.
Before that a block digs as the same block does in the first build with those tags (by its name, or all the
blocks it became alike: `planks` as `oak_planks`, `spruce_planks`, ..., and Bedrock's flattened names by the
table in `dig.ts`, `stonebrick` as the stone bricks, `red_flower` as the flowers, `log2` as the acacia and
dark oak logs, `concretePowder` as the concrete powders; blocks that agree on their tools only,
as saplings do, give the tools, the rest of the material the Java block's): a block's tools have not
changed since 1.16, where the Java data of the time does not say so (Java 1.16.2's leaves are a `plant`) or
the build's Geyser map has no Java block for it (1.19.50 - 1.19.70 planks, logs, wool). Only a block that
build does not have (only the removed `mysterious_frame` blocks of 1.17.40 - 1.18.11) digs as its Java block does (its `material`'s `mineable/*` parts, the lowest tier of its
`harvestTools`, whether it has any). A material is named as Java names them (`leaves;mineable/hoe`, `default` for none); its
parts no digger makes (leaves, cobweb, wool, plants) take the speeds of swords (the game's) and shears as
`dig.ts` lists them, not a Java `materials.json` (some Java versions have shears at 1 there).

`biomes.json` is likewise the one minecraft-data has while it fits (exactly the biomes the server sends,
each with its id, temperature and rainfall), else made as legacy2 makes it, its fields then set as above (`src/mcdata/biomes.ts`):
PyMCTranslate's biome tables (pinned in `src/mcdata/inputs.ts`, cached in `work/pymctranslate/`) give each
Bedrock biome its numeric id and its Java biome, whose properties come from the Java `biomes.json` of
`javaVersion`. Unlike legacy2, the Java names are from the PyMCTranslate snapshot of `javaVersion` (legacy2
took the newest, whose renamed biomes the Java 1.16 and 1.17 data lacks, so 20 biomes got the defaults), and
a Java biome with `has_precipitation` gets no default `precipitation` (legacy2 wrote `"rain"` beside
`has_precipitation: false`).

`entities.json` too is the one minecraft-data has while it fits (exactly the entities the server sends,
each with its runtime id and a hitbox), else made as legacy2 makes it (`src/mcdata/entities.ts`): the
entity identifiers from `packets.nbt`, hitboxes and Java names from legacy2's hand-kept table, the rest
from the Java `entities.json` of `javaVersion`.

`items.json` too is the one minecraft-data has while it fits (exactly the registry's items, from 1.21.100
each with its runtime id, one entry per data value, no unresolved `tagkey[...]` enchantment category), else
made as legacy2 makes it (`src/mcdata/items.ts`), its fields then set as above, with two more fixes: a Geyser
mapping without `bedrock_data` is data 0 (legacy2 wrote `"metadata": null`), and a variation has only the
properties the schema allows it. Like legacy2, it gives no item a `blockStateId`.

A version's own file that no version points to any more (its version now shares an earlier one) is
deleted.

A file that means the same as the one of the build before is not kept: that version's `dataPaths.json`
entry points to the version that has it (and an existing copy is deleted). So every file is unique, and
every version resolves every key. Running it again changes nothing. Commit the result in the
minecraft-data checkout.

Where the forms are equally valid, a regenerated file keeps the form of the version's file in the checkout's
`HEAD`, so it only differs where the data does: blocks it writes as a single id (`"web": 0`, older files),
arrays it splits one state per line (1.17.0), its shape ids (unused shapes included), and the key order of a
`blockStates.json` that says the same. Shape ids are only kept from a table of the same kind of boxes: the
collision files up to 1.21.120 hold Geyser's centre + size boxes, not min/max, and are replaced. A version
without a file gets arrays and ids numbered as met.
