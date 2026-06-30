# recipes.json

**Shape:** object keyed by recipe id (string number) → recipe object.
**Generator:** `src/generators/recipe.ts` (`RecipesGenerator`).
**Sources:** Bedrock `crafting_data.json` (**Bedrock packet capture**) for the recipes;
`item_registry.json` (**Bedrock packet capture**) to resolve item `network_id` → item name.

Each captured crafting/smelting recipe is normalized; item runtime ids are resolved to names.

## Top-level

| Key    | Description                                                                |
| ------ | -------------------------------------------------------------------------- |
| `<id>` | The recipe's numeric id (from `crafting_data.recipes`), as the object key. |

## Recipe object

| Property      | Type   | Description                                                                                                                                                                                                         | Source                                            |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `type`        | string | Crafting station / recipe type. The block name when present (e.g. `crafting_table`, `furnace`, `stonecutter`, `smoker`, `blast_furnace`, `campfire`, `cartography_table`, `shulker_box`), else the raw recipe type. | `crafting_data` `recipe.block` / `recipe.type`    |
| `name`        | string | Recipe id string (shaped/shapeless) or input item name (furnace).                                                                                                                                                   | `crafting_data` `recipe.recipe_id` / input        |
| `ingredients` | array  | Distinct input items: `{ name, metadata, count }`, or `{ tag, count }` for tag inputs, or `{ name, count }` for complex aliases.                                                                                    | `crafting_data` inputs + `item_registry`          |
| `input`       | array  | Grid layout: array of rows of indices into `ingredients` (1-based; `0` = empty slot). Shapeless/shaped/shulker_box only.                                                                                            | computed from `crafting_data` `recipe.input`      |
| `output`      | array  | Output items: `{ name, metadata, count, nbt? }`.                                                                                                                                                                    | `crafting_data` `recipe.output` + `item_registry` |
| `priority`    | number | Recipe priority. **`shulker_box` recipes only.**                                                                                                                                                                    | `crafting_data` `recipe.priority`                 |

### Ingredient / output item descriptor

| Field      | Description                                                                              |
| ---------- | ---------------------------------------------------------------------------------------- |
| `name`     | Item name (`minecraft:` stripped), resolved from `network_id` via `item_registry`.       |
| `metadata` | Item metadata / damage (`metadata` or `network_data`; furnace inputs use `32767` = any). |
| `count`    | Stack count (defaults `1`).                                                              |
| `nbt`      | Extra NBT, when the item carries it (`extra.nbt`).                                       |
| `tag`      | Item-tag name, for `item_tag` inputs (instead of `name`).                                |

## Handled recipe types

`shapeless`, `shaped`, `shaped_chemistry`, `shapeless_chemistry` → grid recipes with `input`;
`furnace`, `furnace_with_metadata` → smelting (single ingredient, no `input`); `shulker_box` → adds
`priority`. **Skipped** (logged, not emitted): `multi`, `smithing_trim`, `smithing_transform`. Any
other type throws.

## Version breakpoints

- **No structural change.** The set of `type` values present grows as Bedrock adds stations
  (e.g. `1.26.30` includes `deprecated`, `smoker`, `furnace`, `cartography_table`, `stonecutter`,
  `soul_campfire`, `crafting_table`, `shulker_box`, `campfire`, `blast_furnace`).
- `item_registry.json` source packet moved from `start_game` (≤1.21.50) to a dedicated
  `item_registry` packet (1.21.60+) — transparent to this file's output.
