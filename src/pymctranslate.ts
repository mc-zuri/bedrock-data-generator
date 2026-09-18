// PyMCTranslate's universal biome tables (the biomeMap build input). The latest snapshot is a strict
// superset of older ones (stable ids) and covers every biome we map, so one java+bedrock pair serves
// all versions. Downloaded into data/pymctranslate/<snapshot>/__biome_data__.json.

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rootDir } from "./utils.ts";
import { download, githubRaw } from "./download.ts";

const REPO = "Amulet-Team/PyMCTranslate";
const REF = "b05862d585cd06b6b49a693d6cfe8c2562a6ab26";
export const JAVA_SNAPSHOT = "java_26_3";
export const BEDROCK_SNAPSHOT = "bedrock_26_50";
const SNAPSHOTS = [JAVA_SNAPSHOT, BEDROCK_SNAPSHOT];

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
