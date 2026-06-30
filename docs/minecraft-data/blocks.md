# blocks.json

**Shape:** array of block objects, sorted by `id`.
**Generator:** `src/generators/blocks.ts` (`BlocksGenerator`).
**Sources:** Bedrock palette (`blockStates.json`, from **bedrock-data**) + Java fields from
**Java minecraft-data** `blocks.json` (pinned `javaVersion`), joined via the Bedrock→Java block map
(`blocksB2J.json`).

Each Bedrock block name is grouped from the palette (collecting its state-id range), then enriched
with the matching Java block's fields when a B2J mapping exists. Bedrock-only blocks keep only the
defaulted fields below.

## Properties

| Property       | Type    | Description                                                                                                                            | Source                                         |
| -------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `id`           | number  | Block id. Kept equal to the Java block id when mapped; otherwise falls back to `minStateId`. Duplicate ids are re-assigned from 8000+. | Java `blocks.json` `id`, else `minStateId`     |
| `name`         | string  | Bedrock block identifier (`minecraft:` stripped).                                                                                      | `blockStates.json` `name`                      |
| `displayName`  | string  | Human name. From Java when mapped, else title-cased from `name`.                                                                       | Java `blocks.json` `displayName`, else derived |
| `minStateId`   | number  | First palette index (runtime id) for this block.                                                                                       | computed from `blockStates.json` order         |
| `maxStateId`   | number  | Last palette index for this block.                                                                                                     | computed from `blockStates.json` order         |
| `defaultState` | number  | Default state id; always set to `minStateId`.                                                                                          | computed                                       |
| `hardness`     | number  | Mining hardness. Defaults to `0` if not in Java.                                                                                       | Java `blocks.json` `hardness`                  |
| `resistance`   | number  | Blast resistance. Only present when supplied by Java.                                                                                  | Java `blocks.json` `resistance`                |
| `stackSize`    | number  | Max stack size. Defaults to `1`.                                                                                                       | Java `blocks.json` `stackSize`                 |
| `diggable`     | boolean | Whether the block can be mined. Defaults `false`.                                                                                      | Java `blocks.json` `diggable`                  |
| `material`     | string  | Tool/material class (e.g. `mineable/pickaxe`). Java-only; absent for bedrock-only blocks.                                              | Java `blocks.json` `material`                  |
| `harvestTools` | object  | Map of item id → `true` for tools that drop this block. Java-only.                                                                     | Java `blocks.json` `harvestTools`              |
| `transparent`  | boolean | Transparency flag. Defaults `false`.                                                                                                   | Java `blocks.json` `transparent`               |
| `emitLight`    | number  | Light emitted (0–15). Defaults `0`.                                                                                                    | Java `blocks.json` `emitLight`                 |
| `filterLight`  | number  | Light absorbed (0–15). Defaults `0`.                                                                                                   | Java `blocks.json` `filterLight`               |
| `boundingBox`  | string  | `block` or `empty`. Defaults `block`.                                                                                                  | Java `blocks.json` `boundingBox`               |
| `drops`        | array   | Item ids dropped. Defaults `[]`.                                                                                                       | Java `blocks.json` `drops`                     |

> Any other field present on the Java block (e.g. `transparent` variants) is spread through verbatim
> via `Object.assign(javaBlock, …)`, so mapped blocks may carry additional Java-only keys.

## Notes

- `entry.states` is asserted **sequential** (no gaps in the palette range) before being collapsed to
  `minStateId`/`maxStateId`.
- Block ids try to mirror Java numbering for cross-edition stability; collisions are reassigned 8000+.

## Version breakpoints

- **No structural change**; field availability depends on whether the Bedrock block maps to a Java
  block for the pinned `javaVersion`:
  - Mapped blocks (e.g. `stone`) carry `resistance`, `material`, `harvestTools`, `drops` from Java.
  - Bedrock-only / unmapped blocks carry only the defaulted fields.
- As Bedrock flattens blocks over time, more blocks map cleanly to Java and gain the richer fields.
