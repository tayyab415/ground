import { describe, expect, it } from "vitest";
import { resolveTileHealth } from "./tiles";

describe("resolveTileHealth", () => {
  it("does not treat a single tileerror as a persistent gap", () => {
    expect(resolveTileHealth(0, 1, "tileerror")).toBeNull();
    expect(resolveTileHealth(8, 1, "tileerror")).toBeNull();
    expect(resolveTileHealth(8, 1, "load")).toBe("ok");
  });

  it("clears a gap when a tile loads", () => {
    expect(resolveTileHealth(1, 4, "tileload")).toBe("ok");
    expect(resolveTileHealth(4, 2, "load")).toBe("ok");
  });

  it("marks gap only after a full layer load with zero successes", () => {
    expect(resolveTileHealth(0, 6, "load")).toBe("gap");
    expect(resolveTileHealth(0, 0, "load")).toBe("ok");
  });
});
