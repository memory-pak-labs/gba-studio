import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT,
  syncVerticeDungeonCrawlerV1Assets
} from "./vertice-showcase-assets.mjs";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";

const templateProjectPath = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

describe("promoção do Dungeon Crawler v1 de Vértice", () => {
  it("copia o BG e a sheet FAR/MID/NEAR aprovados igualmente para template e fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dungeon-crawler-v1-"));
    const sourceDirectory = path.join(root, "production");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");

    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true }),
      mkdir(sourceDirectory, { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}"),
      ...VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT.map(async (asset, index) => {
        const source = path.join(sourceDirectory, asset.source);
        await mkdir(path.dirname(source), { recursive: true });
        await writeFile(source, `approved-dungeon-v1-${index}`);
      })
    ]);

    const synced = await syncVerticeDungeonCrawlerV1Assets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(2);
    expect(synced.fixtureAssets).toHaveLength(2);
    await Promise.all(VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT.flatMap((asset) => {
      const templateAsset = path.join(path.dirname(templateProjectPath), "Assets", asset.destination, asset.name);
      const fixtureAsset = path.join(path.dirname(fixtureProjectPath), "Assets", asset.destination, asset.name);
      return [
        access(templateAsset),
        access(fixtureAsset)
      ];
    }));
    for (const [index, asset] of VERTICE_DUNGEON_CRAWLER_V1_ASSET_LAYOUT.entries()) {
      const templateAsset = path.join(path.dirname(templateProjectPath), "Assets", asset.destination, asset.name);
      const fixtureAsset = path.join(path.dirname(fixtureProjectPath), "Assets", asset.destination, asset.name);
      await expect(readFile(templateAsset, "utf8")).resolves.toBe(`approved-dungeon-v1-${index}`);
      await expect(readFile(fixtureAsset, "utf8")).resolves.toBe(`approved-dungeon-v1-${index}`);
    }
  });

  it("mantém as três fases atuais da Usina com os assets V3 materializados", () => {
    const project = promoteExemploGBAVerticeCampaign(JSON.parse(readFileSync(templateProjectPath, "utf8")));
    const exploration = project.scenas.find((scene) => scene.name === "usina_submersa");
    const combat = project.scenas.find((scene) => scene.name === "usina_combate");
    const exit = project.scenas.find((scene) => scene.name === "usina_saida");
    const sentinel = project.actors.find((actor) => actor.name === "Sentinela da Usina");

    expect(exploration).toMatchObject({
      backgroundAssetName: "usina-exploration-background-v3-4bpp.png",
      runtime: { type: "dungeonCrawler" }
    });
    expect(combat?.backgroundAssetName).toBe("usina-combat-background-v3-4bpp.png");
    expect(exit?.backgroundAssetName).toBe("usina-exit-background-v3-4bpp.png");
    expect(sentinel).toEqual(expect.objectContaining({
      roomName: "usina_combate",
      spriteSheet: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png"
    }));
    expect(project.assets.find((asset) => asset.name === "sentinel-depth-far-mid-near-192x64-v3-4bpp.png"))
      .toEqual(expect.objectContaining({
        name: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png",
        metadata: expect.objectContaining({ generatedBy: "usina-v3-promotion" })
    }));
  });
});
