// Connects a bedrock-protocol client to a running BDS and writes the packets the generators need
// into data/bedrock/<version>/. This is the "connect and export data" half of the pipeline; server
// process management lives in external-server.ts.

import { createClient, type Version } from "bedrock-protocol";
import * as fs from "node:fs";
import * as path from "node:path";
import { dataPath } from "../utils.ts";
import { type ExternalServerInstance } from "./external-server.ts";

const CAPTURE_TIMEOUT_MS = 120_000;

// DeviceOS must be one the server still accepts. 1.26.43 added an allow-list to the
// ConnectionRequest check - rejecting the retired platforms: 0 Unknown,
// 5 GearVR, 6 Hololens, 7 Win10, 10 TVOS, 14 WindowsPhone. bedrock-protocol defaults to 7, so from
// 1.26.43 on the server refuses the login with "Connection Request invalid." and NO local decode
// error, which surfaces as a bare capture timeout. 8 (Win32) is accepted; so are 1-4, 9, 11-13, 15.
const loginClientData = { skinData: { DeviceOS: 8 } };

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
        ...loginClientData,
      });

      let settled = false;
      const decodeFailures = new Set<string>();

      const closeQuietly = () => {
        // close() calls removeAllListeners(), but packets already queued can still fail to decode
        // afterwards — and an 'error' with no listener takes the whole process down. Re-arm a no-op.
        client.close();
        client.on("error", () => {});
      };

      const timer = setTimeout(() => {
        settled = true;
        closeQuietly();
        reject(new Error(`timeout; missing packets: ${[...remaining].join(", ")}`));
      }, CAPTURE_TIMEOUT_MS);

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeQuietly();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      // A new build can change the shape of packets we do NOT consume, and killing the capture over
      // one of those loses every packet we do need. 1.26.40's start_game is exactly that case. Record
      // the failure and keep going; the timeout above is the real "we never got it" signal.
      client.on("error", (err: any) => {
        const e = err instanceof Error ? err : new Error(String(err));
        const where = /at Object\.(packet_\w+)/.exec(e.stack ?? "")?.[1] ?? "unknown";
        if (!decodeFailures.has(where)) {
          decodeFailures.add(where);
          console.log(`  [decode-failure] ${version} ${where}: ${e.message.split("\n")[0]}`);
        }
      });

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
