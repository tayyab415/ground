import type { GroundCheck, GroundCheckReply } from "./types";

const CHECKS_KEY = "ground.field-checks";
const REPLIES_KEY = "ground.field-replies";

function canUseStorage(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const k = "ground.store-probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function browserStoreAvailable(): boolean {
  return canUseStorage();
}

export function readStoredChecks(): GroundCheck[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(CHECKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GroundCheck[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredCheck(check: GroundCheck): { ok: boolean; reason?: string } {
  if (!canUseStorage()) return { ok: false, reason: "Browser store unavailable." };
  try {
    const rest = readStoredChecks().filter((c) => c.id !== check.id);
    localStorage.setItem(CHECKS_KEY, JSON.stringify([...rest, check]));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Browser store write failed." };
  }
}

export function readStoredReply(checkId: string): GroundCheckReply | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(REPLIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, GroundCheckReply>;
    return parsed[checkId] ?? null;
  } catch {
    return null;
  }
}

export function writeStoredReply(
  checkId: string,
  reply: GroundCheckReply,
): { ok: boolean; reason?: string } {
  if (!canUseStorage()) return { ok: false, reason: "Browser store unavailable." };
  try {
    const raw = localStorage.getItem(REPLIES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, GroundCheckReply>) : {};
    parsed[checkId] = reply;
    localStorage.setItem(REPLIES_KEY, JSON.stringify(parsed));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Browser store write failed." };
  }
}

export function findStoredCheck(checkId: string): GroundCheck | null {
  return readStoredChecks().find((c) => c.id === checkId) ?? null;
}

export const FIELD_STORE_GAP =
  "No GroundCheck store in this browser for that id. Same-tab localStorage can receive a reply. A mobile officer on another device is a gap unless a real shared store exists. Photo and GPS were not collected. No reply was invented.";

/** Same-browser store only. Do not treat URL query params as a reply store. */
export function fieldCaptureAllowed(
  checkId: string,
): { ok: true; check: GroundCheck } | { ok: false; gap: string } {
  if (!checkId) {
    return { ok: false, gap: "No check id in this link. Nothing was invented." };
  }
  const check = findStoredCheck(checkId);
  if (!check) return { ok: false, gap: FIELD_STORE_GAP };
  return { ok: true, check };
}
