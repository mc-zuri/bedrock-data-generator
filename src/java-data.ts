// Downloads the Java Edition minecraft-data files the generators enrich Bedrock from, into data/java/.
// Source is the mc-zuri/node-minecraft-data fork (bedrock-v2 branch). That repo shares files across
// versions via dataPaths.json (e.g. pc/1.20.3's biomes physically live in pc/1.20.2), so we mirror its
// layout exactly: resolve every (version, resource) through dataPaths, then store the file under its
// canonical dir — data/java/<dir>/<resource>.json. dataPaths.json itself is saved to data/java/ so the
// generators resolve reads the same way (see Generator.javaResource).
//
// Per Bedrock version the generators read biomes/blocks/entities from javaVersion and items from
// javaItemsVersion. We download those four resources for the full set of java versions involved: each
// javaVersion/javaItemsVersion plus every version those reference in dataPaths (so shared source dirs
// like 1.16.1 and 1.20.2 are fully populated, not just the leaf the generators happen to read).

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { dataPath } from "./utils.ts";
import { download, tryDownload, githubRaw } from "./download.ts";
import { versions } from "./versions.ts";

const REPO = "mc-zuri/node-minecraft-data";
const REF = "bedrock-v2";
const BASE = "minecraft-data/data";
const JAVA_WORKERS = 8;
const RESOURCES = ["biomes", "blocks", "entities", "items"] as const;

const dataPathsFile = () => dataPath("java", "dataPaths.json");

let dataPathsCache: Record<string, Record<string, string>> | null = null;
async function getDataPaths(): Promise<Record<string, Record<string, string>>> {
  if (!dataPathsCache) {
    if (existsSync(dataPathsFile())) {
      dataPathsCache = JSON.parse(readFileSync(dataPathsFile(), "utf8")).pc;
    } else {
      const buf = await download(githubRaw(REPO, REF, `${BASE}/dataPaths.json`));
      await mkdir(dirname(dataPathsFile()), { recursive: true });
      await writeFile(dataPathsFile(), buf);
      dataPathsCache = JSON.parse(buf.toString("utf8")).pc;
    }
  }
  return dataPathsCache!;
}

// The java versions the generators directly pair Bedrock with.
function neededVersions(): Set<string> {
  const set = new Set<string>();
  for (const v of versions) {
    set.add(v.javaVersion);
    set.add(v.javaItemsVersion ?? v.javaVersion);
  }
  return set;
}

// Expands a version set with every other version it references in dataPaths (across all resources), so
// shared source dirs (e.g. 1.16.2 -> 1.16.1 for several resources, 1.20.3 -> 1.20.2 for biomes) get
// their own data downloaded too.
function expand(paths: Record<string, Record<string, string>>, base: Set<string>): Set<string> {
  const all = new Set(base);
  for (const version of base) {
    const entry = paths[version];
    if (!entry) continue;
    for (const dir of Object.values(entry)) {
      all.add(dir.replace(/^pc\//, ""));
    }
  }
  return all;
}

// Builds the dedup'd download plan: canonical dest -> { url, required }. `required` marks files a
// directly-paired version needs (fail-fast); expansion-only files are best-effort (skip on 404).
function plan(paths: Record<string, Record<string, string>>, core: Set<string>): Map<string, { url: string; required: boolean }> {
  const tasks = new Map<string, { url: string; required: boolean }>();
  for (const version of expand(paths, core)) {
    const required = core.has(version);
    for (const resource of RESOURCES) {
      const dir = paths[version]?.[resource];
      if (!dir) continue;
      const dest = dataPath("java", dir.replace(/^pc\//, ""), `${resource}.json`);
      const url = githubRaw(REPO, REF, `${BASE}/${dir}/${resource}.json`);
      const existing = tasks.get(dest);
      if (!existing) {
        tasks.set(dest, { url, required });
      } else if (required) {
        existing.required = true;
      }
    }
  }
  return tasks;
}

async function runPlan(tasks: Map<string, { url: string; required: boolean }>, concurrency: number): Promise<number> {
  const pending = [...tasks.entries()].filter(([dest]) => !existsSync(dest));
  let cursor = 0;
  let written = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const [dest, { url, required }] = pending[cursor++];
      const data = required ? await download(url) : await tryDownload(url);
      if (!data) continue; // expansion-only file that doesn't exist for this version
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, data);
      written++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) || 1 }, worker));
  return written;
}

// Downloads all java data for every version involved (paired + referenced), `concurrency` at a time.
export async function downloadJavaData({ concurrency = JAVA_WORKERS } = {}): Promise<void> {
  const paths = await getDataPaths();
  const written = await runPlan(plan(paths, neededVersions()), concurrency);
  console.log(written ? `java data ready: downloaded ${written} files` : "java data ready: all files present");
}

// Downloads the java data one Bedrock version needs (paired + referenced), if missing. Returns true if
// anything downloaded.
export async function ensureJavaData(mcDataVersion: string): Promise<boolean> {
  const v = versions.find((x) => x.mcDataVersion === mcDataVersion);
  if (!v) return false;
  const paths = await getDataPaths();
  const core = new Set([v.javaVersion, v.javaItemsVersion ?? v.javaVersion]);
  return (await runPlan(plan(paths, core), JAVA_WORKERS)) > 0;
}
