import { exportNetworkData, setupBedrockServers } from "./src/server/external-server.ts";
import { downloadExternalData } from "./src/fetchMappings.ts";
import { generateData } from "./src/generateData.ts";

await main();

async function main() {
  await setupBedrockServers();
  await exportNetworkData({ concurency: 4 });
  await downloadExternalData();
  await generateData({ concurency: 16 });
}
