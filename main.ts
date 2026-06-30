import { exportNetworkData, setupBedrockServers } from "./src/server/external-server.ts";
import { downloadExternalData } from "./src/fetchMappings.ts";
import { generateData } from "./src/generateData.ts";
import { deduplicate } from "./src/dataPaths.ts";

await main();

async function main() {
  await setupBedrockServers();
  await exportNetworkData({ concurency: 4 });
  await downloadExternalData();
  await generateData({ concurency: 16 });
  // Build dataPaths.json + remove cross-version duplicate files in one pass (each resource kept only
  // at the version that first introduced its content; later identical versions point back to it).
  deduplicate();
}
