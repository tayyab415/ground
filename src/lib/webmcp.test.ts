import { afterEach, describe, expect, it } from "vitest";
import { apply_correction, get_open_evidence, get_unsaved_changes, get_workspace_state, show_candidates } from "./commands";
import { emptyWorkspace, getState, replaceState, subscribe } from "./store";
import { executeRegisteredTool, normalizeToolInput, registerWebMcpTools, WEBMCP_TOOLS } from "./webmcp";

afterEach(() => replaceState(emptyWorkspace()));

describe("webmcp registration", () => {
  it("registers desk commands including get_unsaved_changes when modelContext exists", async () => {
    const names: string[] = [];
    const fake = {
      registerTool: async (tool: { name: string }) => {
        names.push(tool.name);
      },
    };
    Object.defineProperty(document, "modelContext", {
      value: fake,
      configurable: true,
    });
    const result = await registerWebMcpTools();
    expect(result.registered).toBe(true);
    expect(names).toEqual(WEBMCP_TOOLS.map((t) => t.name));
    expect(getState().webmcp.registered).toBe(true);
  });

  it("preview_scenario tool does not invent a seasonal canal on scenario-only input", async () => {
    await show_candidates();
    const tool = WEBMCP_TOOLS.find((t) => t.name === "preview_scenario");
    expect(tool).toBeTruthy();
    const result = (await tool!.execute({ scenario: "high_investment" })) as {
      ok: boolean;
      preview?: { correction?: unknown; whatChanged: string[] };
    };
    expect(result.ok).toBe(true);
    expect(result.preview?.correction).toBeUndefined();
    expect(result.preview?.whatChanged.join(" ")).not.toMatch(/canal/i);
  });
});

describe("User Prompt execute wrappers share the UI store", () => {
  it("normalizes JSON strings, wrappers, and Execute Tool objects the same way", () => {
    const object = { district: "gorakhpur", value: "seasonal" };
    expect(normalizeToolInput(object)).toEqual(object);
    expect(normalizeToolInput(JSON.stringify(object))).toEqual(object);
    expect(normalizeToolInput(JSON.stringify(JSON.stringify(object)))).toEqual(object);
    expect(normalizeToolInput({ arguments: object, thought: "fix canal" })).toEqual({
      district: "gorakhpur",
      value: "seasonal",
      thought: "fix canal",
    });
    expect(normalizeToolInput({ args: JSON.stringify(object) })).toEqual(object);
    const signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
    expect(normalizeToolInput(signal, object)).toEqual(object);
    expect(normalizeToolInput(undefined)).toEqual({});
  });

  it("apply_correction via the registered execute wrapper re-ranks the same store the UI reads", async () => {
    const bound: Record<string, (input?: unknown, options?: unknown) => Promise<unknown>> = {};
    Object.defineProperty(document, "modelContext", {
      value: {
        registerTool: async (tool: {
          name: string;
          execute: (input?: unknown, options?: unknown) => Promise<unknown>;
        }) => {
          bound[tool.name] = tool.execute;
        },
      },
      configurable: true,
    });
    await registerWebMcpTools();
    expect(typeof bound.apply_correction).toBe("function");
    expect(typeof bound.show_candidates).toBe("function");
    expect(typeof bound.open_evidence).toBe("function");

    await bound.show_candidates!({ limit: 5 });
    expect(getState().candidates[0]?.districtId).toBe("gorakhpur");
    expect(get_workspace_state().candidates[0]?.districtId).toBe("gorakhpur");

    await bound.open_evidence!({ arguments: JSON.stringify({ district: "Gorakhpur District" }) });
    expect(get_open_evidence().open).toBe(true);
    expect(getState().openEvidenceDistrictId).toBe("gorakhpur");
    expect(get_workspace_state().openEvidenceDistrictId).toBe("gorakhpur");

    const notified: string[] = [];
    const unsub = subscribe(() => notified.push(getState().openEvidenceDistrictId ?? ""));
    const signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
    const result = (await bound.apply_correction!(
      JSON.stringify({
        district: "gorakhpur",
        fact: "canal_irrigation",
        value: "seasonal",
        note: "The canal here is seasonal, not year-round.",
        thought: "Gemini extra field",
      }),
      { signal },
    )) as { ok?: boolean; moved?: { rank?: number; previousRank?: number; name?: string } };
    unsub();

    expect(result.ok).toBe(true);
    expect(result.moved?.previousRank).toBe(1);
    expect(result.moved?.rank).toBeGreaterThan(1);
    expect(notified.length).toBeGreaterThan(0);

    const store = getState();
    const viaRead = get_workspace_state();
    expect(store).toBe(getState());
    expect(store.openEvidenceDistrictId).toBe("gorakhpur");
    expect(viaRead.openEvidenceDistrictId).toBe("gorakhpur");
    const g = store.candidates.find((c) => c.districtId === "gorakhpur");
    expect(g?.rank).toBeGreaterThan(1);
    expect(g?.previousRank).toBe(1);
    expect(store.candidates[0]?.districtId).not.toBe("gorakhpur");
    expect(viaRead.candidates.find((c) => c.districtId === "gorakhpur")?.rank).toBe(g?.rank);
    const irrig = get_open_evidence().evidence?.find((e) => e.id === "irrigation");
    expect(irrig?.status).toBe("corrected");
    expect(String(irrig?.display).toLowerCase()).toMatch(/seasonal/);
    expect(get_unsaved_changes().corrections.length).toBeGreaterThan(0);
    expect(get_unsaved_changes().corrections[0]?.to).toBe("seasonal_canal");
    expect(get_unsaved_changes().corrections[0]?.committed).toBe(false);
  });

  it("executeRegisteredTool is the same command path as clicking Canal is seasonal", async () => {
    await show_candidates();
    const ui = apply_correction({
      district: "gorakhpur",
      value: "seasonal",
      note: "The canal here is seasonal, not year-round.",
    });
    const uiRank = getState().candidates.find((c) => c.districtId === "gorakhpur")?.rank;
    replaceState(emptyWorkspace());
    await show_candidates();
    const viaHost = (await executeRegisteredTool("apply_correction", {
      district: "gorakhpur",
      value: "seasonal_canal",
      thought: "extra",
    })) as { ok: boolean; moved?: { rank?: number } };
    expect(ui.ok).toBe(true);
    expect(viaHost.ok).toBe(true);
    expect(getState().candidates.find((c) => c.districtId === "gorakhpur")?.rank).toBe(uiRank);
    expect(getState().openEvidenceDistrictId).toBe("gorakhpur");
  });

  it("show_candidates and open_evidence wrappers write the tab state reads see", async () => {
    const opened = (await executeRegisteredTool("open_evidence", { district: "gorakhpur" })) as {
      error?: string;
    };
    expect(opened.error).toMatch(/show_candidates first/i);
    await executeRegisteredTool("show_candidates", JSON.stringify({ runAnalysis: true }));
    expect(get_workspace_state().candidates.length).toBeGreaterThan(0);
    await executeRegisteredTool("open_evidence", { name: "Gorakhpur" });
    expect(get_open_evidence().open).toBe(true);
    expect(get_open_evidence().districtId).toBe("gorakhpur");
    expect(getState().openEvidenceDistrictId).toBe("gorakhpur");
  });

  it("does not invent a field reply when send_ground_check is invoked via the execute wrapper", async () => {
    await show_candidates();
    const sent = (await executeRegisteredTool("send_ground_check", {
      district: "gorakhpur",
      question: "Is the canal seasonal?",
    })) as { ok: boolean; check?: { reply: unknown } };
    expect(sent.ok).toBe(true);
    expect(sent.check?.reply).toBeNull();
    const denied = (await executeRegisteredTool("approve_evidence", { checkId: "gc-missing" })) as {
      ok: boolean;
      error?: string;
    };
    expect(denied.ok).toBe(false);
    expect(String(denied.error)).toMatch(/will not fall back/i);
  });
});
