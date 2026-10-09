import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import {
  VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT,
  syncVerticeOficinaPointClickAssets
} from "./vertice-showcase-assets.mjs";
import { promoteApprovedOficinaPointClickAssets } from "./vertice-showcase-project.mjs";

const oficinaAssetNames = Object.freeze({
  background: "oficina-gba.png",
  cursor: "oficina-cursor.png",
  mechanic: "oficina-mechanic.png",
  stabilizer: "oficina-stabilizer.png"
});

function oficinaRoom(name = "oficina") {
  return {
    id: `scene-${name}`,
    name,
    width: 30,
    height: 20,
    sceneType: "pointAndClick",
    backgroundAssetName: "oficina-gba.png",
    backgroundRenderMode: "tilemap",
    gbStudioUseBackgroundLayout: true,
    tileLayers: []
  };
}

describe("promoção aprovada da cena point-and-click da Oficina de Nara", () => {
  it("substitui os assets antigos por um background point-and-click e cursor novos", () => {
    const unrelatedRoom = { id: "scene-port", name: "porto_lumen", width: 30, height: 20 };
    const input = {
      assets: [
        { id: "old-workshop", name: "workshop-gba.png", kind: "Background" },
        { id: "port", name: "port-lumen-gba.png", kind: "Background" }
      ],
      scenas: [oficinaRoom(), unrelatedRoom],
      rooms: [oficinaRoom(), unrelatedRoom]
    };

    const promoted = promoteApprovedOficinaPointClickAssets(input);

    expect(promoted.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      oficinaAssetNames.background,
      "port-lumen-gba.png"
    ]));
    expect(promoted.assets.map((asset) => asset.name)).not.toContain("workshop-gba.png");

    for (const collection of [promoted.scenas, promoted.rooms]) {
      const scene = collection.find((candidate) => candidate.name === "oficina");
      expect(scene).toMatchObject({
        backgroundAssetName: oficinaAssetNames.background,
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: true,
        tileLayers: [],
        playerActorName: "Cursor da Oficina"
      });
      expect(collection.find((candidate) => candidate.name === "porto_lumen")).toBe(unrelatedRoom);
    }
    expect(promoted.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "oficina-cursor",
        roomName: "oficina",
        spriteSheet: oficinaAssetNames.cursor,
        animationName: "idle",
        animationStateID: "oficina-cursor-state"
      }),
      expect.objectContaining({ id: "oficina-mechanic", spriteSheet: oficinaAssetNames.mechanic }),
      expect.objectContaining({ id: "oficina-stabilizer", spriteSheet: oficinaAssetNames.stabilizer })
    ]));
    expect(promoted.animations.map((animation) => animation.id)).toEqual(expect.arrayContaining([
      "oficina-cursor-idle",
      "oficina-cursor-hover"
    ]));
    expect(promoted.animations.map((animation) => animation.id)).toContain("oficina-stabilizer-installed");
    expect(promoted.animationStates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "oficina-cursor-state",
        animationType: "cursor",
        animationIDs: ["oficina-cursor-idle", "oficina-cursor-hover"]
      })
    ]));
  });

  it("copia BG1 v2 e BG2/BG3 v1 aprovados para o template e o fixture", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "oficina-promotion-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);
    await Promise.all(VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT.map(async (asset, index) => {
      const source = path.join(sourceDirectory, asset.source);
      await mkdir(path.dirname(source), { recursive: true });
      await writeFile(source, `approved-oficina-${index}`);
    }));

    const synced = await syncVerticeOficinaPointClickAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(4);
    expect(synced.fixtureAssets).toHaveLength(4);
    await Promise.all(VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT.map(async (asset, index) => {
      const relative = path.join("Assets", asset.destination, asset.name);
      await expect(readFile(path.join(path.dirname(templateProjectPath), relative), "utf8"))
        .resolves.toBe(`approved-oficina-${index}`);
      await expect(readFile(path.join(path.dirname(fixtureProjectPath), relative), "utf8"))
        .resolves.toBe(`approved-oficina-${index}`);
    }));
  });

  it("seleciona o cursor v2 indexado e preserva o nome publico do asset", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "oficina-cursor-v2-"));
    const sourceDirectory = path.join(root, "source");
    const templateProjectPath = path.join(root, "template", "exemplo.gba-project");
    const fixtureProjectPath = path.join(root, "fixture", "exemplo.gba-project");
    await Promise.all([
      mkdir(path.dirname(templateProjectPath), { recursive: true }),
      mkdir(path.dirname(fixtureProjectPath), { recursive: true })
    ]);
    await Promise.all([
      writeFile(templateProjectPath, "{}"),
      writeFile(fixtureProjectPath, "{}")
    ]);
    for (const asset of VERTICE_OFICINA_POINT_CLICK_ASSET_LAYOUT) {
      const source = path.join(sourceDirectory, asset.source);
      await mkdir(path.dirname(source), { recursive: true });
      await writeFile(source, asset.name === oficinaAssetNames.cursor ? "cursor-v2-approved" : "background-approved");
    }

    const synced = await syncVerticeOficinaPointClickAssets({
      templateProjectPath,
      fixtureProjectPath,
      sourceDirectory
    });

    expect(synced.templateAssets).toHaveLength(4);
    await expect(readFile(path.join(path.dirname(templateProjectPath), "Assets", "sprites", oficinaAssetNames.cursor), "utf8"))
      .resolves.toBe("cursor-v2-approved");
    await expect(readFile(path.join(path.dirname(fixtureProjectPath), "Assets", "sprites", oficinaAssetNames.cursor), "utf8"))
      .resolves.toBe("cursor-v2-approved");
  });

  it("exporta o background único e os hotspots para o contrato point_click", () => {
    const project = promoteApprovedOficinaPointClickAssets({
      assets: [
        {
          id: oficinaAssetNames.background,
          name: oficinaAssetNames.background,
          kind: "Background",
          metadata: { source: `Assets/backgrounds/${oficinaAssetNames.background}`, width: 240, height: 160 }
        },
        {
          id: oficinaAssetNames.cursor,
          name: oficinaAssetNames.cursor,
          kind: "Sprite",
          metadata: { source: `Assets/sprites/${oficinaAssetNames.cursor}`, frameWidth: 16, frameHeight: 16, frameCount: 2 }
        }
      ],
      assetGroups: [],
      scenas: [oficinaRoom()],
      rooms: [oficinaRoom()],
      actors: [],
      animations: [],
      animationStates: [],
      spriteReferenceImages: [],
      events: [
        { id: "event-drawer", name: "oficina_gaveta_vazia", category: "Cena", steps: [{ command: "show_dialogue oficina_gaveta" }] },
        { id: "event-mechanic", name: "oficina_mara", category: "Ator", steps: [{ command: "show_dialogue oficina_mara" }] },
        { id: "event-stabilizer", name: "oficina_instalar_estabilizador", category: "Cena", steps: [{ command: "show_dialogue oficina_estabilizador" }] },
        { id: "event-exit", name: "oficina_partir_mercado", category: "Cena", steps: [{ command: "show_dialogue oficina_saida" }] }
      ],
      dialogues: [
        { id: "dialogue-drawer", key: "oficina_gaveta", character: "Nara", text: "Não encontrei nada aqui." },
        { id: "dialogue-stabilizer", key: "oficina_estabilizador", character: "Nara", text: "Estabilizador instalado." },
        { id: "dialogue-exit", key: "oficina_saida", character: "Nara", text: "Ainda preciso concluir o reparo." }
        ,{ id: "dialogue-mara", key: "oficina_mara", character: "Mecânica", text: "A bancada está pronta." }
      ],
      audioItems: [],
      triggers: [
        { id: "trigger-drawer", name: "Gaveteiro da Oficina", roomName: "oficina", x: 3, y: 8, width: 4, height: 7, eventBindings: { onInteract: "oficina_gaveta_vazia" } },
        { id: "trigger-stabilizer", name: "Bancada do estabilizador", roomName: "oficina", x: 11, y: 8, width: 9, height: 6, eventBindings: { onInteract: "oficina_instalar_estabilizador" } },
        { id: "trigger-exit", name: "Saída da Oficina", roomName: "oficina", x: 26, y: 6, width: 3, height: 9, eventBindings: { onInteract: "oficina_partir_mercado" } }
      ],
      variables: [{ id: "variable-stabilizer", name: "var_stabilizer", initialValue: 0 }],
      settings: {
        general: { gameTitle: "Oficina", startScene: "oficina", startSceneType: "pointAndClick", exportFolder: "build" },
        pointAndClick: { cursorSpeed: 2 },
        build: { romFileName: "oficina.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });
    const exported = buildEngineExportProjectContract(project);

    expect(exported.point_click_project?.backgrounds).toEqual([
      { name: "oficina_gba", layer: "bg1", tilemap: "oficina_gba", backdrop_color: 0 }
    ]);
    expect(exported.point_click_project?.scenes[0]).toMatchObject({
      name: "oficina",
      background: 0,
      hotspots: expect.arrayContaining([
        expect.objectContaining({ name: "Gaveteiro da Oficina", on_click: expect.any(Array) }),
        expect.objectContaining({ name: "Bancada do estabilizador", on_click: expect.any(Array) }),
        expect.objectContaining({ name: "Saída da Oficina", on_click: expect.any(Array) })
      ])
    });
  });
});
