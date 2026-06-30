# items.json

**Shape:** array of item objects, sorted by `id`.
**Generator:** `src/generators/items.ts` (`ItemsGenerator`); item maps from `src/generators/itemMap.ts`.
**Sources:** Bedrock `item_registry.json` (**Bedrock packet capture**) as the item list, enriched with
Java fields from **Java minecraft-data** `items.json` (pinned `javaItemsVersion`) via the Geyser item
map (`items_mappings.json`, **Geyser mappings**).

Each Bedrock registry item is matched to its Java counterpart through the Bedrock→Java item map; Java
fields are spread in, then bedrock-specific fields override.

## Properties

| Property            | Type     | Description                                                                                                                                                                         | Source                                                |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `id`                | number   | Item id. Java-derived id when mapped; bedrock-only items get 9000+. **1.21.100+:** replaced by the Bedrock `runtime_id` (negative for block-items).                                 | Java `items.json` `id` / 9000+ / bedrock `runtime_id` |
| `name`              | string   | Bedrock item identifier (`minecraft:` stripped).                                                                                                                                    | `item_registry.json` `itemstates[].name`              |
| `displayName`       | string   | Human name. From Java when mapped, else title-cased from `name`.                                                                                                                    | Java `items.json` `displayName`, else derived         |
| `stackSize`         | number   | Max stack size. Defaults `1`; Java overrides (e.g. 64).                                                                                                                             | Java `items.json` `stackSize`                         |
| `metadata`          | number   | Bedrock damage/metadata value of the primary variant (multi-variant items only).                                                                                                    | Geyser item map `bedrock_data`                        |
| `variations`        | array    | Other metadata variants collapsed under one bedrock id, each `{ metadata, id, displayName, name, stackSize, ... }`. Present only when the bedrock item maps to multiple Java items. | Geyser item map + Java `items.json`                   |
| `blockStateId`      | number   | Palette index of the placed block, for block-items (`runtime_id < 0`).                                                                                                              | resolved against `blockStates.json`                   |
| `enchantCategories` | string[] | Enchantment categories (deduped). Java-only.                                                                                                                                        | Java `items.json` `enchantCategories`                 |
| `repairWith`        | string[] | Items that repair this one. Java-only.                                                                                                                                              | Java `items.json` `repairWith`                        |
| `maxDurability`     | number   | Durability. Java-only.                                                                                                                                                              | Java `items.json` `maxDurability`                     |
| `enchantability`    | number   | Enchantability. Java-only.                                                                                                                                                          | Java `items.json`                                     |
| `nbt`               | object   | **1.21.100+ only.** Raw packet NBT for the item (`{ type, name, value }`).                                                                                                          | `item_registry.json` `itemstates[].nbt`               |
| `version`           | string   | **1.21.100+ only.** Bedrock item version tag (e.g. `none`).                                                                                                                         | `item_registry.json` `itemstates[].version`           |

> Any additional Java item field is spread through verbatim, so mapped items may carry extra Java-only
> keys (e.g. `maxDurability`, `repairWith`, `enchantability`).

## itemMap (intermediate, not in minecraft-data output)

`itemMap.ts` builds the Java↔Bedrock item maps consumed here. It handles Geyser quirks:

- **id keying:** Geyser `items.json` ≤1.17.0 keys bedrock by numeric `bedrock_id` (= registry
  `runtime_id`); newer ones by string `bedrock_identifier`.
- **renames/flattening:** `sealantern→sea_lantern`, `scute→turtle_scute`, `grass→grass_block`;
  stone variants → `stone`, plank variants → `planks` when the literal id isn't in the registry.

A startup check throws if the Geyser item mapping order doesn't line up index-by-index with the Java
item palette (air excluded from both sides).

## Version breakpoints

- **≤ 1.17.0:** itemMap reads Geyser numeric `bedrock_id`. First item id is Java-derived (e.g. `id=1`
  for stone).
- **1.20.80 onward (pre-runtime era):** air present as `id=0`; ids still Java-derived.
- **1.21.100+ (runtime-id era):** `id` becomes the Bedrock `runtime_id` (negative for block-items),
  and each item gains `nbt` + `version` fields, mirroring upstream minecraft-data for those versions.
  Example: `1.21.130` first item `id=-1090`, with `nbt` and `version: "none"`.
