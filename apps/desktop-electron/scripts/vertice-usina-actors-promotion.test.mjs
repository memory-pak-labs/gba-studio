import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_USINA_ACTOR_LAYOUT,
  syncVerticeUsinaActors
} from "./vertice-showcase-assets.mjs";

describe("promoção dos atores da Usina Submersa de Vértice", () => {
  it("copia as folhas 4 BPP aprovadas igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "usina-actors-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");

    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true }),
      ...VERTICE_USINA_ACTOR_LAYOUT.map((asset) => mkdir(path.dirname(path.join(sourceDirectory, asset.source)), { recursive: true }))
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_USINA_ACTOR_LAYOUT.map((asset, index) => writeFile(
        path.join(sourceDirectory, asset.source),
        `approved-usina-actor-${index + 1}`
      ))
    ]);

    const synced = await syncVerticeUsinaActors({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_USINA_ACTOR_LAYOUT).toEqual([
      {
        source: "usina-submersa-v2/actors/sentinel/prepared/vertice-usina-sentinel-v2.png",
        name: "usina-sentinel-v2.png",
        destination: "sprites"
      },
      {
        source: "usina-submersa-v2/actors/energy-cell/prepared/vertice-usina-energy-cell-v2.png",
        name: "usina-energy-cell-v2.png",
        destination: "sprites"
      }
    ]);
    expect(synced.templateAssets).toHaveLength(2);
    expect(synced.fixtureAssets).toHaveLength(2);
    for (const [index, asset] of VERTICE_USINA_ACTOR_LAYOUT.entries()) {
      const target = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
        .resolves.toBe(`approved-usina-actor-${index + 1}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
        .resolves.toBe(`approved-usina-actor-${index + 1}`);
    }
  });
});
