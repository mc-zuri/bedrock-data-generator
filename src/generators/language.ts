import fs from "node:fs";
import path from "node:path";
import { rootDir } from "../utils.ts";
import { Generator } from "./generator.ts";

// The vanilla resource pack shipped with each BDS holds the canonical en_US strings. We read it
// straight from the already-downloaded server (servers/<ver>/resource_packs/vanilla/texts/en_US.lang)
// instead of re-downloading the zip, and parse the key=value .lang into the flat {key:value} map
// minecraft-data publishes as language.json.
function langFile(version: string): string {
  return path.resolve(rootDir(), "servers", version, "resource_packs", "vanilla", "texts", "en_US.lang");
}

export class LanguageGenerator extends Generator {
  protected readonly label = "language.json";

  protected async generate() {
    const version = this.bedrockVersion;
    const file = langFile(version);
    if (!fs.existsSync(file)) {
      throw new Error(`language: ${file} not found; run downloadServers.ts for ${version}`);
    }

    // Parse exactly like minecraft-data's upstream extractor: trim the line, strip comments, then
    // split on "=" taking only the first two fields (so a value's leading space is kept and anything
    // after a second "=" is dropped — matching the published language.json byte-for-byte).
    const lang: Record<string, string> = {};
    for (const raw of fs.readFileSync(file, "utf8").toString().split("\n")) {
      const line = raw.trim().replace(/#.*$/g, "").trim();
      if (!line) continue;
      const [key, value] = line.split("=");
      if (value === undefined) continue;
      lang[key] = value;
    }

    this.publishJson("language.json", lang);
  }
}
