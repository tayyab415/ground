import snapshotUp from "./snapshot.json";
import snapshotMh from "./snapshot-maharashtra.json";
import snapshotUs from "./snapshot-us.json";
import type { Constraints, Mission, RegionId } from "../lib/types";

export type SnapshotShape = {
  retrievedAt: string;
  region?: string;
  districts: Record<string, SnapshotDistrict>;
};

export type SnapshotDistrict = {
  id: string;
  name: string;
  centroid: { lat: number; lon: number };
  soil: {
    properties: Record<string, { mean: number; unit: string }>;
    source: string;
    url: string;
    query: { lat: number; lon: number; depth: string };
  } | null;
  elevation: {
    meters: number;
    source: string;
    url: string;
    query: { lat: number; lon: number };
  } | null;
  error?: unknown[];
  mills?: {
    status?: string;
    reason?: string;
    count?: number;
    source: string;
    url?: string;
    note?: string;
  };
};

export type RegionDef = {
  id: RegionId;
  state: string;
  mission: Mission;
  constraints: Constraints;
  snapshot: SnapshotShape;
  geojsonPath: string;
  mapCenter: [number, number];
  mapZoom: number;
  note: string;
  crop: string;
};

const UP_MISSION: Mission = {
  title: "Rice Resilience Program — Uttar Pradesh",
  region: "Uttar Pradesh, India",
  objective:
    "Improve rice resilience across Uttar Pradesh with data-driven district prioritization.",
  candidatePoolNote:
    "V1 candidate pool is 12 eastern rice-belt districts with fetchable geometry. This is not a 75-district census ranking.",
};

const UP_CONSTRAINTS: Constraints = {
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

const MH_MISSION: Mission = {
  title: "Rice Resilience Program — Maharashtra",
  region: "Maharashtra, India",
  objective:
    "Improve rice resilience across Maharashtra with data-driven district prioritization.",
  candidatePoolNote:
    "V1 candidate pool is 12 rice-producing districts (Vidarbha + Konkan) with fetchable geometry. This is not a 36-district census ranking.",
};

const MH_CONSTRAINTS: Constraints = {
  budgetCr: 50,
  maxDistricts: 3,
  irrigatedAreaMinPct: 25,
  floodRiskMax: "medium",
  millDistanceKm: 150,
  notes: [
    "Vidarbha districts sit on higher alluvial/black-cotton plateau; Konkan districts are coastal.",
    "Irrigated-area, flood-risk, and mill constraints cannot be enforced in V1 (data is a gap).",
  ],
};

const US_MISSION: Mission = {
  title: "Rice Resilience Program — US Mississippi Delta",
  region: "Mississippi Delta, USA (Arkansas + Mississippi)",
  objective:
    "Improve rice resilience across the US Mississippi Delta with data-driven county prioritization.",
  candidatePoolNote:
    "V1 candidate pool is 14 rice-belt counties (Arkansas + Mississippi) with fetchable geometry. This is not a full US county census ranking.",
};

const US_CONSTRAINTS: Constraints = {
  budgetCr: 50,
  maxDistricts: 3,
  irrigatedAreaMinPct: 25,
  floodRiskMax: "medium",
  millDistanceKm: 150,
  notes: [
    "Soil and elevation are point samples at county centroids (ISRIC SoilGrids + SRTM via Open-Meteo), not county-wide means.",
    "Irrigated-area, flood-risk, and mill constraints cannot be enforced in V1 (data is a gap).",
  ],
};

export const REGIONS: Record<RegionId, RegionDef> = {
  up: {
    id: "up",
    state: "Uttar Pradesh",
    mission: UP_MISSION,
    constraints: UP_CONSTRAINTS,
    snapshot: snapshotUp as SnapshotShape,
    geojsonPath: "data/up-rice-districts.geojson",
    mapCenter: [26.7, 83.45],
    mapZoom: 8,
    crop: "rice",
    note: "Eastern Gangetic rice belt. The Gorakhpur canal prior is the reference weak fact.",
  },
  maharashtra: {
    id: "maharashtra",
    state: "Maharashtra",
    mission: MH_MISSION,
    constraints: MH_CONSTRAINTS,
    snapshot: snapshotMh as SnapshotShape,
    geojsonPath: "data/maharashtra-rice-districts.geojson",
    mapCenter: [20.4, 78.4],
    mapZoom: 7,
    crop: "rice",
    note: "Vidarbha plateau + Konkan coast. No district-specific canal priors; irrigation is a modeled prior, not measured.",
  },
  us: {
    id: "us",
    state: "US Mississippi Delta",
    mission: US_MISSION,
    constraints: US_CONSTRAINTS,
    snapshot: snapshotUs as SnapshotShape,
    geojsonPath: "data/us-delta-rice-counties.geojson",
    mapCenter: [33.68, -90.66],
    mapZoom: 7,
    crop: "rice",
    note: "Lower Mississippi Alluvial Plain. Point samples only; no district canal priors or flood layer.",
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];
