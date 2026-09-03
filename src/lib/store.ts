import { REGIONS } from "../data/regions";
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

const UP_DEF = REGIONS.up;

export const DEFAULT_MISSION: Mission = UP_DEF.mission;
export const DEFAULT_CONSTRAINTS: Constraints = UP_DEF.constraints;
export const EASTERN_UP_CENTER: [number, number] = UP_DEF.mapCenter;

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
    region: "up",
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
      zoom: UP_DEF.mapZoom,
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
  const region = state.region;
  const mission = state.mission;
  const constraints = state.constraints;
  replaceState({ ...emptyWorkspace(), geojson, webmcp, region, mission, constraints });
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
