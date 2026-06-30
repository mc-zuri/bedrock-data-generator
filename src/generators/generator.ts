import fs from "node:fs";
import path from "node:path";
import { dataPath, mcDataDir, outputPath } from "../utils.ts";

// minecraft-data shares java resource files across versions via dataPaths.json (e.g. pc/1.20.3's
// biomes physically live in pc/1.20.2). java-data.ts downloads into that same layout, so generators
// resolve a (version, resource) the same way minecraft-data does. Cached: read once per worker.
let JAVA_DATA_PATHS: Record<string, Record<string, string>> | null = null;
function javaDataPaths(): Record<string, Record<string, string>> {
  if (!JAVA_DATA_PATHS) {
    JAVA_DATA_PATHS = JSON.parse(fs.readFileSync(dataPath("java", "dataPaths.json"), "utf8")).pc;
  }
  return JAVA_DATA_PATHS!;
}

export type GeneratorContext = {
  bedrockVersion: string;
  javaVersion: string;
  javaItemsVersion: string;
};

export abstract class Generator {
  protected readonly bedrockVersion: string;
  protected readonly javaVersion: string;
  protected readonly javaItemsVersion: string;

  constructor(ctx: GeneratorContext) {
    this.bedrockVersion = ctx.bedrockVersion;
    this.javaVersion = ctx.javaVersion;
    this.javaItemsVersion = ctx.javaItemsVersion;
  }

  protected abstract readonly label: string;
  protected abstract generate(): Promise<unknown>;

  async run(): Promise<void> {
    fs.mkdirSync(outputPath(this.bedrockVersion), { recursive: true });
    fs.mkdirSync(mcDataDir("bedrock", this.bedrockVersion), { recursive: true });
    const result = await this.generate();
    if (result === "skip") return;
    console.log("    ✔ ok ->", this.bedrockVersion, this.label);
  }

  protected readJson(file: string): any {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  protected bedrockData(...parts: string[]): string {
    return dataPath("bedrock", this.bedrockVersion, ...parts);
  }

  protected javaResource(version: string, resource: string): string {
    const dir = javaDataPaths()[version]?.[resource];
    if (!dir) {
      throw new Error(`dataPaths.json has no pc/${version}/${resource}`);
    }
    return dataPath("java", dir.replace(/^pc\//, ""), `${resource}.json`);
  }

  protected outputFile(...parts: string[]): string {
    return outputPath(this.bedrockVersion, ...parts);
  }

  protected mcDataFile(...parts: string[]): string {
    return mcDataDir("bedrock", this.bedrockVersion, ...parts);
  }

  protected write(absPath: string, content: string | Buffer): void {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content);
  }

  protected publish(file: string, content: string | Buffer): void {
    this.write(this.outputFile(file), content);
    this.write(this.mcDataFile(file), content);
  }

  protected writeJson(absPath: string, value: unknown): void {
    this.write(absPath, JSON.stringify(value, null, 2));
  }

  protected publishJson(file: string, value: unknown): void {
    this.publish(file, JSON.stringify(value, null, 2));
  }
}
