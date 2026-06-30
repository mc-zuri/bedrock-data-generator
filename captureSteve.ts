import { Relay } from "bedrock-protocol";
import fs from "node:fs";
import path from "node:path";
import { ExternalServer } from "./src/server/external-server.ts";
import { versions } from "./src/versions.ts";
import { normalizeSteveSkin } from "./src/steve-normalize.ts";

const rootDir = import.meta.dirname;

const SKIN_KEYS = [
  "AnimatedImageData",
  "ArmSize",
  "CapeData",
  "CapeId",
  "CapeImageHeight",
  "CapeImageWidth",
  "CapeOnClassicSkin",
  "PersonaPieces",
  "PersonaSkin",
  "PieceTintColors",
  "PremiumSkin",
  "SkinAnimationData",
  "SkinColor",
  "SkinData",
  "SkinGeometryData",
  "SkinGeometryDataEngineVersion",
  "SkinId",
  "SkinImageHeight",
  "SkinImageWidth",
  "SkinResourcePatch",
];
const pickSkin = (o: any) => Object.fromEntries(SKIN_KEYS.filter((k) => k in o).map((k) => [k, o[k]]));

const arg = (name: string, def: string) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));

  if (!a) {
    throw new Error(`missing --${name}= parameter`);
  }

  return a.slice(name.length + 3);
};

async function main() {
  const version = arg("version", "1.26.20");
  const port = Number(arg("port", "19150"));
  const steveFile = path.join(rootDir, "data", "bedrock", version, "steve.json");

  if (fs.existsSync(steveFile)) {
    console.log(`steve.json already present for ${version} (${steveFile}); nothing to capture. Delete it to re-capture.`);
    return;
  }

  console.log(`Starting BDS ${version} ...`);
  const serverVersion = versions.find((v) => v.mcDataVersion === version)?.serverVersion ?? version;
  const server = await ExternalServer.startExternalServer({ rootDir, mcDataVersion: version, serverVersion });
  console.log(`BDS ready on port ${server.serverPort}.`);

  const relay = new Relay({
    version,
    host: "0.0.0.0",
    port,
    offline: true,
    username: "McZuri5840",
    profilesFolder: "C:/git/profiles",
    destination: { host: "127.0.0.1", port: server.serverPort, offline: true },
  } as any);

  let captured = false;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a client to connect")), 300_000);

    relay.on("connect", (player: any) => {
      console.log("Client connected to relay — waiting for login...");
      player.on("login", () => {
        if (captured) return;
        const skin = player.skinData;
        if (!skin) {
          console.warn("login received but player.skinData was empty");
          return;
        }
        fs.mkdirSync(path.dirname(steveFile), { recursive: true });
        fs.writeFileSync(steveFile, JSON.stringify(normalizeSteveSkin(pickSkin(skin)), null, 2));
        captured = true;
        clearTimeout(timer);
        console.log(`✓ captured skin (SkinId=${skin.SkinId}) -> ${steveFile}`);
        resolve();
      });
    });

    relay.listen();
    console.log(`Relay listening on 127.0.0.1:${port}  ->  127.0.0.1:${server.serverPort} (BDS ${version})`);
    console.log(`In Minecraft ${version}: add server 127.0.0.1:${port} and connect once.`);
  });

  await relay.close();
  await server.stop();
  console.log(`Done. ${steveFile} is ready to commit.`);
}

await main();
