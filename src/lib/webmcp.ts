import {
  apply_correction,
  export_decision,
  get_current_selection,
  get_open_evidence,
  get_visible_map_state,
  get_workspace_state,
  highlight_uncertainty,
  open_evidence,
  preview_scenario,
  show_candidates,
} from "./commands";
import { patchState } from "./store";

type ToolSpec = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: boolean;
  };
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};

const emptyObject = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

export const WEBMCP_TOOLS: ToolSpec[] = [
  {
    name: "get_workspace_state",
    description:
      "Read the live Ground workspace: mission, constraints, layers, ranked candidates, open evidence, timeline, and unsaved selection/corrections. This is browser-tab state, not a server snapshot.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: () => get_workspace_state(),
  },
  {
    name: "get_current_selection",
    description:
      "Return the district/polygon the human currently has selected. The selection is unsaved and only exists in this tab.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: () => get_current_selection(),
  },
  {
    name: "get_visible_map_state",
    description: "Return map center, zoom, bounds, OSM tile status, and active layers.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: () => get_visible_map_state(),
  },
  {
    name: "get_open_evidence",
    description: "Return the evidence card currently open, including sources, gaps, and unverified assumptions.",
    inputSchema: emptyObject,
    annotations: { readOnlyHint: true },
    execute: () => get_open_evidence(),
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
      additionalProperties: false,
    },
    execute: (input) =>
      show_candidates({
        limit: typeof input.limit === "number" ? input.limit : undefined,
        runAnalysis: typeof input.runAnalysis === "boolean" ? input.runAnalysis : undefined,
      }),
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
      additionalProperties: false,
    },
    execute: (input) => open_evidence({ district: String(input.district ?? "") }),
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
      additionalProperties: false,
    },
    execute: (input) => highlight_uncertainty({ on: input.on === false ? false : true }),
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
      additionalProperties: false,
    },
    execute: (input) =>
      preview_scenario({
        district: input.district ? String(input.district) : undefined,
        fact: input.fact === "canal_irrigation" ? "canal_irrigation" : undefined,
        value:
          input.value === "year-round" || input.value === "seasonal" ? input.value : undefined,
        scenario:
          input.scenario === "high_investment" || input.scenario === "low_risk" || input.scenario === "base"
            ? input.scenario
            : undefined,
      }),
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
      additionalProperties: false,
    },
    execute: (input) =>
      apply_correction({
        district: input.district ? String(input.district) : undefined,
        fact: input.fact === "canal_irrigation" ? "canal_irrigation" : undefined,
        value:
          input.value === "year-round" || input.value === "seasonal" ? input.value : undefined,
        note: input.note ? String(input.note) : undefined,
      }),
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
      additionalProperties: false,
    },
    execute: (input) => export_decision({ download: input.download === false ? false : true }),
  },
];

export async function registerWebMcpTools(): Promise<{ registered: boolean; reason: string; names: string[] }> {
  const doc = typeof document === "undefined" ? undefined : document;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const ctx = doc?.modelContext ?? nav?.modelContext;
  const names = WEBMCP_TOOLS.map((t) => t.name);
  if (!ctx || typeof ctx.registerTool !== "function") {
    const reason =
      "document.modelContext.registerTool is not available in this browser. UI commands still work. Open in ChatGPT/Codex desktop or Chrome with WebMCP to let an agent call the same commands.";
    patchState({ webmcp: { registered: false, reason } });
    return { registered: false, reason, names };
  }
  try {
    for (const tool of WEBMCP_TOOLS) {
      await ctx.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: async (input) => tool.execute(input ?? {}),
      });
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
