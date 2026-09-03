import { describe, expect, it } from "vitest";
import { analysisConfigured, finalizeNdviCoverage, ndviFromPublicSnapshot } from "./analysis";
import { NDVI_EE_SNAPSHOT } from "./ndviSnapshot";
import { SNAPSHOT } from "./rank";

const sourced = (value: number) => ({
  value,
  source: { name: "Google Earth Engine" },
  startDate: "2023-06-01",
  endDate: "2024-12-31",
});

describe("finalizeNdviCoverage", () => {
  it("keeps sourced values but sets a gap when some requested districts are missing", () => {
    const ndvi = { gorakhpur: sourced(0.41) };
    const result = finalizeNdviCoverage(["gorakhpur", "ballia"], ndvi);
    expect(result.ndvi.gorakhpur?.value).toBe(0.41);
    expect(result.gap).not.toBeNull();
    expect(result.gap?.reason).toMatch(/partial ndvi/i);
    expect(result.gap?.reason).toMatch(/ballia/);
  });

  it("sets gap:null only when every requested id is present", () => {
    const ndvi = { gorakhpur: sourced(0.41), ballia: sourced(0.33) };
    const complete = finalizeNdviCoverage(["gorakhpur", "ballia"], ndvi);
    expect(complete.gap).toBeNull();
    expect(complete.ndvi.gorakhpur?.value).toBe(0.41);
    expect(complete.ndvi.ballia?.value).toBe(0.33);
  });

  it("does not invent values when the payload is empty", () => {
    const result = finalizeNdviCoverage(["gorakhpur"], {});
    expect(result.ndvi).toEqual({});
    expect(result.gap?.reason).toMatch(/no sourced ndvi/i);
  });
});

describe("public EE snapshot", () => {
  it("does not configure a sidecar URL in the public desk", () => {
    expect(analysisConfigured()).toBe(false);
    expect(String(import.meta.env.VITE_ANALYSIS_URL ?? "")).toBe("");
  });

  it("uses dated sourced means and does not invent Ambedkar Nagar or extra scores", () => {
    const ids = Object.keys(SNAPSHOT.districts);
    const result = ndviFromPublicSnapshot(ids);
    expect(result.ndvi.gorakhpur?.value).toBe(0.534);
    expect(result.ndvi.deoria?.value).toBe(0.557);
    expect(result.ndvi.kushinagar?.value).toBe(0.627);
    expect(result.ndvi.maharajganj?.value).toBe(0.691);
    expect(result.ndvi.basti?.value).toBe(0.588);
    expect(result.ndvi["sant-kabir-nagar"]?.value).toBe(0.555);
    expect(result.ndvi.siddharthnagar?.value).toBe(0.592);
    expect(result.ndvi.azamgarh?.value).toBe(0.504);
    expect(result.ndvi.mau?.value).toBe(0.521);
    expect(result.ndvi.ballia?.value).toBe(0.407);
    expect(result.ndvi.ghazipur?.value).toBe(0.449);
    expect(result.ndvi["ambedkar-nagar"]).toBeUndefined();
    expect(result.ndvi.jaunpur).toBeUndefined();
    expect(result.gap?.reason).toMatch(/ambedkar-nagar/);
    expect(result.ndvi.gorakhpur?.source.note).toMatch(/2026-07-29/);
    expect(SNAPSHOT.districts.jaunpur).toBeUndefined();
    expect(NDVI_EE_SNAPSHOT.notInCandidatePool.jaunpur).toBe(0.567);
    expect(NDVI_EE_SNAPSHOT.missingInCandidatePool).toContain("ambedkar-nagar");
  });
});
