import url from "node:url";
import path from "node:path";

export function rootDir() {
  const __filename = url.fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), "..");
}

export function outputPath(...parts: string[]) {
  return path.resolve(rootDir(), "output", ...parts);
}

export function dataPath(...parts: string[]) {
  return path.resolve(rootDir(), "data", ...parts);
}

// Root of the generated minecraft-data package (the `data/` dir lives under it). Bedrock output is
// published in the package layout: <root>/minecraft-data/data/bedrock/<version>/<file> plus
// <root>/minecraft-data/data/dataPaths.json. Override the package location with MINECRAFT_DATA_DIR.
export function mcDataPackageDir() {
  return process.env.MINECRAFT_DATA_DIR ?? path.resolve(rootDir(), "minecraft-data");
}
export function mcDataDir(...parts: string[]) {
  return path.resolve(mcDataPackageDir(), "data", ...parts);
}

export function strip(key: string): string {
  return key?.replace("minecraft:", "").split("[")[0];
}

export function camel(name: string): string {
  return name
    .split(/[._]/)
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
}

// Canonical property order for the generated files. Single source of truth shared by the generators
// (which emit keys in this order) and normalize.ts (which enforces it), so the output property order
// is predictable and the two can't drift.
export const BLOCK_ORDER = [
  "id", "name", "displayName", "hardness", "resistance", "stackSize", "diggable", "material", "transparent", "emitLight", "filterLight", "defaultState", "minStateId", "maxStateId", "harvestTools", "drops", "boundingBox",
] as const;
export const ITEM_ORDER = [
  "id", "stackSize", "name", "displayName", "nbt", "version", "metadata", "variations", "enchantCategories", "repairWith", "maxDurability", "durability", "blockStateId",
] as const;
export const ITEM_VARIATION_ORDER = ["metadata", "id", "displayName", "name", "stackSize", "enchantCategories", "maxDurability"] as const;

// Returns a shallow copy of obj with keys in `order` first (when present), then any remaining keys in
// their original order. Used to give generated objects a predictable, normalized property order.
export function orderKeys<T extends Record<string, unknown>>(obj: T, order: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const key of order) if (key in obj) out[key] = obj[key];
  for (const key in obj) if (!(key in out)) out[key] = obj[key];
  return out as T;
}

// Returns the shortest decimal whose value, after JSON.parse + Math.fround, is the original float32.
// The collision coordinates come from the game as 32-bit floats widened into noisy doubles
// (0.025 -> 0.02500000037252903); this trims the noise to the shortest string that still reproduces
// the exact same float32 once the consumer re-frounds it. Non-float32 numbers (genuine doubles, or
// integers outside float32's exact range) fail the guard and are returned unchanged.
export function f32(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) !== value) return value;
  for (let precision = 1; precision < 17; precision++) {
    const candidate = Number(value.toPrecision(precision));
    if (Math.fround(candidate) === value) return candidate;
  }
  return value;
}

// Deep-copies a JSON-like value, applying f32() to every number.
export function shortenFloats<T>(value: T): T {
  if (typeof value === "number") return f32(value) as T;
  if (Array.isArray(value)) return value.map((v) => shortenFloats(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key in value as Record<string, unknown>) out[key] = shortenFloats((value as Record<string, unknown>)[key]);
    return out as T;
  }
  return value;
}

interface InlineRules {
  blockArrays?: boolean; // keep block state-index arrays (under "blocks"/"visualBlocks") inline
  shapeArrays?: boolean; // keep shape coordinate arrays (under "shapes") inline
  maxLength?: number; // max stringified length still kept inline
}

// Custom JSON serializer for the blockCollisionShapes structure. Expands every object one key per
// line, but keeps the leaf arrays inline (block index arrays and shape coordinate arrays) so the file
// is one block / one shape per line instead of one giant line. Numbers use String()/JSON.stringify,
// i.e. the shortest round-trip form, so values are reproduced exactly (no precision loss).
export function customJSONStringify(obj: unknown, options: { indent?: string; inline?: InlineRules } = {}): string {
  const indent = options.indent ?? "\t";
  const inline = options.inline ?? {};

  function stringifyValue(value: any, depth: number, _key: string | number | null, parentKey: string | number | null): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    const type = typeof value;
    if (type === "string") return JSON.stringify(value);
    if (type === "number" || type === "boolean") return String(value);

    if (Array.isArray(value)) {
      const str = JSON.stringify(value).replace(/,/g, ", "); // add a space after every comma

      // Block index arrays (under "blocks"/"visualBlocks") — always inline when enabled.
      if (inline.blockArrays && (parentKey === "blocks" || parentKey === "visualBlocks")) {
        return str;
      }
      // Shape coordinate arrays (under "shapes") — inline while under the length cap.
      if (inline.shapeArrays && parentKey === "shapes" && str.length < (inline.maxLength ?? 10000)) {
        return str;
      }
      // Default: inline short arrays, otherwise one element per line.
      if (str.length < 100) return str;
      const items = value.map((v, i) => stringifyValue(v, depth + 1, i, _key));
      return "[\n" + indent.repeat(depth + 1) + items.join(",\n" + indent.repeat(depth + 1)) + "\n" + indent.repeat(depth) + "]";
    }

    if (type === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) return "{}";
      // Small objects stay inline.
      const objStr = JSON.stringify(value).replace(/:/g, ": ").replace(/,/g, ", ");
      if (objStr.length < 100) return objStr;
      const entries = keys.map((k) => indent.repeat(depth + 1) + JSON.stringify(k) + ": " + stringifyValue(value[k], depth + 1, k, _key));
      return "{\n" + entries.join(",\n") + "\n" + indent.repeat(depth) + "}";
    }

    return String(value);
  }

  return stringifyValue(obj, 0, null, null);
}
