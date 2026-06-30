import assert from "node:assert";
import stringify from "json-stringify-pretty-compact";
import { BLOCK_ORDER, orderKeys, shortenFloats, strip } from "../utils.ts";
import { Generator } from "./generator.ts";

function sequential(data: number[]): boolean {
  return data.every((num, i) => i === data.length - 1 || num < data[i + 1]);
}
function titleCase(str: string): string {
  return str.replace(/\b\S/g, (t) => t.toUpperCase());
}

export class BlocksGenerator extends Generator {
  protected readonly label = "blocks.json";

  protected async generate() {
    const bedrockBlockStates = this.readJson(this.outputFile("blocks", "BlockStates.json"));
    const bedrock2Java = this.readJson(this.outputFile("blocks", "Bedrock2Java.json"));
    const javaBlocks: any[] = this.readJson(this.javaResource(this.javaVersion, "blocks"));

    const mapB2J = Object.entries(bedrock2Java).reduce<Record<string, string>>((acc, [k, v]) => {
      acc[strip(k)] ??= strip(v as string);
      return acc;
    }, {});
    const out: Record<string, any> = {};
    const usedIds = new Set();

    for (let i = 0; i < bedrockBlockStates.length; i++) {
      const state = bedrockBlockStates[i];
      const name = strip(state.name);
      out[name] ??= { name: name, states: [] };
      out[name].states.push(i);

      const javaName = mapB2J[name];
      if (javaName) {
        let found;
        for (const javaBlock of javaBlocks) {
          if (javaBlock.name === javaName) {
            found = true;
            const e = { ...javaBlock };
            out[name] = Object.assign(e, out[name]);
            break;
          }
        }
        if (!found) {
          console.warn(`    ⚠ ${this.bedrockVersion} blocks: no java block ${javaName} for ${name}`);
        }
      }
    }

    // Sort it based on IDs. The IDs (note, NOT the stateID) are kept the same as PC when possible
    const fin = Object.values(out).sort((a, b) => {
      // console.log('s',a.id, b.id)
      return (a.id ?? 999) - (b.id ?? 9999);
    });

    for (const entry of fin) {
      assert(sequential(entry.states), JSON.stringify(entry));

      entry.id ??= undefined; // sorting
      entry.minStateId = entry.states[0];
      entry.maxStateId = entry.states[entry.states.length - 1];
      delete entry.states;
      entry.displayName ??= titleCase(entry.name.replace(/_/g, " "));

      entry.id ??= entry.minStateId;
      entry.defaultState = entry.minStateId;
      entry.hardness ??= 0;
      entry.stackSize ??= 1;
      entry.diggable ??= false;
      entry.boundingBox ??= "block";
      entry.drops ??= [];
      entry.transparent ??= false;
      entry.emitLight ??= 0;
      entry.filterLight ??= 0;
    }

    // post-process: Fix any dupe IDs
    let di = 8000;
    for (const entry of fin) {
      if (usedIds.has(entry.id)) {
        // entry.old = entry.id
        entry.id = di++;
      }
      usedIds.add(entry.id);
    }

    const ordered = fin.map((entry) => orderKeys(entry, BLOCK_ORDER));
    this.publish("blocks.json", stringify(shortenFloats(ordered), { indent: 2, maxLength: 200 }));
  }
}
