import path from "node:path";
import { describe, expect, it } from "vitest";
import { materializeFunctionalP0Fixture } from "./materializeFunctionalP0Fixture.js";

describe("materializeFunctionalP0Fixture", () => {
  it.runIf(Boolean(process.env.GBA_STUDIO_MATERIALIZE_P0_FIXTURE))("writes the technical P0 fixture beside its assets", async () => {
    const appRoot = path.resolve(process.cwd());
    const result = await materializeFunctionalP0Fixture({ appRoot });

    expect(result.projectPath).toContain("electron-p0-playtest.gba-project");
    expect(result.enginePackPath.length).toBeGreaterThan(0);
  });
});
