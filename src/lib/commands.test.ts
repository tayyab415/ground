import { afterEach, describe, expect, it } from "vitest";
import {
  apply_correction,
  export_decision,
  get_current_selection,
  get_open_evidence,
  get_workspace_state,
  highlight_uncertainty,
  open_evidence,
  preview_scenario,
  selectDistrict,
  show_candidates,
} from "./commands";
import { buildEvidence, rankDistricts, SNAPSHOT } from "./rank";
import { emptyWorkspace, replaceState } from "./store";
import { WEBMCP_TOOLS } from "./webmcp";

afterEach(() => {
  replaceState(emptyWorkspace());
});

describe("honesty", () => {
  it("never invents an NDVI number when Earth Engine is absent", () => {
    const ranked = rankDistricts({ ndvi: {} });
    expect(ranked.meta.ndviIncluded).toBe(false);
    expect(ranked.meta.droppedFactors.some((d) => d.id === "ndvi")).toBe(true);
    for (const c of ranked.candidates) {
      const ndvi = c.evidence.find((e) => e.id === "ndvi");
      expect(ndvi?.value).toBeNull();
      expect(ndvi?.status).toBe("gap");
      expect(ndvi?.usedInRanking).toBe(false);
      expect(String(ndvi?.display).toLowerCase()).toContain("gap");
    }
  });

  it("only uses NDVI when a sourced value is supplied", () => {
    const ranked = rankDistricts({
      ndvi: {
        gorakhpur: {
          value: 0.41,
          source: { name: "Google Earth Engine", note: "test fixture" },
          startDate: "2023-06-01",
          endDate: "2024-12-31",
        },
      },
    });
    expect(ranked.meta.ndviIncluded).toBe(true);
    const g = ranked.candidates.find((c) => c.districtId === "gorakhpur");
    expect(g?.evidence.find((e) => e.id === "ndvi")?.value).toBe(0.41);
    const other = ranked.candidates.find((c) => c.districtId === "ballia");
    expect(other?.evidence.find((e) => e.id === "ndvi")?.status).toBe("gap");
  });

  it("uses SoilGrids and elevation receipts, not mockup scores", () => {
    const g = buildEvidence("gorakhpur");
    const soil = g.find((e) => e.id === "soil");
    const elev = g.find((e) => e.id === "elevation");
    expect(soil?.status).toBe("ok");
    expect(elev?.value).toBe(SNAPSHOT.districts.gorakhpur?.elevation?.meters);
    expect(elev?.value).toBe(79);
    expect(soil?.source.name).toMatch(/SoilGrids/);
  });
});

describe("canal challenge", () => {
  it("ranks Gorakhpur first while the year-round canal prior is unverified", () => {
    const { candidates } = rankDistricts();
    expect(candidates[0]?.districtId).toBe("gorakhpur");
    const irrig = candidates[0]?.evidence.find((e) => e.id === "irrigation");
    expect(irrig?.status).toBe("unverified");
  });

  it("re-ranks when the canal is corrected to seasonal, with receipts", async () => {
    await show_candidates({ limit: 5 });
    const before = get_workspace_state();
    expect(before.candidates[0]?.districtId).toBe("gorakhpur");
    selectDistrict("gorakhpur");
    expect(get_current_selection().selection?.saved).toBe(false);

    const preview = preview_scenario({
      district: "gorakhpur",
      fact: "canal_irrigation",
      value: "seasonal",
    });
    expect(preview.ok).toBe(true);
    expect(get_workspace_state().candidates[0]?.districtId).toBe("gorakhpur");
    expect(get_workspace_state().unsavedChanges.scenarioPreview).toBeTruthy();

    const applied = apply_correction({
      district: "gorakhpur",
      value: "seasonal",
      note: "The canal here is seasonal, not year-round.",
    });
    expect(applied.ok).toBe(true);
    expect(applied.unsaved).toBe(true);
    const after = get_workspace_state();
    const g = after.candidates.find((c) => c.districtId === "gorakhpur");
    expect(g?.rank).toBeGreaterThan(1);
    expect(g?.previousRank).toBe(1);
    expect(after.candidates[0]?.districtId).not.toBe("gorakhpur");
    const irrig = after.candidates
      .find((c) => c.districtId === "gorakhpur")
      ?.gaps.includes("irrigation");
    const evidence = get_open_evidence();
    const irrigItem = evidence.evidence?.find((e) => e.id === "irrigation");
    expect(irrigItem?.status).toBe("corrected");
    expect(String(irrigItem?.display).toLowerCase()).toMatch(/seasonal/);
    expect(after.unsavedChanges.corrections.length).toBeGreaterThan(0);
    expect(irrig).toBeFalsy();
  });
});

describe("workspace commands", () => {
  it("exposes the same WebMCP tool names as the UI command layer", () => {
    expect(WEBMCP_TOOLS.map((t) => t.name)).toEqual([
      "get_workspace_state",
      "get_current_selection",
      "get_visible_map_state",
      "get_open_evidence",
      "show_candidates",
      "open_evidence",
      "highlight_uncertainty",
      "preview_scenario",
      "apply_correction",
      "export_decision",
    ]);
  });

  it("reads unsaved selection without persisting it", () => {
    selectDistrict("ballia");
    const sel = get_current_selection();
    expect(sel.selection?.districtId).toBe("ballia");
    expect(sel.selection?.saved).toBe(false);
    expect(get_workspace_state().unsavedChanges.selection?.districtId).toBe("ballia");
  });

  it("open_evidence and highlight_uncertainty share UI command behavior", async () => {
    await show_candidates();
    const opened = open_evidence({ district: "Gorakhpur" });
    expect("open" in opened && opened.open).toBe(true);
    if ("districtId" in opened) expect(opened.districtId).toBe("gorakhpur");
    const hl = highlight_uncertainty({ on: true });
    expect(hl.highlighted).toContain("gorakhpur");
  });

  it("export_decision includes sources, corrections, gaps, and a hash", async () => {
    await show_candidates();
    apply_correction({ district: "gorakhpur", value: "seasonal" });
    const record = await export_decision({ download: false });
    expect(record.reproducibilityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.corrections.length).toBeGreaterThan(0);
    expect(record.gaps.some((g) => g.toLowerCase().includes("ndvi"))).toBe(true);
    expect(record.sources.some((s) => s.name.includes("SoilGrids"))).toBe(true);
    expect(record.ranking.candidates[0]?.evidence.find((e) => e.id === "ndvi")?.status).toBe("gap");
  });
});
