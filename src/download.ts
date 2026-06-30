// Small HTTP / GitHub download util. Network transport only — no domain knowledge.

const RAW = "https://raw.githubusercontent.com";

/** Fetches a URL as bytes; throws on any non-2xx. */
export async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Like download(), but returns null on 404 — for optional resources that may not exist. */
export async function tryDownload(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Builds a raw file URL for `path` on `repo` (e.g. "GeyserMC/mappings") at a ref/commit. */
export function githubRaw(repo: string, ref: string, path: string): string {
  return `${RAW}/${repo}/${ref}/${path}`;
}
