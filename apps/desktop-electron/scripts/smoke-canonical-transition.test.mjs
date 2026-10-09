import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("canonical transition smoke", () => {
  it("derives the focused probe from the canonical source and marks it diagnostic-only", async () => {
    const source = await readFile(new URL("./smoke-canonical-transition.mjs", import.meta.url), "utf8");

    expect(source).toContain('resolveCanonicalP0Source(appRoot)');
    expect(source).toContain('auditCanonicalP0Assets(appRoot)');
    expect(source).toContain('derivedFromCanonical: true');
    expect(source).toContain('global: false');
    expect(source).toContain('async function findAvailablePort()');
    expect(source).toContain('`--evidence=${sceneEvidencePath}`');
    expect(source).toContain('GBA_STUDIO_SMOKE_CDP_PORT: String(cdpPort)');
    expect(source).not.toContain('technicalFixture');
    expect(source).not.toContain('electron-p0-playtest.gba-project');
  });
});
