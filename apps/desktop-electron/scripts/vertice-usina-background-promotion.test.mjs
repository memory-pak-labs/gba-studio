import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_USINA_BACKGROUND_LAYOUT,
  syncVerticeUsinaBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção da Usina Submersa de Vértice", () => {
  it("copia a fonte 4 bpp aprovada v2 igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "usina-background-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const asset = VERTICE_USINA_BACKGROUND_LAYOUT[0];
    const source = path.join(sourceDirectory, asset.source);

    await Promise.all([
      mkdir(path.dirname(source), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(source, "approved-usina-v2-pixels"),
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);

    const synced = await syncVerticeUsinaBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    const target = path.join("Assets", asset.destination, asset.name);
    expect(asset).toEqual({
      source: "usina-submersa-v2/prepared/vertice-usina-submersa-v2-gba.png",
      name: "usina-submersa-gba.png",
      destination: "backgrounds"
    });
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), target)]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), target)]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
      .resolves.toBe("approved-usina-v2-pixels");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
      .resolves.toBe("approved-usina-v2-pixels");
  });
});
