// Downloads the Geyser mapping files (the external-repo build inputs) for every pinned Bedrock
// version into data/bedrock/<version>/. Pins live in versions.ts (mg / mappings); the per-version
// download lives in GeyserMappings. Run via `node main.ts`, or standalone with `node src/fetchMappings.ts`.

import { fileURLToPath } from "node:url";
import { versions } from "./versions.ts";
import { GeyserMappings } from "./geyser-mappings.ts";
import { BedrockData } from "./bedrock-data.ts";
import { downloadJavaData, ensureJavaData } from "./java-data.ts";
import { downloadPyMCTranslate } from "./pymctranslate.ts";

const pinned = versions.filter((v) => v.mappings).map((v) => new GeyserMappings(v));
// Every version has a serverVersion, so every version gets a bedrock-data download (palette + shapes).
const bedrockData = versions.map((v) => new BedrockData(v));
const EXTERNAL_WORKERS = 8;

// Downloads one version's external inputs (Geyser mappings + bedrock-data capture) if missing.
// Returns true if anything downloaded.
export async function ensureMappings(mcDataVersion: string): Promise<boolean> {
  let downloaded = false;
  const m = pinned.find((x) => x.version === mcDataVersion);
  if (m && !m.present) {
    await m.fetch();
    downloaded = true;
  }
  const b = bedrockData.find((x) => x.version === mcDataVersion);
  if (b && !b.present) {
    await b.fetch();
    downloaded = true;
  }
  if (await ensureJavaData(mcDataVersion)) {
    downloaded = true;
  }
  return downloaded;
}

// Downloads every version still missing an external input (Geyser mappings + bedrock-data palette /
// block-state-shapes), `concurrency` at a time. Fail-fast: any download error aborts (these are
// required build inputs). Pure HTTP, so the pool just warms a cold cache faster.
export async function downloadExternalData({ concurrency = EXTERNAL_WORKERS } = {}): Promise<void> {
  await downloadPyMCTranslate();
  await downloadJavaData({ concurrency });
  const pending: { fetch: () => Promise<void> }[] = [...pinned.filter((m) => !m.present), ...bedrockData.filter((b) => !b.present)];
  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) await pending[cursor++].fetch();
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) || 1 }, worker));
  console.log(`external data ready: ${pinned.length} mapping versions, ${bedrockData.length} bedrock-data versions present`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await downloadExternalData();
}
