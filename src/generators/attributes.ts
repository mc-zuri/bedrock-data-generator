import { strip, camel } from "../utils.ts";
import { Generator } from "./generator.ts";

export class AttributesGenerator extends Generator {
  protected readonly label = "attributes.json";

  protected async generate() {
    const packet = this.readJson(this.bedrockData("player_attributes.json"));

    const seen = new Set<string>();
    const attributes: any[] = [];
    for (const attr of packet.attributes ?? []) {
      const resource = strip(attr.name);
      if (seen.has(resource)) continue;
      seen.add(resource);
      attributes.push({
        // TODO: should we use java name?
        name: camel(resource),
        resource,
        default: attr.default,
        min: attr.min,
        max: attr.max,
      });
    }

    this.publishJson("attributes.json", attributes);
  }
}
