import { afterEach, describe, expect, it } from "vitest";
import {
  apply_correction,
  approve_evidence,
  approveDecision,
  chooseScenario,
  commit_preview,
  export_decision,
  get_current_selection,
  get_open_evidence,
  get_unsaved_changes,
  get_workspace_state,
  highlight_uncertainty,
  open_evidence,
  preview_scenario,
  selectDistrict,
  send_ground_check,
  setDrawnSelection,
  show_candidates,
  submit_field_reply,
} from "./commands";
import { buildEvidence, rankDistricts, SNAPSHOT } from "./rank";
import { emptyWorkspace, getState, patchState, replaceState } from "./store";
import { WEBMCP_TOOLS } from "./webmcp";

afterEach(() => {
  replaceState(emptyWorkspace());
  localStorage.clear();
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

  it("does not use partial NDVI as a global factor (no zero-penalty)", () => {
    const without = rankDistricts({ ndvi: {} });
    const partial = rankDistricts({
      ndvi: {
        gorakhpur: {
          value: 0.41,
          source: { name: "Google Earth Engine", note: "test fixture" },
          startDate: "2023-06-01",
          endDate: "2024-12-31",
        },
      },
    });
    expect(partial.meta.ndviIncluded).toBe(false);
    expect(partial.meta.droppedFactors.some((d) => d.id === "ndvi")).toBe(true);
    const g = partial.candidates.find((c) => c.districtId === "gorakhpur");
    const ndvi = g?.evidence.find((e) => e.id === "ndvi");
    expect(ndvi?.value).toBe(0.41);
    expect(ndvi?.usedInRanking).toBe(false);
    const ballia = partial.candidates.find((c) => c.districtId === "ballia");
    expect(ballia?.evidence.find((e) => e.id === "ndvi")?.status).toBe("gap");
    const g0 = without.candidates.find((c) => c.districtId === "gorakhpur")?.score;
    const b0 = without.candidates.find((c) => c.districtId === "ballia")?.score;
    const g1 = g?.score;
    const b1 = ballia?.score;
    expect(g0).toBeDefined();
    expect(b0).toBeDefined();
    expect(g1).toBeCloseTo(g0 as number, 5);
    expect(b1).toBeCloseTo(b0 as number, 5);
  });

  it("includes NDVI in ranking only when every district has a sourced value", () => {
    const ndvi = Object.fromEntries(
      Object.keys(SNAPSHOT.districts).map((id) => [
        id,
        {
          value: id === "gorakhpur" ? 0.41 : 0.3,
          source: { name: "Google Earth Engine", note: "complete fixture" },
          startDate: "2023-06-01",
          endDate: "2024-12-31",
        },
      ]),
    );
    const ranked = rankDistricts({ ndvi });
    expect(ranked.meta.ndviIncluded).toBe(true);
    expect(ranked.candidates[0]?.evidence.find((e) => e.id === "ndvi")?.usedInRanking).toBe(true);
    expect(ranked.candidates.every((c) => c.evidence.find((e) => e.id === "ndvi")?.status === "ok")).toBe(
      true,
    );
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
    expect(after.unsavedChanges.corrections[0]?.from).toBe("perennial_canal_assumed");
    expect(after.unsavedChanges.corrections[0]?.to).toBe("seasonal_canal");
    expect(irrig).toBeFalsy();
  });

  it("honors year-round corrections and refuses a no-op record", async () => {
    await show_candidates();
    const seasonal = apply_correction({ district: "Kushinagar", value: "year-round" });
    expect(seasonal.ok).toBe(true);
    const k = getState().candidates.find((c) => c.districtId === "kushinagar");
    expect(k?.evidence.find((e) => e.id === "irrigation")?.value).toBe("perennial_canal_assumed");
    expect(get_workspace_state().unsavedChanges.corrections.at(-1)?.from).toBe("seasonal_canal");
    const noop = apply_correction({ district: "gorakhpur", value: "year-round" });
    expect(noop.ok).toBe(false);
    expect(String(noop.error)).toMatch(/no-op/i);
  });
});

describe("workspace commands", () => {
  it("exposes the same WebMCP tool names as the UI command layer", () => {
    expect(WEBMCP_TOOLS.map((t) => t.name)).toEqual([
      "get_workspace_state",
      "get_current_selection",
      "get_visible_map_state",
      "get_open_evidence",
      "get_unsaved_changes",
      "show_candidates",
      "open_evidence",
      "highlight_uncertainty",
      "preview_scenario",
      "apply_correction",
      "export_decision",
      "send_ground_check",
      "approve_evidence",
    ]);
  });

  it("reads unsaved selection without persisting it", () => {
    selectDistrict("ballia");
    const sel = get_current_selection();
    expect(sel.selection?.districtId).toBe("ballia");
    expect(sel.selection?.saved).toBe(false);
    expect(get_workspace_state().unsavedChanges.selection?.districtId).toBe("ballia");
  });

  it("exposes unsaved selection and corrections only through get_unsaved_changes", async () => {
    const empty = get_unsaved_changes();
    expect(empty.selection).toBeNull();
    expect(empty.corrections).toEqual([]);
    expect(empty.note).toMatch(/WebMCP/i);
    selectDistrict("ballia");
    await show_candidates();
    apply_correction({ district: "gorakhpur", value: "seasonal" });
    const unsaved = get_unsaved_changes();
    expect(unsaved.selection?.districtId).toBe("ballia");
    expect(unsaved.selection?.saved).toBe(false);
    expect(unsaved.corrections).toHaveLength(1);
    expect(unsaved.corrections[0]?.districtId).toBe("gorakhpur");
    expect(unsaved.corrections[0]?.committed).toBe(false);
    const tool = WEBMCP_TOOLS.find((t) => t.name === "get_unsaved_changes");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    const viaTool = tool!.execute({});
    expect(viaTool).toEqual(unsaved);
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
    const gNdvi = record.ranking.candidates
      .find((c) => c.districtId === "gorakhpur")
      ?.evidence.find((e) => e.id === "ndvi");
    expect(gNdvi?.status).toBe("ok");
    expect(gNdvi?.value).toBe(0.534);
    expect(gNdvi?.usedInRanking).toBe(false);
    const aNdvi = record.ranking.candidates
      .find((c) => c.districtId === "ambedkar-nagar")
      ?.evidence.find((e) => e.id === "ndvi");
    expect(aNdvi?.status).toBe("gap");
    expect(aNdvi?.value).toBeNull();
  });

  it("resolves apply_correction against SNAPSHOT and errors on unknown districts", async () => {
    await show_candidates();
    selectDistrict("ballia");
    const unknown = apply_correction({ district: "not-a-district", value: "seasonal" });
    expect(unknown.ok).toBe(false);
    expect(String(unknown.error)).toMatch(/unknown district/i);
    expect(get_workspace_state().unsavedChanges.corrections.length).toBe(0);
    expect(get_workspace_state().unsavedChanges.selection?.districtId).toBe("ballia");
  });

  it("does not default preview_scenario to a seasonal Gorakhpur canal", async () => {
    await show_candidates();
    const preview = preview_scenario({ scenario: "low_risk" });
    expect(preview.ok).toBe(true);
    if ("preview" in preview && preview.preview) {
      expect(preview.preview.correction).toBeUndefined();
      expect(preview.preview.whatChanged.join(" ")).toMatch(/low_risk/);
      expect(preview.preview.whatChanged.join(" ")).not.toMatch(/canal/i);
    }
    expect(get_workspace_state().candidates[0]?.districtId).toBe("gorakhpur");
  });

  it("commit_preview applies year-round from preview.correction.to, not seasonal", async () => {
    await show_candidates();
    selectDistrict("gorakhpur");
    const preview = preview_scenario({
      district: "kushinagar",
      fact: "canal_irrigation",
      value: "year-round",
    });
    expect(preview.ok).toBe(true);
    if ("preview" in preview) {
      expect(preview.preview?.correction?.to).toBe("perennial_canal_assumed");
      expect(preview.preview?.correction?.districtId).toBe("kushinagar");
    }
    const committed = commit_preview();
    expect(committed.ok).toBe(true);
    const corrections = get_workspace_state().unsavedChanges.corrections;
    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.districtId).toBe("kushinagar");
    expect(corrections[0]?.to).toBe("perennial_canal_assumed");
    expect(corrections[0]?.to).not.toBe("seasonal_canal");
    const g = getState().candidates.find((c) => c.districtId === "gorakhpur");
    expect(g?.evidence.find((e) => e.id === "irrigation")?.status).toBe("unverified");
    const k = getState().candidates.find((c) => c.districtId === "kushinagar");
    expect(k?.evidence.find((e) => e.id === "irrigation")?.value).toBe("perennial_canal_assumed");
  });

  it("commit_preview on a scenario-only preview does not write a canal correction", async () => {
    await show_candidates();
    selectDistrict("gorakhpur");
    const preview = preview_scenario({ scenario: "low_risk" });
    expect(preview.ok).toBe(true);
    if ("preview" in preview) expect(preview.preview?.correction).toBeUndefined();
    const committed = commit_preview();
    expect(committed.ok).toBe(true);
    if ("applied" in committed) expect(committed.applied).toBe("scenario");
    const after = get_workspace_state();
    expect(after.unsavedChanges.corrections).toHaveLength(0);
    expect(after.unsavedChanges.scenarioPreview).toBeNull();
    expect(getState().scenario).toBe("low_risk");
    const g = getState().candidates.find((c) => c.districtId === "gorakhpur");
    expect(g?.evidence.find((e) => e.id === "irrigation")?.status).toBe("unverified");
    expect(g?.evidence.find((e) => e.id === "irrigation")?.value).toBe("perennial_canal_assumed");
  });

  it("commit_preview on a mixed correction+scenario preview commits the preview ranking", async () => {
    await show_candidates();
    const preview = preview_scenario({
      district: "gorakhpur",
      fact: "canal_irrigation",
      value: "seasonal",
      scenario: "low_risk",
    });
    expect(preview.ok).toBe(true);
    if (!("preview" in preview) || !preview.preview) throw new Error("expected preview");
    expect(preview.preview.correction?.to).toBe("seasonal_canal");
    expect(preview.preview.scenario).toBe("low_risk");
    expect(preview.preview.whatChanged.join(" ")).toMatch(/Irrigation/);
    expect(preview.preview.whatChanged.join(" ")).toMatch(/low_risk/);
    const expected = preview.preview.after.map((r) => ({
      districtId: r.districtId,
      rank: r.rank,
      score: r.score,
    }));
    const correctionOnly = rankDistricts({
      corrections: [
        {
          id: "only-corr",
          districtId: "gorakhpur",
          fact: "canal_irrigation",
          from: "perennial_canal_assumed",
          to: "seasonal_canal",
          note: "",
          appliedAt: new Date().toISOString(),
          committed: false,
        },
      ],
      scenario: "base",
    }).candidates.map((c) => ({ districtId: c.districtId, rank: c.rank, score: c.score }));
    expect(expected).not.toEqual(correctionOnly);

    const committed = commit_preview();
    expect(committed.ok).toBe(true);
    expect(getState().scenario).toBe("low_risk");
    const corrections = get_workspace_state().unsavedChanges.corrections;
    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.to).toBe("seasonal_canal");
    const live = getState().candidates.map((c) => ({
      districtId: c.districtId,
      rank: c.rank,
      score: c.score,
    }));
    expect(live).toEqual(expected);
  });

  it("commit_preview on a correction-only preview does not restore a stale scenario", async () => {
    await show_candidates();
    chooseScenario("low_risk");
    const preview = preview_scenario({
      district: "gorakhpur",
      fact: "canal_irrigation",
      value: "seasonal",
    });
    expect(preview.ok).toBe(true);
    if ("preview" in preview && preview.preview) {
      expect(preview.preview.scenarioExplicit).toBe(false);
      expect(preview.preview.scenario).toBe("low_risk");
    }
    patchState({ scenario: "high_investment" });
    const committed = commit_preview();
    expect(committed.ok).toBe(true);
    expect(getState().scenario).toBe("high_investment");
    expect(getState().scenario).not.toBe("low_risk");
    const irrig = getState().candidates.find((c) => c.districtId === "gorakhpur")?.evidence.find(
      (e) => e.id === "irrigation",
    );
    expect(irrig?.status).toBe("corrected");
  });

  it("changing scenario clears a prior approval so export cannot look approved", async () => {
    await show_candidates();
    const approved = approveDecision({ district: "gorakhpur" });
    expect(approved.ok).toBe(true);
    const before = await export_decision({ download: false });
    expect(before.finalChoice.approved).toBe(true);
    chooseScenario("low_risk");
    expect(getState().approval).toBeNull();
    const after = await export_decision({ download: false });
    expect(after.finalChoice.approved).toBe(false);
    expect(after.approvals).toEqual([]);
  });

  it("reads unsaved lasso/polygon selection without a server roundtrip", () => {
    const drawn = setDrawnSelection({
      kind: "lasso",
      coordinates: [
        [83.1, 26.6],
        [83.4, 26.6],
        [83.4, 26.9],
        [83.1, 26.9],
      ],
    });
    expect(drawn.ok).toBe(true);
    const sel = get_current_selection();
    expect(sel.selection?.kind).toBe("lasso");
    expect(sel.selection?.saved).toBe(false);
    expect(sel.selection?.polygon?.type).toBe("Polygon");
    expect(sel.note).toMatch(/not sent to a server/i);
    expect(get_unsaved_changes().selection?.kind).toBe("lasso");
  });
});

describe("GroundCheck", () => {
  it("send_ground_check does not invent a field reply", () => {
    const sent = send_ground_check({ district: "gorakhpur" });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("expected send");
    expect(sent.check.reply).toBeNull();
    expect(sent.fieldPath).toMatch(/field=/);
    expect(sent.check.question.length).toBeGreaterThan(10);
    const approveEmpty = approve_evidence({ checkId: sent.check.id });
    expect(approveEmpty.ok).toBe(false);
    expect(String(approveEmpty.error)).toMatch(/no field reply/i);
  });

  it("approve_evidence only works after a real photo+answer submit", () => {
    const sent = send_ground_check({ district: "gorakhpur", question: "Is the canal seasonal?" });
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("expected send");
    const missingPhoto = submit_field_reply({
      checkId: sent.check.id,
      answer: "Seasonal",
      photoDataUrl: null,
    });
    expect(missingPhoto.ok).toBe(false);
    const replied = submit_field_reply({
      checkId: sent.check.id,
      answer: "Seasonal. The canal is dry in May.",
      photoDataUrl: "data:image/jpeg;base64,/9j/aaaa",
      gps: { lat: 26.76, lon: 83.37, accuracyM: 12 },
      capturedAt: "2026-08-27T10:00:00Z",
    });
    expect(replied.ok).toBe(true);
    if (!replied.ok) throw new Error("expected reply");
    expect(replied.check.reply?.answer).toMatch(/Seasonal/);
    expect(replied.check.reply?.photoDataUrl).toMatch(/^data:image/);
    expect(replied.check.reply?.gps?.lat).toBeCloseTo(26.76);
    const approved = approve_evidence({ checkId: sent.check.id });
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("expected approve");
    expect(approved.check.status).toBe("approved");
  });

  it("WebMCP GroundCheck tools call the same commands as the UI", () => {
    const sendTool = WEBMCP_TOOLS.find((t) => t.name === "send_ground_check");
    const approveTool = WEBMCP_TOOLS.find((t) => t.name === "approve_evidence");
    expect(sendTool).toBeTruthy();
    expect(approveTool).toBeTruthy();
    const sent = sendTool!.execute({ district: "ballia", question: "Any standing water?" }) as {
      ok: boolean;
      check?: { id: string; reply: null };
    };
    expect(sent.ok).toBe(true);
    expect(sent.check?.reply).toBeNull();
    const denied = approveTool!.execute({ checkId: sent.check?.id }) as { ok: boolean };
    expect(denied.ok).toBe(false);
  });
});

