import url from "node:url";
import path from "node:path";

export function rootDir() {
  const __filename = url.fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), "..");
}

export function outputPath(...parts: string[]) {
  return path.resolve(rootDir(), "output", ...parts);
}

export function dataPath(...parts: string[]) {
  return path.resolve(rootDir(), "data", ...parts);
}

export function strip(key: string): string {
  return key?.replace("minecraft:", "").split("[")[0];
}

export function camel(name: string): string {
  return name
    .split(/[._]/)
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
}
