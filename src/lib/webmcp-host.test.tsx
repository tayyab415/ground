import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { emptyWorkspace, getState, replaceState } from "./store";
import { useWorkspace } from "./useWorkspace";
import { registerWebMcpTools } from "./webmcp";

afterEach(() => replaceState(emptyWorkspace()));

function DeskProbe() {
  const ws = useWorkspace();
  const open = ws.candidates.find((c) => c.districtId === ws.openEvidenceDistrictId);
  const irrig = open?.evidence.find((e) => e.id === "irrigation");
  const g = ws.candidates.find((c) => c.districtId === "gorakhpur");
  return (
    <div>
      <span data-read="leader">{ws.candidates[0]?.name ?? ""}</span>
      <span data-read="g-rank">{g?.rank ?? ""}</span>
      <span data-read="g-prev">{g?.previousRank ?? ""}</span>
      <span data-read="open">{ws.openEvidenceDistrictId ?? ""}</span>
      <span data-read="irrig">{irrig?.status ?? ""}</span>
      <span data-read="irrig-display">{irrig?.display ?? ""}</span>
      <span data-read="unsaved">{ws.corrections.filter((c) => !c.committed).length}</span>
    </div>
  );
}

async function mountProbe(): Promise<{ root: Root; el: HTMLDivElement; read: (key: string) => string }> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<DeskProbe />);
  });
  return {
    root,
    el,
    read: (key: string) => el.querySelector(`[data-read="${key}"]`)?.textContent ?? "",
  };
}

describe("WebMCP host execute updates React desk state", () => {
  it("User Prompt-shaped apply_correction moves ranking, evidence, and unsaved banner", async () => {
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
    const { root, el, read } = await mountProbe();
    try {
      await act(async () => {
        await bound.show_candidates!({ limit: 5 });
      });
      expect(read("leader")).toBe("Gorakhpur");
      expect(read("g-rank")).toBe("1");
      expect(getState().candidates[0]?.districtId).toBe("gorakhpur");

      await act(async () => {
        await bound.open_evidence!({ district: "Gorakhpur" });
      });
      expect(read("open")).toBe("gorakhpur");
      expect(read("irrig")).toBe("unverified");

      await act(async () => {
        await bound.apply_correction!(
          JSON.stringify({
            district: "gorakhpur",
            value: "seasonal",
            fact: "canal_irrigation",
            extra_from_gemini: true,
          }),
        );
      });

      expect(read("open")).toBe("gorakhpur");
      expect(read("irrig")).toBe("corrected");
      expect(read("irrig-display").toLowerCase()).toMatch(/seasonal/);
      expect(Number(read("g-rank"))).toBeGreaterThan(1);
      expect(read("g-prev")).toBe("1");
      expect(read("leader")).not.toBe("Gorakhpur");
      expect(Number(read("unsaved"))).toBeGreaterThan(0);
      expect(getState().openEvidenceDistrictId).toBe("gorakhpur");
    } finally {
      await act(async () => {
        root.unmount();
      });
      el.remove();
    }
  });
});
