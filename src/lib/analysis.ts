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
 * Missing URL, timeout, non-OK payload, or payload without sources → gap.
 */
export async function fetchNdvi(districts: { id: string; lat: number; lon: number }[]): Promise<AnalysisResponse> {
  const base = analysisUrl();
  if (!base) {
    return {
      ndvi: {},
      gap: {
        reason:
          "No analysis API configured (VITE_ANALYSIS_URL empty). Earth Engine runs only on Cloud Run with ADC. NDVI is a gap.",
      },
    };
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
    if (Object.keys(ndvi).length === 0) {
      return {
        ndvi: {},
        gap: {
          reason: "Earth Engine returned no sourced NDVI values. Nothing was invented.",
        },
      };
    }
    return { ndvi, gap: null };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Earth Engine request failed";
    return { ndvi: {}, gap: { reason: `Earth Engine unavailable: ${reason}` } };
  } finally {
    clearTimeout(t);
  }
}

export function analysisConfigured(): boolean {
  return Boolean(analysisUrl());
}
