#!/usr/bin/env node
/**
 * Copy Vite dist into /docs for a committed preview (githack, local static
 * files). Preserves docs/mockups and docs/verify. Removes leftover hashed
 * assets that dist no longer produces.
 * The live site is the Actions-built dist, not this folder.
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PRESERVE = ["mockups", "verify"];

export async function syncSnapshot(dist, docs, preserveList = DEFAULT_PRESERVE) {
  const preserve = new Set(preserveList);
  const distEntries = await readdir(dist, { withFileTypes: true });
  const distNames = new Set(distEntries.map((e) => e.name));
  await mkdir(docs, { recursive: true });
  const docsEntries = await readdir(docs, { withFileTypes: true });
  for (const entry of docsEntries) {
    if (preserve.has(entry.name)) continue;
    if (!distNames.has(entry.name)) {
      await rm(joinSafe(docs, entry.name), { recursive: true, force: true });
    }
  }
  for (const entry of distEntries) {
    if (preserve.has(entry.name)) continue;
    const dest = joinSafe(docs, entry.name);
    await rm(dest, { recursive: true, force: true });
    await cp(joinSafe(dist, entry.name), dest, { recursive: true });
  }
  return { copied: distEntries.length, preserved: [...preserve] };
}

function joinSafe(root, name) {
  return `${root.replace(/\/$/, "")}/${name}`;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  const result = await syncSnapshot("dist", "docs");
  console.log(`Copied ${result.copied} dist entries into docs/ (kept ${result.preserved.join(", ")}).`);
}
