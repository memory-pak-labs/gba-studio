import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_RACING_ASSET_LAYOUT,
  VERTICE_RACING_BACKGROUND_LAYOUT,
  syncVerticeRacingAssets,
  syncVerticeRacingBackgrounds
} from "./vertice-showcase-assets.mjs";

describe("promoção dos backgrounds de corrida de Vértice", () => {
  it("copia o BG top-down atual da corrida", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "racing-backgrounds-"));
    const sourceDirectory = path.join(root, "production");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");

    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      ...VERTICE_RACING_BACKGROUND_LAYOUT.map((asset, index) => {
        const source = path.join(sourceDirectory, asset.source);
        return mkdir(path.dirname(source), { recursive: true }).then(() => writeFile(source, `approved-racing-background-${index}`));
      }),
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);

    const synced = await syncVerticeRacingBackgrounds({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_RACING_BACKGROUND_LAYOUT).toEqual([{
      source: "prepared/vertice-circuit-topdown.png",
      name: "circuit-topdown.png",
      destination: "backgrounds"
    }]);
    expect(synced.templateAssets).toHaveLength(1);
    expect(synced.fixtureAssets).toHaveLength(1);

    await Promise.all(VERTICE_RACING_BACKGROUND_LAYOUT.map(async (asset, index) => {
      const target = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
        .resolves.toBe(`approved-racing-background-${index}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
        .resolves.toBe(`approved-racing-background-${index}`);
    }));
  });

  it("copia o pacote de corrida com os dois veículos Vértice", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "racing-assets-"));
    const sourceDirectory = path.join(root, "production");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");

    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_RACING_ASSET_LAYOUT.map((asset, index) => {
        const source = path.join(sourceDirectory, asset.source ?? asset.name);
        return mkdir(path.dirname(source), { recursive: true }).then(() => writeFile(source, `approved-racing-asset-${index}`));
      })
    ]);

    const synced = await syncVerticeRacingAssets({ templateProjectPath, fixtureProjectPath, sourceDirectory });
    expect(synced.templateAssets).toHaveLength(3);
    expect(synced.fixtureAssets).toHaveLength(3);
    await Promise.all(VERTICE_RACING_ASSET_LAYOUT.map(async (asset, index) => {
      const target = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
        .resolves.toBe(`approved-racing-asset-${index}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
        .resolves.toBe(`approved-racing-asset-${index}`);
    }));
  });
});
