import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_TITLE_BACKGROUND_LAYOUT,
  syncVerticeTitleBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção da tela de título de Vértice", () => {
  it("copia os frames preparados v4 igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "title-background-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      ...VERTICE_TITLE_BACKGROUND_LAYOUT.map((asset) =>
        mkdir(path.dirname(path.join(sourceDirectory, asset.source)), { recursive: true })
      ),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);
    await Promise.all(VERTICE_TITLE_BACKGROUND_LAYOUT.map((asset) =>
      writeFile(path.join(sourceDirectory, asset.source), `approved-${asset.name}-v4-pixels`)
    ));

    const synced = await syncVerticeTitleBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toEqual(VERTICE_TITLE_BACKGROUND_LAYOUT.map((asset) =>
      path.join(path.dirname(templateProjectPath), "Assets", asset.destination, asset.name)
    ));
    expect(synced.fixtureAssets).toEqual(VERTICE_TITLE_BACKGROUND_LAYOUT.map((asset) =>
      path.join(path.dirname(fixtureProjectPath), "Assets", asset.destination, asset.name)
    ));
    for (const asset of VERTICE_TITLE_BACKGROUND_LAYOUT) {
      await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", asset.destination, asset.name), "utf8"))
        .resolves.toBe(`approved-${asset.name}-v4-pixels`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", asset.destination, asset.name), "utf8"))
        .resolves.toBe(`approved-${asset.name}-v4-pixels`);
    }
  });
});
