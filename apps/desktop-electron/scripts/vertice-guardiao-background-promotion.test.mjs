import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT,
  VERTICE_GUARDIAN_BACKGROUND_LAYOUT,
  syncVerticeBattleRpgActorAssets,
  syncVerticeGuardianBackground
} from "./vertice-showcase-assets.mjs";

describe("promoção do Guardião do Relé de Vértice", () => {
  it("copia a fonte 4 bpp aprovada v1 igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "guardian-background-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    const asset = VERTICE_GUARDIAN_BACKGROUND_LAYOUT[0];
    const source = path.join(sourceDirectory, asset.source);

    await Promise.all([
      mkdir(path.dirname(source), { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(source, "approved-guardian-v1-pixels"),
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);

    const synced = await syncVerticeGuardianBackground({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    const target = path.join("Assets", asset.destination, asset.name);
    expect(asset).toEqual({
      source: "exemplo-gba-battle-rpg-v1-candidate/materialized/scene-copy-v2/Assets/backgrounds/battle-rpg-usina-nearest-review.png",
      name: "battle-rpg-usina-nearest-review.png",
      destination: "backgrounds"
    });
    expect(synced.templateAssets).toEqual([path.join(path.dirname(templateProjectPath), target)]);
    expect(synced.fixtureAssets).toEqual([path.join(path.dirname(fixtureProjectPath), target)]);
    await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
      .resolves.toBe("approved-guardian-v1-pixels");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
      .resolves.toBe("approved-guardian-v1-pixels");
  });

  it("copia Nara e o Guardião preparados para os slots OBJ da batalha", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "battle-actors-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");

    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true }),
      ...VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT.map((asset) => mkdir(path.dirname(path.join(sourceDirectory, asset.source)), { recursive: true }))
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT.map((asset) => writeFile(path.join(sourceDirectory, asset.source), `approved-${asset.name}`))
    ]);

    const synced = await syncVerticeBattleRpgActorAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(2);
    expect(synced.fixtureAssets).toHaveLength(2);
    for (const asset of VERTICE_BATTLE_RPG_ACTOR_ASSET_LAYOUT) {
      const target = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), target), "utf8"))
        .resolves.toBe(`approved-${asset.name}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), target), "utf8"))
        .resolves.toBe(`approved-${asset.name}`);
    }
  });
});
