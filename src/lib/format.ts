import type { Candidate, EvidenceItem, EvidenceStatus, LayerId } from "./types";

export const RANK_COLORS = ["#1d4ed8", "#047857", "#6d28d9", "#b45309", "#be185d", "#0f766e"];

export function rankColor(rank: number): string {
  return RANK_COLORS[(rank - 1) % RANK_COLORS.length] ?? "#334155";
}

export function statusLabel(status: EvidenceStatus): string {
  switch (status) {
    case "ok":
      return "Sourced";
    case "unverified":
      return "Unverified";
    case "modeled":
      return "Model prior";
    case "corrected":
      return "Corrected";
    case "gap":
      return "Gap";
  }
}

export function weakCard(evidence: EvidenceItem[]): EvidenceItem | undefined {
  return evidence.find((e) => e.status === "unverified") ?? evidence.find((e) => e.status === "gap");
}

export function choroplethMode(layers: Record<LayerId, boolean>): "ndvi" | "soil" | "elevation" | "rank" {
  if (layers.ndvi) return "ndvi";
  if (layers.soil) return "soil";
  if (layers.elevation) return "elevation";
  return "rank";
}

export function choroplethLabel(mode: ReturnType<typeof choroplethMode>, ndviIncluded: boolean): string {
  if (mode === "ndvi") return ndviIncluded ? "Fill: sourced NDVI (not rank)" : "Fill: NDVI gap (not rank)";
  if (mode === "soil") return "Fill: soil suitability";
  if (mode === "elevation") return "Fill: elevation";
  return "Fill: rank";
}

function lerpColor(a: string, b: string, t: number): string {
  const p = Math.max(0, Math.min(1, t));
  const ah = a.slice(1);
  const bh = b.slice(1);
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * p);
  const g = Math.round(ag + (bg - ag) * p);
  const bl = Math.round(ab + (bb - ab) * p);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

const GAP_FILL = "#cbd5e1";

export function districtFill(
  mode: ReturnType<typeof choroplethMode>,
  cand: Candidate | undefined,
): string {
  if (!cand) return GAP_FILL;
  if (mode === "ndvi") {
    const e = cand.evidence.find((x) => x.id === "ndvi");
    if (e?.status === "ok" && typeof e.value === "number") {
      return lerpColor("#f7fee7", "#166534", (e.value + 0.2) / 0.9);
    }
    return GAP_FILL;
  }
  if (mode === "soil") {
    const e = cand.evidence.find((x) => x.id === "soil");
    if (e?.score != null) return lerpColor("#f5f0e6", "#92400e", e.score);
    return GAP_FILL;
  }
  if (mode === "elevation") {
    const e = cand.evidence.find((x) => x.id === "elevation");
    if (typeof e?.value === "number") {
      const t = Math.max(0, Math.min(1, (e.value - 50) / 70));
      return lerpColor("#e0f2fe", "#1e3a8a", t);
    }
    return GAP_FILL;
  }
  return rankColor(cand.rank);
}

export function averageMetrics(
  cands: Candidate[],
  ndviIncluded: boolean,
): { ndvi: string; ndviBar: number; soil: string; soilN: number; elev: string } {
  if (!cands.length) {
    return { ndvi: "—", ndviBar: 0, soil: "—", soilN: 0, elev: "—" };
  }
  const ndviVals = cands
    .map((c) => c.evidence.find((e) => e.id === "ndvi"))
    .filter((e): e is EvidenceItem => e?.status === "ok" && typeof e.value === "number")
    .map((e) => e.value as number);
  const soils = cands
    .map((c) => c.evidence.find((e) => e.id === "soil")?.score)
    .filter((n): n is number => n != null);
  const elevs = cands
    .map((c) => c.evidence.find((e) => e.id === "elevation")?.value)
    .filter((n): n is number => typeof n === "number");
  const soilN = soils.length ? soils.reduce((a, b) => a + b, 0) / soils.length : 0;
  const ndviAvg = ndviVals.length ? ndviVals.reduce((a, b) => a + b, 0) / ndviVals.length : null;
  return {
    ndvi: ndviIncluded && ndviAvg != null ? ndviAvg.toFixed(2) : "Gap",
    ndviBar: ndviIncluded && ndviAvg != null ? Math.max(0, Math.min(1, (ndviAvg + 0.2) / 0.9)) : 0,
    soil: soils.length ? soilN.toFixed(2) : "Gap",
    soilN,
    elev: elevs.length ? `${Math.round(elevs.reduce((a, b) => a + b, 0) / elevs.length)} m` : "Gap",
  };
}
