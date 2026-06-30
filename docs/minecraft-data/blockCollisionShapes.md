# blockCollisionShapes.json

**Shape:** object `{ blocks, shapes }`.
**Generator:** `src/generators/collision.ts` (`CollisionGenerator`).
**Primary source:** `block-state-shapes.nbt` (**bedrock-data**), little-endian NBT.

Maps each Bedrock block to one collision-shape index per block state. Shapes are deduplicated into a
shared `shapes` table.

## Properties

| Property        | Type       | Description                                                                                                          | Source                                             |
| --------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `blocks`        | object     | Map of block name (`minecraft:` stripped) → array of shape ids, one entry per state from `minStateId`..`maxStateId`. | computed                                           |
| `blocks.<name>` | number[]   | Shape index into `shapes` for each successive block state.                                                           | `block-state-shapes.nbt` `shapes[].collisionShape` |
| `shapes`        | object     | Map of shape id → array of axis-aligned boxes.                                                                       | deduped from collision shapes                      |
| `shapes.<id>`   | number[][] | List of `[minX,minY,minZ,maxX,maxY,maxZ]` boxes. `shapes["0"]` is always `[]` (empty / no collision, used by air).   | bedrock-data                                       |

Example: `blocks.stone = [1,1,1,1,1,1,1]` (7 states all using shape `1`), `shapes["1"] = [[0,0,0,1,1,1]]`
(a full cube), `shapes["0"] = []`.

## Three generation paths (selected by which source file is present)

`generate()` picks the source by file existence, in this priority:

1. **`generateFromShapes()` — `block-state-shapes.nbt` (bedrock-data).** Primary/authoritative. Each
   shape entry is keyed by `blockStateId` (palette order from `blockStates.json`); collision-only,
   shapes kept exact (no rounding). Air / empty shape collapses to index `0`.
2. **`generateV2()` — `collisions.nbt` (Geyser mappings, `mg`/v2 era).** Fallback. Resolves bedrock
   state ids through `Java2Bedrock` + `BSS`, indexes into Geyser `collisions`/`indices`. Skips bedrock
   states not in the palette.
3. **`generateV1()` — `collision.json` + `generator_blocks_v1.json` (oldest Geyser era).** Fallback.
   Walks Geyser block mappings, applies `applyV1BlockFixups` (color/cardinal/stone/plank remaps) to
   line up bedrock identifiers with the palette, fills state gaps.

All three emit the identical `{ blocks, shapes }` shape; only the source/precision differs.

## Version breakpoints

- **Output shape is identical across all versions.**
- The **source path** differs: `block-state-shapes.nbt` (bedrock-data) is present for the full range
  and is preferred, so most/all versions use path 1. The Geyser v2/v1 paths are fallbacks for any
  version missing the bedrock-data capture.
- Per project memory, the bedrock-data block-state-shapes capture became the primary collision source
  (path 1); earlier the Geyser v1/v2 paths were used. If regenerating, behavior depends on which
  source files exist in `data/bedrock/<ver>/`.
