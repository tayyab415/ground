import { afterEach, describe, expect, it } from "vitest";
import { emptyWorkspace, getState, replaceState } from "./store";
import { registerWebMcpTools, WEBMCP_TOOLS } from "./webmcp";

afterEach(() => replaceState(emptyWorkspace()));

describe("webmcp registration", () => {
  it("registers the ten desk commands when modelContext exists", async () => {
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
});
