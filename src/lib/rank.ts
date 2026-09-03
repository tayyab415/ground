import snapshotUp from "../data/snapshot.json";
import type { SnapshotShape } from "../data/regions";
import { IRRIGATION_PRIORS, priorForClass } from "./irrigation";
import type {
  Candidate,
  Correction,
  EvidenceItem,
  IrrigationPrior,
  NdviLookup,
  RankingMeta,
  ScenarioId,
} from "./types";

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
  mills?: {
    status?: string;
    reason?: string;
    count?: number;
    source: string;
    url?: string;
    note?: string;
  };
  error?: unknown[];
};

export let SNAPSHOT: SnapshotShape = snapshotUp as SnapshotShape;

/** The active region's snapshot. Switched by set_region; module-level by design. */
export function setActiveSnapshot(next: SnapshotShape) {
  SNAPSHOT = next;
}

export const RECIPE_WEIGHTS = {
  ndvi: 0.3,
  soil: 0.2,
  elevation: 0.1,
  mills: 0.15,
  irrigation: 0.15,
  flood: 0.1,
} as const;

export function soilFractions(soil: SnapshotDistrict["soil"]) {
  if (!soil) return null;
  const clayRaw = soil.properties.clay?.mean;
  const sandRaw = soil.properties.sand?.mean;
  const siltRaw = soil.properties.silt?.mean;
  if (clayRaw == null || sandRaw == null || siltRaw == null) return null;
  // SoilGrids maps clay/sand/silt as g/kg integers; conventional % = value / 10.
  return {
    clayPct: clayRaw / 10,
    sandPct: sandRaw / 10,
    siltPct: siltRaw / 10,
    clayGkg: clayRaw,
    sandGkg: sandRaw,
    siltGkg: siltRaw,
  };
}

export function textureLabel(clay: number, sand: number, silt: number): string {
  if (silt >= 50 && clay >= 12 && clay < 27 && sand < 20) return "silt loam";
  if (silt >= 50 && clay >= 12 && clay < 27) return "silt loam";
  if (clay >= 20 && clay < 35 && sand >= 45) return "sandy clay loam";
  if (clay >= 20 && clay < 35 && silt >= 28 && sand < 45) return "clay loam";
  if (clay >= 7 && clay < 27 && sand > 52 && silt + 2 * clay < 30) return "sandy loam";
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand < 52) return "loam";
  if (silt >= 80 && clay < 12) return "silt";
  if (clay >= 27 && clay < 40 && sand <= 20) return "silty clay loam";
  if (clay >= 27 && clay < 40) return "clay loam";
  return "loam";
}

/** Rice prefers fine alluvial soils: enough clay, not too much sand. */
export function soilScoreFromFractions(clay: number, sand: number): number {
  let score = 0.35;
  if (clay >= 20 && clay <= 40) score += 0.4;
  else if (clay >= 15 && clay < 20) score += 0.25;
  else if (clay > 40 && clay <= 55) score += 0.3;
  else score += 0.1;
  if (sand < 35) score += 0.25;
  else if (sand < 45) score += 0.15;
  else score += 0.05;
  return clamp(score, 0, 1);
}

/** Eastern UP rice belt sits ~50–110 m. Score the alluvial band, do not infer flood. */
export function elevationScore(meters: number): number {
  if (meters >= 50 && meters <= 110) {
    const mid = 1 - Math.abs(meters - 72) / 80;
    return clamp(0.86 + 0.14 * mid, 0, 1);
  }
  if (meters < 50) return 0.7;
  if (meters <= 160) return 0.55;
  return 0.35;
}

export function millScore(count: number): number {
  if (count <= 0) return 0.2;
  return clamp(0.35 + Math.min(count, 8) * 0.08, 0, 1);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function lookupDistrictId(q: string): string | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const attempts = [trimmed, trimmed.replace(/\s+districts?$/i, "").trim()].filter(Boolean);
  for (const attempt of attempts) {
    const key = attempt.toLowerCase().replace(/\s+/g, "-");
    if (SNAPSHOT.districts[key]) return key;
    const found = Object.values(SNAPSHOT.districts).find(
      (d) => d.id === key || d.name.toLowerCase() === attempt.toLowerCase(),
    );
    if (found) return found.id;
  }
  return null;
}

export function irrigationFor(
  districtId: string,
  corrections: Correction[],
): IrrigationPrior {
  const applied = [...corrections]
    .reverse()
    .find((c) => c.districtId === districtId && c.fact === "canal_irrigation");
  if (applied) {
    const prior = priorForClass(applied.to);
    if (applied.evidenceSource) {
      return {
        ...prior,
        source: {
          ...prior.source,
          name: applied.evidenceSource.name,
          note: applied.evidenceSource.note ?? prior.source.note,
        },
      };
    }
    return prior;
  }
  return (
    IRRIGATION_PRIORS[districtId] ?? {
      class: "mixed_groundwater_surface",
      score: 0.7,
      label: "Mixed / unspecified",
      status: "modeled",
      assumption: "Default prior; no district-specific canal claim.",
      source: { name: "Workspace model prior" },
    }
  );
}

export function scenarioWeightMultiplier(scenario: ScenarioId): {
  irrigation: number;
  unverifiedPenalty: number;
} {
  if (scenario === "low_risk") return { irrigation: 1.15, unverifiedPenalty: 0.22 };
  if (scenario === "high_investment") return { irrigation: 0.9, unverifiedPenalty: 0.05 };
  return { irrigation: 1, unverifiedPenalty: 0.08 };
}

export type RankInput = {
  corrections?: Correction[];
  ndvi?: NdviLookup;
  scenario?: ScenarioId;
  retrievedAt?: string;
};

export function buildEvidence(
  districtId: string,
  input: RankInput = {},
): EvidenceItem[] {
  const rec = SNAPSHOT.districts[districtId];
  if (!rec) return [];
  const corrections = input.corrections ?? [];
  const items: EvidenceItem[] = [];

  const ndvi = input.ndvi?.[districtId];
  if (ndvi) {
    items.push({
      id: "ndvi",
      label: "Crop health (NDVI)",
      value: ndvi.value,
      display: ndvi.value.toFixed(3),
      status: "ok",
      score: clamp((ndvi.value + 0.2) / 0.9, 0, 1),
      usedInRanking: true,
      source: ndvi.source,
    });
  } else {
    items.push({
      id: "ndvi",
      label: "Crop health (NDVI)",
      value: null,
      display: "Gap",
      status: "gap",
      usedInRanking: false,
      source: {
        name: "Google Earth Engine (Sentinel-2 NDVI)",
        note: "No NDVI value is shown or used. Earth Engine was not available or returned no result.",
      },
    });
  }

  const frac = soilFractions(rec.soil);
  if (frac && rec.soil) {
    const texture = textureLabel(frac.clayPct, frac.sandPct, frac.siltPct);
    const score = soilScoreFromFractions(frac.clayPct, frac.sandPct);
    items.push({
      id: "soil",
      label: "Soil texture (0–5 cm)",
      value: texture,
      display: `${texture} · clay ${frac.clayPct.toFixed(1)}%`,
      status: "ok",
      score,
      usedInRanking: true,
      source: {
        name: rec.soil.source,
        url: rec.soil.url,
        retrievedAt: SNAPSHOT.retrievedAt,
        note: `Centroid sample ${rec.soil.query.lat}, ${rec.soil.query.lon}. Raw clay ${frac.clayGkg} g/kg (÷10 → %). Point sample, not a district mean.`,
      },
    });
  } else {
    items.push({
      id: "soil",
      label: "Soil texture",
      value: null,
      display: "Gap",
      status: "gap",
      usedInRanking: false,
      source: { name: "ISRIC SoilGrids 2.0", note: "No sample for this district." },
    });
  }

  if (rec.elevation && rec.elevation.meters != null) {
    items.push({
      id: "elevation",
      label: "Elevation",
      value: rec.elevation.meters,
      display: `${Math.round(rec.elevation.meters)} m`,
      unit: "m",
      status: "ok",
      score: elevationScore(rec.elevation.meters),
      usedInRanking: true,
      source: {
        name: rec.elevation.source,
        url: rec.elevation.url,
        retrievedAt: SNAPSHOT.retrievedAt,
        note: "SRTM-based point elevation at district centroid. Not a flood model.",
      },
    });
  } else {
    items.push({
      id: "elevation",
      label: "Elevation",
      value: null,
      display: "Gap",
      status: "gap",
      usedInRanking: false,
      source: { name: "Open-Meteo Elevation API", note: "Unavailable for this district." },
    });
  }

  const mills = rec.mills;
  if (mills && mills.status !== "gap" && typeof mills.count === "number") {
    items.push({
      id: "mills",
      label: "Rice mills (OSM)",
      value: mills.count,
      display: `${mills.count} OSM matches`,
      status: "ok",
      score: millScore(mills.count),
      usedInRanking: true,
      source: {
        name: mills.source,
        url: mills.url,
        retrievedAt: SNAPSHOT.retrievedAt,
        note: mills.note,
      },
    });
  } else {
    items.push({
      id: "mills",
      label: "Rice mills",
      value: null,
      display: "Gap",
      status: "gap",
      usedInRanking: false,
      source: {
        name: "Places API (New) via ADC, or OSM Overpass",
        note:
          mills?.reason ??
          "No mill registry in this session. Places is server-side ADC only; Overpass timed out at snapshot time.",
      },
    });
  }

  const irrig = irrigationFor(districtId, corrections);
  items.push({
    id: "irrigation",
    label: "Irrigation assumption",
    value: irrig.class,
    display: irrig.label,
    status: irrig.status,
    score: irrig.score,
    usedInRanking: true,
    source: irrig.source,
    assumption: irrig.assumption,
  });

  items.push({
    id: "flood",
    label: "Flood risk",
    value: null,
    display: "Gap",
    status: "gap",
    usedInRanking: false,
    source: {
      name: "NRSC / NDMA flood hazard (not loaded in V1)",
      note: "No district flood score is invented. Constraint “flood risk medium or lower” cannot be enforced.",
    },
  });

  return items;
}

export function activeWeights(
  evidenceSets: EvidenceItem[][],
  scenario: ScenarioId,
): { weights: Record<string, number>; dropped: RankingMeta["droppedFactors"] } {
  const factorIds = ["ndvi", "soil", "elevation", "mills", "irrigation", "flood"] as const;
  const dropped: RankingMeta["droppedFactors"] = [];
  const present: string[] = [];
  for (const id of factorIds) {
    const flags = evidenceSets.map((set) => Boolean(set.find((e) => e.id === id)?.usedInRanking));
    const any = flags.some(Boolean);
    const all = flags.length > 0 && flags.every(Boolean);
    // NDVI must be complete across the pool or it is dropped. Partial coverage
    // would otherwise zero-penalize districts with an explicit gap.
    const used = id === "ndvi" ? all : any;
    if (!used) {
      const sample = evidenceSets[0]?.find((e) => e.id === id);
      const reason =
        id === "ndvi" && any && !all
          ? "Partial NDVI coverage. Factor dropped from global weights so missing districts are not scored as 0."
          : (sample?.source.note ?? `${id} not available`);
      dropped.push({ id, reason });
    } else present.push(id);
  }
  const raw: Record<string, number> = {};
  let sum = 0;
  const boost = scenarioWeightMultiplier(scenario);
  for (const id of present) {
    let w = RECIPE_WEIGHTS[id as keyof typeof RECIPE_WEIGHTS];
    if (id === "irrigation") w *= boost.irrigation;
    raw[id] = w;
    sum += w;
  }
  const weights: Record<string, number> = {};
  if (sum === 0) return { weights, dropped };
  for (const [id, w] of Object.entries(raw)) weights[id] = w / sum;
  return { weights, dropped };
}

export function scoreEvidence(
  evidence: EvidenceItem[],
  weights: Record<string, number>,
  scenario: ScenarioId,
): number {
  const boost = scenarioWeightMultiplier(scenario);
  const usable: { id: string; w: number; score: number }[] = [];
  let sum = 0;
  for (const [id, w] of Object.entries(weights)) {
    const item = evidence.find((e) => e.id === id);
    if (!item || item.score == null || !item.usedInRanking) continue;
    usable.push({ id, w, score: item.score });
    sum += w;
  }
  if (sum === 0) return 0;
  let total = 0;
  for (const row of usable) {
    const item = evidence.find((e) => e.id === row.id);
    let s = row.score;
    if (item?.status === "unverified") s = clamp(s - boost.unverifiedPenalty, 0, 1);
    total += s * (row.w / sum);
  }
  return total;
}

export function reasonFrom(evidence: EvidenceItem[], score: number): string[] {
  const bits: string[] = [];
  const soil = evidence.find((e) => e.id === "soil");
  const elev = evidence.find((e) => e.id === "elevation");
  const irrig = evidence.find((e) => e.id === "irrigation");
  const ndvi = evidence.find((e) => e.id === "ndvi");
  if (soil?.status === "ok") bits.push(String(soil.display));
  if (elev?.status === "ok") bits.push(`elev ${elev.display}`);
  if (irrig) bits.push(irrig.display);
  if (ndvi?.status === "gap") bits.push("NDVI gap");
  bits.push(`score ${score.toFixed(3)}`);
  return bits;
}

export function rankDistricts(input: RankInput = {}): {
  candidates: Candidate[];
  meta: RankingMeta;
} {
  const ids = Object.keys(SNAPSHOT.districts);
  const scenario = input.scenario ?? "base";
  const byId: Record<string, EvidenceItem[]> = {};
  for (const id of ids) byId[id] = buildEvidence(id, input);
  const ndviComplete =
    ids.length > 0 &&
    ids.every((id) => byId[id]?.find((e) => e.id === "ndvi")?.status === "ok");
  if (!ndviComplete) {
    for (const id of ids) {
      const item = byId[id]?.find((e) => e.id === "ndvi");
      if (!item) continue;
      item.usedInRanking = false;
    }
  }
  const { weights, dropped } = activeWeights(Object.values(byId), scenario);
  const scored = ids.map((id) => {
    const rec = SNAPSHOT.districts[id]!;
    const evidence = byId[id]!;
    const score = scoreEvidence(evidence, weights, scenario);
    return { id, rec, evidence, score };
  });
  scored.sort((a, b) => b.score - a.score || a.rec.name.localeCompare(b.rec.name));
  const candidates: Candidate[] = scored.map((row, i) => ({
    districtId: row.id,
    name: row.rec.name,
    rank: i + 1,
    previousRank: null,
    score: row.score,
    scoreDisplay: (row.score * 100).toFixed(1),
    reasons: reasonFrom(row.evidence, row.score),
    evidence: row.evidence,
    centroid: row.rec.centroid,
  }));
  const ndviIncluded = Boolean(weights.ndvi);
  const meta: RankingMeta = {
    computedAt: new Date().toISOString(),
    recipe:
      "Rice-resilience V1: weighted sum of available factors only. Missing factors are dropped and weights renormalized. Unverified irrigation is penalized.",
    weights,
    droppedFactors: dropped,
    ndviIncluded,
    note: ndviIncluded
      ? "NDVI from Earth Engine is included (complete sourced coverage)."
      : "NDVI is a gap or only partial. No crop-health number was invented, and missing NDVI is not scored as 0.",
  };
  return { candidates, meta };
}

export function attachRankDelta(
  previous: Candidate[] | null,
  next: Candidate[],
): Candidate[] {
  if (!previous) return next;
  const prevRank = new Map(previous.map((c) => [c.districtId, c.rank]));
  return next.map((c) => ({
    ...c,
    previousRank: prevRank.get(c.districtId) ?? null,
  }));
}

export function uncertainDistrictIds(candidates: Candidate[]): string[] {
  return candidates
    .filter((c) => c.evidence.some((e) => e.status === "unverified"))
    .map((c) => c.districtId);
}
