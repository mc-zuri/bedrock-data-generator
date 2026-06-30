import { strip } from "../utils.ts";
import { Generator } from "./generator.ts";

function titleCase(str: string): string {
  return str.replace(/\b\S/g, (t) => t.toUpperCase());
}

function versionAtLeast(version: string, min: string): boolean {
  const parts = version.split(".").map(Number);
  const bound = min.split(".").map(Number);
  for (let i = 0; i < bound.length; i++) {
    const part = parts[i] ?? 0;
    if (part !== bound[i]) {
      return part > bound[i];
    }
  }
  return true;
}

export class ItemsGenerator extends Generator {
  protected readonly label = "items.json";

  protected async generate() {
    const version = this.bedrockVersion;
    const javaVersion = this.javaItemsVersion;
    const bedrockBlockStates = this.readJson(this.outputFile("blocks", "BlockStates.json"));
    const bedrock2Java = this.readJson(this.outputFile("items", "Bedrock2Java.json"));

    const javaItems: any[] = this.readJson(this.javaResource(javaVersion, "items"));
    const itemstates = this.readJson(this.bedrockData("item_registry.json")).itemstates;

    // verify: the mappings-generator items must line up index-by-index with the java item palette.
    // Geyser prepends `minecraft:air` (not a real java item) and some minecraft-data versions list air
    // as id 0 while others omit it, so drop air from both sides before the strict compare.
    const mappingsItems = Object.entries(this.readJson(this.bedrockData("items_mappings.json"))).filter(([k]) => k !== "minecraft:air");
    const javaNames = javaItems.filter((it) => it.name !== "air");
    for (let i = 0; i < mappingsItems.length; i++) {
      if (mappingsItems[i][0] !== `minecraft:${javaNames[i]?.name}`) {
        throw Error(`items mapping mismatch at ${i}: ${mappingsItems[i][0]} != minecraft:${javaNames[i]?.name} (bedrock ${version} vs java ${javaVersion})`);
      }
    }

    // Some items are bedrock exclusive and cannot be found in the Java Edition item palette, so we assign our own ID starting
    // at 9000 to not conflict
    let bedrockExIx = 9000;

    // 1.21.100+ minecraft-data keys items by the bedrock runtime_id (negative for block items) and carries
    // the packet nbt + version, instead of the java-derived id. Match that for those versions only.
    const useRuntimeId = versionAtLeast(version, "1.21.100");

    let ret: any[] = [];
    for (const item of itemstates) {
      let blockStateId;
      if (item.runtime_id < 0) {
        for (let i = 0; i < bedrockBlockStates.length; i++) {
          const entry = bedrockBlockStates[i];
          if (entry.name === item.name) blockStateId = i;
        }
      }

      const name = strip(item.name);
      const mapped = bedrock2Java[name];

      let entry: any;
      if (mapped?.length > 1) {
        const variations = [];
        for (const mappe of mapped) {
          const mcdItem = javaItems.find((e) => e.name === strip(mappe[1]));
          variations.push({ metadata: parseInt(mappe[0]), ...mcdItem });
        }
        variations.sort((a, b) => a.metadata - b.metadata);
        const e = variations.shift();

        entry = {
          // Undefined just to make sure the keys are sorted correctly
          id: undefined,
          displayName: undefined,
          name: undefined,
          stackSize: 1, // schema required
          ...e,
          name: strip(name),
          variations,
          blockStateId,
        };
      } else {
        const mcdItem = javaItems.find((e) => e.name === strip(mapped?.[0]?.[1]));
        entry = {
          id: bedrockExIx++,
          stackSize: 1,
          ...mcdItem,
          name: strip(name),
          blockStateId,
        };
      }

      if (useRuntimeId) {
        entry.id = item.runtime_id;
        entry.nbt = item.nbt;
        entry.version = item.version;
      }
      ret.push(entry);
    }

    ret = ret.sort((a, b) => (a.id ?? 9999) - (b.id ?? 9999));

    for (const r of ret) {
      r.displayName ??= titleCase(r.name.replace("item.", "").replace(/_/g, " "));
    }

    // remove duplicates
    for (const item of ret) {
      if (item.enchantCategories?.length) {
        const uniques: any[] = [];
        for (const enchCat of item.enchantCategories) {
          if (!uniques.includes(enchCat)) {
            uniques.push(enchCat);
          }
        }
        item.enchantCategories = uniques;
      }
    }

    this.publishJson("items.json", ret);
  }
}
