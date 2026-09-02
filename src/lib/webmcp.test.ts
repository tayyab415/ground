import { afterEach, describe, expect, it } from "vitest";
import { show_candidates } from "./commands";
import { emptyWorkspace, getState, replaceState } from "./store";
import { registerWebMcpTools, WEBMCP_TOOLS } from "./webmcp";

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
