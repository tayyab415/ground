import snapshot from "../data/ndvi-ee-snapshot.json";
import type { NdviLookup, SourceRef } from "./types";

export type NdviEeSnapshotFile = {
  asOf: string;
  startDate: string;
  endDate: string;
  latestScene: string;
  scenes: number;
  scaleMeters: number;
  cloudMask: string;
  source: SourceRef & { datasets?: string[] };
  districts: Record<string, number>;
  notInCandidatePool: Record<string, number>;
  missingInCandidatePool: string[];
  missingNote: string;
};

export const NDVI_EE_SNAPSHOT = snapshot as NdviEeSnapshotFile;

export function ndviSnapshotSourceNote(): string {
  const s = NDVI_EE_SNAPSHOT;
  return `${s.source.note ?? s.source.name} as_of ${s.asOf}, window ${s.startDate} to ${s.endDate}, ${s.scenes} scenes, latest_scene ${s.latestScene}, ${s.cloudMask}, scale ${s.scaleMeters}m.`;
}

export function lookupFromNdviSnapshot(requestedIds: string[]): NdviLookup {
  const out: NdviLookup = {};
  for (const id of requestedIds) {
    const value = NDVI_EE_SNAPSHOT.districts[id];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[id] = {
      value,
      source: {
        name: NDVI_EE_SNAPSHOT.source.name,
        url: NDVI_EE_SNAPSHOT.source.url,
        retrievedAt: NDVI_EE_SNAPSHOT.asOf,
        note: ndviSnapshotSourceNote(),
      },
      startDate: NDVI_EE_SNAPSHOT.startDate,
      endDate: NDVI_EE_SNAPSHOT.endDate,
    };
  }
  return out;
}
