import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { rootDir } from "./utils.ts";
import { download, tryDownload, githubRaw } from "./download.ts";
import { type versionData } from "./versions.ts";

const MAPPINGS = "GeyserMC/mappings";
const GENERATOR = "GeyserMC/mappings-generator";

// Downloads one Bedrock version's Geyser mapping files into data/bedrock/<version>/.
//   `mg` set  -> v2: generator_blocks.json (mappings-generator) + optional collisions.nbt
//   `mg` empty -> v1: blocks.json (mappings)               + optional collision.json
// items + the block file are required; the collision file is optional (may 404).
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
    const block = this.v.mg ? "generator_blocks_v2.json" : "generator_blocks_v1.json";
    return existsSync(join(this.dir, "items_mappings.json")) && existsSync(join(this.dir, block));
  }

  async fetch(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.write("items_mappings.json", await download(githubRaw(MAPPINGS, this.v.mappings!, "items.json")));

    if (this.v.mg) {
      await this.write("generator_blocks_v2.json", await download(githubRaw(GENERATOR, this.v.mg, "generator_blocks.json")));
      const written = await this.writeOptional("collisions.nbt", githubRaw(MAPPINGS, this.v.mappings!, "collisions.nbt"));
      console.log(`✓ ${this.version} (v2${written ? "" : ", no collisions.nbt"})`);
    } else {
      await this.write("generator_blocks_v1.json", await download(githubRaw(MAPPINGS, this.v.mappings!, "blocks.json")));
      const written = await this.writeOptional("collision.json", githubRaw(MAPPINGS, this.v.mappings!, "collision.json"));
      console.log(`✓ ${this.version} (v1${written ? "" : ", no collision.json"})`);
    }
  }

  private write(file: string, data: Buffer): Promise<void> {
    return writeFile(join(this.dir, file), data);
  }

  private async writeOptional(file: string, url: string): Promise<boolean> {
    const data = await tryDownload(url);
    if (data) await this.write(file, data);
    return data !== null;
  }
}
