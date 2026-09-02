import { fetchNdvi } from "./analysis";
import { canonicalJson, sha256Hex } from "./hash";
import { SNAPSHOT, attachRankDelta, irrigationFor, lookupDistrictId, rankDistricts, uncertainDistrictIds } from "./rank";
import { defaultCorrectionNote, irrigationClassFromValue, valueFromIrrigationClass } from "./irrigation";
import {
  addCorrection,
  getState,
  getUnsavedChanges,
  patchState,
  pushTimeline,
  setLayer,
  setScenario,
} from "./store";
import type {
  Candidate,
  Correction,
  DecisionRecord,
  LayerId,
  ScenarioId,
  Selection,
} from "./types";

function geometryFor(districtId: string): GeoJSON.Geometry | null {
  const f = getState().geojson?.features.find((feat) => {
    const id = (feat.properties as { id?: string } | null)?.id;
    return id === districtId;
  });
  return f?.geometry ?? null;
}

function candidateByNameOrId(q: string): Candidate | undefined {
  const key = q.trim().toLowerCase();
  return getState().candidates.find(
    (c) => c.districtId === key || c.name.toLowerCase() === key,
  );
}

export function get_workspace_state() {
  const s = getState();
  return {
    mission: s.mission,
    constraints: s.constraints,
    layers: s.layers,
    scenario: s.scenario,
    candidates: s.candidates.map((c) => ({
      districtId: c.districtId,
      name: c.name,
      rank: c.rank,
      previousRank: c.previousRank,
      score: c.score,
      scoreDisplay: c.scoreDisplay,
      reasons: c.reasons,
      uncertainty: c.evidence.filter((e) => e.status === "unverified").map((e) => e.id),
      gaps: c.evidence.filter((e) => e.status === "gap").map((e) => e.id),
    })),
    rankingMeta: s.rankingMeta,
    openEvidenceDistrictId: s.openEvidenceDistrictId,
    highlightedUncertainty: s.highlightedUncertainty,
    approval: s.approval,
    view: s.view,
    analysisStatus: s.analysisStatus,
    ndviGap: s.ndviGap,
    webmcp: s.webmcp,
    unsavedChanges: getUnsavedChanges(),
    timeline: s.timeline.slice(-12),
  };
}

export function get_current_selection() {
  const sel = getState().selection;
  if (!sel) return { selection: null, note: "No district selected in this tab." };
  return {
    selection: sel,
    note: "Selection lives in this browser tab and is not persisted.",
  };
}

export function get_visible_map_state() {
  const s = getState();
  return {
    center: s.map.center,
    zoom: s.map.zoom,
    bounds: s.map.bounds,
    tiles: s.map.tiles,
    tilesNote: s.map.tilesNote,
    layers: s.layers,
    selectedDistrictId: s.selection?.districtId ?? null,
  };
}

export function get_open_evidence() {
  const s = getState();
  const id = s.openEvidenceDistrictId;
  if (!id) return { open: false, evidence: null };
  const cand = s.candidates.find((c) => c.districtId === id);
  return {
    open: true,
    districtId: id,
    name: cand?.name ?? id,
    rank: cand?.rank ?? null,
    score: cand?.score ?? null,
    evidence: cand?.evidence ?? [],
  };
}

/** Unsaved tab state for WebMCP. Not a REST/API snapshot. */
export function get_unsaved_changes() {
  const unsaved = getUnsavedChanges();
  return {
    selection: unsaved.selection,
    corrections: unsaved.corrections,
    scenarioPreview: unsaved.scenarioPreview,
    approvalPending: unsaved.approvalPending,
    note: "Unsaved human selection and corrections exist only in this browser tab. An agent can read them only through WebMCP, not a public API.",
  };
}

export async function show_candidates(input: {
  limit?: number;
  runAnalysis?: boolean;
} = {}) {
  const s = getState();
  if (s.candidates.length === 0 || input.runAnalysis !== false) {
    await runAnalysis();
  }
  const limit = input.limit ?? getState().constraints.maxDistricts;
  const shown = getState().candidates.slice(0, Math.max(1, limit));
  pushTimeline("show_candidates", `Showing ${shown.length} ranked candidates as overlays.`);
  return {
    shown: shown.map((c) => ({
      rank: c.rank,
      districtId: c.districtId,
      name: c.name,
      score: c.scoreDisplay,
      reasons: c.reasons,
    })),
    rankingMeta: getState().rankingMeta,
    ndviGap: getState().ndviGap,
  };
}

export function open_evidence(input: { district: string }) {
  const cand = candidateByNameOrId(input.district);
  if (!cand) {
    return { ok: false, error: `No candidate named ${input.district}. Run show_candidates first.` };
  }
  selectDistrict(cand.districtId);
  patchState({ openEvidenceDistrictId: cand.districtId, view: "desk", scenarioPreview: null });
  pushTimeline("open_evidence", `Opened evidence for ${cand.name}.`);
  return get_open_evidence();
}

export function highlight_uncertainty(input: { on?: boolean } = {}) {
  const on = input.on !== false;
  const ids = on ? uncertainDistrictIds(getState().candidates) : [];
  patchState({ highlightedUncertainty: ids });
  pushTimeline(
    "highlight_uncertainty",
    on
      ? `Highlighted ${ids.length} district(s) whose rank hangs on an unverified assumption.`
      : "Cleared uncertainty highlight.",
  );
  return { highlighted: ids };
}

export function preview_scenario(input: {
  district?: string;
  fact?: "canal_irrigation";
  value?: "seasonal" | "year-round";
  scenario?: ScenarioId;
} = {}) {
  const s = getState();
  if (s.candidates.length === 0) {
    return { ok: false, error: "No ranking yet. Call show_candidates first." };
  }
  const canalRequested = input.fact != null || input.value != null;
  let staged: Correction | undefined;
  let districtId: string | undefined;
  if (canalRequested) {
    if (input.district) {
      const resolved = lookupDistrictId(input.district);
      if (!resolved) {
        return { ok: false, error: `Unknown district: ${input.district}` };
      }
      districtId = resolved;
    } else if (s.selection?.districtId) {
      districtId = s.selection.districtId;
    } else {
      return { ok: false, error: "No district selected. Pass district or select one." };
    }
    const value = input.value ?? "seasonal";
    const to = irrigationClassFromValue(value);
    const from = irrigationFor(districtId, s.corrections).class;
    if (from === to) {
      return { ok: false, error: `Irrigation class is already ${to}. Preview would be a no-op.` };
    }
    staged = {
      id: `preview-${Date.now()}`,
      districtId,
      fact: "canal_irrigation",
      from,
      to,
      note:
        value === "seasonal"
          ? "Preview: canal treated as seasonal, not year-round."
          : "Preview: canal treated as year-round.",
      appliedAt: new Date().toISOString(),
      committed: false,
    };
  }
  const scenario = input.scenario ?? s.scenario;
  const before = s.candidates.map((c) => ({
    districtId: c.districtId,
    rank: c.rank,
    score: c.score,
  }));
  const next = rankDistricts({
    corrections: staged ? [...s.corrections, staged] : s.corrections,
    ndvi: s.ndvi,
    scenario,
  });
  const whatChanged: string[] = [];
  if (staged) whatChanged.push(`Irrigation (${districtId}): ${staged.from} → ${staged.to}`);
  if (!staged || scenario !== s.scenario) whatChanged.push(`Scenario → ${scenario}`);
  const canalLabel =
    staged?.to === "seasonal_canal" ? "Seasonal canal" : staged ? "Year-round canal" : null;
  const preview = {
    label: canalLabel
      ? scenario !== s.scenario
        ? `${canalLabel} + ${scenario} (preview, not applied)`
        : `${canalLabel} (preview, not applied)`
      : `Scenario ${scenario} (preview)`,
    scenario,
    correction: staged,
    before,
    after: next.candidates.map((c) => ({
      districtId: c.districtId,
      rank: c.rank,
      score: c.score,
    })),
    whatChanged,
  };
  patchState({ scenarioPreview: preview, view: "desk" });
  pushTimeline("preview_scenario", preview.label);
  return { ok: true, preview, afterTop: next.candidates.slice(0, 5) };
}

export function apply_correction(input: {
  district?: string;
  fact?: "canal_irrigation";
  value?: "seasonal" | "year-round";
  note?: string;
  scenario?: ScenarioId;
} = {}) {
  const s = getState();
  let districtId: string | undefined;
  if (input.district) {
    const resolved = lookupDistrictId(input.district);
    if (!resolved) {
      return { ok: false, error: `Unknown district: ${input.district}` };
    }
    districtId = resolved;
  } else if (s.selection?.districtId) {
    districtId = s.selection.districtId;
  } else {
    return { ok: false, error: "No district selected. Select a district or pass district." };
  }
  const value = input.value ?? "seasonal";
  const to = irrigationClassFromValue(value);
  const from = irrigationFor(districtId, s.corrections).class;
  if (from === to) {
    return { ok: false, error: `Irrigation class is already ${to}. Correction would be a no-op.` };
  }
  const scenario = input.scenario ?? s.scenario;
  const correction: Correction = {
    id: `corr-${Date.now()}`,
    districtId,
    fact: "canal_irrigation",
    from,
    to,
    note: input.note ?? defaultCorrectionNote(value),
    appliedAt: new Date().toISOString(),
    committed: false,
  };
  const previous = s.candidates;
  addCorrection(correction);
  const ranked = rankDistricts({
    corrections: [...getState().corrections],
    ndvi: s.ndvi,
    scenario,
  });
  const candidates = attachRankDelta(previous, ranked.candidates);
  patchState({
    candidates,
    rankingMeta: ranked.meta,
    scenario,
    scenarioPreview: null,
    approval: null,
    openEvidenceDistrictId: districtId,
  });
  const moved = candidates.find((c) => c.districtId === districtId);
  const leader = candidates[0];
  pushTimeline(
    "apply_correction",
    `Applied unsaved correction on ${districtId}: canal → ${to}. ${moved?.name} is now rank ${moved?.rank}. Leader: ${leader?.name}.`,
  );
  return {
    ok: true,
    unsaved: true,
    correction,
    leader: leader ? { name: leader.name, rank: leader.rank, score: leader.scoreDisplay } : null,
    moved: moved
      ? {
          name: moved.name,
          rank: moved.rank,
          previousRank: moved.previousRank,
          score: moved.scoreDisplay,
        }
      : null,
    ranking: candidates.slice(0, 8).map((c) => ({
      rank: c.rank,
      previousRank: c.previousRank,
      name: c.name,
      score: c.scoreDisplay,
    })),
    ndviGap: getState().ndviGap,
  };
}

export async function export_decision(input: { download?: boolean } = {}) {
  const s = getState();
  const leader = s.candidates[0] ?? null;
  const chosenId = s.approval?.districtId ?? s.selection?.districtId ?? leader?.districtId ?? null;
  const chosen = s.candidates.find((c) => c.districtId === chosenId) ?? leader;
  const gaps = [
    ...new Set(
      [
        ...s.rankingMeta.droppedFactors.map((d) => `${d.id}: ${d.reason}`),
        ...(s.ndviGap ? [`ndvi: ${s.ndviGap.reason}`] : []),
      ].filter(Boolean),
    ),
  ];
  const sources = [
    {
      name: "District boundaries",
      url: "https://github.com/udit-001/india-maps-data",
      note: "Uttar Pradesh district GeoJSON. Not an official Survey of India product.",
    },
    {
      name: "ISRIC SoilGrids 2.0",
      url: "https://www.isric.org/explore/soilgrids",
      retrievedAt: SNAPSHOT.retrievedAt,
    },
    {
      name: "Open-Meteo Elevation API (SRTM-based)",
      url: "https://open-meteo.com/en/docs/elevation-api",
      retrievedAt: SNAPSHOT.retrievedAt,
    },
    {
      name: "OpenStreetMap raster tiles",
      url: "https://www.openstreetmap.org/copyright",
    },
    {
      name: "Google Earth Engine",
      note: s.rankingMeta.ndviIncluded
        ? "NDVI included from analysis API."
        : "Not used. NDVI is a gap.",
    },
  ];
  const draft: Omit<DecisionRecord, "reproducibilityHash"> = {
    title: `Decision record: ${s.mission.title}`,
    generatedAt: new Date().toISOString(),
    mission: s.mission,
    constraints: s.constraints,
    finalChoice: {
      districtId: chosen?.districtId ?? null,
      name: chosen?.name ?? null,
      rank: chosen?.rank ?? null,
      score: chosen?.score ?? null,
      approved: Boolean(s.approval),
    },
    ranking: {
      recipe: s.rankingMeta.recipe,
      weights: s.rankingMeta.weights,
      droppedFactors: s.rankingMeta.droppedFactors,
      candidates: s.candidates.map((c) => ({
        rank: c.rank,
        previousRank: c.previousRank,
        districtId: c.districtId,
        name: c.name,
        score: c.score,
        reasons: c.reasons,
        evidence: c.evidence,
      })),
    },
    sources,
    corrections: s.corrections,
    approvals: s.approval ? [s.approval] : [],
    gaps,
    note: "Another agent can replay the ranking from this record plus src/lib/rank.ts. NDVI numbers appear only when Earth Engine actually returned them.",
  };
  const reproducibilityHash = await sha256Hex(canonicalJson(draft));
  const record: DecisionRecord = { ...draft, reproducibilityHash };
  patchState({ view: "decision" });
  pushTimeline("export_decision", `Decision record hashed ${reproducibilityHash.slice(0, 12)}…`);
  if (input.download !== false && typeof document !== "undefined") {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ground-decision-${record.generatedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return record;
}

export function selectDistrict(districtId: string) {
  const rec = SNAPSHOT.districts[districtId];
  if (!rec) return { ok: false as const, error: "Unknown district" };
  const polygon = geometryFor(districtId) ?? {
    type: "Point",
    coordinates: [rec.centroid.lon, rec.centroid.lat],
  };
  const selection: Selection = {
    kind: "district",
    districtId,
    name: rec.name,
    polygon,
    saved: false,
  };
  patchState({
    selection,
    map: { ...getState().map, center: [rec.centroid.lat, rec.centroid.lon] },
  });
  return { ok: true as const, selection };
}

export function closeEvidence() {
  patchState({ openEvidenceDistrictId: null });
}

export function closePreview() {
  patchState({ scenarioPreview: null });
}

export function commit_preview() {
  const preview = getState().scenarioPreview;
  if (!preview) return { ok: false as const, error: "No preview open." };
  const corr = preview.correction;
  const scenario = preview.scenario;
  if (corr) {
    const value = valueFromIrrigationClass(corr.to);
    if (!value) {
      return { ok: false as const, error: `Cannot apply irrigation class ${corr.to} from this preview.` };
    }
    return apply_correction({
      district: corr.districtId,
      value,
      note: corr.note,
      scenario,
    });
  }
  if (scenario !== getState().scenario) {
    chooseScenario(scenario);
  }
  closePreview();
  return { ok: true as const, applied: "scenario" as const };
}

export function closeDecision() {
  patchState({ view: "desk" });
}

export function toggleLayer(id: LayerId, on?: boolean) {
  const current = getState().layers[id];
  setLayer(id, on ?? !current);
  return getState().layers;
}

export function chooseScenario(id: ScenarioId) {
  setScenario(id);
  const s = getState();
  if (s.candidates.length) {
    const ranked = rankDistricts({
      corrections: s.corrections,
      ndvi: s.ndvi,
      scenario: id,
    });
    patchState({
      candidates: attachRankDelta(s.candidates, ranked.candidates),
      rankingMeta: ranked.meta,
    });
  }
  pushTimeline("scenario", `Scenario set to ${id}.`);
  return { scenario: id, rankingMeta: getState().rankingMeta };
}

export function setMapView(partial: Partial<{
  center: [number, number];
  zoom: number;
  bounds: [[number, number], [number, number]] | null;
  tiles: "ok" | "gap";
}>) {
  patchState({ map: { ...getState().map, ...partial } });
}

export function setGeojson(geojson: GeoJSON.FeatureCollection) {
  patchState({ geojson });
}

export function approveDecision(input: { by?: string; reason?: string; district?: string } = {}) {
  const s = getState();
  const cand =
    (input.district ? candidateByNameOrId(input.district) : null) ??
    (s.selection ? s.candidates.find((c) => c.districtId === s.selection?.districtId) : null) ??
    s.candidates[0];
  if (!cand) return { ok: false, error: "Nothing to approve. Rank candidates first." };
  const approval = {
    districtId: cand.districtId,
    name: cand.name,
    by: input.by ?? "Human (this tab)",
    at: new Date().toISOString(),
    reason: input.reason ?? "Approved from the desk. The agent did not decide.",
  };
  const corrections = s.corrections.map((c) => ({ ...c, committed: true }));
  patchState({ approval, corrections });
  selectDistrict(cand.districtId);
  pushTimeline("approve", `Human approved ${cand.name}. Nothing moved without that click.`);
  return { ok: true, approval };
}

export async function runAnalysis() {
  patchState({ analysisStatus: "running" });
  const districts = Object.values(SNAPSHOT.districts).map((d) => ({
    id: d.id,
    lat: d.centroid.lat,
    lon: d.centroid.lon,
  }));
  const ndviRes = await fetchNdvi(districts);
  const s = getState();
  const ranked = rankDistricts({
    corrections: s.corrections,
    ndvi: ndviRes.ndvi,
    scenario: s.scenario,
  });
  patchState({
    ndvi: ndviRes.ndvi,
    ndviGap: ndviRes.gap,
    candidates: attachRankDelta(s.candidates.length ? s.candidates : null, ranked.candidates),
    rankingMeta: ranked.meta,
    analysisStatus: "ready",
    highlightedUncertainty: uncertainDistrictIds(ranked.candidates),
  });
  const leader = ranked.candidates[0];
  pushTimeline(
    "analysis",
    `Ranked ${ranked.candidates.length} districts. Leader: ${leader?.name ?? "none"}. ${
      ndviRes.gap ? `NDVI gap: ${ndviRes.gap.reason}` : "NDVI included from Earth Engine."
    }`,
  );
  return get_workspace_state();
}

export const commands = {
  get_workspace_state,
  get_current_selection,
  get_visible_map_state,
  get_open_evidence,
  get_unsaved_changes,
  show_candidates,
  open_evidence,
  highlight_uncertainty,
  preview_scenario,
  apply_correction,
  commit_preview,
  export_decision,
  selectDistrict,
  runAnalysis,
  approveDecision,
  toggleLayer,
  chooseScenario,
};
