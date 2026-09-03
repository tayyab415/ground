import {
  apply_correction,
  approve_evidence,
  export_decision,
  get_current_selection,
  get_ground_checks,
  get_open_evidence,
  get_unsaved_changes,
  get_visible_map_state,
  get_workspace_state,
  highlight_uncertainty,
  open_evidence,
  preview_scenario,
  send_ground_check,
  set_region,
  show_candidates,
} from "./commands";
import { lookupDistrictId } from "./rank";
import { getState, notifyListeners, patchState } from "./store";
import type { ScenarioId } from "./types";

type ToolExecuteOptions = { signal?: AbortSignal };

type ToolSpec = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  annotations?: { readOnlyHint?: boolean };
  execute: (input?: unknown, options?: ToolExecuteOptions) => unknown | Promise<unknown>;
};

type ToolRunner = (input: Record<string, unknown>) => unknown | Promise<unknown>;

const WRAPPER_KEYS = ["input", "arguments", "args", "parameters", "params", "data"] as const;

const DISPATCH_KEY = "__groundWebMcpExecute";

type GroundGlobal = typeof globalThis & {
  [DISPATCH_KEY]?: typeof executeRegisteredTool;
};

const emptyObject = {
  type: "object" as const,
  properties: {},
};

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    "aborted" in value &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as AbortSignal).addEventListener === "function"
  );
}

function isExecuteOptions(value: unknown): value is ToolExecuteOptions {
  return typeof value === "object" && value !== null && isAbortSignal((value as ToolExecuteOptions).signal);
}

function unwrapJson(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== "string") return current;
    const trimmed = current.trim();
    if (!trimmed) return {};
    const start = trimmed.charAt(0);
    if (start !== "{" && start !== "[" && start !== '"') return current;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return current;
    }
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isAbortSignal(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Inspector User Prompt (Gemini) may pass a JSON string, a double-encoded
 * string, or `{ arguments: ... }` instead of the object Execute Tool sends.
 * Chrome's executeTool parses JSON first; a cloned/stale execute callback
 * may not. Unwrap without inventing fields.
 */
export function normalizeToolInput(raw?: unknown, extra?: unknown): Record<string, unknown> {
  let value: unknown = raw;
  if (isAbortSignal(value) || isExecuteOptions(value)) {
    value = extra;
  }
  value = unwrapJson(value);
  if (Array.isArray(value) && value.length === 1) {
    value = unwrapJson(value[0]);
  }
  if (value == null || value === "") return {};
  const rec = asRecord(value);
  if (!rec) return {};

  for (const key of WRAPPER_KEYS) {
    if (!(key in rec) || rec[key] == null) continue;
    const inner = unwrapJson(rec[key]);
    const innerRec = asRecord(inner);
    if (!innerRec) continue;
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if ((WRAPPER_KEYS as readonly string[]).includes(k)) continue;
      rest[k] = v;
    }
    return { ...innerRec, ...rest };
  }
  return rec;
}

function stringField(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    const nested = asRecord(value);
    if (nested) {
      const fromNested = stringField(nested, "district", "name", "id", "value");
      if (fromNested) return fromNested;
    }
  }
  return undefined;
}

function districtFrom(input: Record<string, unknown>): string | undefined {
  const raw = stringField(
    input,
    "district",
    "districtId",
    "district_id",
    "districtName",
    "district_name",
    "candidate",
    "location",
  );
  if (raw) return lookupDistrictId(raw) ?? raw;
  for (const key of ["name", "id"] as const) {
    const alias = stringField(input, key);
    if (!alias) continue;
    const resolved = lookupDistrictId(alias);
    if (resolved) return resolved;
  }
  return undefined;
}

function mentionIsNegated(text: string, matchIndex: number): boolean {
  const before = text.slice(0, matchIndex);
  return /(?:^|[^a-z])(?:not|no|non|never|isn't|isnt|ain't|aint|neither)\s+(?:an?\s+|the\s+)?$/i.test(
    before,
  );
}

const CANAL_CLASS_RE = "(?:year\\s*round|yearround|perennial|seasonal)";
const NEGATION_RE = "(?:not|no|non|never|isn't|isnt|ain't|aint|neither)";

/** `seasonal? no, perennial` denies seasonal; `seasonal, not year-round` does not. */
function trailingShortDenial(text: string, matchIndex: number, phraseLen: number): boolean {
  const after = text.slice(matchIndex + phraseLen);
  const m = after.match(new RegExp(`^\\s*[?.,:;!)"']*\\s*${NEGATION_RE}\\b([\\s\\S]*)$`, "i"));
  if (!m) return false;
  const rest = (m[1] ?? "").replace(/^\s+/, "");
  if (new RegExp(`^(?:an?\\s+|the\\s+)?${CANAL_CLASS_RE}\\b`, "i").test(rest)) return false;
  return true;
}

function mentionIsDenied(text: string, matchIndex: number, phraseLen: number): boolean {
  return mentionIsNegated(text, matchIndex) || trailingShortDenial(text, matchIndex, phraseLen);
}

function eachPhraseMatch(
  text: string,
  phrase: string,
  onMatch: (index: number, length: number) => boolean,
): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (onMatch(match.index, match[0].length)) return true;
  }
  return false;
}

function hasPositivePhrase(text: string, phrase: string): boolean {
  return eachPhraseMatch(text, phrase, (index, length) => !mentionIsDenied(text, index, length));
}

function hasNegatedPhrase(text: string, phrase: string): boolean {
  return eachPhraseMatch(text, phrase, (index, length) => mentionIsDenied(text, index, length));
}

/**
 * Map inspector/Gemini canal values. Exact aliases first. Prefix negation
 * (`not seasonal; perennial`) and trailing short denials (`seasonal? no, perennial`)
 * are year-round. Unclassified mixed prose returns undefined so the host
 * wrapper can reject before apply_correction defaults to seasonal.
 * Doubly denied prose (`seasonal? no, not year-round`) stays unclassified.
 */
export function canalValueFrom(input: Record<string, unknown>): "seasonal" | "year-round" | undefined {
  const raw = stringField(input, "value", "irrigation", "canal", "to");
  if (!raw) return undefined;
  const n = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (n === "seasonal" || n === "seasonal canal") return "seasonal";
  if (
    n === "year round" ||
    n === "yearround" ||
    n === "perennial" ||
    n === "perennial canal assumed" ||
    n === "year round canal"
  ) {
    return "year-round";
  }
  const seasonal = hasPositivePhrase(n, "seasonal");
  const yearRound =
    hasPositivePhrase(n, "perennial") ||
    hasPositivePhrase(n, "year round") ||
    hasPositivePhrase(n, "yearround");
  const seasonalDenied = hasNegatedPhrase(n, "seasonal");
  const yearRoundDenied =
    hasNegatedPhrase(n, "perennial") ||
    hasNegatedPhrase(n, "year round") ||
    hasNegatedPhrase(n, "yearround");
  if (yearRound && !seasonal) return "year-round";
  if (seasonal && !yearRound) return "seasonal";
  if (!seasonal && seasonalDenied && !yearRoundDenied && !yearRound) return "year-round";
  if (!yearRound && yearRoundDenied && !seasonalDenied && !seasonal) return "seasonal";
  return undefined;
}

function classifiedCanalValue(
  input: Record<string, unknown>,
): { ok: true; value?: "seasonal" | "year-round" } | { ok: false; error: string } {
  const raw = stringField(input, "value", "irrigation", "canal", "to");
  const value = canalValueFrom(input);
  if (raw && value == null) {
    return {
      ok: false,
      error:
        "Could not classify canal correction as seasonal or year-round. Ambiguous prose was not applied.",
    };
  }
  return { ok: true, value };
}

function canalFactFrom(input: Record<string, unknown>): "canal_irrigation" | undefined {
  const raw = stringField(input, "fact");
  if (raw == null) return undefined;
  const n = raw.toLowerCase().replace(/[_-]+/g, " ");
  if (n === "canal irrigation" || n === "irrigation" || n === "canal") return "canal_irrigation";
  return raw === "canal_irrigation" ? "canal_irrigation" : undefined;
}

function scenarioFrom(input: Record<string, unknown>): ScenarioId | undefined {
  const raw = stringField(input, "scenario");
  if (raw === "high_investment" || raw === "low_risk" || raw === "base") return raw;
  return undefined;
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ok: false, error: "Tool result could not be serialized for the agent." };
  }
}

const runners: Record<string, ToolRunner> = {
  get_workspace_state: () => get_workspace_state(),
  get_current_selection: () => get_current_selection(),
  get_visible_map_state: () => get_visible_map_state(),
  get_open_evidence: () => get_open_evidence(),
  get_unsaved_changes: () => get_unsaved_changes(),
  show_candidates: (input) =>
    show_candidates({
      limit: typeof input.limit === "number" ? input.limit : undefined,
      runAnalysis: typeof input.runAnalysis === "boolean" ? input.runAnalysis : undefined,
    }),
  open_evidence: (input) => open_evidence({ district: String(districtFrom(input) ?? "") }),
  highlight_uncertainty: (input) => highlight_uncertainty({ on: input.on === false ? false : true }),
  preview_scenario: (input) => {
    const classified = classifiedCanalValue(input);
    if (!classified.ok) return classified;
    return preview_scenario({
      district: districtFrom(input),
      fact: canalFactFrom(input),
      value: classified.value,
      scenario: scenarioFrom(input),
    });
  },
  apply_correction: (input) => {
    const classified = classifiedCanalValue(input);
    if (!classified.ok) return classified;
    return apply_correction({
      district: districtFrom(input),
      fact: canalFactFrom(input),
      value: classified.value,
      note: stringField(input, "note"),
    });
  },
  export_decision: (input) => export_decision({ download: input.download === false ? false : true }),
  send_ground_check: (input) =>
    send_ground_check({
      district: districtFrom(input),
      question: stringField(input, "question"),
      dueDays: typeof input.dueDays === "number" ? input.dueDays : undefined,
    }),
  approve_evidence: (input) => {
    if (!("checkId" in input) || input.checkId === undefined || input.checkId === null) {
      return approve_evidence({});
    }
    return approve_evidence({ checkId: String(input.checkId) });
  },
  set_region: (input) => {
    const region = input.region === undefined || input.region === null ? undefined : String(input.region);
    return set_region({ region });
  },
  get_ground_checks: () => get_ground_checks(),
};

/**
 * Same command path the visible UI uses. Inspector User Prompt, Execute Tool,
 * and in-page buttons all end here so ranking / evidence / unsaved state move
 * on one in-tab store.
 */
export async function executeRegisteredTool(
  name: string,
  raw?: unknown,
  extra?: unknown,
): Promise<unknown> {
  const input = normalizeToolInput(raw, extra);
  const run = runners[name];
  if (!run) {
    return { ok: false, error: `Unknown tool: ${name}` };
  }
  const result = await Promise.resolve(run(input));
  notifyListeners();
  return result;
}

function installDispatcher() {
  const g = globalThis as GroundGlobal;
  g[DISPATCH_KEY] = executeRegisteredTool;
}

installDispatcher();

function hostExecute(toolName: string) {
  return async (input?: unknown, options?: ToolExecuteOptions) => {
    const g = globalThis as GroundGlobal;
    const live = g[DISPATCH_KEY] ?? executeRegisteredTool;
    const result = await live(toolName, input, options);
    notifyListeners();
    return jsonSafe(result);
  };
}

export const WEBMCP_TOOLS: ToolSpec[] = [
  {
    name: "get_workspace_state",
    description:
      "Read the live Ground workspace: mission, constraints, layers, ranked candidates, open evidence, timeline, and unsaved selection/corrections. This is browser-tab state, not a server snapshot.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: hostExecute("get_workspace_state"),
  },
  {
    name: "get_current_selection",
    description:
      "Return the district, polygon, lasso, or point the human currently has selected. The selection is unsaved and only exists in this tab — not a server roundtrip.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: hostExecute("get_current_selection"),
  },
  {
    name: "get_visible_map_state",
    description: "Return map center, zoom, bounds, OSM tile status, and active layers.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: hostExecute("get_visible_map_state"),
  },
  {
    name: "get_open_evidence",
    description: "Return the evidence card currently open, including sources, gaps, and unverified assumptions.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: hostExecute("get_open_evidence"),
  },
  {
    name: "get_unsaved_changes",
    description:
      "Return unsaved human selection, uncommitted corrections, and any open preview in this tab. This state is not persisted and is visible to an agent only through WebMCP.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: hostExecute("get_unsaved_changes"),
  },
  {
    name: "show_candidates",
    description:
      "Run or refresh the honest ranking and show ranked districts as map overlays. NDVI is included only if Earth Engine returned sourced values; otherwise it is a gap.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many candidates to emphasize (default: mission max districts)." },
        runAnalysis: {
          type: "boolean",
          description: "If true (default when empty), recompute ranking before showing.",
        },
      },
    },
    execute: hostExecute("show_candidates"),
  },
  {
    name: "open_evidence",
    description:
      "Open the evidence card for a ranked district (name or id), e.g. Gorakhpur. Same action as clicking View details.",
    inputSchema: {
      type: "object",
      properties: {
        district: { type: "string", description: "District name or id, e.g. Gorakhpur or gorakhpur." },
      },
      required: ["district"],
    },
    execute: hostExecute("open_evidence"),
  },
  {
    name: "highlight_uncertainty",
    description:
      "Mark districts whose current rank depends on an unverified assumption (the Gorakhpur canal prior).",
    inputSchema: {
      type: "object",
      properties: {
        on: { type: "boolean", description: "Default true. Set false to clear." },
      },
    },
    execute: hostExecute("highlight_uncertainty"),
  },
  {
    name: "preview_scenario",
    description:
      "Preview a re-ranking without committing. Pass scenario to preview weight changes. Pass fact and value only to preview a canal correction; district is required then unless a district is already selected. Does not default to Gorakhpur or seasonal canal.",
    inputSchema: {
      type: "object",
      properties: {
        district: { type: "string", description: "District name or id when previewing a canal correction. No default." },
        fact: { type: "string", enum: ["canal_irrigation"] },
        value: { type: "string", enum: ["seasonal", "year-round"] },
        scenario: { type: "string", enum: ["base", "high_investment", "low_risk"] },
      },
    },
    execute: hostExecute("preview_scenario"),
  },
  {
    name: "apply_correction",
    description:
      "Apply a human correction and re-run the bounded ranking in this tab (unsaved). Default: canal irrigation is seasonal.",
    inputSchema: {
      type: "object",
      properties: {
        district: { type: "string", description: "District name or id. Defaults to current unsaved selection." },
        fact: { type: "string", enum: ["canal_irrigation"] },
        value: { type: "string", enum: ["seasonal", "year-round"] },
        note: { type: "string" },
      },
    },
    execute: hostExecute("apply_correction"),
  },
  {
    name: "set_region",
    description:
      "Switch the workspace to another supported region (up, maharashtra, us). Resets ranking, corrections, ground checks, draw mode, and timeline. Call show_candidates to rank this region.",
    inputSchema: {
      type: "object",
      properties: {
        region: { type: "string", enum: ["up", "maharashtra", "us"], description: "Region id." },
      },
      required: ["region"],
    },
    execute: hostExecute("set_region"),
  },
  {
    name: "export_decision",
    description:
      "Generate the decision record (mission, ranking history, sources, corrections, gaps, reproducibility hash) and download JSON. Same as Share/export in the UI.",
    inputSchema: {
      type: "object",
      properties: {
        download: { type: "boolean", description: "Default true. Set false to return the record without downloading." },
      },
    },
    execute: hostExecute("export_decision"),
  },
  {
    name: "get_ground_checks",
    description:
      "Read GroundChecks and their field replies in this tab. Replies are real (photo + answer) or absent — never invented. Approved replies mark verified field evidence.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: hostExecute("get_ground_checks"),
  },
  {
    name: "send_ground_check",
    description:
      "Create a GroundCheck for a field officer: one question, one location, photo + short answer, due date. Same as the Send GroundCheck control. Does not invent a reply. If the reply store is down, the check is a gap.",
    inputSchema: {
      type: "object",
      properties: {
        district: { type: "string", description: "District name or id. Defaults to current selection." },
        question: { type: "string", description: "One precise question for the officer." },
        dueDays: { type: "number", description: "Days until due (default 7)." },
      },
    },
    execute: hostExecute("send_ground_check"),
  },
  {
    name: "approve_evidence",
    description:
      "Mark a field GroundCheck reply as verified evidence. Reads the officer's answer and, when the reply contradicts the current irrigation assumption, applies the resulting correction and re-ranks. Same as Approve evidence in the UI. Fails if no real reply exists — never fakes a field photo, GPS, or answer.",
    inputSchema: {
      type: "object",
      properties: {
        checkId: {
          type: "string",
          description:
            "GroundCheck id. If supplied (including whitespace-only), missing/empty is an error — no fallback. Omit to approve the latest replied check in this tab or its same-tab localStorage store.",
        },
      },
    },
    execute: hostExecute("approve_evidence"),
  },
];

function modelContext(): WebMcpContext | undefined {
  const doc = typeof document === "undefined" ? undefined : document;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return doc?.modelContext ?? nav?.modelContext;
}

let registerAbort: AbortController | null = null;

export async function registerWebMcpTools(): Promise<{ registered: boolean; reason: string; names: string[] }> {
  installDispatcher();
  const names = WEBMCP_TOOLS.map((t) => t.name);
  const ctx = modelContext();
  if (!ctx || typeof ctx.registerTool !== "function") {
    const reason =
      "document.modelContext.registerTool is not available in this browser. UI commands still work. Open in ChatGPT/Codex desktop or Chrome with WebMCP to let an agent call the same commands.";
    patchState({ webmcp: { registered: false, reason } });
    return { registered: false, reason, names };
  }
  try {
    registerAbort?.abort();
    registerAbort = typeof AbortController === "function" ? new AbortController() : null;
    for (const tool of WEBMCP_TOOLS) {
      await ctx.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: hostExecute(tool.name),
        },
        registerAbort ? { signal: registerAbort.signal } : undefined,
      );
    }
    const reason = `Registered ${names.length} tools on document.modelContext. Same commands as the visible UI.`;
    patchState({ webmcp: { registered: true, reason } });
    return { registered: true, reason, names };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "registerTool failed";
    patchState({ webmcp: { registered: false, reason } });
    return { registered: false, reason, names };
  }
}

let registerTimer: ReturnType<typeof setInterval> | null = null;
const REGISTER_RETRY_MS = 1200;
const REGISTER_MAX_TRIES = 60; // ~72s of retries before giving up

/**
 * The WebMCP client in Chrome/ChatGPT/Codex injects document.modelContext
 * asynchronously, usually after the app has already mounted and missed it.
 * Poll until it appears (or a hard cap), then register exactly once.
 * If a second client appears later, it re-registers over the same tool names.
 */
export async function startWebMcpAutoRegister(): Promise<void> {
  let tries = 0;
  if (registerTimer) {
    clearInterval(registerTimer);
    registerTimer = null;
  }
  const attempt = async () => {
    const s = getState();
    const bridge = modelContext();
    if (bridge && typeof bridge.registerTool === "function") {
      if (!s.webmcp.registered) {
        await registerWebMcpTools();
      }
      return;
    }
    tries += 1;
    if (tries === 1 || tries % 10 === 0) {
      patchState({
        webmcp: {
          registered: false,
          reason: `Waiting for the WebMCP client to attach (check ${tries}/...). Enable WebMCP in this browser tab, or reload with it active.`,
        },
      });
    }
  };
  await attempt();
  if (!registerTimer) {
    registerTimer = setInterval(() => void attempt(), REGISTER_RETRY_MS);
  }
  setTimeout(() => {
    if (registerTimer) {
      clearInterval(registerTimer);
      registerTimer = null;
    }
  }, REGISTER_RETRY_MS * REGISTER_MAX_TRIES);
}

export function stopWebMcpAutoRegister() {
  if (registerTimer) {
    clearInterval(registerTimer);
    registerTimer = null;
  }
}
