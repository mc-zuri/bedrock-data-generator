import nbt from "prismarine-nbt";
import { strip } from "../utils.ts";
import { Generator } from "./generator.ts";

export class BiomesGenerator extends Generator {
  protected readonly label = "biomes.json";

  protected async generate() {
    const biomeDef = this.readJson(this.bedrockData("biome_definition_list.json"));
    let biomes: Record<string, any>;
    if (biomeDef.nbt) {
      biomes = nbt.simplify(biomeDef.nbt);
    } else {
      biomes = {};
      for (const def of biomeDef.biome_definitions) {
        biomes[strip(biomeDef.string_list[def.name_index])] = def;
      }
    }

    const bedrockBiomeIds = this.readJson(this.outputFile("biome", "Biomes.json"));
    const bedrock2Java = this.readJson(this.outputFile("biome", "Bedrock2Java.json"));

    const javaBiomeMapped: Record<string, any> = {};
    for (const biome of this.readJson(this.javaResource(this.javaVersion, "biomes")) as any[]) {
      javaBiomeMapped[biome.name] = biome;
    }

    let ret: any[] = [];
    const bedrockOnly: string[] = [];
    for (const biomeName in biomes) {
      const biome = biomes[biomeName];
      if (bedrockBiomeIds["minecraft:" + biomeName] == null) {
        throw new Error(`biomes: ${this.bedrockVersion} has no bedrock biome id for ${biomeName}`);
      }

      const javaBiomeName = bedrock2Java["minecraft:" + biomeName];
      const javaBiome = javaBiomeName ? javaBiomeMapped[strip(javaBiomeName)] : undefined;
      if (!javaBiome) {
        bedrockOnly.push(biomeName);
      }

      const entry: any = {
        id: undefined,
        name: undefined,
        category: "",
        precipitation: "rain",
        depth: 0,
        dimension: "overworld",
        displayName: biomeName,
        color: 0,
        rainfall: 0,
        ...javaBiome,
      };
      entry.id = bedrockBiomeIds["minecraft:" + biomeName];
      entry.name = biomeName;
      entry.temperature = biome.temperature;
      entry.rainfall = biome.downfall;
      ret.push(entry);
    }

    if (bedrockOnly.length) {
      console.warn(`    ⚠ ${this.bedrockVersion} biomes without java mapping (defaulted): ${bedrockOnly.join(", ")}`);
    }

    ret = ret.sort((a, b) => a.id - b.id);

    this.publishJson("biomes.json", ret);
  }
}
