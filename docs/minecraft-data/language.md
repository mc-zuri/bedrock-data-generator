# language.json

**Shape:** flat object, localization key → string.
**Generator:** `src/generators/language.ts` (`LanguageGenerator`).
**Source:** the **vanilla resource pack** shipped inside the downloaded BDS:
`servers/<ver>/resource_packs/vanilla/texts/en_US.lang`.

The canonical en_US strings, parsed from the `.lang` file into the flat map minecraft-data publishes.

## Format

| Element | Description                                                                                  | Source                          |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| key     | Localization key (e.g. `accessibility.disableTTS`, `tile.stone.name`, `item.*`, `entity.*`). | `en_US.lang` left of first `=`  |
| value   | Localized en_US string. May contain `%s` / `%1$s` format placeholders.                       | `en_US.lang` right of first `=` |

## Parsing rules (match upstream minecraft-data byte-for-byte)

For each line: trim, strip `#` comments, trim again; skip blank lines; split on `=` taking only the
**first two** fields. This means:

- a value's leading space is preserved,
- anything after a second `=` in the value is dropped,
- lines without `=` are skipped.

Throws if the `.lang` file is missing (server not downloaded for that version).

## Version breakpoints

- **No structural change.** Just a growing/shifting key set as Minecraft adds/renames strings
  (`1.16.201`: ~8517 keys).
- Content is whatever ships in that BDS build's vanilla resource pack.
