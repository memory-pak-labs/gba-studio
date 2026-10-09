import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("responsive visual smoke source", () => {
  it("uses the canonical Exemplo GBA source and records provenance", async () => {
    const source = await readFile(new URL("./smoke-responsive-visual.mjs", import.meta.url), "utf8");

    expect(source).toContain("assertCanonicalP0Source(appRoot)");
    expect(source).toContain("canonicalP0Source.projectPath");
    expect(source).toContain("sourceKey: \"canonicalP0\"");
    expect(source).not.toContain("sourceFixturePath");
    expect(source).not.toContain("fixturePath,");
  });
});
