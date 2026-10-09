import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import {
  VERTICE_PENEDOS_FULL_SCENE_ASSET_LAYOUT,
  syncVerticePenedosLayeredAssets
} from "./vertice-showcase-assets.mjs";
import { promoteApprovedPenedosLayeredAssets } from "./vertice-showcase-project.mjs";

const penedosAssetNames = Object.freeze({
  sky: "penedos-sky-sea-bg3.png",
  terrain: "penedos-terrain-bg2.png",
  foreground: "penedos-foreground-bg1.png"
});

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

function penedosRoom(name = "penedos_vento") {
  return {
    id: `scene-${name}`,
    name,
    width: 60,
    height: 20,
    sceneType: "platformer",
    backgroundAssetName: "cliffs-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    parallax: { mode: "bg3", offsetX: 0, offsetY: 0, speedX: 128, speedY: 256 },
    tileLayers: []
  };
}

describe("promoção das camadas aprovadas dos Penedos do Vento", () => {
  it("substitui o fundo único por BG3, BG2 e BG1 independentes na cena e no room", () => {
    const unrelatedRoom = { id: "scene-porto", name: "porto_lumen", width: 30, height: 20 };
    const input = {
      assets: [
        { id: "old-cliffs", name: "cliffs-gba.png", kind: "Background" },
        { id: "port", name: "port-lumen-gba.png", kind: "Background" }
      ],
      scenas: [penedosRoom(), unrelatedRoom],
      rooms: [penedosRoom(), unrelatedRoom]
    };

    const promoted = promoteApprovedPenedosLayeredAssets(input);

    expect(promoted.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      penedosAssetNames.sky,
      penedosAssetNames.terrain,
      penedosAssetNames.foreground,
      "port-lumen-gba.png"
    ]));
    expect(promoted.assets.map((asset) => asset.name)).not.toContain("cliffs-gba.png");

    for (const collection of [promoted.scenas, promoted.rooms]) {
      const scene = collection.find((candidate) => candidate.name === "penedos_vento");
      expect(scene).toMatchObject({
        backgroundAssetName: penedosAssetNames.terrain,
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: true,
        parallax: { mode: "bg3", offsetX: 0, offsetY: 0, speedX: 128, speedY: 256 }
      });
      expect(scene.tileLayers.map((layer) => layer.mapping)).toEqual(["BG3", "BG2", "BG1", "BG0"]);
      for (const [mapping, assetName, tileValue] of [
        ["BG3", penedosAssetNames.sky, 0],
        ["BG2", penedosAssetNames.terrain, 0],
        ["BG1", penedosAssetNames.foreground, 0],
        ["BG0", "", -1]
      ]) {
        const layer = scene.tileLayers.find((candidate) => candidate.mapping === mapping);
        expect(layer.tilemap).toHaveLength(1200);
        expect(new Set(layer.tilemap)).toEqual(new Set([tileValue]));
        expect(layer.tileSourceAssetNames).toHaveLength(1200);
        expect(new Set(layer.tileSourceAssetNames)).toEqual(new Set([assetName]));
      }
      expect(collection.find((candidate) => candidate.name === "porto_lumen")).toBe(unrelatedRoom);
    }
  });

  it("copia os BG3/BG1 v2 e a camada BG2 v1 para o template e a fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penedos-promotion-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(sourceDirectory, { recursive: true }),
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);
    await Promise.all(VERTICE_PENEDOS_FULL_SCENE_ASSET_LAYOUT.map(async (asset, index) => {
      const source = path.join(sourceDirectory, asset.source);
      await mkdir(path.dirname(source), { recursive: true });
      await writeFile(source, `approved-penedos-${index}`);
    }));

    const synced = await syncVerticePenedosLayeredAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(3);
    expect(synced.fixtureAssets).toHaveLength(3);
    await Promise.all(VERTICE_PENEDOS_FULL_SCENE_ASSET_LAYOUT.map(async (asset, index) => {
      const relative = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), relative), "utf8"))
        .resolves.toBe(`approved-penedos-${index}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), relative), "utf8"))
        .resolves.toBe(`approved-penedos-${index}`);
    }));
  });

  it("exporta as três camadas independentes pelo contrato de plataforma", () => {
    const project = promoteApprovedPenedosLayeredAssets(JSON.parse(readFileSync(templateURL, "utf8")));
    const exported = buildEngineExportProjectContract(project);
    const room = exported.platformer_project?.rooms.find((candidate) => candidate.name === "penedos_vento");
    const scene = project.scenas.find((candidate) => candidate.name === "penedos_vento");

    expect(room?.background_layers?.map((layer) => layer.layer)).toEqual(["bg3", "bg2", "bg1"]);
    expect(room?.background_layers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        layer: "bg3",
        tilemap: "penedos_sky_sea_bg3",
        tilemap_layout: "source_asset",
        parallax: { x: 128, y: 256 }
      }),
      expect.objectContaining({
        layer: "bg2",
        tilemap: "penedos_terrain_bg2",
        tilemap_layout: "source_asset",
        parallax: { x: 256, y: 256 }
      }),
      expect.objectContaining({
        layer: "bg1",
        tilemap: "penedos_foreground_bg1",
        tilemap_layout: "source_asset",
        parallax: { x: 256, y: 256 }
      })
    ]));
    for (const layer of room?.background_layers ?? []) {
      expect(layer.tiles).toHaveLength(Number(scene?.width) * Number(scene?.height));
    }
  });
});
