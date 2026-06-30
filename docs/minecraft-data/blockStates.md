# blockStates.json

**Shape:** array of objects, in Bedrock **runtime-id order** (array index = block runtime/state id).
**Generator:** `src/generators/blockMap.ts` (`BlockMapGenerator.getBlockStatesGeyser` → `generate`).
**Primary source:** `block_palette.nbt` (**bedrock-data**), parsed as big-endian NBT.

This is the raw Bedrock block-state palette exactly as the server reports it. Every other block file
is derived from this ordering (the array index is the `blockStateId` referenced by
`blockCollisionShapes.json` and `items.json`).

## Properties

| Property              | Type          | Description                                                                                                                                                                                                    | Source                                                            |
| --------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `name`                | string        | Bedrock block identifier, **`minecraft:` prefix stripped is NOT applied here** — kept as captured minus the leading `minecraft:` (e.g. `acacia_button`).                                                       | `block_palette.nbt` → `blocks[].name` (with `minecraft:` removed) |
| `states`              | object        | Map of state property name → `{ type, value }`. `type` is the NBT tag (`byte`, `int`, `string`); `value` is the property value. Order/keys are block-specific (e.g. `button_pressed_bit`, `facing_direction`). | `block_palette.nbt` → `blocks[].states`                           |
| `states.<prop>.type`  | string        | NBT value type of the state property.                                                                                                                                                                          | bedrock-data                                                      |
| `states.<prop>.value` | number/string | State property value.                                                                                                                                                                                          | bedrock-data                                                      |
| `version`             | number        | Bedrock block data version int (e.g. `17825808`). Encodes the game version that owns the palette entry.                                                                                                        | `block_palette.nbt` → `blocks[].version`                          |

## Notes

- The array index **is** the runtime id; there is no explicit id field. `blockMap.ts` uses this index
  to build `BRID`/`BSS` maps and to wire collision shapes.
- Parsed as **big-endian** NBT (`nbt.parse(data)` auto-detect; little-endian fails for this file).

## Version breakpoints

- **No structural change** across versions. The array simply grows as Bedrock adds blocks/states:
  - `1.16.201`: 6611 states (`version` 17825808)
  - `1.21.0`: 14160 states (`version` 18153475)
  - `1.26.30`: 16913 states (`version` 18168865)
- `version` ints increase monotonically with the game build.
