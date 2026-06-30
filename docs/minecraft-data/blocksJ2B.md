# blocksJ2B.json

**Shape:** object, Java block-state string → Bedrock block-state string.
**Generator:** `src/generators/blockMap.ts` (`BlockMapGenerator.buildJ2B`).
**Source:** Geyser block mappings — `generator_blocks_v1.json` (**Geyser mappings**, pre-1.21) or
`generator_blocks_v2.json` (**Geyser mappings-generator**, 1.21.0+).

Translates a fully-qualified Java block state to the equivalent Bedrock block state.

## Format

Both keys and values are block-state strings of the form `minecraft:<name>[<prop>=<val>,...]`.
Stateless blocks use empty brackets `[]`. Properties are sorted alphabetically; boolean values are
normalized to `1`/`0` on the **bedrock** side.

```
"minecraft:air[]"     => "minecraft:air[]"
"minecraft:stone[]"   => "minecraft:stone[stone_type=stone]"   // pre-flatten bedrock
"minecraft:granite[]" => "minecraft:stone[stone_type=granite]"
```

| Element | Description                                                                                                                                             | Source                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| key     | Java block-state string. v1: the Geyser key (stateless normalized to `name[]`). v2: `java_state.Name` + sorted `java_state.Properties`.                 | Geyser block mappings |
| value   | Bedrock block-state string. v1: `bedrock_identifier` + `bedrock_states`. v2: `minecraft:` + `bedrock_state.bedrock_identifier` + `bedrock_state.state`. | Geyser block mappings |

First-seen mapping wins (`??=`); later duplicate Java keys are ignored.

## Version breakpoints

- **v1 era (`mg: ""`, ≤ 1.20.80):** built from `generator_blocks_v1.json` (Geyser `blocks.json`).
  Bedrock side may carry legacy aggregate states (e.g. `stone[stone_type=granite]`).
- **v2 era (`mg` set, 1.21.0+):** built from `generator_blocks_v2.json` (mappings-generator
  `generator_blocks.json`, `.mappings` array). Bedrock side reflects flattened identifiers
  (e.g. `granite` is its own block). Version-specific fixups applied via `applyGeneratorBlockFixups`
  (e.g. `1.21.42` skull/sponge/tnt/wood re-pointing).
- Output **format is identical** across both eras; only the underlying mappings differ.
