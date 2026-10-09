import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_COUNCIL_BACKGROUND_LAYOUT,
  syncVerticeCouncilBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção do Conselho da Guardiã de Vértice", () => {
  it("copia a fonte 4 bpp runtime15 do Conselho igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "council-background-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const asset = VERTICE_COUNCIL_BACKGROUND_LAYOUT[0];
    const source = path.join(sourceDirectory, asset.source);

    await Promise.all([
      mkdir(path.dirname(source), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(source, "approved-council-v3-pixels"),
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);

    const synced = await syncVerticeCouncilBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    const target = path.join("Assets", asset.destination, asset.name);
    expect(asset).toEqual({
      source: "conselho-guardia-v3/prepared/vertice-council-gba-v3-runtime15.png",
      name: "council-gba.png",
      destination: "backgrounds"
    });
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), target)]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), target)]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
      .resolves.toBe("approved-council-v3-pixels");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
      .resolves.toBe("approved-council-v3-pixels");
  });
});
