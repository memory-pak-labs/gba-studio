import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_PROLOGUE_BACKGROUND_LAYOUT,
  syncVerticePrologueBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção do background de prólogo de Vértice", () => {
  it("aponta os três backgrounds para a fonte preparada v3", () => {
    expect(VERTICE_PROLOGUE_BACKGROUND_LAYOUT.map(({ source }) => source)).toEqual([
      "exemplo-gba-prologo-storyboard-v3/prepared/vertice-prologue-frame-1-gba.png",
      "exemplo-gba-prologo-storyboard-v3/prepared/vertice-prologue-frame-2-gba.png",
      "exemplo-gba-prologo-storyboard-v3/prepared/vertice-prologue-frame-3-gba.png"
    ]);
  });

  it("copia a fonte preparada v3 igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "prologue-background-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_PROLOGUE_BACKGROUND_LAYOUT.map(async (asset, index) => {
        const source = path.join(sourceDirectory, asset.source);
        await mkdir(path.dirname(source), { recursive: true });
        await writeFile(source, `approved-prologue-v3-pixels-${index}`);
      })
    ]);

    const synced = await syncVerticePrologueBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(VERTICE_PROLOGUE_BACKGROUND_LAYOUT.length);
    expect(synced.fixtureAssets).toHaveLength(VERTICE_PROLOGUE_BACKGROUND_LAYOUT.length);
    for (const [index, asset] of VERTICE_PROLOGUE_BACKGROUND_LAYOUT.entries()) {
      const target = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
        .resolves.toBe(`approved-prologue-v3-pixels-${index}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
        .resolves.toBe(`approved-prologue-v3-pixels-${index}`);
    }
  });
});
