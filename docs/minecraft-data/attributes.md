# attributes.json

**Shape:** array of attribute objects.
**Generator:** `src/generators/attributes.ts` (`AttributesGenerator`).
**Source:** Bedrock `player_attributes.json` (**Bedrock packet capture**, from the `update_attributes`
packet).

Lists each attribute the server reports for the player, with its default and clamp range. Duplicates
(by resource name) are dropped, first-seen wins; array order follows packet order.

## Properties

| Property   | Type   | Description                                                                                                                               | Source                                          |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `name`     | string | camelCase attribute name derived from `resource` (e.g. `player.hunger` → `playerHunger`, `knockback_resistance` → `knockbackResistance`). | derived from `resource`                         |
| `resource` | string | Bedrock attribute identifier (`minecraft:` stripped, e.g. `health`, `player.hunger`).                                                     | `player_attributes.json` `attributes[].name`    |
| `default`  | number | Default value.                                                                                                                            | `player_attributes.json` `attributes[].default` |
| `min`      | number | Minimum / clamp floor.                                                                                                                    | `player_attributes.json` `attributes[].min`     |
| `max`      | number | Maximum / clamp ceiling.                                                                                                                  | `player_attributes.json` `attributes[].max`     |

## Version breakpoints

- **No structural change.** The attribute **set and order are packet-driven**, so they vary by version:
  - `1.16.201` – `1.21.0`: 14 attributes, order `luck, health, absorption, knockback_resistance,
movement, underwater_movement, lava_movement, follow_range, attack_damage, player.hunger,
player.exhaustion, player.saturation, player.level, player.experience`.
  - `1.21.130`: still 14, but **reordered** (player.* first) — reflects the packet's new ordering.
  - `1.26.x`: **17 attributes** — adds `friction_modifier`, `bounciness`, `air_drag_modifier`.
- Because order/contents come straight from the live packet, treat ordering as version-specific.
