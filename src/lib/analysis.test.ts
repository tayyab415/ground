import { describe, expect, it } from "vitest";
import { finalizeNdviCoverage } from "./analysis";

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
