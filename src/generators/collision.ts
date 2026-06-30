import fs from "node:fs";
import assert from "node:assert";
import nbt from "prismarine-nbt";
import { customJSONStringify, shortenFloats, strip } from "../utils.ts";

// blocks: one block per line, its state-index array inline; shapes: one shape per line, its
// coordinate arrays inline (block index arrays can be long — 10000 keeps them on one line).
const COLLISION_FORMAT = { indent: "\t", inline: { blockArrays: true, shapeArrays: true, maxLength: 10000 } } as const;
import { Generator } from "./generator.ts";

function sequential(data: (string | number)[]): boolean {
  const nums = data.map((k) => parseInt(k as string));
  if (nums.length < 2) return true;
  for (let i = nums[0], j = 0; i <= nums[nums.length - 1]; i++, j++) {
    if (nums[j] != nums[0] + j) return false;
  }
  return true;
}

function normalizeShape(shape: number[] | number[][]): number[][] {
  if (!shape || shape.length === 0) {
    return [[0, 0, 0, 0, 0, 0]];
  }
  if (Array.isArray(shape[0])) {
    return shape as number[][];
  }
  return [shape as number[]];
}

export class CollisionGenerator extends Generator {
  protected readonly label = "collision";

  protected async generate() {
    // block-state-shapes.nbt (mc-zuri/bedrock-data) carries each bedrock block state's collisionShape,
    // captured straight from the game — authoritative and preferred over the Geyser mappings. It exists
    // for every version, so it's the primary source. Geyser remains a fallback: collisions.nbt (-> v2)
    // for the mappings-generator era, collision.json (-> v1) for the oldest versions.
    if (fs.existsSync(this.bedrockData("block-state-shapes.nbt"))) {
      return await this.generateFromShapes();
    }
    if (fs.existsSync(this.bedrockData("collisions.nbt"))) {
      return await this.generateV2();
    }
    return await this.generateV1();
  }

  // Builds blockCollisionShapes.json from block-state-shapes.nbt. Each shape entry is indexed by the
  // bedrock runtime block-state id (blockStateId), which lines up with the palette order in
  // BlockStates.json (written by blockMap), so we resolve each state's block name by that id. Collision
  // shapes are kept exact (no rounding) and deduplicated into the shapes table; one index per state.
  private async generateFromShapes() {
    const blocks = this.readJson(this.outputFile("blocks.json"));
    const names: string[] = this.readJson(this.outputFile("blocks", "BlockStates.json")).map((s: any) => strip(s.name));

    // block-state-shapes.nbt is little-endian (Bedrock) NBT — parse it explicitly, per
    // bedrock-data/examples/load-block-state-shapes.ts. Each entry: { blockStateId, collisionShape:
    // number[][], uiShape: number[], visualShape: number[] }; we only need blockStateId + collisionShape.
    const buf = fs.readFileSync(this.bedrockData("block-state-shapes.nbt"));
    const shapeStates: any[] = nbt.simplify((await nbt.parse(buf, "little")).parsed).shapes;

    // group each state's collision shape by block name, in runtime-id order
    const statesByName = new Map<string, (number[] | number[][])[]>();
    for (const state of shapeStates) {
      const name = names[state.blockStateId];
      if (name === undefined) {
        continue;
      }
      const list = statesByName.get(name);
      if (list) {
        list.push(state.collisionShape);
      } else {
        statesByName.set(name, [state.collisionShape]);
      }
    }

    const shapes: Record<number, number[][]> = {};
    const shapeIds = new Map<string, number>();

    const shapeId = (shape: number[] | number[][]): number => {
      const normalized = normalizeShape(shape);
      const key = JSON.stringify(normalized);
      let id = shapeIds.get(key);
      if (id === undefined) {
        id = shapeIds.size;
        shapeIds.set(key, id);
        shapes[id] = normalized;
      }
      return id;
    };

    const out: Record<string, number[]> = {};
    for (const block of blocks) {
      const name = strip(block.name);
      const states = statesByName.get(name);
      if (!states) {
        out[name] = [shapeId([])];
        continue;
      }
      out[name] = states.map((shape) => shapeId(shape));
    }
    // Air (and any empty collisionShape) collapses onto index 0; force it to the empty shape.
    shapes[0] = [];

    this.publish("blockCollisionShapes.json", customJSONStringify(shortenFloats({ blocks: out, shapes }), COLLISION_FORMAT));
  }

  private async generateV1() {
    const bedrockBlockStates = this.readJson(this.outputFile("blocks", "BlockStates.json"));
    const geyserMappings = applyV1BlockFixups(this.readJson(this.bedrockData("generator_blocks_v1.json")), bedrockBlockStates);
    const collisions = this.readJson(this.bedrockData("collision.json"));

    const buildBSS = (states: any) => {
      const s = [];
      for (const k in states) {
        const v = states[k];
        s.push(`${k}=${v}`);
      }
      return s.join(",");
    };

    const statesByName = new Map<string, string[]>();
    for (let i = 0; i < bedrockBlockStates.length; i++) {
      const name = bedrockBlockStates[i].name;
      const arr = statesByName.get(name);
      if (arr) {
        arr.push(String(i));
      } else {
        statesByName.set(name, [String(i)]);
      }
    }

    function getStateIDFor(name: string, states?: Record<string, any>): any {
      const candidates = statesByName.get(name.replace("minecraft:", ""));
      if (!candidates) return undefined;
      for (const i of candidates) {
        if (!states) return i;
        const block = bedrockBlockStates[i as any];
        let failed;
        for (const [state, value] of Object.entries(states)) {
          if (block.states[state]?.value != value) {
            failed = true;
            break;
          }
        }
        if (!failed) {
          return i;
        }
      }
    }

    const out: Record<string, any> = {};
    const col: Record<string, any> = {};
    // console.log(collisions)
    // return

    /**
     * The following code builds a map of blockIdName => Array of block state indexes
     */
    for (const javaId in geyserMappings) {
      const maping = geyserMappings[javaId];
      buildBSS(maping.bedrock_states);
      // This is a mapping that contains bedrock block names as their keys, and
      // their indexes to the collisions map as their values. We need to make sure
      // We need to make sure
      const o = (out[`${strip(maping.bedrock_identifier)}`] ??= {});
      // console.log(maping)

      // Put a second map into `o` that maps state IDs for each of the bedrock block names
      // to a collision index.
      const stateID = getStateIDFor(maping.bedrock_identifier, maping.bedrock_states);
      // console.log('stateID', stateID, maping)
      assert(stateID, `Could not find stateID for ${maping.bedrock_identifier}`);
      o[stateID] = maping.collision_index;

      // Make sure that the `o` map's keys of BRIDs are sequential and don't have any gaps.
      // That's because we do minStateId + stateNumber to figure out which collision to use.
      const keys = Object.keys(o);

      // Get the "default" collision index for this block in case a missing block state doesn't have one.
      // The default is just the first one we find.
      const defVal = o[keys[0]];

      if (!sequential(keys)) {
        console.warn(`⚠ GAP in collisions for ${maping.bedrock_identifier} / ${javaId}, ${keys} -- filling in`);
        for (let i = parseInt(keys[0]); i <= parseInt(keys[keys.length - 1]); i++) {
          o[i] ??= defVal;
        }
        if (!sequential(Object.keys(o))) throw Error();
      }

      col[maping.collision_index] = collisions[maping.collision_index];
    }

    for (const key in out) {
      const minStateId = getStateIDFor("minecraft:" + key);
      const val = out[key];
      const keys = Object.keys(val).map((k) => parseInt(k));
      const next = [];
      for (let i = minStateId; i <= keys[keys.length - 1]; i++) {
        if (val[i] != null) next.push(val[i]);
        else next.push(0);
      }
      out[key] = next;
      // console.log('Next', next, minStateId, keys[keys.length - 1])
      if (next.length < keys.length) throw Error();
    }

    this.publish("blockCollisionShapes.json", customJSONStringify(shortenFloats({ blocks: out, shapes: col }), COLLISION_FORMAT));
  }

  private async generateV2() {
    const BSS = this.readJson(this.outputFile("blocks", "BSS.json"));
    const blocksJSON = this.readJson(this.outputFile("blocks.json"));
    const Java2Bedrock = this.readJson(this.outputFile("blocks", "Java2Bedrock.json"));

    const collisionsData = fs.readFileSync(this.bedrockData("collisions.nbt"));
    const collisionsNbt = await nbt.parse(collisionsData);
    const collisionsJSON: any = nbt.simplify(collisionsNbt.parsed);

    const collisions: { blocks: Record<string, any>; shapes: Record<string, any> } = {
      blocks: {},
      shapes: {},
    };

    const bedrockBlockStateId_2_collisionIndex: Record<string, any> = {};
    const bedrock_block_states = Object.values(Java2Bedrock) as string[];
    for (const bedrockBlockIndex in bedrock_block_states) {
      let bedrockStateName = bedrock_block_states[bedrockBlockIndex];

      let index = BSS[jss2bss(bedrockStateName)];
      if (index == null) {
        if (index == null && bedrockStateName === "minecraft:golden_dandelion[]" && BSS[jss2bss("minecraft:dandelion[]")] !== undefined) {
          bedrockStateName = "minecraft:golden_dandelion[]";
          index = BSS["minecraft:dandelion[]"];
        }
      }
      if (index == null) {
        // The Java->Bedrock map (from a possibly newer mappings-generator pin) can reference a bedrock
        // state absent from this version's palette; skip it rather than aborting the whole version.
        console.warn(`    ⚠ ${this.bedrockVersion} collision: bedrock state ${bedrockStateName} not in palette (skipped)`);
        continue;
      }
      bedrockBlockStateId_2_collisionIndex[index] = bedrockBlockIndex;
    }

    for (const bedrockBlockIndex in blocksJSON) {
      const bedrockBlock = blocksJSON[bedrockBlockIndex];
      for (let stateId = bedrockBlock.minStateId; stateId <= bedrockBlock.maxStateId; stateId++) {
        if (!collisions.blocks[strip(bedrockBlock.name)]) {
          collisions.blocks[strip(bedrockBlock.name)] = [];
        }

        if (bedrockBlockStateId_2_collisionIndex[stateId] != undefined) {
          collisions.blocks[strip(bedrockBlock.name)].push(collisionsJSON.indices[bedrockBlockStateId_2_collisionIndex[stateId]]);
        } else {
          collisions.blocks[strip(bedrockBlock.name)].push(0);
        }
      }
    }

    for (const key in collisionsJSON.collisions) {
      const value = collisionsJSON.collisions[key];
      collisions.shapes[key] = value;
    }

    this.publish("blockCollisionShapes.json", customJSONStringify(shortenFloats(collisions), COLLISION_FORMAT));
  }
}

function jss2bss(val: string) {
  val = val.replace(/=true/g, "=1");
  val = val.replace(/=false/g, "=0");
  return val;
}

type V1Entry = { bedrock_identifier: string; bedrock_states?: Record<string, any>; [k: string]: any };
type States = Record<string, any> | undefined;

const COLOR_FIX: Record<string, string> = { silver: "light_gray" };
const CARD2FACE: Record<string, number> = { north: 2, south: 3, west: 4, east: 5 };
const FACE2STR: Record<number, string> = { 0: "down", 1: "up", 2: "north", 3: "south", 4: "west", 5: "east" };
const STONE_TYPE: Record<string, string> = {
  granite: "granite",
  polished_granite: "granite_smooth",
  diorite: "diorite",
  polished_diorite: "diorite_smooth",
  andesite: "andesite",
  polished_andesite: "andesite_smooth",
};
const PLANK_WOODS = new Set(["oak", "spruce", "birch", "jungle", "acacia", "dark_oak"]);

function buildPaletteIndex(bss: any[]): Map<string, Record<string, any>[]> {
  const idx = new Map<string, Record<string, any>[]>();
  for (const b of bss) {
    const st: Record<string, any> = {};
    for (const k in b.states) st[k] = b.states[k]?.value;
    const list = idx.get(b.name) ?? [];
    list.push(st);
    idx.set(b.name, list);
  }
  return idx;
}

function paletteHas(idx: Map<string, Record<string, any>[]>, id: string, st: States): boolean {
  const list = idx.get(id.replace("minecraft:", ""));
  if (!list) return false;
  if (!st) return list.length > 0;
  outer: for (const blk of list) {
    for (const k in st) if (blk[k] != st[k]) continue outer;
    return true;
  }
  return false;
}

function v1Candidates(id: string, st: States): { id: string; st: States }[] {
  const out: { id: string; st: States }[] = [];
  const snake = id.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  for (const cid of snake !== id ? [snake, id] : [id]) {
    out.push({ id: cid, st });
    if (st && "no_drop_bit" in st) {
      const s = { ...st };
      delete s.no_drop_bit;
      out.push({ id: cid, st: s });
    }
    if (st && typeof st.color === "string") {
      const color = COLOR_FIX[st.color] ?? st.color;
      const s = { ...st };
      delete s.color;
      out.push({ id: `${color}_${cid}`, st: s });
    }
    if (st && typeof st["minecraft:cardinal_direction"] === "string") {
      const s = { ...st };
      const v = CARD2FACE[s["minecraft:cardinal_direction"]];
      delete s["minecraft:cardinal_direction"];
      s.facing_direction = v;
      out.push({ id: cid, st: s });
    }
    if (st && typeof st.facing_direction === "number") {
      const s: Record<string, any> = { ...st };
      const v = FACE2STR[s.facing_direction];
      delete s.facing_direction;
      s["minecraft:facing_direction"] = v;
      out.push({ id: cid, st: s });
    }
    if (cid in STONE_TYPE) out.push({ id: "stone", st: { ...(st ?? {}), stone_type: STONE_TYPE[cid] } });
    if (cid.endsWith("_planks") && PLANK_WOODS.has(cid.slice(0, -7))) out.push({ id: "planks", st: { ...(st ?? {}), wood_type: cid.slice(0, -7) } });
  }
  return out;
}

function applyV1BlockFixups(geyserMappings: Record<string, V1Entry>, bss: any[]): Record<string, V1Entry> {
  const idx = buildPaletteIndex(bss);
  for (const javaId in geyserMappings) {
    const m = geyserMappings[javaId];
    const id = (m.bedrock_identifier || "").replace("minecraft:", "");
    const st = m.bedrock_states;
    if (paletteHas(idx, id, st)) continue;
    for (const c of v1Candidates(id, st)) {
      if (paletteHas(idx, c.id, c.st)) {
        m.bedrock_identifier = c.id;
        m.bedrock_states = c.st;
        break;
      }
    }
  }
  return geyserMappings;
}
