import { lookupFromNdviSnapshot, NDVI_EE_SNAPSHOT, ndviSnapshotSourceNote } from "./ndviSnapshot";
import type { NdviLookup } from "./types";

export type AnalysisResponse = {
  ndvi: NdviLookup;
  gap: { reason: string } | null;
  millsGap?: { reason: string } | null;
};

function analysisUrl(): string | null {
  const raw = import.meta.env.VITE_ANALYSIS_URL as string | undefined;
  if (!raw || !raw.trim()) return null;
  return raw.replace(/\/$/, "");
}

/**
 * Honest NDVI lookup. Never invents a number.
 * Missing sidecar URL → dated public EE snapshot (sourced values only).
 * Timeout, non-OK payload, or payload without sources → gap.
 *
 * The public desk leaves VITE_ANALYSIS_URL empty and never calls the private sidecar.
 * A private operator may point a non-public build at the IAM/token-gated sidecar.
 * Never put a sidecar token or Maps JS key in the frontend bundle; never call a
 * CORS-open /v1/ndvi on the public internet.
 */
export function ndviFromPublicSnapshot(requestedIds: string[]): AnalysisResponse {
  const ndvi = lookupFromNdviSnapshot(requestedIds);
  const result = finalizeNdviCoverage(requestedIds, ndvi);
  if (!result.gap) return result;
  const missing = requestedIds.filter((id) => ndvi[id] == null);
  if (Object.keys(ndvi).length === 0) {
    return {
      ndvi: {},
      gap: {
        reason: `No sourced NDVI in the dated EE snapshot (${ndviSnapshotSourceNote()}). Nothing was invented.`,
      },
    };
  }
  return {
    ndvi: result.ndvi,
    gap: {
      reason: `Partial NDVI from dated EE snapshot (${NDVI_EE_SNAPSHOT.asOf}, Sentinel-2 ${NDVI_EE_SNAPSHOT.startDate}–${NDVI_EE_SNAPSHOT.endDate}). Sourced values shown for ${Object.keys(ndvi).length}/${requestedIds.length} requested districts. Missing ${missing.join(", ") || "none"} — not invented. Ranking does not include NDVI.`,
    },
  };
}

export async function fetchNdvi(districts: { id: string; lat: number; lon: number }[]): Promise<AnalysisResponse> {
  const base = analysisUrl();
  if (!base) {
    return ndviFromPublicSnapshot(districts.map((d) => d.id));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${base}/v1/ndvi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: "gen-lang-client-0261050164",
        districts,
      }),
      signal: ctrl.signal,
    });
    const body = (await res.json()) as {
      status?: string;
      reason?: string;
      districts?: Array<{
        id: string;
        ndvi?: number;
        source?: { name: string; url?: string };
        startDate?: string;
        endDate?: string;
      }>;
    };
    if (!res.ok || body.status === "gap") {
      return {
        ndvi: {},
        gap: { reason: body.reason ?? `Earth Engine gap (HTTP ${res.status})` },
      };
    }
    const ndvi: NdviLookup = {};
    for (const row of body.districts ?? []) {
      if (!row.id) continue;
      if (typeof row.ndvi !== "number" || !row.source?.name) continue;
      if (!Number.isFinite(row.ndvi) || row.ndvi < -1 || row.ndvi > 1) continue;
      ndvi[row.id] = {
        value: row.ndvi,
        source: {
          name: row.source.name,
          url: row.source.url,
          note: `Sentinel-2 NDVI ${row.startDate ?? "?"}–${row.endDate ?? "?"}`,
        },
        startDate: row.startDate ?? "",
        endDate: row.endDate ?? "",
      };
    }
    return finalizeNdviCoverage(
      districts.map((d) => d.id),
      ndvi,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Earth Engine request failed";
    return { ndvi: {}, gap: { reason: `Earth Engine unavailable: ${reason}` } };
  } finally {
    clearTimeout(t);
  }
}

/**
 * gap:null only when every requested district has a sourced NDVI.
 * Partial coverage keeps real values for evidence but is still a gap for ranking/banner.
 */
export function finalizeNdviCoverage(requestedIds: string[], ndvi: NdviLookup): AnalysisResponse {
  const wanted = requestedIds.filter(Boolean);
  const present = wanted.filter((id) => ndvi[id] != null);
  const missing = wanted.filter((id) => ndvi[id] == null);
  if (present.length === 0) {
    return {
      ndvi: {},
      gap: {
        reason: "Earth Engine returned no sourced NDVI values. Nothing was invented.",
      },
    };
  }
  if (missing.length > 0) {
    return {
      ndvi,
      gap: {
        reason: `Partial NDVI: sourced values for ${present.length}/${wanted.length} requested districts (missing ${missing.join(", ")}). Not treated as complete coverage; ranking does not include NDVI.`,
      },
    };
  }
  return { ndvi, gap: null };
}

export function analysisConfigured(): boolean {
  return Boolean(analysisUrl());
}
