// captureSteve's relay tags the persona id (persona-<playfabid>-<N>) in SkinId, SkinResourcePatch and
// SkinGeometryData. The <playfabid> is the skin's PlayFab ID (the id PlayFab stores the skin under,
// see bedrock-protocol handshake/login.js) and varies by capture account; the trailing <N> is a
// per-capture counter. Both are opaque to the protocol (the only constraint is that
// SkinResourcePatch's geometry name resolves in SkinGeometryData — which it still does because we
// rewrite all three fields together). Canonicalizing the persona id to a single fixed PlayFab ID + -0
// makes captures deterministic so identical skins are byte-identical and dedup across versions.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataPath } from "./utils.ts";

const CANONICAL_PLAYFAB_ID = "123456789012345";
const fixPersona = (s: string) => s.replace(/(persona[-_])[0-9a-f]+-\d+/g, (_m, prefix) => `${prefix}${CANONICAL_PLAYFAB_ID}-0`);

export function normalizeSteveSkin<T extends Record<string, any>>(skin: T): T {
  const out: Record<string, any> = { ...skin };
  if (typeof out.SkinId === "string") out.SkinId = fixPersona(out.SkinId);
  for (const key of ["SkinResourcePatch", "SkinGeometryData"]) {
    if (typeof out[key] === "string") {
      out[key] = Buffer.from(fixPersona(Buffer.from(out[key], "base64").toString("utf8")), "utf8").toString("base64");
    }
  }
  return out as T;
}

// Rewrites every data/bedrock/<version>/steve.json in place with the canonical -0 suffix.
export function normalizeCapturedSteve(): void {
  const base = dataPath("bedrock");
  let changed = 0;
  let total = 0;
  for (const version of fs.readdirSync(base)) {
    const file = path.join(base, version, "steve.json");
    if (!fs.existsSync(file)) continue;
    total++;
    const original = fs.readFileSync(file, "utf8");
    const updated = JSON.stringify(normalizeSteveSkin(JSON.parse(original)), null, 2);
    if (updated !== original) {
      fs.writeFileSync(file, updated);
      changed++;
    }
  }
  console.log(`normalizeSteve: ${changed}/${total} captures updated`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  normalizeCapturedSteve();
}
