# biomes.json

**Shape:** array of biome objects, sorted by `id`.
**Generator:** `src/generators/biomes.ts` (`BiomesGenerator`); id maps from `src/generators/biomeMap.ts`.
**Sources:** Bedrock `biome_definition_list.json` (**Bedrock packet capture**) for the biome set +
temperature/downfall; Bedrock biome ids and Bedrock→Java mapping from **PyMCTranslate**; remaining
fields from **Java minecraft-data** `biomes.json` (pinned `javaVersion`).

Every Bedrock biome from the definition list is given its Bedrock numeric id, enriched with the
matched Java biome's fields, then has temperature/rainfall overwritten from the Bedrock definition.

## Properties

| Property        | Type   | Description                                                                       | Source                                                      |
| --------------- | ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `id`            | number | Bedrock numeric biome id.                                                         | PyMCTranslate `bedrock` `int_map` (via `biome/Biomes.json`) |
| `name`          | string | Bedrock biome name (`minecraft:` stripped).                                       | `biome_definition_list.json`                                |
| `displayName`   | string | Human name (defaults to `name`; Java overrides when mapped).                      | Java `biomes.json` `displayName`, else `name`               |
| `category`      | string | Biome category (e.g. `ocean`). Defaults `""`.                                     | Java `biomes.json` `category`                               |
| `precipitation` | string | Precipitation type. Defaults `rain`.                                              | Java `biomes.json` `precipitation`                          |
| `temperature`   | number | Biome temperature. **Always overwritten** from the Bedrock definition.            | `biome_definition_list.json` `temperature`                  |
| `rainfall`      | number | Humidity/downfall. **Always overwritten** from the Bedrock definition `downfall`. | `biome_definition_list.json` `downfall`                     |
| `depth`         | number | Terrain depth. Defaults `0`.                                                      | Java `biomes.json` `depth`                                  |
| `dimension`     | string | `overworld` / `nether` / `end`. Defaults `overworld`.                             | Java `biomes.json` `dimension`                              |
| `color`         | number | Biome color int. Defaults `0`.                                                    | Java `biomes.json` `color`                                  |

## biomeMap (intermediate, not in minecraft-data output)

`biomeMap.ts` produces `biome/Biomes.json` (bedrock name → id), `Java2Bedrock.json`, and
`Bedrock2Java.json` using PyMCTranslate's universal biome tables (`java_26_2` + `bedrock_26_30`
snapshots), filtered to the biomes actually present in this version's `biome_definition_list.json`.

## Notes

- Throws if a biome in the definition list has no Bedrock id in the PyMCTranslate map.
- Biomes with no Java mapping keep the default fields (logged as a warning at generation time).

## Version breakpoints

- **Output shape is identical** across versions; the set grows over time
  (`1.16.201`: 75 biomes → `1.21.130`: 87 → `1.26.30`: 88).
- **Source format of `biome_definition_list.json` changes** (handled transparently): older versions
  carry an NBT blob (`.nbt`, simplified via prismarine-nbt); 1.21.0+ use a structured
  `biome_definitions` + `string_list` array (names de-referenced by `name_index`, `minecraft:`
  stripped). Both yield the same output.
