import type {
  Approval,
  Constraints,
  Correction,
  LayerId,
  Mission,
  ScenarioId,
  TimelineEvent,
  Workspace,
} from "./types";

export const DEFAULT_MISSION: Mission = {
  title: "Rice Resilience Program — Uttar Pradesh",
  region: "Uttar Pradesh, India",
  objective:
    "Improve rice resilience across Uttar Pradesh with data-driven district prioritization.",
  candidatePoolNote:
    "V1 candidate pool is 12 eastern rice-belt districts with fetchable geometry. This is not a 75-district census ranking.",
};

export const DEFAULT_CONSTRAINTS: Constraints = {
  budgetCr: 50,
  maxDistricts: 3,
  irrigatedAreaMinPct: 25,
  floodRiskMax: "medium",
  millDistanceKm: 150,
  notes: [
    "Irrigated-area minimum cannot be enforced: no district irrigation-share table is loaded.",
    "Flood-risk maximum cannot be enforced: flood layer is a gap.",
    "Mill-distance maximum cannot be enforced: mill registry is a gap in this session.",
  ],
};

export const EASTERN_UP_CENTER: [number, number] = [26.7, 83.45];

let seq = 1;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function emptyWorkspace(): Workspace {
  return {
    mission: DEFAULT_MISSION,
    constraints: DEFAULT_CONSTRAINTS,
    layers: {
      districts: true,
      ndvi: true,
      soil: true,
      elevation: true,
      mills: true,
      roads: true,
    },
    scenario: "base",
    selection: null,
    drawMode: "idle",
    candidates: [],
    rankingMeta: {
      computedAt: null,
      recipe: "",
      weights: {},
      droppedFactors: [],
      ndviIncluded: false,
      note: "Analysis has not been run.",
    },
    openEvidenceDistrictId: null,
    highlightedUncertainty: [],
    scenarioPreview: null,
    corrections: [],
    groundChecks: [],
    timeline: [
      {
        id: nextId("t"),
        at: new Date().toISOString(),
        kind: "session",
        text: "Workspace opened. Ranking idle. No NDVI until Earth Engine answers.",
      },
    ],
    approval: null,
    view: "desk",
    map: {
      center: EASTERN_UP_CENTER,
      zoom: 8,
      bounds: null,
      tiles: "ok",
      tilesNote: "OSM raster tiles. No Google Maps JavaScript key in the browser.",
    },
    analysisStatus: "idle",
    ndvi: {},
    ndviGap: { reason: "Earth Engine has not been queried yet." },
    geojson: null,
    webmcp: { registered: false, reason: "not registered" },
  };
}

let state: Workspace = emptyWorkspace();
const listeners = new Set<() => void>();

export function getState(): Workspace {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyListeners() {
  for (const l of listeners) l();
}

export function replaceState(next: Workspace) {
  state = next;
  notifyListeners();
}

export function patchState(partial: Partial<Workspace>) {
  replaceState({ ...state, ...partial });
}

export function pushTimeline(kind: string, text: string): TimelineEvent {
  const event: TimelineEvent = {
    id: nextId("t"),
    at: new Date().toISOString(),
    kind,
    text,
  };
  patchState({ timeline: [...state.timeline, event] });
  return event;
}

export function setLayer(id: LayerId, on: boolean) {
  patchState({ layers: { ...state.layers, [id]: on } });
}

export function setScenario(scenario: ScenarioId) {
  patchState({ scenario });
}

export function resetWorkspace() {
  const geojson = state.geojson;
  const webmcp = state.webmcp;
  replaceState({ ...emptyWorkspace(), geojson, webmcp });
}

export function recordApproval(approval: Approval) {
  patchState({ approval });
}

export function addCorrection(correction: Correction) {
  patchState({ corrections: [...state.corrections, correction] });
}

export function getUnsavedChanges() {
  return {
    selection: state.selection,
    corrections: state.corrections.filter((c) => !c.committed),
    scenarioPreview: state.scenarioPreview,
    groundChecks: state.groundChecks,
    drawMode: state.drawMode,
    approvalPending: state.approval == null && state.candidates.length > 0,
  };
}
