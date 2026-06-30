import { strip } from "../utils.ts";
import { Generator, type GeneratorContext } from "./generator.ts";

// Geyser's items.json pin can lag the bundled item_registry: renamed ids (sealantern->sea_lantern,
// scute->turtle_scute, grass->grass_block) and flattened ids (granite/*_planks kept their metadata
// but the registry still groups them under stone/planks). When a mapping's bedrock_identifier is not
// in the registry, rewrite to a registry-verified candidate (keeping bedrock_data); skip if none fit.
const ITEM_RENAME: Record<string, string> = {
  "minecraft:sealantern": "minecraft:sea_lantern",
  "minecraft:scute": "minecraft:turtle_scute",
  "minecraft:grass": "minecraft:grass_block",
};
const STONE_TYPES = new Set(["granite", "polished_granite", "diorite", "polished_diorite", "andesite", "polished_andesite"]);
const PLANK_WOODS = new Set(["oak", "spruce", "birch", "jungle", "acacia", "dark_oak"]);

export class ItemMapGenerator extends Generator {
  protected readonly label = "items";

  private readonly j2b: Record<string, string> = {};
  private readonly b2j: Record<string, [string, string][]> = {};
  private readonly itemstates: Record<string, any> = {};
  private readonly byRuntimeId: Record<string, any> = {};

  constructor(ctx: GeneratorContext) {
    super(ctx);
    const packet = this.readJson(this.bedrockData("item_registry.json"));
    for (const state of packet.itemstates) {
      this.itemstates[state.name] = state;
      this.byRuntimeId[state.runtime_id] = state;
    }
  }

  private resolveItemState(bid: string) {
    if (!bid) return undefined;
    if (this.itemstates[bid]) return this.itemstates[bid];
    const candidates: string[] = [];
    if (ITEM_RENAME[bid]) candidates.push(ITEM_RENAME[bid]);
    const short = strip(bid);
    if (STONE_TYPES.has(short)) candidates.push("minecraft:stone");
    if (short.endsWith("_planks") && PLANK_WOODS.has(short.slice(0, -7))) candidates.push("minecraft:planks");
    for (const c of candidates) if (this.itemstates[c]) return this.itemstates[c];
    return undefined;
  }

  private buildJ2B() {
    const map = this.readJson(this.bedrockData("items_mappings.json"));
    for (const javaItemName in map) {
      const bedrockItem = map[javaItemName];
      // Older Geyser items.json (<=1.17.0) keys by numeric bedrock_id (= registry runtime_id);
      // newer ones key by string bedrock_identifier.
      const mapped = bedrockItem.bedrock_identifier != null ? this.resolveItemState(bedrockItem.bedrock_identifier) : this.byRuntimeId[bedrockItem.bedrock_id];
      if (!mapped) continue;
      this.j2b[strip(javaItemName)] = strip(mapped.name) + ":" + bedrockItem.bedrock_data;
    }
  }

  private buildB2J() {
    const b2j = this.b2j;
    for (const javaId in this.j2b) {
      const bedrockId = this.j2b[javaId];
      const [bedrockName, damage] = bedrockId.split(":");
      b2j[bedrockName] ??= [];
      b2j[bedrockName].push([damage, javaId]);
    }
  }

  protected async generate() {
    this.buildJ2B();
    this.buildB2J();
    this.writeJson(this.outputFile("items", "Java2Bedrock.json"), this.j2b);
    this.writeJson(this.outputFile("items", "Bedrock2Java.json"), this.b2j);
  }
}
