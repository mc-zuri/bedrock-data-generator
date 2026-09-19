import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rootDir } from "./utils.ts";
import { download, tryDownload, githubRaw } from "./download.ts";
import { type versionData } from "./versions.ts";

const MAPPINGS = "GeyserMC/mappings";
const GENERATOR = "GeyserMC/mappings-generator";

// Downloads one Bedrock version's Geyser mapping files into data/bedrock/<version>/.
//   `mg` empty -> v1: blocks.json (mappings)
//   `mg` set   -> v2: generator_blocks.json (mappings-generator)
//   `mg` set but that ref has no generator_blocks.json -> v3: blocks.nbt (mappings)
// mappings-generator deleted the generated generator_blocks.json in c271b1a (2026-06-29) and is now
// only the generator source, so every ref after that is v3: the block map ships as blocks.nbt in the
// mappings repo instead. items + the block file are required.
// Collision files are deliberately NOT downloaded: block-state-shapes.nbt (mc-zuri/bedrock-data) covers
// every version and CollisionGenerator prefers it, so Geyser's collisions.nbt / collision.json are dead.
export class GeyserMappings {
  readonly version: string;
  private readonly v: versionData;
  private readonly dir: string;

  constructor(v: versionData) {
    this.v = v;
    this.version = v.mcDataVersion;
    this.dir = join(rootDir(), "data", "bedrock", v.mcDataVersion);
  }

  /** True when the items + block files are already on disk. */
  get present(): boolean {
    if (!existsSync(join(this.dir, "items_mappings.json"))) return false;
    if (!this.v.mg) return existsSync(join(this.dir, "generator_blocks_v1.json"));
    return existsSync(join(this.dir, "generator_blocks_v2.json")) || existsSync(join(this.dir, "generator_blocks_v3.nbt"));
  }

  async fetch(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.write("items_mappings.json", await download(githubRaw(MAPPINGS, this.v.mappings!, "items.json")));

    if (!this.v.mg) {
      await this.write("generator_blocks_v1.json", await download(githubRaw(MAPPINGS, this.v.mappings!, "blocks.json")));
      console.log(`✓ ${this.version} (v1)`);
      return;
    }

    const v2 = await tryDownload(githubRaw(GENERATOR, this.v.mg, "generator_blocks.json"));
    if (v2) {
      await this.write("generator_blocks_v2.json", v2);
      console.log(`✓ ${this.version} (v2)`);
      return;
    }

    // mappings-generator ref carries no generated file — take the block map from the mappings pin.
    await this.write("generator_blocks_v3.nbt", await download(githubRaw(MAPPINGS, this.v.mappings!, "blocks.nbt")));
    console.log(`✓ ${this.version} (v3 blocks.nbt)`);
  }

  private write(file: string, data: Buffer): Promise<void> {
    return writeFile(join(this.dir, file), data);
  }
}
