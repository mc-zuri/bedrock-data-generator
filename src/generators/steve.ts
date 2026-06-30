import fs from "node:fs";
import { Generator } from "./generator.ts";

export class SteveGenerator extends Generator {
  protected readonly label = "steve.json";

  protected async generate() {
    const steveFile = this.bedrockData("steve.json");
    if (!fs.existsSync(steveFile)) {
      throw new Error(`    ⚠ skip steve.json for ${this.bedrockVersion}: ${steveFile} not captured yet (run captureSteve.ts --version=${this.bedrockVersion})`);
    }
    this.publish("steve.json", JSON.stringify(JSON.parse(fs.readFileSync(steveFile, "utf8"))));
  }
}
