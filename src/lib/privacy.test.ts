import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public desk privacy", () => {
  it("does not mint or embed a Maps JS key, sidecar URL, or token", () => {
    const files = [
      "src/ui/MapCanvas.tsx",
      "src/lib/analysis.ts",
      "src/lib/tiles.ts",
      "src/App.tsx",
      "src/main.tsx",
      ".env.example",
    ];
    const joined = files.map((f) => readFileSync(resolve(f), "utf8")).join("\n");
    expect(joined).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(joined).not.toMatch(/maps\.googleapis\.com\/maps\/api\/js/);
    expect(joined).not.toMatch(/GROUND_SIDECAR_TOKEN\s*=\s*[^S\n]/);
    expect(joined).not.toMatch(/https:\/\/[a-z0-9.-]*run\.app/);
    expect(readFileSync(resolve(".env.example"), "utf8")).toMatch(/VITE_ANALYSIS_URL=\s*$/m);
  });
});
