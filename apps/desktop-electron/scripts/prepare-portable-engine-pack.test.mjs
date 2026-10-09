import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { preparePortableEnginePack } from "./prepare-portable-engine-pack.mjs";

describe("portable Engine Pack", () => {
  it("preserves ARM bytes and Python sources in a package located under a path with spaces", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "GBA Studio pack "));
    try {
      const source = path.join(root, "source");
      const output = path.join(root, "package/EnginePack/GBAStudioEnginePack");
      await mkdir(path.join(source, "lib"), { recursive: true });
      await mkdir(path.join(source, "tools"));
      await writeFile(path.join(source, "enginepack.json"), JSON.stringify({ version: "2.26.0" }));
      const library = Buffer.from([0, 1, 127, 255]);
      await writeFile(path.join(source, "lib/libgbastudio_engine.a"), library);
      for (const tool of ["assetc", "gbsdoctor", "gbsbuild"]) {
        await writeFile(path.join(source, "tools", tool), `#!/usr/bin/env python3\nprint('${tool}')\n`);
      }
      await preparePortableEnginePack({ source, output });
      expect(await readFile(path.join(output, "lib/libgbastudio_engine.a"))).toEqual(library);
      for (const tool of ["assetc", "gbsdoctor", "gbsbuild"]) {
        expect(await readFile(path.join(output, "tools", `${tool}.py`))).toEqual(await readFile(path.join(source, "tools", tool)));
      }
      expect(await readFile(path.join(output, "HOST_REQUIREMENTS.txt"), "utf8")).toContain("does not bundle");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
