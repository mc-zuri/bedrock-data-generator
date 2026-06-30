// worker_threads entry: runs extract() for one version per message. The generators are CPU-bound
// (JSON/NBT parse + transform + stringify), and each version is independent (writes only its own
// output/<ver> dirs), so distributing versions across threads gives real multi-core speedup —
// unlike an async pool, which would just time-slice the single main thread.

import { parentPort } from "node:worker_threads";
import { extract } from "./extract.ts";

if (!parentPort) throw new Error("extractWorker must be run as a worker_thread");

parentPort.on("message", async (task: [string, string, string?] | "stop") => {
  if (task === "stop") {
    parentPort!.close();
    return;
  }
  const [bedrockVersion, javaVersion, javaItemsVersion] = task;
  await extract(bedrockVersion, javaVersion, javaItemsVersion); // extract() logs/swallows its own errors
  parentPort!.postMessage("done");
});
