import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT,
  syncVerticeCouncilActorAssets
} from "./vertice-showcase-assets.mjs";

describe("promoção dos atores do Conselho da Guardiã de Vértice", () => {
  it("copia os três PNGs v4 aprovados igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "council-actors-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");

    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true }),
      ...VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT.map((asset) => mkdir(
        path.dirname(path.join(sourceDirectory, asset.source)),
        { recursive: true }
      ))
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT.map((asset, index) => writeFile(
        path.join(sourceDirectory, asset.source),
        `approved-council-actor-v4-${index + 1}`
      ))
    ]);

    const synced = await syncVerticeCouncilActorAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT).toEqual([
      {
        source: "conselho-guardia-v4/prepared/vertice-nara-portrait-v4.png",
        name: "nara-portrait.png",
        destination: "sprites"
      },
      {
        source: "conselho-guardia-v4/prepared/vertice-guardian-portrait-v4.png",
        name: "guardian-portrait.png",
        destination: "sprites"
      },
      {
        source: "conselho-guardia-v4/prepared/vertice-dialogue-sigil-v4.png",
        name: "dialogue-sigil.png",
        destination: "sprites"
      }
    ]);
    expect(synced.templateAssets).toHaveLength(3);
    expect(synced.fixtureAssets).toHaveLength(3);

    for (const [index, asset] of VERTICE_COUNCIL_ACTOR_ASSET_LAYOUT.entries()) {
      const target = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
        .resolves.toBe(`approved-council-actor-v4-${index + 1}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
        .resolves.toBe(`approved-council-actor-v4-${index + 1}`);
    }
  });
});
