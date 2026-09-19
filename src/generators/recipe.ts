import stringify from "json-stringify-pretty-compact";
import { strip } from "../utils.ts";
import { Generator } from "./generator.ts";

export class RecipesGenerator extends Generator {
  protected readonly label = "recipes.json";

  protected async generate() {
    const craftingData = normalizeCraftingData(this.readJson(this.bedrockData("crafting_data.json")));
    const itemstates = this.readJson(this.bedrockData("item_registry.json")).itemstates;
    const uniqueTypes = new Set();

    const itemRuntimeId2String: Record<string, string> = {};
    for (const state of itemstates) {
      itemRuntimeId2String[state.runtime_id] = state.name;
    }

    const makeOutputItem = (_it: any) => {
      const it = typeof _it === "string" ? JSON.parse(_it) : _it;
      if (it.type === "item_tag") return { tag: strip(it.tag), count: it.count ?? 1 };
      if (it.type === "complex_alias") return { name: strip(it.name), metadata: it.metadata, count: it.count ?? 1 };
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

// 1.26.40 restructured CraftingDataPacket: the single tagged `recipes` list became eight typed
// per-category arrays, shaped ingredients became a FLAT row-major list (width x height, with an
// explicit count) instead of a nested grid, and each ingredient became a Cereal tagged descriptor.
// Without this the generator iterates a `recipes` key that no longer exists and emits an empty
// recipes.json. Normalising back to the legacy shape keeps the rest of this file version-agnostic.
const LEGACY_TYPE: Record<string, string> = {
  shaped: "shaped",
  shapeless: "shapeless",
  multi: "multi",
  user_data_shapeless: "shulker_box", // enum slot 5 — "shulker_box" is just the old label for it
  shapeless_chemistry: "shapeless_chemistry",
  shaped_chemistry: "shaped_chemistry",
  smithing_transform: "smithing_transform",
  smithing_trim: "smithing_trim",
};

// minecraft-data's own 1.26.40/1.26.45 schema names these arrays with a `_recipes` suffix (and
// user_data_shapeless `shulker_box_recipes`); our 1.26.50 schema uses the bare names.
const UPSTREAM_KEY: Record<string, string> = {
  shaped: "shaped_recipes",
  shapeless: "shapeless_recipes",
  multi: "multi_recipes",
  user_data_shapeless: "shulker_box_recipes",
  shapeless_chemistry: "shapeless_chemistry_recipes",
  shaped_chemistry: "shaped_chemistry_recipes",
  smithing_transform: "smithing_transform_recipes",
  smithing_trim: "smithing_trim_recipes",
};

/** A 1.26.40 ingredient -> the legacy `{type, ...}` form the rest of this generator understands. */
function legacyIngredient(c: any): any {
  // minecraft-data's own schema decodes an ingredient flat: {type, descriptor_type, name|tag, metadata, count}.
  if (c && !("descriptor" in c)) {
    if (c.type !== "valid") return { type: "invalid", count: 0 };
    if (c.descriptor_type === "item_tag") return { type: "item_tag", tag: c.tag, count: c.count };
    return { type: "complex_alias", name: c.name, count: c.count, metadata: c.metadata };
  }
  const outer = c?.descriptor ?? {};
  const count = c?.count ?? 1;
  // present === 0 means an empty grid slot; the legacy shape spelt that "invalid".
  if (!outer.present) return { type: "invalid", count: 0 };
  const inner = outer.descriptor ?? {};
  const value = inner.value ?? {};
  if (inner.type_name === "item_tag") return { type: "item_tag", tag: value.tag, count };
  if (inner.type_name === "molang") return { type: "molang", expression: value.expression, count };
  // "name" descriptors carry the item name directly, which is what complex_alias meant before.
  return { type: "complex_alias", name: value.name, count, metadata: c?.aux };
}

function normalizeCraftingData(cd: any): any {
  if (cd?.recipes) return cd; // already the legacy shape
  const recipes: any[] = [];
  for (const [key, type] of Object.entries(LEGACY_TYPE)) {
    for (const r of cd?.[key] ?? cd?.[UPSTREAM_KEY[key]] ?? []) {
      const recipe: any = { ...r };
      if (Array.isArray(r.input)) {
        const ing = r.input.map(legacyIngredient);
        // Shaped recipes must keep their grid: re-nest the flat row-major list into `height` rows
        // of `width`. Shapeless ones stay a flat list.
        recipe.input =
          r.width && r.height
            ? Array.from({ length: r.height }, (_, y) => ing.slice(y * r.width, (y + 1) * r.width))
            : ing;
      }
      recipes.push({ type, recipe });
    }
  }
  return { ...cd, recipes };
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
