// Connects a bedrock-protocol client to a running BDS and writes the packets the generators need
// into data/bedrock/<version>/. This is the "connect and export data" half of the pipeline; server
// process management lives in external-server.ts.

import { createClient, type Version } from "bedrock-protocol";
import * as fs from "node:fs";
import * as path from "node:path";
import { dataPath } from "../utils.ts";
import { type ExternalServerInstance } from "./external-server.ts";

const CAPTURE_TIMEOUT_MS = 120_000;

// JSON.stringify can't serialise bigint (packet fields such as runtime ids may be bigint).
const toJson = (obj: any) => JSON.stringify(obj, (_k, v) => (typeof v?.valueOf?.() === "bigint" ? v.toString() : v), 2);

interface ExportDef {
  packet: string;
  file: string;
  /** payload to persist from the packet params */
  pick: (params: any) => any;
  minVersion?: string;
  maxVersion?: string;
}

// item_registry moved out of start_game into its own packet in 1.21.60.
const EXPORT_DEFS: ExportDef[] = [
  { packet: "start_game", file: "item_registry.json", pick: (p) => ({ itemstates: p.itemstates }), maxVersion: "1.21.50" },
  { packet: "item_registry", file: "item_registry.json", pick: (p) => p, minVersion: "1.21.60" },
  { packet: "crafting_data", file: "crafting_data.json", pick: (p) => p },
  { packet: "available_entity_identifiers", file: "available_entity_identifiers.json", pick: (p) => p },
  { packet: "biome_definition_list", file: "biome_definition_list.json", pick: (p) => p },
  { packet: "update_attributes", file: "player_attributes.json", pick: (p) => p },
];

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

function defsForVersion(version: string): ExportDef[] {
  return EXPORT_DEFS.filter((d) => (!d.minVersion || compareVersions(version, d.minVersion) >= 0) && (!d.maxVersion || compareVersions(version, d.maxVersion) <= 0));
}

/** True when every packet file this version needs already exists on disk. */
export function requiredFilesPresent(version: string): boolean {
  return defsForVersion(version).every((d) => fs.existsSync(dataPath("bedrock", version, d.file)));
}

export class PacketExporter {
  private readonly instance: ExternalServerInstance;

  constructor(instance: ExternalServerInstance) {
    this.instance = instance;
  }

  /** Connects, captures every required packet into data/bedrock/<version>/, returns the files written. */
  async export(): Promise<string[]> {
    const version = this.instance.mcDataVersion;
    const defs = defsForVersion(version);
    const outDir = dataPath("bedrock", version);
    fs.mkdirSync(outDir, { recursive: true });
    await this.capture(version, this.instance.serverPort, outDir, defs);
    return defs.map((d) => d.file);
  }

  /** Resolves once every required packet has been written (or rejects on timeout / client error). */
  private capture(version: string, port: number, outDir: string, defs: ExportDef[]): Promise<void> {
    const remaining = new Set(defs.map((d) => d.packet));
    const byPacket = new Map(defs.map((d) => [d.packet, d]));

    return new Promise<void>((resolve, reject) => {
      const client = createClient({
        host: "127.0.0.1",
        port,
        version: version as Version,
        username: "ex",
        offline: true,
        skipPing: true,
      });

      const timer = setTimeout(() => {
        client.close();
        reject(new Error(`timeout; missing packets: ${[...remaining].join(", ")}`));
      }, CAPTURE_TIMEOUT_MS);

      const finish = (err?: Error) => {
        clearTimeout(timer);
        client.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      client.on("error", (err: any) => finish(err instanceof Error ? err : new Error(String(err))));

      client.on("packet", ({ data: { name, params } }: any) => {
        const def = byPacket.get(name);
        if (!def || !remaining.has(name)) return;
        try {
          fs.writeFileSync(path.join(outDir, def.file), toJson(def.pick(params)));
          remaining.delete(name);
          if (remaining.size === 0) finish();
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }
}
