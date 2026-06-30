// Downloads the per-version Bedrock capture files (block palette + block-state collision shapes) from
// the mc-zuri/bedrock-data repo into data/bedrock/<mcDataVersion>/. The repo lays files out by the
// real server build (serverVersion), e.g. data/1.26.30.5/block-state-shapes.nbt, so we key the
// download on versionData.serverVersion but store under mcDataVersion to match the rest of the pipeline.
//   block_palette.nbt        -> blockMap (state names/ids, by runtime id)
//   block-state-shapes.nbt   -> collision (per-state collisionShape, preferred over Geyser)

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rootDir } from "./utils.ts";
import { download, githubRaw } from "./download.ts";
import { type versionData } from "./versions.ts";

const REPO = "mc-zuri/bedrock-data";
const REF = "main";
export const BEDROCK_DATA_FILES = ["block_palette.nbt", "block-state-shapes.nbt"] as const;

export class BedrockData {
  readonly version: string;
  private readonly serverVersion: string;
  private readonly dir: string;

  constructor(v: versionData) {
    this.version = v.mcDataVersion;
    this.serverVersion = v.serverVersion;
    this.dir = join(rootDir(), "data", "bedrock", v.mcDataVersion);
  }

  /** True when both capture files are already on disk. */
  get present(): boolean {
    return BEDROCK_DATA_FILES.every((f) => existsSync(join(this.dir, f)));
  }

  async fetch(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const file of BEDROCK_DATA_FILES) {
      const data = await download(githubRaw(REPO, REF, `data/${this.serverVersion}/${file}`));
      await writeFile(join(this.dir, file), data);
    }
    console.log(`✓ ${this.version} bedrock-data (palette + block-state-shapes)`);
  }
}
