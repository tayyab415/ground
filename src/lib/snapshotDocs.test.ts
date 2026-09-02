import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncSnapshot } from "../../scripts/snapshot-docs.mjs";

describe("docs snapshot", () => {
  it("removes hashed assets that dist no longer produces", async () => {
    const root = await mkdtemp(join(tmpdir(), "ground-snap-"));
    const dist = join(root, "dist");
    const docs = join(root, "docs");
    await mkdir(join(dist, "assets"), { recursive: true });
    await mkdir(join(docs, "assets"), { recursive: true });
    await mkdir(join(docs, "mockups"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<html>new</html>");
    await writeFile(join(dist, "assets", "index-new.js"), "new");
    await writeFile(join(docs, "index.html"), "<html>old</html>");
    await writeFile(join(docs, "assets", "removed-z9y8.js"), "stale");
    await writeFile(join(docs, "gone.txt"), "should vanish");
    await writeFile(join(docs, "mockups", "desk.html"), "keep");
    await syncSnapshot(dist, docs, ["mockups", "verify"]);
    expect(await readFile(join(docs, "index.html"), "utf8")).toBe("<html>new</html>");
    expect(await readFile(join(docs, "assets", "index-new.js"), "utf8")).toBe("new");
    await expect(readFile(join(docs, "assets", "removed-z9y8.js"), "utf8")).rejects.toThrow();
    await expect(readFile(join(docs, "gone.txt"), "utf8")).rejects.toThrow();
    expect(await readFile(join(docs, "mockups", "desk.html"), "utf8")).toBe("keep");
  });
});
