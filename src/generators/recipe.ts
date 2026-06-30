import stringify from "json-stringify-pretty-compact";
import { strip } from "../utils.ts";
import { Generator } from "./generator.ts";

export class RecipesGenerator extends Generator {
  protected readonly label = "recipes.json";

  protected async generate() {
    const craftingData = this.readJson(this.bedrockData("crafting_data.json"));
    const itemstates = this.readJson(this.bedrockData("item_registry.json")).itemstates;
    const uniqueTypes = new Set();

    const itemRuntimeId2String: Record<string, string> = {};
    for (const state of itemstates) {
      itemRuntimeId2String[state.runtime_id] = state.name;
    }

    const makeOutputItem = (_it: any) => {
      const it = typeof _it === "string" ? JSON.parse(_it) : _it;
      if (it.type === "item_tag") return { tag: strip(it.tag), count: it.count ?? 1 };
      if (it.type === "complex_alias") return { name: strip(it.name), count: it.count ?? 1 };
      const name = itemRuntimeId2String[it.network_id];
      if (!name) throw Error("unknown item network_id " + it.network_id);
      return {
        name: strip(name ?? it.network_id),
        metadata: it.metadata ?? it.network_data,
        count: it.count ?? 1,
        nbt: it.extra?.nbt,
      };
    };

    const ret: any[] = [];

    for (const id in craftingData.recipes) {
      const recipe = craftingData.recipes[id];
      const rid = parseInt(id);
      uniqueTypes.add(recipe.recipe.block);
      uniqueTypes.add(recipe.type);
      const name = recipe.recipe.recipe_id;
      if (["shapeless", "shaped", "shaped_chemistry", "shapeless_chemistry"].includes(recipe.type)) {
        const [ing, inp] = flatten(recipe.recipe.input);
        ret.push({
          type: recipe.recipe.block || recipe.type,
          id: rid,
          name,
          ingredients: ing.map(makeOutputItem),
          input: inp,
          output: recipe.recipe.output.map(makeOutputItem),
        });
      } else if (recipe.type === "furnace" || recipe.type === "furnace_with_metadata") {
        const fname = itemRuntimeId2String[recipe.recipe.input_id];
        ret.push({
          type: recipe.recipe.block || "furnace",
          id: rid,
          name: fname,
          ingredients: [{ name: strip(fname), metadata: recipe.recipe.metadata, count: 1 }],
          output: [makeOutputItem(recipe.recipe.output)],
        });
      } else if (recipe.type === "multi") {
        console.log("skip multi");
      } else if (recipe.type === "shulker_box") {
        const [ing, inp] = flatten(recipe.recipe.input);
        ret.push({
          type: "shulker_box",
          id: rid,
          name,
          ingredients: ing.map(makeOutputItem),
          input: inp,
          output: recipe.recipe.output.map(makeOutputItem),
          priority: recipe.recipe.priority,
        });
      } else if (recipe.type === "smithing_trim") {
        console.log("skip smithing_trim");
      } else if (recipe.type === "smithing_transform") {
        console.log("skip smithing_transform");
      } else {
        throw Error(recipe.type + " is not support");
      }
    }

    const final: Record<string, any> = {};
    for (const r of ret) {
      final[r.id] = r;
      delete r.id;
    }

    this.publish("recipes.json", stringify(final, { indent: 2, maxLength: 200 }));
  }
}

function tfi(inp: any): string {
  return JSON.stringify(inp);
}

function flatten(input: any): [any[], any[]] {
  const ing: string[] = [];
  const counts: Record<string, number> = {};
  const result: any[] = [];
  if (Array.isArray(input[0])) {
    for (let i = 0; i < input.length; i++) {
      const inp1 = input[i];
      const newInpArray = [];
      for (let j = 0; j < inp1.length; j++) {
        const inp2 = inp1[j];
        if (inp2.type === "invalid" || inp2.network_id === 0) {
          newInpArray.push(0);
          continue;
        }
        const ingredient = tfi(inp2);
        if (!ing.includes(ingredient)) ing.push(ingredient);
        counts[ingredient] ??= 0;
        counts[ingredient]++;
        newInpArray.push(ing.indexOf(ingredient) + 1);
      }
      result.push(newInpArray);
    }
  } else {
    const newInpArray = [];
    for (let j = 0; j < input.length; j++) {
      const inp2 = input[j];
      if (inp2.network_id == 0) {
        newInpArray.push(0);
        continue;
      }
      const ingredient = tfi(inp2);
      if (!ing.includes(ingredient)) ing.push(ingredient);
      counts[ingredient] ??= 0;
      counts[ingredient]++;
      newInpArray.push(ing.indexOf(ingredient) + 1);
    }
    result.push(newInpArray);
  }
  const ing2 = ing.map((e) => {
    const x = JSON.parse(e);
    x.count = counts[e] || x.count;
    return x;
  });
  return [ing2, result];
}
