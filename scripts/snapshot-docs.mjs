#!/usr/bin/env node
/**
 * Copy the Vite dist into /docs for GitHub Pages (branch source: /docs)
 * and githack preview. Preserves docs/mockups and docs/verify.
 * GitHub Pages will not serve /site.
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const dist = "dist";
const docs = "docs";
const preserve = new Set(["mockups", "verify"]);

const entries = await readdir(dist, { withFileTypes: true });
await mkdir(docs, { recursive: true });
for (const entry of entries) {
  if (preserve.has(entry.name)) continue;
  const dest = join(docs, entry.name);
  await rm(dest, { recursive: true, force: true });
  await cp(join(dist, entry.name), dest, { recursive: true });
}
console.log(`Copied ${entries.length} dist entries into ${docs}/ (kept ${[...preserve].join(", ")}).`);
