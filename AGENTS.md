# AGENTS.md

Read [README.md](README.md) first, and bedrock-data's README: it is the format of everything this reads.

## Invariants

- **bedrock-data is read as its README says**, through `src/bedrockData.ts` only, and a `formatVersion` this does not
  know is refused. Nothing here imports code from bedrock-data or the extractor.
- **Fix the source, not the output.** A wrong minecraft-data value is fixed in the generator that makes it, or in the
  extractor where bedrock-data has it wrong; never by a hardcoded correction or a hand edit of minecraft-data. Where
  the result disagrees with minecraft-data's earlier files, say why (README: language.json) so the pull request can.
- **Regenerating changes only what bedrock-data says otherwise.** A second `pnpm generate` changes nothing; a file that
  says the same in another key order is left as it is written; `dataPaths.json` keeps its formatting and line endings.
- **minecraft-data owns its versions.** This never adds a version entry, a protocol or a version.json: it fills the
  keys of its generators in the entries there are.
- **Previews are never used.**

## Conventions

- Node 24 runs `src/*.ts` directly: erasable TypeScript only (no enums, no parameter properties), `.ts` in imports.
- Match the code around you: function declarations, comments that say what a thing is for, no comment noise.
- `pnpm verify && pnpm test` before a commit; after a generator change, also `pnpm generate` and minecraft-data's
  `tools/js` `npm test` in the checkout.
