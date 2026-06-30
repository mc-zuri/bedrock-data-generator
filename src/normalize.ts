// Normalizes every generated minecraft-data JSON to a single canonical property order and verifies
// that no object carries a property outside the registry. The registry below is the source of truth
// for which properties each file may contain and in what order; an unregistered field is a hard error
// (a new packet/mapping field must be added here deliberately). Run with `node src/normalize.ts`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import stringify from "json-stringify-pretty-compact";
import { outputPath } from "./utils.ts";

type Spec = { kind: "keep" } | { kind: "array"; items: Spec } | { kind: "map"; values: Spec } | { kind: "objectOrArray"; object: Spec } | { kind: "object"; fields: string[]; nested?: Record<string, Spec> };

type FileSpec = { spec: Spec; serialize: (value: unknown) => string };

const KEEP: Spec = { kind: "keep" };

function object(fields: string[], nested?: Record<string, Spec>): Spec {
  return { kind: "object", fields, nested };
}
function array(items: Spec): Spec {
  return { kind: "array", items };
}
function map(values: Spec): Spec {
  return { kind: "map", values };
}

function compact2(value: unknown): string {
  return stringify(value, { indent: 2, maxLength: 200 });
}
function compactTab(value: unknown): string {
  return stringify(value, { indent: "\t", maxLength: 19999 });
}
function json2(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
function jsonTab(value: unknown): string {
  return JSON.stringify(value, null, "\t");
}

const STATE_VALUE = object(["type", "value"]);
const CLIMATE = object(["temperature", "humidity", "altitude", "weirdness", "offset"]);
const INGREDIENT = object(["name", "tag", "metadata", "count", "nbt"]);
const RECIPE = object(["type", "id", "name", "ingredients", "input", "output", "priority"], { ingredients: array(INGREDIENT), output: array(INGREDIENT), input: KEEP });

const REGISTRY: Record<string, FileSpec> = {
  "blocks.json": {
    serialize: compact2,
    spec: array(
      object(["id", "name", "displayName", "hardness", "resistance", "stackSize", "diggable", "material", "transparent", "emitLight", "filterLight", "defaultState", "minStateId", "maxStateId", "harvestTools", "drops", "boundingBox"])
    ),
  },
  "items.json": {
    serialize: json2,
    spec: array(
      object(["id", "stackSize", "name", "displayName", "nbt", "version", "metadata", "variations", "enchantCategories", "repairWith", "maxDurability", "durability", "blockStateId"], {
        variations: array(object(["metadata", "id", "displayName", "name", "stackSize", "enchantCategories", "maxDurability"])),
      })
    ),
  },
  "biomes.json": {
    serialize: json2,
    spec: array(object(["id", "name", "category", "precipitation", "depth", "dimension", "displayName", "color", "rainfall", "temperature", "has_precipitation", "child", "climates", "parent"], { climates: array(CLIMATE) })),
  },
  "entities.json": {
    serialize: json2,
    spec: array(object(["id", "internalId", "name", "displayName", "height", "width", "length", "offset", "type", "category"])),
  },
  "attributes.json": {
    serialize: json2,
    spec: array(object(["name", "resource", "default", "min", "max"])),
  },
  "blockStates.json": {
    serialize: jsonTab,
    spec: array(object(["name", "states", "version"], { states: map(STATE_VALUE) })),
  },
  "recipes.json": {
    serialize: compact2,
    spec: map({ kind: "objectOrArray", object: RECIPE }),
  },
  "blockCollisionShapes.json": {
    serialize: compactTab,
    spec: object(["blocks", "visualBlocks", "shapes", "dynamicShapes"], { blocks: KEEP, visualBlocks: KEEP, shapes: KEEP, dynamicShapes: KEEP }),
  },
};

function reorder(value: any, spec: Spec, location: string): any {
  if (spec.kind === "keep") {
    return value;
  }
  if (spec.kind === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`expected array at ${location}`);
    }
    return value.map((item, i) => reorder(item, spec.items, `${location}[${i}]`));
  }
  if (spec.kind === "map") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      out[key] = reorder(value[key], spec.values, `${location}.${key}`);
    }
    return out;
  }
  if (spec.kind === "objectOrArray") {
    if (Array.isArray(value)) {
      return value.map((item, i) => reorder(item, spec.object, `${location}[${i}]`));
    }
    return reorder(value, spec.object, location);
  }
  for (const key of Object.keys(value)) {
    if (!spec.fields.includes(key)) {
      throw new Error(`unknown field "${key}" at ${location} — add it to the normalize registry`);
    }
  }
  const out: Record<string, any> = {};
  for (const field of spec.fields) {
    if (!(field in value)) {
      continue;
    }
    const childSpec = spec.nested?.[field];
    out[field] = childSpec ? reorder(value[field], childSpec, `${location}.${field}`) : value[field];
  }
  return out;
}

export function normalize(): { changed: string[]; checked: number } {
  const base = outputPath("minecraft-data");
  const changed: string[] = [];
  let checked = 0;
  for (const version of fs.readdirSync(base)) {
    const dir = path.join(base, version);
    if (!fs.statSync(dir).isDirectory()) {
      continue;
    }
    for (const file in REGISTRY) {
      const filePath = path.join(dir, file);
      if (!fs.existsSync(filePath)) {
        continue;
      }
      checked++;
      const original = fs.readFileSync(filePath, "utf8");
      const reordered = reorder(JSON.parse(original), REGISTRY[file].spec, `${version}/${file}`);
      const serialized = REGISTRY[file].serialize(reordered);
      if (serialized !== original) {
        fs.writeFileSync(filePath, serialized);
        changed.push(`${version}/${file}`);
      }
    }
  }
  return { changed, checked };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { changed, checked } = normalize();
  console.log(`normalized ${changed.length}/${checked} files`);
  for (const file of changed) {
    console.log("  ~", file);
  }
}
