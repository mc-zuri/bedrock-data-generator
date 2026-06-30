// Deduplicates the generated bedrock output and builds the minecraft-data package index in one pass.
// Walks the versions oldest -> newest and, per resource, keeps only the file from the version that
// first introduced its current content; any later version whose file is byte-identical is deleted and
// pointed (in dataPaths.json) back to that owner version. Because the generators write normalized,
// float-shortened, key-ordered JSON, identical content is byte-identical, so this dedups effectively.
//
// Runs after a full generate (main.ts / generateData); also standalone: `node src/dataPaths.ts`.
// Idempotent: a removed file's existing pointer is preserved on re-run.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versions } from "./versions.ts";
import { mcDataDir } from "./utils.ts";

type DataPaths = { pc: Record<string, unknown>; bedrock: Record<string, Record<string, string>> };

export function deduplicate(): void {
  // versions.ts is in chronological (oldest -> newest) order.
  const ordered = versions.filter((v) => v.mappings).map((v) => v.mcDataVersion);
  const present = ordered.filter((v) => fs.existsSync(mcDataDir("bedrock", v)));

  const file = mcDataDir("dataPaths.json");
  const dp: DataPaths = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { pc: {}, bedrock: {} };
  dp.pc ??= {};
  dp.bedrock ??= {};
  // keep any existing per-version entries (e.g. resources we don't generate) and our prior pointers.
  for (const v of present) dp.bedrock[v] = { ...(dp.bedrock[v] ?? {}) };

  // every resource filename that still appears in any version
  const resources = new Set<string>();
  for (const v of present) for (const f of fs.readdirSync(mcDataDir("bedrock", v))) if (f.endsWith(".json")) resources.add(f);

  let removed = 0;
  for (const resource of resources) {
    const key = path.basename(resource, ".json");
    let owner: string | null = null;
    let ownerContent: string | null = null;
    for (const v of present) {
      const f = mcDataDir("bedrock", v, resource);
      if (!fs.existsSync(f)) continue; // already deduped on a prior run — its pointer is preserved above
      const content = fs.readFileSync(f, "utf8");
      if (owner !== null && content === ownerContent) {
        fs.rmSync(f);
        dp.bedrock[v][key] = `bedrock/${owner}`; // point the duplicate at the version that introduced it
        removed++;
      } else {
        owner = v;
        ownerContent = content;
        dp.bedrock[v][key] = `bedrock/${v}`;
      }
    }
  }

  // drop version dirs left empty by dedup
  for (const v of present) {
    const dir = mcDataDir("bedrock", v);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(dp, null, 2));
  console.log(`deduplicate: ${present.length} versions, removed ${removed} duplicate files -> ${file}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  deduplicate();
}
