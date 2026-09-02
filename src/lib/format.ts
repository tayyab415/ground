import type { EvidenceItem, EvidenceStatus } from "./types";

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
