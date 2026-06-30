// PyMCTranslate's universal biome tables (the biomeMap build input). The latest snapshot is a strict
// superset of older ones (stable ids) and covers every biome we map, so one java+bedrock pair serves
// all versions. Downloaded into data/pymctranslate/<snapshot>/__biome_data__.json.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rootDir } from "./utils.ts";
import { download, githubRaw } from "./download.ts";

const REPO = "gentlegiantJGC/PyMCTranslate";
const REF = "dc68d5426dd613d39ecc197c05a72fff81b40f6b";
const SNAPSHOTS = ["java_26_2", "bedrock_26_30"];

function snapshotFile(snapshot: string): string {
  return join(rootDir(), "data", "pymctranslate", snapshot + ".json");
}

export function pymctranslatePresent(): boolean {
  return SNAPSHOTS.every((s) => existsSync(snapshotFile(s)));
}

// Downloads any missing biome snapshot. Required build input, so it throws on a failed download.
export async function downloadPyMCTranslate(): Promise<void> {
  await mkdir(join(rootDir(), "data", "pymctranslate"), { recursive: true });
  for (const snapshot of SNAPSHOTS) {
    if (existsSync(snapshotFile(snapshot))) continue;
    const data = await download(githubRaw(REPO, REF, `PyMCTranslate/json/versions/${snapshot}/__biome_data__.json`));
    await writeFile(snapshotFile(snapshot), data);
    console.log(`✓ pymctranslate ${snapshot}`);
  }
}
