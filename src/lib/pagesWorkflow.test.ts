import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("pages workflow", () => {
  const yml = readFileSync(resolve(".github/workflows/test-and-pages.yml"), "utf8");

  it("deploys the CI dist on main, not a committed /docs snapshot", () => {
    expect(yml).toMatch(/path:\s*dist/);
    expect(yml).toMatch(/BASE_PATH:\s*\/ground\//);
    expect(yml).toContain("grep -q '/ground/assets/' dist/index.html");
    expect(yml).not.toMatch(/continue-on-error/);
    expect(yml).not.toMatch(/path:\s*docs/);
  });
});
