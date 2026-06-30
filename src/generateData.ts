// Generates minecraft-data output for every version in versions.ts, distributing versions across
// worker threads (one version per task). The generators are CPU-bound, so real threads give multi-core
// speedup; each worker pulls the next version when it finishes, so the pool stays saturated.

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { versions } from "./versions.ts";
import { cpus } from "os";

type Task = [string, string, string];

export async function generateData({ concurency = cpus().length } = {}): Promise<void> {
  const tasks: Task[] = versions.filter((v) => v.mappings).map((v) => [v.mcDataVersion, v.javaVersion, v.javaItemsVersion ?? v.javaVersion]);
  let cursor = 0;

  const runWorker = () =>
    new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL("./extractWorker.ts", import.meta.url));
      const next = () => {
        if (cursor >= tasks.length) {
          worker.postMessage("stop");
          return;
        }
        worker.postMessage(tasks[cursor++]);
      };
      worker.on("message", (msg) => {
        if (msg === "done") next();
      });
      worker.on("error", reject);
      worker.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited with code ${code}`))));
      next();
    });

  const workers = Math.min(concurency, tasks.length) || 1;
  await Promise.all(Array.from({ length: workers }, runWorker));
  console.log(`generated ${tasks.length} versions`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await generateData();
}
