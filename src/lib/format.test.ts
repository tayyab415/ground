import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { averageMetrics, choroplethMode, districtFill } from "./format";
import { rankDistricts, SNAPSHOT } from "./rank";

describe("map fill", () => {
  it("does not use rank color for the NDVI layer", () => {
    expect(choroplethMode({ districts: true, ndvi: true, soil: true, elevation: true, mills: true, roads: false })).toBe(
      "ndvi",
    );
    const ranked = rankDistricts();
    const g = ranked.candidates.find((c) => c.districtId === "gorakhpur");
    const ndviFill = districtFill("ndvi", g);
    const rankFill = districtFill("rank", g);
    expect(ndviFill).toBe("#cbd5e1");
    expect(ndviFill).not.toBe(rankFill);
    expect(choroplethMode({ districts: true, ndvi: false, soil: true, elevation: false, mills: false, roads: false })).toBe(
      "soil",
    );
    expect(choroplethMode({ districts: true, ndvi: false, soil: false, elevation: true, mills: false, roads: false })).toBe(
      "elevation",
    );
  });
});

describe("averages", () => {
  it("shows Gap when NDVI is not included, and the sourced mean when it is", () => {
    const gap = averageMetrics(rankDistricts().candidates.slice(0, 3), false);
    expect(gap.ndvi).toBe("Gap");
    expect(gap.ndviBar).toBe(0);
    const ndvi = Object.fromEntries(
      Object.keys(SNAPSHOT.districts).map((id) => [
        id,
        {
          value: 0.4,
          source: { name: "Google Earth Engine" },
          startDate: "2023-06-01",
          endDate: "2024-12-31",
        },
      ]),
    );
    const ranked = rankDistricts({ ndvi });
    const avg = averageMetrics(ranked.candidates.slice(0, 3), ranked.meta.ndviIncluded);
    expect(ranked.meta.ndviIncluded).toBe(true);
    expect(avg.ndvi).toBe("0.40");
    expect(avg.ndviBar).toBeGreaterThan(0);
  });
});

describe("sidecar is private", () => {
  it("rejects unauthenticated compute and does not CORS-open the app", () => {
    const src = readFileSync(resolve("server/app.py"), "utf8");
    expect(src).not.toMatch(/CORS\(\s*app\s*\)/);
    expect(src).toMatch(/GROUND_SIDECAR_TOKEN/);
    expect(src).toMatch(/require_sidecar_auth/);
    expect(src).toMatch(/401/);
  });
});
