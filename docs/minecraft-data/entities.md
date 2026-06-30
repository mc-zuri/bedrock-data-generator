# entities.json

**Shape (in `minecraft-data/`):** array of entity objects, sorted by `id`.
**Generator:** `src/generators/entities.ts` (`EntitiesGenerator`).
**Sources:** Bedrock `available_entity_identifiers.json` (**Bedrock packet capture**) for the entity
list + numeric runtime ids; hitbox dims from a hand-curated `ENTITY_REGISTRY` in the generator; the
rest from **Java minecraft-data** `entities.json` (pinned `javaVersion`).

> Note: the top-level `output/<ver>/entities.json` is keyed by name (object); the
> `output/minecraft-data/<ver>/entities.json` documented here is the **array** form.

## Properties

| Property      | Type   | Description                                                                    | Source                                             |
| ------------- | ------ | ------------------------------------------------------------------------------ | -------------------------------------------------- |
| `id`          | number | Sequential index in idlist order (0,1,2,…).                                    | computed                                           |
| `internalId`  | number | Bedrock numeric runtime id for the entity.                                     | `available_entity_identifiers.json` `idlist[].rid` |
| `name`        | string | Bedrock entity identifier (`minecraft:` stripped, e.g. `villager_v2`).         | `available_entity_identifiers.json` `idlist[].id`  |
| `displayName` | string | Human name. From Java when matched, else title-cased from `name`.              | Java `entities.json` `displayName`, else derived   |
| `height`      | number | Hitbox height. **Registry value wins**, else Java. (Throws if neither has it.) | `ENTITY_REGISTRY` or Java `entities.json` `height` |
| `width`       | number | Hitbox width. Registry wins, else Java.                                        | `ENTITY_REGISTRY` or Java `entities.json` `width`  |
| `length`      | number | Hitbox length. **Bedrock-only**, from registry (may be `undefined`/null).      | `ENTITY_REGISTRY` `length`                         |
| `offset`      | number | Eye/render offset. **Bedrock-only**, from registry (may be `undefined`/null).  | `ENTITY_REGISTRY` `offset`                         |
| `type`        | string | Entity type (e.g. `mob`). Defaults `""`.                                       | Java `entities.json` `type`                        |
| `category`    | string | Category (e.g. `Passive mobs`).                                                | Java `entities.json` `category`                    |

## ENTITY_REGISTRY (curated)

`available_entity_identifiers.json` has **no** hitbox dims or Java mapping, so the generator keeps a
hand-maintained table providing:

- Bedrock hitbox `height`/`width` (and bedrock-only `length`/`offset`),
- Java-name remaps where the Bedrock id differs (e.g. `tropicalfish → tropical_fish`,
  `zombie_pigman → zombified_piglin`, `ender_crystal → end_crystal`, `evocation_illager → evoker`),
- full dims for bedrock-only entities (e.g. `agent`, `balloon`, `npc`).

Java match preference: direct match by Bedrock id, else the curated `java` remap. `build()` throws if
`height`/`width` cannot be resolved from either source.

## Version breakpoints

- **Output shape is identical** across versions; the set grows (`1.16.201`: 111 → `1.21.130`: 135 →
  `1.26.30`: 136 entities).
- New Bedrock entities require a matching `ENTITY_REGISTRY` entry or generation **fails** for that
  version (intentional, to force curation of hitboxes).
