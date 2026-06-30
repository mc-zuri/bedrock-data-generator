import fs from "fs";
import nbt from "prismarine-nbt";
import stringify from "json-stringify-pretty-compact";
import { Generator } from "./generator.ts";

export class BlockMapGenerator extends Generator {
  protected readonly label = "blocks";

  private j2b: Record<string, string> = {};
  private j2brid: Record<string, string> = {};
  private b2j: Record<string, string> = {};
  private brid2bs: { b: string; j: string }[] = [];
  private bs2brid: Record<string, number> = {};

  buildJ2B() {
    if (fs.existsSync(this.bedrockData("generator_blocks_v1.json"))) {
      // v1 (Geyser mappings repo blocks.json): a flat object keyed by the full java block-state
      // string, each value carrying bedrock_identifier + bedrock_states. Stateless java blocks are
      // keyed without brackets, so normalize them to "name[]" to match the v2/output convention.
      const j2b: Record<string, string> = {};
      const blocksJson = JSON.parse(fs.readFileSync(this.bedrockData("generator_blocks_v1.json"), "utf8"));

      for (const javaState in blocksJson) {
        const val = blocksJson[javaState];
        const javaKey = javaState.includes("[") ? javaState : javaState + "[]";
        const bedrockKey = val.bedrock_identifier + "[" + this._concatStatesJ2B(val.bedrock_states) + "]";
        j2b[javaKey] ??= bedrockKey;
      }
      this.j2b = j2b;
    } else {
      // 1.21.0+
      const j2b: Record<string, string> = {};
      const blocksJson = JSON.parse(fs.readFileSync(this.bedrockData("generator_blocks_v2.json"), "utf8"));
      applyGeneratorBlockFixups(this.bedrockVersion, blocksJson.mappings);

      for (const key in blocksJson.mappings) {
        const val = blocksJson.mappings[key];
        const bedrockKey = "minecraft:" + val.bedrock_state.bedrock_identifier + "[" + this._concatStatesJ2B(val.bedrock_state.state) + "]";
        const javaKey = val.java_state.Name + "[" + this._concatStatesJ2B(val.java_state.Properties, true) + "]";
        j2b[javaKey] ??= bedrockKey;
      }
      this.j2b = j2b;
    }
  }

  jss2bss(val) {
    val = val.replace(/=true/g, "=1");
    val = val.replace(/=false/g, "=0");
    return val;
  }

  buildJ2Bruntimeid() {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.j2b)) {
      // console.log(key, value);
      const val = this.jss2bss(value);
      const brid = this.bs2brid[val];
      if (brid == null) {
        //console.log('No BSID for', value, key, val)
      }
      out[key] = brid;
    }
    this.j2brid = out;
  }

  _concatStatesJ2B(states: any, skipReplace = false) {
    let str = "";
    if (!states) return str;

    for (const key of Object.keys(states).sort()) {
      let val = states[key];
      if (!skipReplace) {
        if (val == "true") val = 1;
        if (val == "false") val = 0;
      }
      str += key + "=" + val + ",";
    }
    return str.endsWith(",") ? str.slice(0, -1) : str;
  }

  buildB2J() {
    const map = {};
    for (const key in this.j2b) {
      const val = this.j2b[key].replace(/true/g, "1").replace(/false/g, "0");
      map[val] = key;
    }

    const ex = getPatches();
    for (const key in ex.bedrock2java) {
      const val = ex.bedrock2java[key];
      map[key] = val;
    }
    this.b2j = map;
  }

  buildBRID(states) {
    const data = states;
    for (let i = 0; i < data.length; i++) {
      const e = data[i];
      // console.log(e)
      let fname = "";
      const name = "minecraft:" + e.name;
      let states = "";
      for (const stateId in e.states) {
        let stateVal = e.states[stateId].value;
        if (typeof stateVal == "object") stateVal = stateVal[1];
        states += stateId + "=" + stateVal + ",";
      }
      states = states.endsWith(",") ? states.slice(0, -1) : states;
      fname = name + "[" + states + "]";
      this.brid2bs[i] = { b: fname, j: this.b2j[fname] };
      this.bs2brid[fname] = i;
    }
    // console.log(array)
    // this.brid2jsid
  }

  async getBlockStatesPMMP() {
    const data = fs.readFileSync(d`./BedrockData/canonical_block_states.nbt`);
    const results = [];
    data.startOffset = 0;

    while (data.startOffset !== data.byteLength) {
      const { parsed, metadata } = await nbt.parse(data);
      data.startOffset += metadata.size;

      results.push({
        name: parsed.value.name.value,
        states: parsed.value.states.value,
        version: parsed.value.version.value,
      });
    }

    return results;
  }

  async getBlockStatesGeyser() {
    const data = fs.readFileSync(this.bedrockData("block_palette.nbt"));
    const { parsed } = await nbt.parse(data); // big-endian NBT (auto-detected; 'little' fails to parse it)
    const results = [];
    for (const block of parsed.value.blocks.value.value) {
      results.push({
        name: block.name.value.replace("minecraft:", ""),
        states: block.states.value,
        version: block.version.value,
      });
    }

    return results;
  }

  async getBlockStatesAmulet() {}

  protected async generate() {
    // Copy over blockstates
    const states = await this.getBlockStatesGeyser();
    this.write(this.outputFile("blocks", "BlockStates.json"), JSON.stringify(states, null, "\t"));
    this.write(this.mcDataFile("blockStates.json"), JSON.stringify(states, null, "\t"));

    // * Build Java BSS to Bedrock BSS map
    {
      this.buildJ2B(); // Geyser mappings
      this.writeJson(this.outputFile("blocks", "Java2Bedrock.json"), this.j2b);
      this.writeJson(this.mcDataFile("blocksJ2B.json"), this.j2b);
    }

    // * Flip previous map: Bedrock Bss <-> Java Bss
    {
      this.buildB2J();
      this.writeJson(this.outputFile("blocks", "Bedrock2Java.json"), this.b2j);
      this.writeJson(this.mcDataFile("blocksB2J.json"), this.b2j);
    }

    // * Map Bedrock block runtime IDs to Block state strings and vice-versa
    {
      this.buildBRID(states);
      this.write(this.outputFile("blocks", "BRID.json"), stringify(this.brid2bs, { indent: "\t", maxLength: 19999 }));
      this.write(this.outputFile("blocks", "BSS.json"), stringify(this.bs2brid, { indent: "\t", maxLength: 19999 }));
    }

    // * Map Java BSS to Java Runtime IDs for convenience
    {
      this.buildJ2Bruntimeid();
      this.write(this.outputFile("blocks", "J2BRID.json"), JSON.stringify(this.j2brid));
    }
  }
}

export function getPatches() {
  const patches = {
    bedrock2java: {
      "minecraft:flowing_water[liquid_depth=0]": "minecraft:water[level=0]",
      "minecraft:flowing_lava[liquid_depth=0]": "minecraft:lava[level=0]",
      "minecraft:air[]": "minecraft:air[]",
    },
  };

  for (let i = 1; i <= 15; i++) {
    patches.bedrock2java[`minecraft:water[liquid_depth=${i}]`] = `minecraft:water[level=${i}]`;
  }

  for (let i = 1; i <= 15; i++) {
    patches.bedrock2java[`minecraft:lava[liquid_depth=${i}]`] = `minecraft:lava[level=${i}]`;
  }

  return patches;
}

type Mapping = {
  java_state: { Name: string; Properties?: Record<string, any> };
  bedrock_state: { bedrock_identifier: string; state?: Record<string, any> };
};

const SKULL_SPLIT: Record<string, string> = {
  "minecraft:skeleton_skull": "skeleton_skull",
  "minecraft:skeleton_wall_skull": "skeleton_skull",
  "minecraft:wither_skeleton_skull": "wither_skeleton_skull",
  "minecraft:wither_skeleton_wall_skull": "wither_skeleton_skull",
  "minecraft:zombie_head": "zombie_head",
  "minecraft:zombie_wall_head": "zombie_head",
  "minecraft:player_head": "player_head",
  "minecraft:player_wall_head": "player_head",
  "minecraft:creeper_head": "creeper_head",
  "minecraft:creeper_wall_head": "creeper_head",
  "minecraft:dragon_head": "dragon_head",
  "minecraft:dragon_wall_head": "dragon_head",
  "minecraft:piglin_head": "piglin_head",
  "minecraft:piglin_wall_head": "piglin_head",
};

function fix_1_21_42(mappings: Mapping[]) {
  for (const m of mappings) {
    const bs = m.bedrock_state;
    if (bs.bedrock_identifier === "skull") {
      const split = SKULL_SPLIT[m.java_state.Name];
      if (split) bs.bedrock_identifier = split;
    }
    // 1.21.40 split sponge/tnt; the reused 1.21.30 generator collapses java wet_sponge onto bedrock
    // sponge and java tnt onto underwater_tnt. Re-point them to the dedicated bedrock blocks (only
    // unstable=false tnt becomes plain tnt; unstable=true stays underwater_tnt, matching minecraft-data).
    if (m.java_state.Name === "minecraft:wet_sponge") {
      bs.bedrock_identifier = "wet_sponge";
    }
    if (m.java_state.Name === "minecraft:tnt" && m.java_state.Properties?.unstable === "false") {
      bs.bedrock_identifier = "tnt";
    }
    if ((bs.bedrock_identifier === "cherry_wood" || bs.bedrock_identifier === "mangrove_wood") && bs.state && bs.state.stripped_bit === false) {
      delete bs.state.stripped_bit;
    }
  }
}

const FIXUPS: Record<string, (m: Mapping[]) => void> = {
  "1.21.42": fix_1_21_42,
};

export function applyGeneratorBlockFixups(version: string, mappings: Mapping[]): Mapping[] {
  FIXUPS[version]?.(mappings);
  return mappings;
}
