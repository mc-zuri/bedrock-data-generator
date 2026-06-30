import nbt from "prismarine-nbt";
import { dataPath, strip } from "../utils.ts";
import { Generator } from "./generator.ts";

export class BiomeMapGenerator extends Generator {
  protected readonly label = "biome";

  protected async generate() {
    const javaData = this.readJson(dataPath("pymctranslate", "java_26_2.json"));
    const bedrockData = this.readJson(dataPath("pymctranslate", "bedrock_26_30.json"));
    const present = this.versionBiomes();

    const j2b: Record<string, any> = {};
    const b2j: Record<string, any> = {};
    const b: Record<string, any> = {};

    for (const biomeName in javaData.int_map) {
      const bedrockName = bedrockData.universal2version[javaData.version2universal[biomeName]];
      if (!present.has(bedrockName)) continue;
      j2b[biomeName] = bedrockName;
    }

    for (const biomeName in bedrockData.int_map) {
      if (!present.has(biomeName)) continue;
      b[biomeName] = bedrockData.int_map[biomeName];
      b2j[biomeName] = javaData.universal2version[bedrockData.version2universal[biomeName]];
    }

    this.writeJson(this.outputFile("biome", "Biomes.json"), b);
    this.writeJson(this.outputFile("biome", "Java2Bedrock.json"), j2b);
    this.writeJson(this.outputFile("biome", "Bedrock2Java.json"), b2j);
  }

  private versionBiomes(): Set<string> {
    const def = this.readJson(this.bedrockData("biome_definition_list.json"));
    const names = new Set<string>();
    if (def.nbt) {
      for (const name of Object.keys(nbt.simplify(def.nbt))) names.add("minecraft:" + name);
    } else {
      for (const d of def.biome_definitions) names.add("minecraft:" + strip(def.string_list[d.name_index]));
    }
    return names;
  }
}
