import { spawn, spawnSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as bedrockServer from "minecraft-bedrock-server";
import { versions } from "../versions.ts";
import { rootDir } from "../utils.ts";
import { cpus } from "os";
import { PacketExporter, requiredFilesPresent } from "./packet-exporter.ts";

const MAX_OUTPUT_BUFFER_SIZE = 100;

export interface ExternalServerOptions {
  "server-name"?: string;
  gamemode?: "survival";
  "force-gamemode"?: boolean;
  "player-rewind-min-correction-delay-ticks"?: number;
  difficulty?: "easy";
  "allow-cheats"?: boolean;
  "max-players"?: number;
  "online-mode"?: boolean;
  "allow-list"?: boolean;
  "server-port"?: number;
  "server-portv6"?: number;
  "enable-lan-visibility"?: boolean;
  "view-distance"?: number;
  "tick-distance"?: number;
  "player-idle-timeout"?: number;
  "allow-player-joining"?: boolean;
  "max-threads"?: number;
  "level-name"?: string;
  "level-seed"?: string;
  "default-player-permission-level"?: "member" | "operator";
  "texturepack-required"?: boolean;
  "content-log-file-enabled"?: boolean;
  "content-log-console-output-enabled"?: boolean;
  "content-log-level"?: "info" | "verbose";
  "compression-threshold"?: number;
  "compression-algorithm"?: "zlib";
  "server-authoritative-movement-strict"?: boolean;
  "server-authoritative-dismount-strict"?: boolean;
  "server-authoritative-entity-interactions-strict"?: boolean;
  "player-position-acceptance-threshold"?: number;
  "player-movement-action-direction-threshold"?: number;
  "server-authoritative-block-breaking-pick-range-scalar"?: number;
  "chat-restriction"?: "None";
  "disable-player-interaction"?: boolean;
  "client-side-chunk-generation-enabled"?: boolean;
  "block-network-ids-are-hashes"?: boolean;
  "disable-persona"?: boolean;
  "disable-custom-skins"?: boolean;
  "server-build-radius-ratio"?: "Disabled";
  "allow-outbound-script-debugging"?: boolean;
  "allow-inbound-script-debugging"?: boolean;
  "force-inbound-debug-port"?: number;
  "script-debugger-auto-attach"?: "disabled";
  "script-debugger-auto-attach-connect-address"?: string;
  "script-debugger-auto-attach-timeout"?: number;
  "script-debugger-passcode"?: string;
  "script-watchdog-enable"?: boolean;
  "script-watchdog-enable-exception-handling"?: boolean;
  "script-watchdog-enable-shutdown"?: boolean;
  "script-watchdog-hang-exception"?: boolean;
  "script-watchdog-hang-threshold"?: number;
  "script-watchdog-spike-threshold"?: number;
  "script-watchdog-slow-threshold"?: number;
  "script-watchdog-memory-warning"?: number;
  "script-watchdog-memory-limit"?: number;
  "diagnostics-capture-auto-start"?: boolean;
  "diagnostics-capture-max-files"?: number;
  "diagnostics-capture-max-file-size"?: number;
  "disable-client-vibrant-visuals"?: boolean;
  "sentry-rate-limit-window"?: number;
  "sentry-max-events-per-window"?: number;
  "enable-profiler"?: boolean;
  "enable-editor-network-metrics"?: boolean;
  "player-rewind-history-size-ticks"?: number;
}

export const defaultExternalServerOptions: ExternalServerOptions = {
  "level-name": "world",
  gamemode: "survival",
  difficulty: "easy",
  "allow-cheats": true,
  "online-mode": false,
  "enable-lan-visibility": false,
  "default-player-permission-level": "operator",
  "content-log-file-enabled": true,
  "content-log-level": "verbose",
  "player-movement-action-direction-threshold": 0,
  "client-side-chunk-generation-enabled": false,
  "player-position-acceptance-threshold": 1000,
  "player-rewind-min-correction-delay-ticks": 10000,
  "player-rewind-history-size-ticks": 40,
  "allow-list": false,
} as const;

export interface ExternalServerInstance {
  mcDataVersion: string;
  serverVersion: string;
  pid: number | undefined;
  serverPort: number;
  serverPortV6: number;
  stop(): Promise<void>;
  sendCommand(command: string): Promise<void>;
  waitForOutput(pattern: RegExp, timeout?: number): Promise<string>;
  dataDir: string;
}

export class ExternalServer {
  static async ensureInstalled({ rootDir, mcDataVersion, serverVersion }: { rootDir: string; mcDataVersion: string; serverVersion: string }) {
    const { serverExePath, serverDir, lockFile } = ExternalServer.resolvePaths(rootDir, mcDataVersion, serverVersion);

    if (fs.existsSync(serverExePath)) {
      return;
    }

    fs.mkdirSync(path.normalize(serverDir), { recursive: true });
    try {
      fs.writeFileSync(lockFile, `downloading at ${new Date().toISOString()}`);
      await bedrockServer.downloadServer(serverVersion, {
        root: path.normalize(serverDir),
        path: serverDir,
        platform: os.platform() === "win32" ? "win32" : "linux",
      });
    } finally {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    }
  }

  static updateServerProperties({ rootDir, mcDataVersion, serverVersion }: { rootDir: string; mcDataVersion: string; serverVersion: string }, updates: ExternalServerOptions) {
    const { serverPropsPath } = ExternalServer.resolvePaths(rootDir, mcDataVersion, serverVersion);

    if (!fs.existsSync(serverPropsPath)) {
      throw new Error(`server.properties not found at ${serverPropsPath}. Is BDS installed correctly?`);
    }

    let content = fs.readFileSync(serverPropsPath, "utf8");

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      const newLine = `${key}=${value}`;
      if (regex.test(content)) {
        content = content.replace(regex, newLine);
      } else {
        content += `\n${newLine}`;
      }
    }
    fs.writeFileSync(serverPropsPath, content);
  }

  static async startExternalServer({ rootDir, mcDataVersion, serverVersion }: { rootDir: string; mcDataVersion: string; serverVersion: string }): Promise<ExternalServerInstance> {
    const { serverExePath, serverDir, serverPropsPath, dataDir } = ExternalServer.resolvePaths(rootDir, mcDataVersion, serverVersion);
    if (!fs.existsSync(serverExePath)) {
      throw new Error(`BDS executable not found at: ${serverExePath}. Set autoDownload: true to auto-download.`);
    }

    const { serverPort, serverPortV6 } = ExternalServer.readServerPorts(serverPropsPath);

    const outputBuffer: string[] = [];
    const outputListeners: Array<{
      pattern: RegExp;
      resolve: (match: string) => void;
      reject: (err: Error) => void;
    }> = [];

    const handle: ChildProcess = spawn(serverExePath, [], {
      cwd: serverDir,
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });

    handle.stdin?.on("error", () => {});

    handle.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();

      let consumed = false;
      for (let i = outputListeners.length - 1; i >= 0; i--) {
        const listener = outputListeners[i];
        if (listener.pattern.test(text)) {
          outputListeners.splice(i, 1);
          listener.resolve(text);
          consumed = true;
        }
      }

      if (!consumed) {
        outputBuffer.push(text);
        if (outputBuffer.length > MAX_OUTPUT_BUFFER_SIZE) {
          outputBuffer.shift();
        }
      }
    });

    handle.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data.toString());
    });

    fs.mkdirSync(path.normalize(dataDir), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Kill the orphan before rejecting — a server that never reports ready
        // would otherwise keep holding its port and crash every later boot.
        forceKillProcess(handle);
        reject(new Error(`Server did not start within ${90_000}ms`));
      }, 200_000);

      const checkReady = (data: Buffer) => {
        const text = data.toString();
        if (text.includes("Server started") || text.includes("IPv4 supported")) {
          clearTimeout(timer);
          handle.stdout?.off("data", checkReady);
          setTimeout(() => resolve(), 500);
        }
      };

      handle.stdout?.on("data", checkReady);

      handle.on("error", (err) => {
        clearTimeout(timer);
        forceKillProcess(handle);
        reject(err);
      });

      handle.on("exit", (code) => {
        if (code !== 0) {
          clearTimeout(timer);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });

    const externalServer: ExternalServerInstance = {
      mcDataVersion,
      serverVersion,
      pid: handle.pid,
      serverPort,
      serverPortV6,
      dataDir,

      async stop(): Promise<void> {
        return new Promise((resolve) => {
          if (handle.exitCode !== null) {
            resolve();
            return;
          }

          if (handle.stdin?.writable) handle.stdin.write("stop\n");

          const timer = setTimeout(() => {
            forceKillProcess(handle);
            resolve();
          }, 5000);

          handle.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      },
      async sendCommand(command: string): Promise<void> {
        if (!handle.stdin) {
          throw new Error("Server stdin not available");
        }
        handle.stdin.write(command + "\n");
      },

      async waitForOutput(pattern: RegExp, timeout = 5000): Promise<string> {
        for (let i = 0; i < outputBuffer.length; i++) {
          if (pattern.test(outputBuffer[i])) {
            const match = outputBuffer[i];
            outputBuffer.splice(i, 1);
            return match;
          }
        }

        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            const idx = outputListeners.findIndex((l) => l.resolve === resolve);
            if (idx !== -1) outputListeners.splice(idx, 1);
            reject(new Error(`Timeout waiting for pattern: ${pattern}`));
          }, timeout);

          outputListeners.push({
            pattern,
            resolve: (match) => {
              clearTimeout(timer);
              resolve(match);
            },
            reject: (err) => {
              clearTimeout(timer);
              reject(err);
            },
          });
        });
      },
    };

    return externalServer;
  }

  private static resolvePaths(rootDir: string, mcDataVersion: string, serverVersion: string) {
    const isWindows = os.platform() === "win32";
    const serverExecutable = isWindows ? "bedrock_server.exe" : "bedrock_server";
    const serverPlugin = isWindows ? "bdx_plugin.exe" : "bdx_plugin";
    const serverDir = path.join(rootDir, "servers", mcDataVersion);
    const serverExePath = path.join(serverDir, serverExecutable);
    const serverPropsPath = path.join(serverDir, "server.properties");
    const serverPluginPath = path.join(rootDir, "projects/cpp/build/windows/x64/release", serverPlugin);
    const lockFile = path.join(path.normalize(serverDir), `.bds-download-${mcDataVersion}-${serverVersion}.lock`);
    const dataDir = path.join(rootDir, "data", "bedrock", mcDataVersion);

    return { serverExePath, serverDir, lockFile, serverPropsPath, dataDir, serverPluginPath };
  }

  private static readServerPorts(serverPropsPath: string): { serverPort: number; serverPortV6: number } {
    const readPort = (content: string, key: string): number | undefined => {
      const match = content.match(new RegExp(`^${key}=(\\d+)$`, "m"));
      if (!match) return undefined;
      const port = Number(match[1]);
      return Number.isInteger(port) ? port : undefined;
    };

    if (!fs.existsSync(serverPropsPath)) {
      throw new Error();
    }

    const content = fs.readFileSync(serverPropsPath, "utf8");
    return {
      serverPort: readPort(content, "server-port")!,
      serverPortV6: readPort(content, "server-portv6")!,
    };
  }
}

function forceKillProcess(proc: ChildProcess): void {
  if (!proc.pid) return;
  if (os.platform() === "win32") {
    spawnSync("taskkill", ["/pid", proc.pid.toString(), "/f", "/t"], { stdio: "ignore" });
  } else {
    proc.kill("SIGKILL");
  }
}

export async function setupBedrockServers() {
  let port = 41032;
  for (const { mcDataVersion, serverVersion } of versions) {
    await ExternalServer.ensureInstalled({ rootDir: rootDir(), mcDataVersion, serverVersion });
    ExternalServer.updateServerProperties(
      { rootDir: rootDir(), mcDataVersion, serverVersion },
      {
        ...defaultExternalServerOptions,
        "server-port": port++,
        "server-portv6": port++,
      }
    );
  }
  console.info("servers configured");
}

export async function exportNetworkData({ concurency = cpus().length } = {}): Promise<{ failed: string[] }> {
  const pending = versions.filter((v) => !requiredFilesPresent(v.mcDataVersion));
  const failed: string[] = [];
  let cursor = 0;

  async function worker(workerId: number) {
    while (cursor < pending.length) {
      const { mcDataVersion, serverVersion } = pending[cursor++];
      let instance: ExternalServerInstance | undefined;
      try {
        instance = await ExternalServer.startExternalServer({ rootDir: rootDir(), mcDataVersion, serverVersion });
        const files = await new PacketExporter(instance).export();
        console.log(`✓ [w${workerId}] ${mcDataVersion} -> ${files.join(", ")}`);
      } catch (e) {
        failed.push(mcDataVersion);
        console.error(`✗ [w${workerId}] ${mcDataVersion}: ${e instanceof Error ? e.message : e}`);
      } finally {
        await instance?.stop();
      }
    }
  }

  const workers = Math.min(concurency, pending.length) || 1;
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));

  console.log(`packet data exported: ${pending.length - failed.length}/${pending.length}`);
  if (failed.length) console.error(`failed: ${failed.join(", ")}`);
  return { failed };
}
