# blocksB2J.json

**Shape:** object, Bedrock block-state string → Java block-state string.
**Generator:** `src/generators/blockMap.ts` (`BlockMapGenerator.buildB2J`).
**Source:** inverse of `blocksJ2B.json` (Geyser block mappings) plus hardcoded water/lava/air patches.

The reverse of [blocksJ2B.json](blocksJ2B.md): translate a Bedrock block state back to Java.

## Format

Same block-state string format on both sides: `minecraft:<name>[<prop>=<val>,...]`, stateless as
`[]`. Built by flipping J2B (booleans `true`/`false` normalized to `1`/`0` on the bedrock key) and
then overlaying `getPatches()`.

```
"minecraft:air[]"                    => "minecraft:air[]"
"minecraft:stone[stone_type=stone]"  => "minecraft:stone[]"
"minecraft:stone[stone_type=granite]"=> "minecraft:granite[]"
```

| Element | Description                                       | Source                        |
| ------- | ------------------------------------------------- | ----------------------------- |
| key     | Bedrock block-state string (booleans as `1`/`0`). | flipped from `blocksJ2B.json` |
| value   | Java block-state string.                          | flipped from `blocksJ2B.json` |

## Hardcoded patches (`getPatches()`)

Always overlaid, overriding any flipped value:

- `minecraft:flowing_water[liquid_depth=0]` → `minecraft:water[level=0]`
- `minecraft:flowing_lava[liquid_depth=0]` → `minecraft:lava[level=0]`
- `minecraft:air[]` → `minecraft:air[]`
- `minecraft:water[liquid_depth=1..15]` → `minecraft:water[level=1..15]`
- `minecraft:lava[liquid_depth=1..15]` → `minecraft:lava[level=1..15]`

## Version breakpoints

- Inherits the [blocksJ2B](blocksJ2B.md) v1/v2 breakpoint (≤1.20.80 vs 1.21.0+); output format is
  identical across versions.
- The water/lava/air patches are applied for every version.
