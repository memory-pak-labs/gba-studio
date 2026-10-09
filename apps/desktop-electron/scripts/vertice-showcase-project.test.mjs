import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decodePngRgba } from "./lib/png-icons.mjs";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";
import { analyzeConditionalSceneFlow } from "../src/shared/conditionalFlowAnalyzer.js";
import { deriveDialoguesWorkspacePresentation, deriveDialoguesWorkspaceValidationIssues } from "../src/shared/dialoguesWorkspace.js";
import { deriveFilesWorkspacePresentation } from "../src/shared/filesWorkspace.js";
import { parseGBAProjectFile } from "../src/shared/projectFile.js";
import { expandProjectTilemaps } from "../src/shared/projectResourceFormat.js";
import { buildAssetcSpritePackGeneration, buildAssetcTilesetPackGeneration } from "../src/shared/engineProjectExport.js";
import { sceneMapCardSize } from "../src/shared/sceneMapLayout.js";
import { validateGBAProjectMigrationContract } from "../../../packages/project-contract/src/index.ts";
import {
  VERTICE_CAMPAIGN_SCENES,
  VERTICE_SUPPORT_SCENES
} from "./vertice-showcase-contract.mjs";
import {
  isVerticeShowcaseProject,
  projectAssetCoverage,
  promoteApprovedPortLumenAssets,
  promoteExemploGBAVerticeCampaign,
  verticeShowcaseSceneClassification
} from "./vertice-showcase-project.mjs";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

function canonicalProject() {
  return expandProjectTilemaps(parseGBAProjectFile(readFileSync(templateURL, "utf8")).data);
}

function verticeProject() {
  return promoteExemploGBAVerticeCampaign(canonicalProject());
}

function canonicalVerticeSceneCount() {
  const sceneNames = [
    ...VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name),
    ...VERTICE_SUPPORT_SCENES.map((scene) => scene.name)
  ].filter((name) => name !== "menu_inicial");
  return new Set(sceneNames).size;
}

describe("materialização canônica de Vértice", () => {
  it("usa o manifesto atual e remove entidades que apontam para versões aposentadas", () => {
    const source = JSON.parse(readFileSync(templateURL, "utf8"));
    const declaredAssetNames = new Set(source.assets.map((asset) => asset.name));
    source.assets.push({ name: "nara-mercado-isometric-v2.png", metadata: { reviewStatus: "approved" } });
    source.actors.push({
      id: "retired-market-player",
      name: "Player antigo",
      roomName: "mercado_suspenso",
      spriteSheet: "nara-mercado-isometric-v2.png"
    });
    source.animations.push({ id: "retired-market-animation", spriteSheet: "nara-mercado-isometric-v2.png" });
    source.animationStates.push({ id: "retired-market-state", spriteSheet: "nara-mercado-isometric-v2.png" });

    const promoted = promoteExemploGBAVerticeCampaign(source);

    expect(promoted.assets.map((asset) => asset.name).sort()).toEqual([...declaredAssetNames].sort());
    expect(promoted.actors.some((actor) => actor.id === "retired-market-player")).toBe(false);
    expect(promoted.actors.every((actor) => !actor.spriteSheet || declaredAssetNames.has(actor.spriteSheet))).toBe(true);
    expect(promoted.animations.every((animation) => declaredAssetNames.has(animation.spriteSheet))).toBe(true);
    expect(promoted.animationStates.every((state) => declaredAssetNames.has(state.spriteSheet))).toBe(true);
    expect(promoted.scenas.every((scene) => !scene.backgroundAssetName || declaredAssetNames.has(scene.backgroundAssetName))).toBe(true);
  });

  it("enquadra o mercador inteiro ao iniciar o Mercado sem mudar o zoom ou o seguimento", () => {
    for (const project of [JSON.parse(readFileSync(templateURL, "utf8")), verticeProject()]) {
      const room = buildEngineExportProjectContract(project).isometric_project.rooms
        .find((candidate) => candidate.name === "mercado_suspenso");
      expect(room.camera).toMatchObject({ follow_enabled: true, zoom_x256: 256 });
      expect(room.on_enter).toEqual(expect.arrayContaining([
        { op: "set_camera_property", field: "pan_y", value: 0 }
      ]));
    }
  });

  it("exports the market exit on the walkable upper deck height", () => {
    for (const project of [JSON.parse(readFileSync(templateURL, "utf8")), verticeProject()]) {
      const exported = buildEngineExportProjectContract(project);
      const room = exported.isometric_project.rooms.find(room => room.name === "mercado_suspenso");
      expect(room.tile_events).toEqual(expect.arrayContaining([
        expect.objectContaining({ area: { x: 27, y: 12, width: 1, height: 1, z: 3 } })
      ]));
      expect(room.height_levels[12 * 36 + 27]).toBe(3);
      expect(room.collision_flags[12 * 36 + 27]).toBe(0);
    }
  });

  it("mantém o logotipo V2 aprovado dentro da paleta OBJ de 15 cores visíveis", () => {
    for (const project of [JSON.parse(readFileSync(templateURL, "utf8")), verticeProject()]) {
      const logo = project.assets.find(asset => asset.name === "title-logo-actor-128x88.png");
      expect(logo?.metadata).toMatchObject({ reviewStatus: "approved", visibleColors: 15 });
      const { pixels } = decodePngRgba(readFileSync(new URL(`Assets/sprites/${logo.name}`, templateURL)));
      const colors = new Set();
      for (let pixel = 0; pixel < pixels.length; pixel += 4) {
        if (pixels[pixel + 3] === 0) continue;
        colors.add((pixels[pixel] >> 3) | ((pixels[pixel + 1] >> 3) << 5) | ((pixels[pixel + 2] >> 3) << 10));
      }
      expect(colors.size).toBeLessThanOrEqual(15);
    }
  });

  it("preserva movimento e espelhamento do sprite autorado de Nara no Porto", () => {
    const saved = JSON.parse(readFileSync(templateURL, "utf8"));
    for (const project of [saved, verticeProject()]) {
      for (const sheet of ["nara-topdown.png"]) {
        const frameWidth = 32;
        const frameHeight = 64;
        const sheetWidth = 288;
        const animations = project.animations.filter((animation) => animation.spriteSheet === sheet);
        expect(animations).toHaveLength(8);
        for (const direction of ["down", "up", "left", "right"]) {
          const idle = animations.find((animation) => animation.name === `idle_${direction}`);
          const walk = animations.find((animation) => animation.name === `walk_${direction}`);
          expect(idle).toMatchObject({ frameWidth, frameHeight, frameCount: 1 });
          expect(walk).toMatchObject({ frameWidth, frameHeight, frameCount: 2, hitboxWidth: 16, hitboxHeight: 16 });
          expect(new Set(walk.frames.map((frame) => frame.tiles[0].sliceX)).size).toBe(2);
          for (const animation of [idle, walk]) for (const frame of animation.frames) {
            expect(frame).toMatchObject({ width: frameWidth, height: frameHeight, originY: 0 });
            // Fitting the editor canvas shifts the tile and origin together.
            // The exported position and the full 32px composition stay intact.
            expect(frame.tiles[0].x - frame.originX).toBe(0);
            expect(frameWidth / 2 - 8 + frame.tiles[0].x).toBeGreaterThanOrEqual(0);
            expect(frameWidth / 2 - 8 + frame.tiles[0].x + frame.tiles[0].tileWidth).toBeLessThanOrEqual(frameWidth);
            expect(frame.tiles[0]).toMatchObject({ tileWidth: frameWidth, tileHeight: frameHeight, flipX: direction === "left" });
            expect(frame.tiles[0].sliceX).toBeLessThan(sheetWidth);
          }
        }
        expect(animations.find((animation) => animation.name === "walk_left").frames.map((frame) => frame.tiles[0].sliceX))
          .toEqual(animations.find((animation) => animation.name === "walk_right").frames.map((frame) => frame.tiles[0].sliceX));
      }
    }
  });
  it("mantém seis cenas de menu in-game com HUD própria e retorno lógico", () => {
    const project = verticeProject();
    const names = ["menu_start", "missoes", "inventario", "mapa_menu", "salvar", "configuracoes"];
    for (const name of names) {
      const scene = project.scenas.find(scene => scene.name === name);
      expect(scene.runtime.config).toMatchObject({ presentationMode: "hud", hudPresetId: `hud-neutral-${name}` });
      expect(scene.runtime.config.hudListRows ?? 0).toBe({menu_start:6,missoes:4,inventario:0,mapa_menu:0,salvar:4,configuracoes:5}[name]);
      expect(scene.runtime.config.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "back", action: "pop_screen" })]));
      const hud = project.settings.hudPresets.find(hud => hud.id === scene.hudPresetId);
      expect(hud).toMatchObject({ backgroundImage: "", width: 240, height: 160 });
      expect(hud.components.filter(c => c.kind === "text")).toHaveLength(8);
      expect(hud.components.filter(c => c.kind === "text").every(c => c.visible === true)).toBe(true);
    }
    expect(project.scenas.some(scene => scene.name === "perfil_equipe")).toBe(false);
  });


  it("organiza a entrada do jogo e a criação de personagem no canvas", () => {
    const project = verticeProject();
    const firstScenes = project.scenas.slice(0, 6);
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const game = project.scenas.find((scene) => scene.name === "porto_lumen");

    expect(firstScenes.map((scene) => scene.name)).toEqual([
      "logo",
      "abertura",
      "titulo",
      "prologo",
      "porto_lumen",
      "mapa_rota"
    ]);
    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(title?.runtime).toMatchObject({
      type: "menu",
      config: {
        role: "title",
        menuProfile: "initial",
        backgroundAnimation: {
          frameAssetNames: ["title-day-centered-240x160-4bpp.png"],
          frameDuration: 1,
          loop: false
        },
        screens: expect.arrayContaining([
          expect.objectContaining({
            id: "title",
            items: [expect.objectContaining({
              id: "start",
              label: "PRESS START",
              eventName: "titulo_abrir_menu",
              targetScreenID: "title_options"
            })]
          }),
          expect.objectContaining({
            id: "title_options",
            carousel: true,
            items: expect.arrayContaining([
              expect.objectContaining({ id: "new-game", targetScreenID: "escolha_genero" }),
              expect.objectContaining({ id: "load-game", targetScreenID: "carregar_jogo" }),
              expect.objectContaining({ id: "language", targetScreenID: "configuracoes" }),
              expect.objectContaining({ id: "settings", targetScreenID: "configuracoes" }),
              expect.objectContaining({ id: "credits", targetScreenID: "creditos" })
            ])
          })
        ])
      }
    });
    expect(game).toMatchObject({
      width: 60,
      height: 40,
      backgroundAssetName: "porto-lume-exterior-topdown-gba.png",
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: true,
      cameraMode: "follow_player",
      cameraBounds: { x: 0, y: 0, width: 60, height: 40 },
      playerActorName: "Nara",
      runtime: { type: "topdown", config: { presentation: "topdown", profile: "port-lumen-topdown-v1" } }
    });
    expect(game?.tilemap).toHaveLength(60 * 40);
    expect(game?.collisionTypes).toHaveLength(60 * 40);
    expect(game?.collisionTypes?.[21 * 60 + 30]).toBe("free");
    expect(game?.collisionTypes?.[0]).toBe("solid");
    expect(project.actors.filter((actor) => actor.roomName === "porto_lumen")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "port-nara", name: "Nara", spriteSheet: "player-pilot-32x32.png" }),
      expect.objectContaining({ id: "port-mechanic", name: "Mecânica de Lúmen", spriteSheet: "mechanic-pilot-32x32.png", eventBindings: { onInteract: "porto_recuperar_estrutura" } }),
      expect.objectContaining({ id: "porto-lume-captain-pilot", spriteSheet: "npc-captain-pilot-32x32.png" }),
      expect.objectContaining({ id: "porto-lume-traveler-pilot", spriteSheet: "traveler-pilot-32x32.png" }),
      expect.objectContaining({ id: "porto-lume-cartographer-pilot", spriteSheet: "cartographer-pilot-32x32.png" }),
      expect.objectContaining({ id: "porto-lume-fisherchild-pilot", spriteSheet: "fisherchild-pilot-32x32.png" }),
      expect.objectContaining({ id: "porto-lume-lighthousekeeper-pilot", spriteSheet: "lighthousekeeper-pilot-32x32.png" })
    ]));
    expect(project.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "trigger-porto-exit",
        roomName: "porto_lumen",
        x: 22,
        y: 35,
        width: 3,
        height: 3
      }),
      expect.objectContaining({
        id: "trigger-porto-lighthouse",
        roomName: "porto_lumen",
        eventName: "porto_entrar_farol",
        eventBindings: { onInteract: "porto_entrar_farol" }
      })
    ]));
    const lighthouse = project.scenas.find((scene) => scene.name === "farol_interior");
    expect(lighthouse).toMatchObject({
      width: 45,
      height: 30,
      sceneType: "topdown",
      backgroundAssetName: "farol-interior-topdown-360x240-gba.png",
      tilesetAssetName: "farol-interior-topdown-360x240-gba.png",
      backgroundRenderMode: "tilemap",
      cameraMode: "follow_player",
      playerActorName: "Nara · Farol",
      runtime: { type: "topdown", config: { presentation: "topdown", profile: "lighthouse-interior" } }
    });
    expect(project.actors.filter((actor) => actor.roomName === "farol_interior")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "farol-nara", name: "Nara · Farol", x: 22, y: 24, spriteSheet: "player-pilot-32x32.png" }),
      expect.objectContaining({ id: "farol-keeper", name: "Guardião do farol", x: 11, y: 9, spriteSheet: "lighthousekeeper-pilot-32x32.png", eventName: "farol_falar_guardiao" })
    ]));
    expect(project.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "trigger-lighthouse-lens", roomName: "farol_interior", x: 19, y: 8, width: 7, height: 3, eventName: "farol_examinar_lente" }),
      expect.objectContaining({ id: "trigger-lighthouse-exit", roomName: "farol_interior", x: 20, y: 26, width: 5, height: 4, eventName: "farol_sair_porto" })
    ]));
    const prologue = project.scenas.find((scene) => scene.name === "prologo");
    expect(prologue?.runtime).toMatchObject({
      type: "cutscene",
      config: {
        steps: [
          expect.objectContaining({ id: "prologo-frame-1", dialogueKey: "prologo_frame_1", backgroundAssetName: "prologue-frame-1-gba.png" }),
          expect.objectContaining({ id: "prologo-frame-2", dialogueKey: "prologo_frame_2", backgroundAssetName: "prologue-frame-2-gba.png" }),
          expect.objectContaining({ id: "prologo-frame-3", dialogueKey: "prologo_frame_3", backgroundAssetName: "prologue-frame-3-gba.png" }),
          expect.objectContaining({ id: "prologo-complete", dialogueKey: "", eventName: "prologo_partir" })
        ]
      }
    });
    expect(project.editorState.scenaConnections.slice(0, 5).map(({ from, to }) => ({ from, to }))).toEqual([
      { from: "logo", to: "abertura" },
      { from: "abertura", to: "titulo" },
      { from: "titulo", to: "escolha_genero" },
      { from: "escolha_genero", to: "nome_jogador" },
      { from: "nome_jogador", to: "prologo" }
    ]);
    expect(project.editorState.sceneMapPositions).toMatchObject({
      logo: { x: 36, y: 36 },
      abertura: { x: 324, y: 36 },
      titulo: { x: 612, y: 36 },
      escolha_genero: { x: 900, y: 36 },
      nome_jogador: { x: 1476, y: 36 },
      prologo: { x: 1764, y: 36 },
      porto_lumen: { x: 2052, y: 36 },
      mapa_rota: { x: 36, y: 498 }
    });

    const positionedRooms = project.scenas.map((scene) => ({
      name: scene.name,
      position: project.editorState.sceneMapPositions[scene.name],
      size: sceneMapCardSize(scene)
    }));
    for (let index = 0; index < positionedRooms.length; index += 1) {
      const room = positionedRooms[index];
      for (const other of positionedRooms.slice(index + 1)) {
        const overlaps = room.position.x < other.position.x + other.size.width
          && room.position.x + room.size.width > other.position.x
          && room.position.y < other.position.y + other.size.height
          && room.position.y + room.size.height > other.position.y;
        expect(overlaps, `${room.name} overlaps ${other.name}`).toBe(false);
      }
    }
  });

  it("reserva a superfície final dos cards após promover o Mercado", () => {
    const source = canonicalProject();
    const sourceMarket = source.scenas.find((scene) => scene.name === "mercado_suspenso");
    sourceMarket.runtime.config.pagedSurface.width = 240;
    sourceMarket.runtime.config.pagedSurface.height = 160;

    const project = promoteExemploGBAVerticeCampaign(source);
    const market = project.scenas.find((scene) => scene.name === "mercado_suspenso");
    const positions = project.editorState.sceneMapPositions;
    const marketSize = sceneMapCardSize(market);

    expect(marketSize).toEqual({ width: 512, height: 434 });
    expect(positions.usina_submersa.x - positions.mercado_suspenso.x)
      .toBe(marketSize.width + 48);
    expect(positions.conselho_guardia.y - positions.mercado_suspenso.y)
      .toBeGreaterThanOrEqual(marketSize.height + 52);
  });

  it("exporta PRESS START como entrada do carrossel do título", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const screens = exported.menu_project?.screens ?? [];
    const title = screens.find((screen) => screen.name === "title");
    const titleOptionsIndex = screens.findIndex((screen) => screen.name === "title_options");

    expect(titleOptionsIndex).toBeGreaterThanOrEqual(0);
    expect(title?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "PRESS START", action: "push_screen", target_screen: titleOptionsIndex })
    ]));
  });

  it("mantém eventos de entrada únicos no fluxo de criação de personagem", () => {
    const project = verticeProject();
    const entryEventNames = [
      "escolha_genero_ao_entrar",
      "nome_jogador_ao_entrar",
      "carregar_jogo_ao_entrar"
    ];

    for (const eventName of entryEventNames) {
      expect(project.events.filter((event) => event.name === eventName), eventName).toHaveLength(1);
    }
  });

  it("reconhece o template já materializado antes das promoções legadas", () => {
    const project = JSON.parse(readFileSync(templateURL, "utf8"));

    expect(isVerticeShowcaseProject(project)).toBe(true);
    expect(isVerticeShowcaseProject({
      ...project,
      scenas: project.scenas.map((scene, index) => index === 0 ? { ...scene, name: "farol_titulo" } : scene)
    })).toBe(false);
  });

  it("substitui a rota Farol por quinze cenas autorais de Vértice sem custom", () => {
    const project = verticeProject();

    expect(project.scenas.map((scene) => scene.name)).toEqual(expect.arrayContaining(
      VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name)
    ));
    expect(project.scenas.slice(0, 6).map((scene) => scene.name)).toEqual([
      "logo", "abertura", "titulo", "prologo", "porto_lumen", "mapa_rota"
    ]);
    expect(project.scenas).toHaveLength(30);
    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(project.scenas).toHaveLength(canonicalVerticeSceneCount());
    expect(project.scenas.some((scene) => scene.sceneType === "custom")).toBe(false);
    expect(project.scenas.find((scene) => scene.name === "arena_arrancada"))
      .toMatchObject({
        sceneType: "luta",
        backgroundAssetName: "arena-gba.png",
        tileLayers: [],
        runtime: { type: "luta", config: { hudAssetName: "fight-hud-v2-arena-bank-05.png" } }
      });
    expect(project.settings.general).toMatchObject({
      gameTitle: "O Último Farol",
      startScene: "logo",
      startSceneType: "cutscene"
    });
  });

  it("preserva os dois lutadores da Arena ao reprocessar o template canônico", () => {
    const project = verticeProject();
    const arenaActors = project.actors.filter((actor) => actor.roomName === "arena_arrancada");

    expect(arenaActors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "nara-fighter",
        spriteSheet: "nara-fighter.png",
        animationName: "idle",
        animationStateID: "nara-fighter-state",
        lutaAnimations: {
          fallback: "idle_animation",
          idle: "idle",
          attack: "attack",
          special: "jump",
          guard: "walk",
          hurt: "hurt"
        },
        battle: expect.objectContaining({ side: "player1", maxHp: 100 })
      }),
      expect.objectContaining({
        id: "rival-fighter",
        spriteSheet: "rival-fighter.png",
        animationName: "arena_rival_idle_left",
        animationStateID: "rival-fighter-state",
        lutaAnimations: {
          fallback: "idle_animation",
          idle: "arena_rival_idle_left",
          attack: "arena_rival_attack_left",
          special: "arena_rival_special_left",
          guard: "arena_rival_guard_left",
          hurt: "arena_rival_hurt_left"
        },
        battle: expect.objectContaining({ side: "player2", maxHp: 96 })
      })
    ]));
  });

  it("mantém as folhas v2 dos lutadores com os cinco estados nativos da luta", () => {
    const project = verticeProject();
    const rivalAnimations = project.animations
      .filter((animation) => animation.spriteSheet === "rival-fighter.png")
      .map((animation) => ({
        id: animation.id,
        name: animation.name,
        state: animation.state,
        direction: animation.direction,
        frameCount: animation.frameCount,
        sourceFrameIndexes: animation.frames.map((frame) => frame.sourceFrameIndex)
      }));
    const rivalAsset = project.assets.find((asset) => asset.id === "rival-fighter");

    expect(rivalAnimations).toEqual([
      {
        id: "rival-arena-idle",
        name: "arena_rival_idle_left",
        state: "idle",
        direction: "left",
        frameCount: 1,
        sourceFrameIndexes: [0]
      },
      {
        id: "rival-arena-attack",
        name: "arena_rival_attack_left",
        state: "attack",
        direction: "left",
        frameCount: 2,
        sourceFrameIndexes: [2, 3]
      },
      {
        id: "rival-arena-special",
        name: "arena_rival_special_left",
        state: "special",
        direction: "left",
        frameCount: 1,
        sourceFrameIndexes: [4]
      },
      {
        id: "rival-arena-guard",
        name: "arena_rival_guard_left",
        state: "guard",
        direction: "left",
        frameCount: 1,
        sourceFrameIndexes: [1]
      },
      {
        id: "rival-arena-hurt",
        name: "arena_rival_hurt_left",
        state: "hurt",
        direction: "left",
        frameCount: 1,
        sourceFrameIndexes: [5]
      }
    ]);
    expect(project.animationStates.find((state) => state.id === "rival-fighter-state"))
      .toMatchObject({
        spriteSheet: "rival-fighter.png",
        animationIDs: [
          "rival-arena-idle",
          "rival-arena-attack",
          "rival-arena-special",
          "rival-arena-guard",
          "rival-arena-hurt"
        ]
      });
    expect(rivalAsset).toMatchObject({
      name: "rival-fighter.png",
      metadata: {
        generatedBy: "exemplo-gba-luta-cais-v2",
        sourceSha256: "0ef00d933ed398689846a94c080f296f42df80223d6858cbefbeb3978af58254",
        preparedSha256: "fcd446b1fb7c7bcba6549d545c62859e88fe91a292704af230993bf66cc43376",
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 6,
        layout: { mode: "horizontal", columns: 6 },
        collisionWidth: 16,
        collisionHeight: 16,
        sourceContract: "gba-native",
        objectPaletteValues: [0, 4160, 5353, 5250, 8387, 11558, 12615, 11933, 4566, 4498, 9786, 6478, 13909, 21309, 18137, 24543],
        reviewStatus: "attention",
        approved: false
      }
    });
  });

  it("declara a perda de quantização observada da Arena sem mascarar o framebuffer", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.id === "arena-background");

    expect(background?.metadata).toMatchObject({
      generatedBy: "exemplo-gba-luta-cais-v2",
      backgroundPaletteBankBudget: 16,
      paletteBankCount: 16,
      backgroundTileOptimizer: {
        enabled: true,
        tileBudget: 1024,
        maxSourcePixelErrorRatio: 0.498671875,
        maxFramebufferMismatchRatio: 0
      },
      backgroundPaletteReferencePlan: {
        schema_version: 1,
        width: 240,
        height: 160,
        bank_count: 16,
        banks: expect.any(Array),
        tile_palette_banks: expect.any(Array)
      },
      assetcStatus: "attention",
      assetcReviewed: true,
      reviewStatus: "attention",
      approved: false
    });
    expect(background?.metadata?.backgroundPaletteReferencePlan?.banks).toHaveLength(16);
    expect(background?.metadata?.backgroundPaletteReferencePlan?.tile_palette_banks).toHaveLength(600);
  });

  it("mantém o player v2 em 64x64, sem cortar as poses da luta", () => {
    const project = verticeProject();
    const playerAnimations = project.animations
      .filter((animation) => animation.spriteSheet === "nara-fighter.png")
      .map((animation) => ({
        id: animation.id,
        frameWidth: animation.frameWidth,
        frameHeight: animation.frameHeight,
        frameCount: animation.frameCount,
        sourceFrameIndexes: animation.frames.map((frame) => frame.sourceFrameIndex),
        hitbox: [animation.hitboxX, animation.hitboxY, animation.hitboxWidth, animation.hitboxHeight]
      }));
    const playerAsset = project.assets.find((asset) => asset.id === "nara-fighter");

    expect(playerAnimations).toHaveLength(6);
    expect(playerAnimations.every((animation) => (
      animation.frameWidth === 64
      && animation.frameHeight === 64
      && animation.hitbox.join(",") === "24,-16,16,16"
    ))).toBe(true);
    expect(playerAnimations.find((animation) => animation.id === "nara-fighter-attack"))
      .toMatchObject({ frameCount: 2, sourceFrameIndexes: [2, 3] });
    expect(playerAnimations.find((animation) => animation.id === "nara-fighter-jump"))
      .toMatchObject({ frameCount: 1, sourceFrameIndexes: [4] });
    expect(playerAsset).toMatchObject({
      metadata: {
        generatedBy: "exemplo-gba-luta-cais-v2",
        sourceSha256: "0ef00d933ed398689846a94c080f296f42df80223d6858cbefbeb3978af58254",
        preparedSha256: "9cb22e4861725b9a6e74274c7c5756360b2d0204d2696724159b3e99bfe44bf5",
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 6,
        collisionWidth: 16,
        collisionHeight: 16,
        sourceContract: "gba-native",
        layout: { mode: "horizontal", columns: 6 },
        objectPaletteValues: [0, 4160, 7362, 4230, 5353, 11558, 10876, 12615, 5429, 4565, 9752, 6478, 14966, 19228, 14789, 14865],
        reviewStatus: "attention",
        approved: false
      }
    });
  });

  it("encadeia Logo, Abertura e Menu Título antes da campanha", () => {
    const project = verticeProject();
    const logo = project.scenas.find((scene) => scene.name === "logo");
    const abertura = project.scenas.find((scene) => scene.name === "abertura");
    const title = project.scenas.find((scene) => scene.name === "titulo");

    expect(logo).toMatchObject({
      sceneType: "cutscene",
      runtime: {
        type: "cutscene",
        config: {
          stepDurationFrames: 120,
          autoAdvance: true,
          steps: [
            expect.objectContaining({ id: "startup-logo-frame-00", durationFrames: 18, backgroundAssetName: "gba-studio-startup-canvas-frame-00-gba.png" }),
            expect.objectContaining({ id: "startup-logo-frame-01", durationFrames: 12, backgroundAssetName: "gba-studio-startup-canvas-frame-01-gba.png" }),
            expect.objectContaining({ id: "startup-logo-frame-02", durationFrames: 12, backgroundAssetName: "gba-studio-startup-canvas-frame-02-gba.png" }),
            expect.objectContaining({ id: "startup-logo-frame-03", durationFrames: 18, backgroundAssetName: "gba-studio-startup-canvas-frame-03-gba.png" }),
            expect.objectContaining({ id: "startup-logo-hold", durationFrames: 60, targetSceneIndex: 1 })
          ]
        }
      }
    });
    expect(abertura).toMatchObject({
      sceneType: "cutscene",
      backgroundAssetName: "opening-v4-per-tile-14-banks.png",
      runtime: { type: "cutscene", config: { stepDurationFrames: 120, autoAdvance: true, steps: [
        expect.objectContaining({ id: "opening-v3-01-vigia-na-praia", durationFrames: 120, skippable: true }),
        expect.objectContaining({ id: "opening-v3-02-vigia-de-costas", durationFrames: 90, skippable: true }),
        expect.objectContaining({ id: "opening-v3-03-sinal-ao-farol", durationFrames: 120, eventName: "abertura_sinal" }),
        expect.objectContaining({ id: "opening-v3-04-menino-na-praia", durationFrames: 150, skippable: true }),
        expect.objectContaining({ id: "opening-v3-complete", eventName: "abertura_concluir", skippable: false })
      ] } }
    });
    expect(title?.runtime).toMatchObject({
      type: "menu",
      config: {
        role: "title",
        screens: expect.arrayContaining([
          expect.objectContaining({
            id: "title",
            items: [expect.objectContaining({ id: "start", label: "PRESS START", eventName: "titulo_abrir_menu", targetScreenID: "title_options" })]
          }),
          expect.objectContaining({ id: "title_options", carousel: true })
        ])
      }
    });
  });

  it("usa o background diurno aprovado apenas no Menu Título", () => {
    const project = verticeProject();
    const logo = project.scenas.find((scene) => scene.name === "logo");
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const logoAsset = project.assets.find((asset) => asset.name === "gba-studio-startup-canvas-frame-00-gba.png");
    const titleAsset = project.assets.find((asset) => asset.name === "title-day-centered-240x160-4bpp.png");

    expect(logo).toMatchObject({
      backgroundAssetName: "gba-studio-startup-canvas-frame-00-gba.png",
      backgroundRenderMode: "tilemap"
    });
    expect(title).toMatchObject({
      backgroundAssetName: "title-day-centered-240x160-4bpp.png"
    });
    expect(titleAsset).toMatchObject({
      metadata: {
        reviewStatus: "approved",
        assetcStatus: "attention",
        backgroundPaletteBankBudget: 14
      }
    });
    expect(logoAsset).toMatchObject({
      kind: "Background",
      name: "gba-studio-startup-canvas-frame-00-gba.png",
      metadata: {
        source: "Assets/backgrounds/gba-studio-startup-canvas-frame-00-gba.png",
        role: "startup-logo-bg",
        sceneRoles: expect.arrayContaining(["startup-logo-bg", "logo-bg"]),
        colorMode: "4bpp",
        width: 240,
        height: 160,
        assetcStatus: "safe",
        generatedBy: "exemplo-gba-startup-logo-v3",
        provenance: expect.stringContaining("canvas"),
        reviewStatus: "approved"
      }
    });
  });

  it("preserva a composição V2 aprovada e o carrossel de opções no título", () => {
    const saved = JSON.parse(readFileSync(templateURL, "utf8"));
    for (const project of [saved, promoteExemploGBAVerticeCampaign(saved)]) {
      expect(project.scenas).toHaveLength(30);
      const title = project.scenas.find((scene) => scene.name === "titulo");
      const titleOptions = title.runtime.config.screens.find((screen) => screen.id === "title_options");
      expect(title.backgroundAssetName).toBe("title-day-centered-240x160-4bpp.png");
      expect(title.runtime.config.backgroundAnimation.frameAssetNames).toEqual(["title-day-centered-240x160-4bpp.png"]);
      expect(title.runtime.config.screens[0].backgroundAnimation.frameAssetNames).toEqual(["title-day-centered-240x160-4bpp.png"]);
      expect(title.runtime.config.screens[0].items[0]).toMatchObject({ eventName: "titulo_abrir_menu", targetScreenID: "title_options" });
      expect(titleOptions).toMatchObject({ carousel: true, items: [
        expect.objectContaining({ id: "new-game" }),
        expect.objectContaining({ id: "load-game" }),
        expect.objectContaining({ id: "language" }),
        expect.objectContaining({ id: "settings" }),
        expect.objectContaining({ id: "credits" })
      ] });
      expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
      expect(project.actors.filter((actor) => actor.roomName === "titulo")).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "title-logo-v2", x: 7, y: 0, spriteSheet: "title-logo-actor-128x88.png", animationStateID: "title-logo-actor-128x88-state" }),
        expect.objectContaining({ id: "title-press-start", x: 10, y: 13, spriteSheet: "press-start-actor-88x32.png", animationStateID: "press-start-actor-state", inputBinding: "Start", eventBindings: { onInteract: "titulo_abrir_menu" } })
      ]));
      expect(project.assets.find((asset) => asset.name === "title-day-centered-240x160-4bpp.png")?.metadata).toMatchObject({ reviewStatus: "approved", candidateStatus: "canonical-integrated", assetcStatus: "attention", backgroundPaletteBankBudget: 14 });
      expect(project.assets.find((asset) => asset.name === "title-logo-actor-128x88.png")?.metadata).toMatchObject({ reviewStatus: "approved", candidateStatus: "canonical-integrated", technicalStatus: "attention" });
      expect(project.assets.find((asset) => asset.name === "press-start-actor-88x32.png")?.metadata).toMatchObject({ reviewStatus: "approved", candidateStatus: "canonical-integrated" });
      expect(project.animations.find((animation) => animation.id === "title-logo-actor-128x88-animation")).toMatchObject({ frameWidth: 128, frameHeight: 88, frames: [{ tiles: expect.arrayContaining([expect.objectContaining({ tileWidth: 64, tileHeight: 64 })]) }] });
      expect(project.animationStates.some((state) => state.id === "title-logo-actor-128x88-state")).toBe(true);
      expect(project.animations.some((animation) => animation.id === "press-start-actor-animation")).toBe(true);
      expect(project.animationStates.some((state) => state.id === "press-start-actor-state")).toBe(true);
    }
    for (const [path, sha256] of [
      ["Assets/backgrounds/title-day-centered-240x160-4bpp.png", "34de4e4b73def5a18a7e55d6fac176ca2b6fd99e2d39231935a2bcd075f6daf9"],
      ["Assets/sprites/title-logo-actor-128x88.png", "f2fa056433d6b43629edb8ef65a9d1fb0ced41b391030a84bdf96931f021c3e0"],
      ["Assets/sprites/press-start-actor-88x32.png", "b3c0d69aa24afe1b4d4bde7aca15ba10a8f7fb03b94150271b34dffecdd2669c"]
    ]) {
      expect(createHash("sha256").update(readFileSync(new URL(path, templateURL))).digest("hex")).toBe(sha256);
    }
  });

  it("preserva os 14 bancos preparados do Título sem quantizar o PNG novamente", () => {
    const report = JSON.parse(readFileSync(new URL(
      "../fixtures/asset-provenance/title-background-14banks.report.json",
      import.meta.url
    ), "utf8"));
    const plan = { banks: report.banks, tile_palette_banks: report.tile_palette_banks };
    const source = decodePngRgba(readFileSync(new URL(
      "Assets/backgrounds/title-day-centered-240x160-4bpp.png", templateURL
    )));
    expect(plan.banks).toHaveLength(14);
    expect(plan.tile_palette_banks).toHaveLength(600);
    for (const project of [canonicalProject(), verticeProject()]) {
      const exported = buildAssetcTilesetPackGeneration(project)
        ?.assetsBySheet?.["title-day-centered-240x160-4bpp.png"];
      expect(exported?.background_palette_reference_plan).toEqual(plan);
    }
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const bank = plan.banks[plan.tile_palette_banks[Math.floor(y / 8) * 30 + Math.floor(x / 8)]];
        const offset = (y * source.width + x) * 4;
        const color = [...source.pixels.subarray(offset, offset + 3)].map((value) => (value >> 3) << 3);
        if (!bank.some((candidate) => candidate && candidate.every((value, index) => value === color[index]))) {
          throw new Error(`Plano do Título não representa o pixel ${x},${y}.`);
        }
      }
    }
  });

  it("separa a arte da Abertura da paisagem do Menu Título", () => {
    const project = verticeProject();
    const abertura = project.scenas.find((scene) => scene.name === "abertura");
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const openingAsset = project.assets.find((asset) => asset.name === "opening-v4-per-tile-14-banks.png");
    const titlePack = buildAssetcTilesetPackGeneration(project);
    const titleBackground = titlePack?.assetsBySheet?.["title-day-centered-240x160-4bpp.png"];

    expect(abertura).toMatchObject({
      backgroundAssetName: "opening-v4-per-tile-14-banks.png",
      backgroundRenderMode: "tilemap"
    });
    expect(title).toMatchObject({
      backgroundAssetName: "title-day-centered-240x160-4bpp.png"
    });
    expect(openingAsset).toMatchObject({
      kind: "Background",
      name: "opening-v4-per-tile-14-banks.png",
      metadata: {
        source: "Assets/backgrounds/opening-v4-per-tile-14-banks.png",
        generatedBy: "opening-v4-per-tile-14-banks",
        role: "opening-bg",
        sceneRoles: ["opening-bg"],
        profile: "menu",
        colorMode: "4bpp",
        backgroundPaletteBankBudget: 14,
        reviewStatus: "approved",
        backgroundPaletteReferencePlan: {
          banks: expect.any(Array),
          tile_palette_banks: expect.any(Array)
        }
      }
    });
    expect(titleBackground).toMatchObject({
      kind: "bg",
      background_palette_banks: 14
    });
  });

  it("usa os cinco atores aprovados da sequência V3", () => {
    const project = verticeProject();
    const openingActors = project.actors.filter((actor) => actor.roomName === "abertura");
    expect(openingActors.map((actor) => actor.id)).toEqual([
      "opening-v3-actor-guardia-idle",
      "opening-v3-actor-guardia-turn",
      "opening-v3-actor-guardia-signal",
      "opening-v3-actor-menino",
      "opening-v3-actor-gaivota"
    ]);
    expect(openingActors.every((actor) => actor.x === 29 && actor.y === 19)).toBe(true);
    expect(project.assets.find((asset) => asset.name === "opening-v3-guardia-idle-48x64.png"))
      .toMatchObject({ kind: "Sprite", metadata: { role: "opening-actor", colorMode: "4bpp" } });
    expect(project.animations.find((animation) => animation.id === "opening-v3-animation-guardia-idle"))
      .toMatchObject({ frameWidth: 48, frameHeight: 64, frameCount: 1 });
    expect(project.animationStates.find((state) => state.id === "opening-v3-state-guardia-idle"))
      .toMatchObject({ animationIDs: ["opening-v3-animation-guardia-idle"] });
    expect(project.actors.filter((actor) => actor.roomName === "titulo").map((actor) => actor.id))
      .toEqual([
        "title-logo-v2",
        "title-press-start",
        "title-carousel-new-game",
        "title-carousel-load-game",
        "title-carousel-language",
        "title-carousel-settings",
        "title-carousel-credits"
      ]);
    expect(project.scenas.find((scene) => scene.name === "logo")?.actors ?? []).toHaveLength(0);
    expect(project.scenas.find((scene) => scene.name === "titulo")?.playerActorName).toBe("");
  });

  it("remove os atores de setas azuis substituídos pelo bloco Slider", () => {
    const project = verticeProject();
    expect(project.actors.filter((actor) => actor.id.startsWith("title-carousel-arrow-"))).toEqual([]);
    expect(project.events.find((event) => event.name === "titulo_abrir_menu")?.steps).toContainEqual(expect.objectContaining({ command: "slider title_options", isEnabled: true }));
  });

  it("mantém o fundo aprovado no título depois de retirar a cena Menu Inicial", () => {
    const project = verticeProject();
    const title = project.scenas.find((scene) => scene.name === "titulo");

    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(title).toMatchObject({ backgroundAssetName: "title-day-centered-240x160-4bpp.png" });
  });

  it("exporta a Logo como primeira tela nativa e aponta para a Abertura", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const scenes = exported.cutscene_project?.scenes ?? [];
    const logoIndex = scenes.findIndex((scene) => scene.name === "logo");
    const aberturaIndex = scenes.findIndex((scene) => scene.name === "abertura");
    const logo = scenes[logoIndex];
    const logoBackground = exported.cutscene_project?.backgrounds?.[logo?.background ?? -1];

    expect(exported.runtime_dispatch).toMatchObject({
      initial_runtime: "cutscene",
      initial_scene: "logo"
    });
    expect(exported.cutscene_project?.initial_scene).toBe(logoIndex);
    expect(logo).toMatchObject({
      name: "logo",
      background: expect.any(Number),
      next_scene: aberturaIndex,
      steps: [
        expect.objectContaining({ duration_frames: 18, auto_advance: true, skippable: true, target_scene: -1 }),
        expect.objectContaining({ duration_frames: 12, auto_advance: true, skippable: true, target_scene: -1 }),
        expect.objectContaining({ duration_frames: 12, auto_advance: true, skippable: true, target_scene: -1 }),
        expect.objectContaining({ duration_frames: 18, auto_advance: true, skippable: true, target_scene: -1 }),
        expect.objectContaining({ duration_frames: 60, auto_advance: true, skippable: true, target_scene: aberturaIndex })
      ]
    });
    expect(logoBackground).toMatchObject({
      name: "gba_studio_startup_canvas_frame_00_gba",
      layer: "bg1",
      tilemap: "gba_studio_startup_canvas_frame_00_gba"
    });
  });

  it("exporta a Abertura com seu próprio background e avanço para o Menu Título", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const scenes = exported.cutscene_project?.scenes ?? [];
    const aberturaIndex = scenes.findIndex((scene) => scene.name === "abertura");
    const abertura = scenes[aberturaIndex];
    const aberturaBackground = exported.cutscene_project?.backgrounds?.[abertura?.background ?? -1];

    expect(abertura).toMatchObject({
      name: "abertura",
      background: expect.any(Number),
      steps: [
        expect.objectContaining({
          duration_frames: 120,
          auto_advance: true,
          skippable: true,
          actor_motions: expect.arrayContaining([{
            actor_index: 0,
            from_position: { x: 240, y: 160 },
            to_position: { x: 142, y: 81 },
            duration_frames: 1
          }])
        }),
        expect.objectContaining({ duration_frames: 90, skippable: true }),
        expect.objectContaining({ duration_frames: 120, script: [{ op: "play_sfx", index: 7 }] }),
        expect.objectContaining({ duration_frames: 150, skippable: true }),
        expect.objectContaining({ script: expect.any(Array), skippable: false })
      ]
    });
    expect(aberturaBackground).toMatchObject({
      name: "opening_v4_per_tile_14_banks",
      layer: "bg1",
      tilemap: "opening_v4_per_tile_14_banks"
    });
  });

  it("exporta o ator da Abertura como metasprite nativo da cutscene", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const abertura = exported.cutscene_project?.scenes.find((scene) => scene.name === "abertura");

    expect(abertura?.actors).toHaveLength(5);
    expect(abertura?.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Guardiã · Abertura · Quadro 1", metasprite: { asset: "opening_v3_guardia_idle_48x64", index: 0 } }),
      expect.objectContaining({ name: "Guardiã · Abertura · Quadro 2", metasprite: { asset: "opening_v3_guardia_turn_48x64", index: 0 } }),
      expect.objectContaining({ name: "Guardiã · Abertura · Quadro 3", metasprite: { asset: "opening_v3_guardia_signal_48x64", index: 0 } }),
      expect.objectContaining({ name: "Menino · Abertura · Quadro 4", metasprite: { asset: "opening_v3_menino_24x32", index: 0 } }),
      expect.objectContaining({ name: "Gaivota · Abertura · Quadro 4", metasprite: { asset: "opening_v3_gaivota_24x16", index: 0 } })
    ]));
    expect(exported.cutscene_project?.assets).toMatchObject({
      obj_palettes: expect.arrayContaining(["opening_v3_guardia_idle_48x64", "opening_v3_guardia_turn_48x64", "opening_v3_guardia_signal_48x64", "opening_v3_menino_24x32", "opening_v3_gaivota_24x16"]),
      tile_assets: expect.arrayContaining(["opening_v3_guardia_idle_48x64", "opening_v3_guardia_turn_48x64", "opening_v3_guardia_signal_48x64", "opening_v3_menino_24x32", "opening_v3_gaivota_24x16"])
    });
  });

  it("exporta o fundo aprovado do título para as telas do carrossel", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const title = exported.menu_project?.screens.find((candidate) => candidate.name === "title");
    const options = exported.menu_project?.screens.find((candidate) => candidate.name === "title_options");
    const background = exported.menu_project?.backgrounds?.[options?.background ?? -1];

    expect(title?.background).toEqual(expect.any(Number));
    expect(options?.background).toBe(title?.background);
    expect(background).toMatchObject({
      name: "title_day_centered_240x160_4bpp",
      layer: "bg1",
      tilemap: "title_day_centered_240x160_4bpp"
    });
  });

  it("exporta as cinco opções do carrossel sem atores de setas", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const options = exported.menu_project?.screens.find((screen) => screen.name === "title_options");

    expect(options?.actors).toHaveLength(6);
    expect(options?.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "NOVO JOGO", role: "option", menu_item_index: 0, metasprite: { asset: "menu_inicial_new_game", index: 0 } }),
      expect.objectContaining({ name: "CARREGAR JOGO", role: "option", menu_item_index: 1, metasprite: { asset: "menu_inicial_load_game", index: 0 } }),
      expect.objectContaining({ name: "IDIOMA", role: "option", menu_item_index: 2, metasprite: { asset: "menu_inicial_language", index: 0 } }),
      expect.objectContaining({ name: "CONFIGURAÇÕES", role: "option", menu_item_index: 3, metasprite: { asset: "menu_inicial_settings", index: 0 } }),
      expect.objectContaining({ name: "CRÉDITOS", role: "option", menu_item_index: 4, metasprite: { asset: "menu_inicial_credits", index: 0 } })
    ]));
    expect(options?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Carregar jogo", requires_save: true })
    ]));
  });

  it("mantém os atores dos Créditos no perfil neutro aprovado", () => {
    const project = verticeProject();
    const initialMenuPageNames = new Set(["creditos"]);
    const initialMenuPageActors = project.actors.filter((actor) => initialMenuPageNames.has(actor.roomName));

    expect(initialMenuPageActors).not.toHaveLength(0);
    expect(initialMenuPageActors.every((actor) => (
      actor.spriteSheet.startsWith("neutral-")
      && actor.menuEntryAnimation === undefined
    ))).toBe(true);
  });

  it("materializa as telas ligadas ao carrossel com fundos e atores próprios", () => {
    const project = verticeProject();
    const linkedScenes = [
      "escolha_genero",
      "nome_jogador",
      "carregar_jogo",
      "salvar",
      "menu_start",
      "configuracoes",
      "creditos"
    ].map((name) => project.scenas.find((scene) => scene.name === name));

    expect(linkedScenes.every(Boolean)).toBe(true);
    expect(linkedScenes.map((scene) => scene?.backgroundAssetName)).toEqual([
      "gender-selection-approved-v2-gba.png", "name-input-approved-v2-gba.png",
      "neutral-carregar_jogo-gba.png", "neutral-salvar-gba.png", "neutral-menu_start-gba.png",
      "neutral-configuracoes-gba.png", "neutral-creditos-gba.png"
    ]);
    expect(project.actors.filter((actor) => [
      "escolha_genero",
      "nome_jogador",
      "carregar_jogo",
      "menu_start",
      "creditos"
    ].includes(actor.roomName))).not.toHaveLength(0);
    const genderActorPositions = Object.fromEntries(
      project.actors
        .filter((actor) => actor.roomName === "escolha_genero")
        .map((actor) => [actor.name, { x: actor.x, y: actor.y }])
    );
    expect(project.actors.find(actor => actor.name === "Moldura de seleção").menuPositionPixels).toEqual({x: 58, y: 47});
    expect(genderActorPositions).toEqual(expect.objectContaining({
      "gender-portrait-male-gba": { x: 7, y: 6 },
      "gender-portrait-female-gba": { x: 15, y: 6 },
      "Moldura de seleção": { x: 7, y: 5 }
    }));
  });

  it("redireciona o idioma do carrossel para a cena única de configurações", () => {
    const project = verticeProject();
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const options = title?.runtime?.config?.screens?.find((screen) => screen.id === "title_options");
    const settings = project.scenas.find((scene) => scene.name === "configuracoes");

    expect(project.scenas.some((scene) => scene.name === "idioma")).toBe(false);
    expect(options?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "language", targetScreenID: "configuracoes", targetItemID: "language", action: "push_screen" })
    ]));
    expect(settings?.runtime?.config?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "language", variableIndex: 15, action: "adjust_variable" })
    ]));
  });

  it("exporta os dois atores da tela inicial e as opções do carrossel como metasprites", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const title = exported.menu_project?.screens.find((screen) => screen.name === "title");
    const options = exported.menu_project?.screens.find((screen) => screen.name === "title_options");

    expect(title?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "PRESS START", line: -1 })
    ]));
    expect(title?.actors).toHaveLength(2);
    expect(title?.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "TITLE LOGO · O Último Farol", metasprite: { asset: "title_logo_actor_128x88", index: 0 } }),
      expect.objectContaining({ name: "PRESS START", metasprite: { asset: "press_start_actor_88x32", index: 0 } })
    ]));
    expect(options?.actors).toHaveLength(6);
    expect(exported.menu_project?.assets).toMatchObject({
      obj_palettes: expect.arrayContaining(["title_logo_actor_128x88", "press_start_actor_88x32", "menu_inicial_new_game"]),
      tile_assets: expect.arrayContaining(["title_logo_actor_128x88", "press_start_actor_88x32", "menu_inicial_new_game"])
    });
  });

  it("separa a escolha de gênero da entrada do nome do jogador", () => {
    const project = verticeProject();
    const gender = project.scenas.find((scene) => scene.name === "escolha_genero");
    const name = project.scenas.find((scene) => scene.name === "nome_jogador");

    expect(gender?.runtime).toMatchObject({
      type: "menu",
      config: {
        role: "gender_select",
        items: expect.arrayContaining([
          expect.objectContaining({ id: "male", eventName: "escolha_genero_homem" }),
          expect.objectContaining({ id: "female", eventName: "escolha_genero_mulher" }),
        ])
      }
    });
    expect(gender?.runtime?.config).not.toHaveProperty("textInput");
    expect(name?.runtime).toMatchObject({
      type: "menu",
      config: {
        role: "name_input",
        textInput: { variableName: "var_character_name", maxLength: 8 },
        items: expect.arrayContaining([
          expect.objectContaining({ id: "confirm", eventName: "nome_jogador_confirmar" })
        ])
      }
    });
    expect(project.scenas.find((scene) => scene.name === "novo_jogo")).toBeUndefined();
    expect(project.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "escolha_genero_confirmar",
        steps: expect.arrayContaining([expect.objectContaining({ command: "change_scene nome_jogador 21 17 right" })])
      }),
      expect.objectContaining({
        name: "nome_jogador_confirmar",
        steps: expect.arrayContaining([expect.objectContaining({ command: "change_scene prologo 21 17 right" })])
      })
    ]));
  });

  it("materializa Missões com objetivo condicional e progresso real sem mutar a campanha", () => {
    const project = verticeProject();
    const scene = project.scenas.find(scene => scene.name === "missoes");
    expect(scene.runtime.config.items.map(item => item.binding?.index).filter(Number.isInteger)).toEqual([1, 2, 8, 14]);
    const commands = project.events.find(event => event.name === "missoes_detalhar_proximo").steps.map(step => step.command);
    expect(commands[0]).toBe("if_variable var_campaign_finished 1");
    expect(commands).toContain("if_variable var_frame 1");
    expect(commands.filter(command => command === "condition_end")).toHaveLength(12);
    expect(commands.some(command => /set_variable|save_game|change_scene|push_screen|pop_screen/.test(command))).toBe(false);
    expect(project.actors.filter(actor => actor.roomName === "missoes")).toHaveLength(13);
  });


  it("materializa o Inventário com os cinco módulos adquiríveis e detalhes de consulta", () => {
    const project = verticeProject();
    const items = project.scenas.find(scene => scene.name === "inventario").runtime.config.items;
    expect(items.filter(item => item.binding).map(item => item.binding.index)).toEqual([1, 4, 2, 6, 7]);
    expect(items.some(item => item.binding?.index === 5)).toBe(false);
    for (const item of items.filter(item => item.eventName)) {
      const commands = project.events.find(event => event.name === item.eventName).steps.map(step => step.command);
      expect(commands).toEqual([expect.stringMatching(/^show_dialogue ingame-item-/)]);
    }
    expect(project.actors.filter(actor => actor.roomName === "inventario")).toHaveLength(12);
  });


  it("materializa o Mapa de consulta com oito destinos e nenhuma ação de viagem", () => {
    const project = verticeProject();
    const scene = project.scenas.find(scene => scene.name === "mapa_menu");
    expect(scene.runtime.config.mapMode).toBe("inspect");
    expect(scene.runtime.config.items).toHaveLength(9);
    expect(scene.runtime.config.nodes).toBeUndefined();
    for (const item of scene.runtime.config.items.filter(item => item.eventName)) {
      expect(item.action).toBe("select");
      const commands = project.events.find(event => event.name === item.eventName).steps.map(step => step.command);
      expect(commands).toEqual([expect.stringMatching(/^show_dialogue ingame-map-/)]);
    }
  });


  it("mantém no catálogo o mapa de viagem aprovado no lugar do Mapa Híbrido", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.name === "route-map-paged-v2.png");

    expect(background?.metadata).toMatchObject({
      kind: "paged_bg",
      backgroundPaletteBankBudget: 14,
      sceneRoles: expect.arrayContaining(["route-map", "route-islands"]),
      reviewStatus: "approved"
    });
  });

  it("retira Perfil/Equipe e usa os retratos aprovados e o nome no Start", () => {
    const project = verticeProject();
    expect(project.scenas.some(scene => scene.name === "perfil_equipe")).toBe(false);
    expect(project.actors.some(actor => actor.roomName === "perfil_equipe")).toBe(false);
    const start = project.scenas.find(scene => scene.name === "menu_start");
    expect(start.runtime.config.titleTextVariableName).toBe("var_character_name");
    const portraits = project.actors.filter(actor => actor.roomName === "menu_start" && actor.menuVisibilityVariable === "var_character_gender");
    expect(portraits.map(actor => actor.spriteSheet)).toEqual(["neutral-portrait-male-gba.png", "neutral-portrait-female-gba.png"]);
    expect(portraits.map(actor => actor.menuVisibilityValue)).toEqual([0, 1]);
    expect(portraits.every(actor => actor.menuVisibilityVariable === "var_character_gender")).toBe(true);
  });


  it("exporta a entrada de nome do jogador sem recorrer à caixa de diálogo", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const playerName = exported.menu_project?.screens.find((screen) => screen.name === "nome_jogador");

    expect(playerName?.text_input).toEqual(expect.objectContaining({
      variable_index: expect.any(Number),
      max_length: 8,
      x: 13,
      y: 6,
      width: 8,
      keyboard_layout: "grid",
      keyboard_x: 7,
      keyboard_y: 8,
      keyboard_width: 16,
      keyboard_height: 10,
      keyboard_allow_lowercase: true,
      keyboard_control_layout: "bottom_grid",
      keyboard_surface: "background"
    }));
    expect(playerName?.actors).toEqual([
      expect.objectContaining({ name: "name-portrait-male-gba", role: "decorative", visibility_value: 0 }),
      expect.objectContaining({ name: "name-portrait-female-gba", role: "decorative", visibility_value: 1 })
    ]);
  });

  it("mantém os textos de gênero no background e o nome livre para o input runtime", () => {
    const project = verticeProject();
    const gender = project.actors.find((actor) => actor.id === "menu-escolha-genero-title");
    const name = project.actors.find((actor) => actor.id === "menu-nome-jogador-title");
    const playerName = project.scenas.find((scene) => scene.name === "nome_jogador");

    expect(gender).toBeUndefined();
    expect(name).toBeUndefined();
    expect(project.actors.filter((actor) => actor.roomName === "nome_jogador")).toHaveLength(2);
    expect(playerName?.runtime?.config?.textInput).toMatchObject({ x: 13, y: 6, width: 8 });
  });

  it("mantém cada tela ligada limitada aos próprios atores e ao BG compartilhado", () => {
    const project = verticeProject();
    const exported = buildEngineExportProjectContract(project);
    const expectedActors = {
      escolha_genero: ["gender-portrait-male-gba", "gender-portrait-female-gba", "Moldura de seleção"],
      nome_jogador: ["name-portrait-male-gba", "name-portrait-female-gba"],
      carregar_jogo: [],
      menu_start: ["Jogador - male", "Jogador - female"],
      configuracoes: [],
      creditos: ["CRÉDITOS", "GBA STUDIO", "ENGINE", "Seta de seleção"],
      missoes: []
    };

    for (const [screenName, legacyNames] of Object.entries(expectedActors)) {
      const neutral = !["escolha_genero", "nome_jogador"].includes(screenName);
      const names = neutral ? project.actors.filter(actor => actor.roomName === screenName).map(actor => actor.name) : legacyNames;
      const screen = exported.menu_project?.screens.find((candidate) => candidate.name === screenName);
      expect(screen?.background).toEqual(expect.any(Number));
      const screenActors = screen?.actors ?? [];
      expect(screenActors.map((actor) => actor.name)).toHaveLength(names.length);
      expect(screenActors.map((actor) => actor.name)).toEqual(expect.arrayContaining(names));
      const actorAssets = screenActors
        ?.filter((actor) => actor.name !== "VOLTAR")
        .map((actor) => actor.metasprite.asset);
      if (neutral) expect(screenActors.filter(actor => actor.role === "cursor")).toHaveLength(1);
      else expect(new Set(actorAssets)).toHaveLength(names.length - (names.includes("VOLTAR") ? 1 : 0));
    }

    const gender = exported.menu_project?.screens.find((screen) => screen.name === "escolha_genero");
    expect(gender?.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gender-portrait-male-gba", role: "option", metasprite: { asset: "gender_portrait_male_gba", index: 0 } }),
      expect.objectContaining({ name: "gender-portrait-female-gba", role: "option", metasprite: { asset: "gender_portrait_female_gba", index: 0 } })
    ]));

    expect(exported.menu_project?.screens.find((screen) => screen.name === "menu_start")?.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ label: "Retomar", action: "pop_screen" })]));
  });

  it("mantém os recortes antigos do logotipo fora do pacote runtime", () => {
    const project = verticeProject();
    const logoSegments = project.assets.filter((asset) => (
      asset.name.startsWith("title-logo-emblem-") && asset.name.endsWith(".png")
    ));
    const spritePack = buildAssetcSpritePackGeneration(project);

    expect(logoSegments).toHaveLength(0);
    for (const asset of logoSegments) {
      expect(spritePack?.assetsBySheet?.[asset.name]).toBeUndefined();
    }
  });

  it("exporta somente o logotipo do título que está referenciado na cena", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const names = new Set(exported.asset_pack?.assets?.map((asset) => asset.name) ?? []);

    expect(names).toContain("title_logo_actor_128x88");
    expect([...names].some((name) => name.startsWith("title_logo_emblem_"))).toBe(false);
  });

  it("monta Configurações como uma única cena com HUD de diálogo", () => {
    const project = verticeProject();
    const settings = project.scenas.find((scene) => scene.name === "configuracoes");
    const startMenu = project.scenas.find((scene) => scene.name === "menu_start");
    const settingsItems = settings?.runtime?.config?.items ?? [];
    const settingsHud = project.settings.hudPresets.find((preset) => preset.id === "hud-neutral-configuracoes");

    expect(project.scenas).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idioma" }),
      expect.objectContaining({ name: "configuracoes_audio" }),
      expect.objectContaining({ name: "configuracoes_controles" })
    ]));
    expect(settings).toMatchObject({
      backgroundAssetName: "neutral-configuracoes-gba.png",
      hudPresetId: "hud-neutral-configuracoes",
      runtime: {
        type: "menu",
        config: {
          role: "settings",
          presentationMode: "hud",
          hudPresetId: "hud-neutral-configuracoes"
        }
      }
    });
    expect(settingsItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "audio-master", variableIndex: 18, action: "adjust_variable", audioChannel: "all" }),
      expect.objectContaining({ id: "audio-music", variableIndex: 19, action: "adjust_variable", audioChannel: "music" }),
      expect.objectContaining({ id: "audio-sfx", variableIndex: 20, action: "adjust_variable", audioChannel: "sfx" }),
      expect.objectContaining({ id: "audio-enabled", variableIndex: 21, action: "toggle_variable", audioChannel: "all" }),
      expect.objectContaining({ id: "language", variableIndex: 15, action: "adjust_variable" }),
      expect.objectContaining({ id: "controls", label: "Controles" }),
      expect.objectContaining({ id: "rtc", eventName: "configuracoes_rtc", binding: expect.objectContaining({ index: 23 }) }),
      expect.objectContaining({ id: "back", action: "pop_screen" })
    ]));
    expect(settingsItems).toHaveLength(8);
    expect(settingsHud).toMatchObject({
      backgroundImage: "",
      width: 240,
      height: 160,
      mode: "advanced",
      components: expect.arrayContaining([
        expect.objectContaining({ id: "configuracoes-row-0", kind: "text", x:56, y:44, height:8 }),
        expect.objectContaining({ kind: "text", text: "D MOVER A OK B VOLTAR", label: "D MOVER A OK B VOLTAR" })
      ])
    });
    expect(settingsHud.components.some(component => component.id === "configuracoes-title")).toBe(false);
    expect(project.assets.find(asset => asset.name === settings.backgroundAssetName)?.metadata.generatedBy).toBe("approved-neutral-menus-v3");
    expect(project.actors.filter((actor) => actor.roomName === "configuracoes")).toHaveLength(9);
    expect(project.events.find((event) => event.name === "configuracoes_ao_entrar")?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "read_rtc hour var_rtc_hour" }),
      expect.objectContaining({ command: "read_rtc minute var_rtc_minute" })
    ]));
    expect(project.events.some((event) => event.name === "configuracoes_audio_ao_entrar")).toBe(false);
    expect(project.events.some((event) => event.name === "configuracoes_controles_ao_entrar")).toBe(false);
    expect(project.dialogues.some((dialogue) => ["configuracoes_audio", "configuracoes_controles"].includes(dialogue.key))).toBe(false);
    expect(project.settings.controls).toMatchObject({
      aButton: "X",
      bButton: "Z",
      startButton: "Enter",
      selectButton: "Shift",
      preset: "GBA clássico"
    });
    expect(startMenu?.runtime).toMatchObject({
      type: "menu",
      config: {
        role: "start",
        items: expect.arrayContaining([
            expect.objectContaining({ id: "inventory", targetScreenID: "inventario", action: "push_screen" }),
            expect.objectContaining({ id: "save", targetScreenID: "salvar", action: "push_screen" }),
            expect.objectContaining({ id: "back", action: "pop_screen" })
          ])
      }
    });
  });

  it("classifica as cenas de campanha, suporte e showcase do projeto exemplo", () => {
    const project = verticeProject();
    const scenes = new Map(project.scenas.map((scene) => [scene.name, scene]));

    expect(verticeShowcaseSceneClassification(scenes.get("porto_lumen"))).toEqual({
      id: "o-ultimo-farol",
      lane: "campaign",
      access: "campaign",
      playable: true,
      retained: true
    });
    expect(verticeShowcaseSceneClassification(scenes.get("arena_tatica"))).toEqual({
      id: "o-ultimo-farol",
      lane: "showcase",
      access: "market-guard",
      playable: true,
      retained: true
    });
    expect(scenes.has("affine_lab")).toBe(false);
    expect(scenes.get("mapa_rota").runtime.config.profile).toBe("route-map-affine-v2-approved");
    expect(verticeShowcaseSceneClassification(scenes.get("configuracoes"))).toEqual({
      id: "o-ultimo-farol",
      lane: "support",
      access: "settings",
      playable: true,
      retained: true
    });
    expect(scenes.get("arena_tatica")).toMatchObject({
      showcase: {
        lane: "showcase",
        access: "market-guard",
        playable: true,
        retained: true
      }
    });

  });

  it("mantém o pacote tático aprovado como referência jogável do showcase", () => {
    const project = verticeProject();
    const tacticalActors = project.actors.filter((actor) => actor.roomName === "arena_tatica");

    expect(tacticalActors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "tactical-nara",
        spriteSheet: "tactical-nara-v5.png",
        animationStateID: "tactical-nara-v5-state"
      }),
      expect.objectContaining({
        id: "tactical-sentinel",
        spriteSheet: "tactical-sentinel-v5.png",
        animationStateID: "tactical-sentinel-v5-state"
      })
    ]));
    expect(project.animations.filter((animation) => animation.spriteSheet === "tactical-nara-v5.png")).toHaveLength(20);
    expect(project.animationStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ spriteSheet: "tactical-nara-v5.png" }),
      expect.objectContaining({ spriteSheet: "tactical-sentinel-v5.png" })
    ]));
    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "tactical-v5-surface.png",
      "tactical-v5-hud.png",
      "tactical-nara-v5.png",
      "tactical-sentinel-v5.png",
      "tactical-cursor-diamond-32x16-v1.png"
    ]));
    expect(project.animations.some((animation) => animation.spriteSheet === "tactical-nara-v3.png")).toBe(false);
    expect(project.animationStates.some((state) => ["tactical-nara-v3.png", "tactical-sentinel-v3.png"].includes(state.spriteSheet))).toBe(false);
  });

  it("materializa Créditos como tela informativa reutilizável", () => {
    const project = verticeProject();
    const credits = project.scenas.find((scene) => scene.name === "creditos");

    expect(credits).toMatchObject({
      backgroundAssetName: "neutral-creditos-gba.png",
      backgroundRenderMode: "tilemap",
      runtime: {
        type: "menu",
        config: {
          role: "credits",
          items: expect.arrayContaining([
            expect.objectContaining({ id: "credits-project", eventName: "creditos_detalhar_projeto", action: "select" }),
            expect.objectContaining({ id: "credits-engine", eventName: "creditos_detalhar_engine", action: "select" })
          ])
        }
      }
    });
    const projectEvent = project.events.find((event) => event.name === "creditos_detalhar_projeto");
    const engineEvent = project.events.find((event) => event.name === "creditos_detalhar_engine");
    expect(projectEvent?.steps.map((step) => step.command)).toEqual(["show_dialogue creditos_projeto"]);
    expect(engineEvent?.steps.map((step) => step.command)).toEqual(["show_dialogue creditos_engine"]);
    expect(project.dialogues).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "creditos_projeto" }),
      expect.objectContaining({ key: "creditos_engine" })
    ]));
    const creditsActors = project.actors.filter((actor) => actor.roomName === "creditos");
    expect(creditsActors.map((actor) => actor.spriteSheet)).toEqual([
      "neutral-compact-mission-gba.png", "neutral-compact-gear-gba.png", "neutral-arrow-right-gba.png"
    ]);
    expect(creditsActors.every((actor) => actor.x >= 0 && actor.y >= 0 && actor.x * 8 < 240 && actor.y * 8 < 160)).toBe(true);
  });

  it("materializa Salvar e Carregar com três slots correspondentes", () => {
    const project = verticeProject();
    for (const [name, prefix, requiresSave] of [["salvar", "menu_salvar", false], ["carregar_jogo", "carregar_jogo", true]]) {
      const scene = project.scenas.find(scene => scene.name === name);
      expect(scene.backgroundAssetName).toBe(`neutral-${name}-gba.png`);
      expect(scene.runtime.config.items.filter(item => Number.isInteger(item.saveSlot)).map(item => item.saveSlot)).toEqual([0, 1, 2]);
      for (let slot = 0; slot < 3; slot++) {
        const item = scene.runtime.config.items[slot];
        expect(item.action).toBe("select");
        expect(Boolean(item.requiresSave)).toBe(requiresSave);
        const commands = project.events.find(event => event.name === `${prefix}_slot_${slot + 1}`).steps.map(step => step.command);
        expect(commands).toEqual(requiresSave ? [`if_save_game ${slot}`, `load_game ${slot}`, "condition_end"] : [`save_game ${slot}`]);
      }
      expect(project.actors.filter(actor => actor.roomName === name)).toHaveLength(5);
    }
    expect(project.settings.save).toMatchObject({ autoSave: true, manualSave: true, slots: 3 });
  });


  it("materializa o Menu Start com seis opções e retorno à partida", () => {
    const project = verticeProject();
    const startMenu = project.scenas.find(scene => scene.name === "menu_start");
    expect(project.scenas).toHaveLength(canonicalVerticeSceneCount());
    expect(startMenu.runtime.config.items.map(item => item.id)).toEqual(["missions", "inventory", "map", "save", "settings", "back"]);
    expect(startMenu.runtime.config.items.at(-1)).toMatchObject({ label: "Retomar", action: "pop_screen" });
    expect(startMenu.eventBindings).toMatchObject({ onInit: "menu_start_ao_entrar" });
  });


  it("promove o mapa de viagem aprovado com atlas em ROM e janela BG paginada", () => {
    const project = verticeProject();
    const scene = project.scenas.find(scene => scene.name === "mapa_rota");
    const exported = buildEngineExportProjectContract(project);
    expect(scene).toMatchObject({width:60,height:40,backgroundAssetName:"route-map-paged-v2.png",hudPresetId:"hud-route-travel"});
    expect(project.assets.find(asset => asset.id === "route-map-paged-v2")?.metadata)
      .toMatchObject({kind:"paged_bg",colorMode:"8bpp-indexed",backgroundPaletteBankBudget:14,reviewStatus:"approved"});
    expect(exported.asset_pack.assets.find(asset => asset.name === "route_map_paged_v2")).toMatchObject({kind:"paged_bg"});
    expect(project.actors.filter(actor => actor.roomName === "mapa_rota")).toEqual([
      expect.objectContaining({id:"map-cursor",worldMapRole:"cursor",spriteSheet:"route-airship-v2.png"})
    ]);
  });

  it("exporta os oito destinos, voo affine e HUD sem carregar o atlas inteiro na VRAM", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const map = exported.world_map_project;
    expect(map).toMatchObject({scene_name:"mapa_rota",embedded_nodes:true,cursor_affine:true,journey_frames:120,
      cursor:{metasprite:{asset:"route_airship_v2",index:0}}});
    expect(map.backgrounds[0]).toMatchObject({tilemap:"route_map_paged_v2",source_tiles:"route_map_paged_v2"});
    expect(map.assets.tile_assets).not.toContain("route_map_paged_v2");
    expect(map.assets.bg_palettes).toContain("route_map_paged_v2");
    expect(map.nodes.map(node => node.name)).toEqual(["porto","penedos","armazem","observatorio","mercado","usina","conselho","circuito"]);
    expect(map.nodes[6]).toMatchObject({position:{x:424,y:74},label:"Conselho Guardia",required_variable:2});
    expect(map.on_start).toEqual(expect.arrayContaining([expect.objectContaining({op:"scene_stack_push",runtime:"world_map"})]));
    expect(map.dialogue_ui.hud_scene_bindings).toEqual(expect.arrayContaining([{scene_name:"mapa_rota",preset_id:"hud-route-travel"}]));
  });

  it("materializa os três fundos e os atores aprovados da Usina", () => {
    const project = verticeProject();
    const backgrounds = ["exploration", "combat", "exit"].map((stage) =>
      project.assets.find((asset) => asset.id === `usina-${stage}-background-v3-4bpp`));
    const sentinel = project.assets.find((asset) => asset.id === "sentinel-depth-far-mid-near-192x64-v3-4bpp");
    const energyCell = project.assets.find((asset) => asset.id === "usina-energy-cell-v3-4bpp");
    const scene = project.scenas.find((candidate) => candidate.name === "usina_submersa");
    const combatScene = project.scenas.find((candidate) => candidate.name === "usina_combate");
    const exitScene = project.scenas.find((candidate) => candidate.name === "usina_saida");
    const explorationActors = project.actors.filter((actor) => actor.roomName === "usina_submersa");
    const combatActors = project.actors.filter((actor) => actor.roomName === "usina_combate");
    const exitActors = project.actors.filter((actor) => actor.roomName === "usina_saida");

    for (const [index, stage] of ["exploration", "combat", "exit"].entries()) {
      expect(backgrounds[index]).toMatchObject({
        name: `usina-${stage}-background-v3-4bpp.png`,
        metadata: {
          role: "dungeon-viewport", colorMode: "4bpp",
          generatedBy: "usina-v3-promotion", reviewStatus: "approved-composition"
        }
      });
    }
    expect(sentinel).toMatchObject({
      name: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png",
      metadata: {
        role: "dungeon-depth-actor",
        colorMode: "4bpp",
        reviewStatus: "approved-composition"
      }
    });
    expect(energyCell).toMatchObject({
      name: "usina-energy-cell-v3-4bpp.png",
      metadata: {
        role: "dungeon-reward",
        colorMode: "4bpp",
        reviewStatus: "approved-composition"
      }
    });
    expect(scene).toMatchObject({
      width: 30,
      height: 20,
      backgroundAssetName: "usina-exploration-background-v3-4bpp.png",
      playerActorName: "",
      runtime: { type: "dungeonCrawler" }
    });
    expect(explorationActors).toEqual([]);
    expect(combatScene).toMatchObject({
      name: "usina_combate",
      runtime: { type: "dungeonCrawler" },
      backgroundAssetName: "usina-combat-background-v3-4bpp.png"
    });
    expect(combatActors).toEqual([
      expect.objectContaining({
        id: "usina-sentinel-v2",
        name: "Sentinela da Usina",
        spriteSheet: "sentinel-depth-far-mid-near-192x64-v3-4bpp.png",
        animationName: "sentinel_far",
        animationStateID: "usina-sentinel-v3-state"
      }),
    ]);
    expect(exitScene).toMatchObject({
      name: "usina_saida",
      runtime: { type: "dungeonCrawler" },
      backgroundAssetName: "usina-exit-background-v3-4bpp.png"
    });
    expect(exitActors).toEqual([
      expect.objectContaining({
        id: "usina-energy-cell-v2",
        name: "Célula de energia",
        spriteSheet: "usina-energy-cell-v3-4bpp.png",
        animationName: "energy_cell_idle",
        animationStateID: "usina-energy-cell-v3-state",
        eventName: "usina_coletar_celula"
      })
    ]);
    expect([...explorationActors, ...combatActors, ...exitActors].map((actor) => actor.spriteSheet)).not.toEqual(expect.arrayContaining([
      "nara-dungeon.png",
      "dungeon-sentinel-v1.png",
      "energy-cell.png",
      "plant-sentinel.png",
    ]));
  });

  it("mantém o BG3 antigo dos Penedos fora do conjunto canônico", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.id === "penedos-sky-background");

    expect(background).toBeUndefined();
  });

  it("mantém o BG1 antigo dos Penedos fora do conjunto canônico", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.id === "penedos-foreground-background");

    expect(background).toBeUndefined();
  });

  it("materializa o Armazém e o Observatório point-and-click aprovados", () => {
    const project = verticeProject();
    expect(project.scenas.find((scene) => scene.name === "oficina")).toBeUndefined();
    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "armazem-das-mares-gba.png",
      "observatorio-do-farol-gba.png",
      "point-click-cursor.png",
      "point-click-lia-scroll.png",
      "point-click-dock-mechanic.png",
      "point-click-keeper-lantern.png"
    ]));
    for (const scene of [
      project.scenas.find((candidate) => candidate.name === "armazem_das_mares"),
      project.scenas.find((candidate) => candidate.name === "observatorio_do_farol")
    ]) {
      expect(scene).toMatchObject({
        sceneType: "pointAndClick",
        width: 30,
        height: 20,
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: true,
        showcase: { lane: "campaign", access: "campaign" }
      });
      expect(project.actors.filter((actor) => actor.roomName === scene.name)).toHaveLength(4);
      expect(project.triggers.filter((trigger) => trigger.roomName === scene.name)).toHaveLength(3);
    }
  });

  it("mantém as pinturas de colisão coerentes com cada runtime visual", () => {
    const project = verticeProject();
    const scene = (name) => project.scenas.find((candidate) => candidate.name === name);
    const isFree = (name, x, y) => {
      const grid = scene(name)?.collisionTypes;
      const index = y * scene(name).width + x;
      if (Array.isArray(grid)) return grid[index] === "free";
      if (grid?.encoding !== "rle-v1") return false;
      let offset = 0;
      for (const [type, count] of grid.runs) {
        offset += count;
        if (index < offset) return type === "free";
      }
      return false;
    };

    for (const name of [
      "logo",
      "abertura",
      "titulo",
      "prologo",
      "tempestade",
      "conselho_guardia",
      "guardiao_rele",
      "arena_arrancada",
    ]) {
      expect(scene(name)?.collisionTypes.every((value) => value === "free")).toBe(true);
    }

    expect(isFree("porto_lumen", 22, 35)).toBe(true);
    expect(isFree("porto_lumen", 30, 35)).toBe(true);
    expect(isFree("farol_interior", 22, 24)).toBe(true);
    expect(isFree("farol_interior", 11, 9)).toBe(true);
    expect(isFree("farol_interior", 22, 14)).toBe(false);
    expect(isFree("circuito_final", 22, 6)).toBe(true);
    expect(isFree("circuito_final", 30, 20)).toBe(false);
  });

  it("materializa a composição aprovada dos Penedos no viewport em duas camadas", () => {
    const project = verticeProject();
    const scene = project.scenas.find(scene => scene.name === "penedos_vento");
    expect(scene).toMatchObject({width:30,height:20,cameraMode:"fixed_center",
      backgroundAssetName:"penedos-v13-terreno-240x160.png",
      tileLayers:[expect.objectContaining({mapping:"BG3"}),expect.objectContaining({mapping:"BG2"})]});
    expect(scene).not.toHaveProperty("hudPresetId");
    const cells = scene.collisionTypes;
    expect(cells).toHaveLength(600);
    expect(cells[12*30+2]).toBe("solid");
    expect(cells[19*30+14]).toBe("damage");
    expect(cells[7*30+13]).toBe("down");
    expect(project.actors.filter(a => a.roomName === "penedos_vento")).toHaveLength(5);
  });

  it("exporta o contrato compacto aprovado dos Penedos com BG3 e BG2", () => {
    const project = verticeProject();
    const exported = buildEngineExportProjectContract(project);
    const room = exported.platformer_project.rooms.find(r => r.name === "penedos_vento");
    expect(room).toMatchObject({width_tiles:30,height_tiles:20,
      visual_tilemap:"penedos_v13_terreno_240x160",visual_tilemap_layout:"source_asset",
      collision_types:expect.arrayContaining(["solid","down","damage"]),
      background_layers:[expect.objectContaining({layer:"bg3",tilemap:"penedos_v13_fundo_240x160"}),
        expect.objectContaining({layer:"bg2",tilemap:"penedos_v13_terreno_240x160"})]});
    expect(project.actors).toEqual(expect.arrayContaining([expect.objectContaining({
      id:"penedos-player",x:6,y:11,spriteSheet:"penedos-v10-nara.png",gbStudioPlayerRuntime:"PLATFORM"})]));
    expect(project.sceneRouteTables.find(t => t.id === "map-routes").routes).toEqual(expect.arrayContaining([
      expect.objectContaining({scene:"penedos_vento",x:6,y:11})]));
    expect(exported.platformer_project.dialogue_ui.hud_scene_bindings.some(b => b.scene_name === "penedos_vento")).toBe(false);
    for (const name of ["penedos_v13_fundo_240x160", "penedos_v13_terreno_240x160"]) {
      expect(exported.asset_pack.assets).toEqual(expect.arrayContaining([expect.objectContaining({
        id:name,background_tile_budget:895,background_palette_banks:14})]));
    }
  });

  it("materializa o Conselho V5 com retratos apenas no diálogo", () => {
    const project = verticeProject();
    const scene = project.scenas.find((candidate) => candidate.name === "conselho_guardia");
    const actors = project.actors.filter((actor) => actor.roomName === "conselho_guardia");
    const councilDialogue = project.dialogues.find((dialogue) => dialogue.key === "conselho");
    const naraDialogue = project.dialogues.find((dialogue) => dialogue.key === "conselho_nara");
    expect(scene).toMatchObject({
      width: 30,
      height: 20,
      backgroundAssetName: "council-v5-background.png",
      runtime: { type: "visualNovel", config: { dialogueKey: "conselho" } },
      playerActorName: ""
    });
    expect(councilDialogue).toMatchObject({
      character: "Guardiã",
      portrait: "council-v5-guardian.png",
      portraitSlot: "right"
    });
    expect(naraDialogue).toMatchObject({
      character: "Nara",
      portrait: "council-v5-nara.png",
      portraitSlot: "left"
    });
    expect(actors).toEqual([]);
    for (const name of ["council-v5-nara.png", "council-v5-guardian.png"]) {
      expect(project.assets.find((asset) => asset.name === name)).toMatchObject({
        kind: "Sprite",
        metadata: { width: 48, height: 48, frameWidth: 48, frameHeight: 48, reviewStatus: "approved" }
      });
      expect(project.animations.find((animation) => animation.spriteSheet === name)).toMatchObject({
        frameWidth: 48, frameHeight: 48, frameCount: 1
      });
    }
    expect(project.assets.find((asset) => asset.name === "council-v5-background.png")).toMatchObject({
      kind: "Background",
      metadata: { width: 240, height: 160, reviewStatus: "approved" }
    });
  });

  it("materializa o pacote aprovado da batalha do Guardião do Relé", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.id === "relay-background");
    const scene = project.scenas.find((candidate) => candidate.name === "guardiao_rele");

    expect(background).toMatchObject({
      kind: "Background",
      name: "battle-rpg-usina-nearest-review.png",
      metadata: {
        role: "relay-arena",
        profile: "battleRpg",
        colorMode: "4bpp"
      }
    });
    expect(scene).toMatchObject({
      width: 30,
      height: 20,
      backgroundAssetName: "battle-rpg-usina-nearest-review.png",
      sceneType: "battleRpg",
      runtime: { type: "battleRpg" }
    });
    expect(project.actors.filter((actor) => actor.roomName === "guardiao_rele")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "nara-guardian",
        spriteSheet: "battle-rpg-scene-party-mechanic-alpha128-v2.png",
        animationStateID: "nara-battle-state",
        battle: expect.objectContaining({ side: "party" })
      }),
      expect.objectContaining({
        id: "relay-guardian",
        spriteSheet: "battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
        animationStateID: "relay-guardian-state",
        battle: expect.objectContaining({ side: "enemy" })
      })
    ]));
    expect(project.animations.map((animation) => animation.spriteSheet)).toEqual(expect.arrayContaining([
      "battle-rpg-scene-party-mechanic-alpha128-v2.png",
      "battle-rpg-scene-enemy-large-robot-alpha128-v2.png"
    ]));
    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "battle-rpg-scene-party-mechanic-alpha128-v2.png",
      "battle-rpg-scene-enemy-large-robot-alpha128-v2.png"
    ]));
    expect(project.assets.some((asset) => asset.name === "battle-ui.png")).toBe(false);
    expect(projectAssetCoverage(project).scenes.find((entry) => entry.scene === "guardiao_rele")).toMatchObject({
      missingRequiredRoles: [],
      legacyDemoAssets: []
    });
  });

  it("mantém somente transições de Vértice e deixa a rota alcançável pelo menu", () => {
    const project = verticeProject();
    const flow = analyzeConditionalSceneFlow(project);

    expect(project.events.every((event) => project.scenas.some((scene) => scene.name === event.roomName))).toBe(true);
    expect(project.events.map((event) => event.name)).toEqual(expect.arrayContaining([
      "titulo_abrir_menu",
      "missoes_detalhar_ativa",
      "missoes_detalhar_proximo",
      "arena_vencer_rival",
      "circuito_concluir"
    ]));
    expect(project.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ roomName: "porto_lumen", eventName: "porto_abrir_mapa" }),
      expect.objectContaining({ roomName: "armazem_das_mares", eventName: "armazem_das_mares_carta", eventBindings: { onInteract: "armazem_das_mares_carta" } }),
      expect.objectContaining({ roomName: "armazem_das_mares", eventName: "armazem_das_mares_saida", eventBindings: { onInteract: "armazem_das_mares_saida" } }),
      expect.objectContaining({ roomName: "observatorio_do_farol", eventName: "observatorio_do_farol_telescopio", eventBindings: { onInteract: "observatorio_do_farol_telescopio" } }),
      expect.objectContaining({ roomName: "observatorio_do_farol", eventName: "observatorio_do_farol_saida", eventBindings: { onInteract: "observatorio_do_farol_saida" } })
    ]));
    expect(flow.startScene).toBe("logo");
    expect(flow.reachableScenes).toHaveLength(canonicalVerticeSceneCount());
    expect(flow.unreachableScenes).toEqual([]);
    expect(flow.invalidTransitions).toEqual([]);
    expect(flow.deadEnds).toEqual([]);
  });

  it("não deixa assets ou diálogos soltos no template de showcase", () => {
    const source = canonicalProject();
    const project = verticeProject();
    const dialogueIssues = deriveDialoguesWorkspaceValidationIssues(
      deriveDialoguesWorkspacePresentation(project)
    );

    for (const data of [source, project]) {
      const files = deriveFilesWorkspacePresentation(data);
      const assetNames = new Set(data.assets.map((asset) => asset.name));
      expect(files.assets.filter((asset) => !asset.isUsed && !asset.isReusableLibraryAsset)).toEqual([]);
      expect(new Set(data.assets.map((asset) => asset.id)).size).toBe(data.assets.length);
      expect((data.settings.hudPresets ?? []).flatMap((preset) => preset.backgroundImage && !assetNames.has(preset.backgroundImage)
        ? [preset.id] : [])).toEqual([]);
      expect((data.settings.interfaceThemes?.themes ?? []).flatMap((theme) => [theme.hudImage, theme.boxImage]
        .filter((name) => name && !assetNames.has(name)))).toEqual([]);
      const directReferences = new Set();
      const collectReferences = (value) => {
        if (typeof value === "string") {
          directReferences.add(value);
          const playerSprite = value.match(/^change_player_sprite\s+(.+)$/);
          if (playerSprite) directReferences.add(playerSprite[1].trim());
          return;
        }
        if (Array.isArray(value)) { value.forEach(collectReferences); return; }
        if (value && typeof value === "object") Object.values(value).forEach(collectReferences);
      };
      for (const [key, value] of Object.entries(data)) {
        if (!["assets", "animations", "animationStates"].includes(key)) collectReferences(value);
      }
      expect(data.assets.filter((asset) =>
        !directReferences.has(asset.name) && !directReferences.has(asset.id) &&
        !asset.metadata?.reusableLibraryAsset &&
        !data.animationStates.some((state) => state.spriteSheet === asset.name && directReferences.has(state.id)) &&
        !data.animations.some((animation) => animation.spriteSheet === asset.name && directReferences.has(animation.id))
      )).toEqual([]);
    }
    expect(dialogueIssues.filter((issue) => issue.id.startsWith("unused-"))).toEqual([]);
  });

  it("retira do catálogo os candidatos substituídos, arquivos sem uso e o Perfil/Equipe sem cena", () => {
    const retiredNames = new Set([
      "opening-gba.png", "route-map-gba.png", "usina-submersa-gba.png", "council-gba.png",
      "menu-start-pause-v2-240x160-4bpp.png", "missions-v2-240x160-4bpp.png",
      "inventory-v2-240x160-4bpp.png", "map-v2-240x160-4bpp.png", "save-v2-240x160-4bpp.png",
      "settings-v2-240x160-4bpp.png", "audio-v2-240x160-4bpp.png", "controls-v2-240x160-4bpp.png",
      "name-player-male-32x32.png", "name-player-female-32x32.png",
      "player-male.png", "player-female.png",
      "profile-team-actor-slots-bg-240x160.png", "profile-team-male-neutral-48x48-4bpp.png",
      "profile-team-female-neutral-48x48-4bpp.png", "profile-team-elder-neutral-48x48-4bpp.png",
      "menu-perfil-equipe.png", "shmup-background-affine-1024.png", "penedos-platformer-v7.png",
      "tactical-feedback-bg-v1.png", "save-game-gba.png", "menu-start-gba.png",
      "missoes-gba.png", "inventario-gba.png", "mapa-hibrido-gba.png",
      "farol-interior-topdown-gba.png", "penedos-platformer-v2-gba.png",
      "mercado-suspenso-gba.png", "mercado-suspenso-modules-v5.png",
      "tactical-surface-r0-c0-v8.png", "tactical-surface-r0-c1-v8.png",
      "tactical-surface-r1-c0-v8.png", "tactical-surface-r1-c1-v8.png",
      "tactical-grid-v1.png", "tactical-hud-v1.png",
      "tactical-v3-coastal-surface.png", "tactical-v3-hud.png", "tactical-feedback-v3.png",
      "point-click-chart-compass.png", "point-click-brass-lantern.png",
      "point-click-red-chest.png", "point-click-storm-lamp.png",
      "point-click-tide-gauge.png", "farm-arena-composition-reference-v2.png",
      "affine-showcase-gba.png", "dialogue-box-gba-v3.png"
    ]);
    for (const project of [JSON.parse(readFileSync(templateURL, "utf8")), verticeProject()]) {
      expect(project.assets.filter((asset) => retiredNames.has(asset.name))).toEqual([]);
      expect(project.actors.some((actor) => actor.roomName === "perfil_equipe")).toBe(false);
      expect(project.animationStates.some((state) => retiredNames.has(state.spriteSheet))).toBe(false);
    }
  });

  it("exporta uma ROM mista cujo ponto de entrada é o menu e inclui luta", () => {
    const project = verticeProject();
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);
    const exported = buildEngineExportProjectContract(project);

    expect(exported.runtime_dispatch).toMatchObject({ initial_runtime: "cutscene" });
    expect(exported.runtime_dispatch.runtimes).toEqual(expect.arrayContaining([
      "menu",
      "cutscene",
      "topdown",
      "world_map",
      "platformer",
      "point_click",
      "isometric",
      "dungeon_crawler",
      "visual_novel",
      "shmup",
      "battle_rpg",
      "luta",
      "racing"
    ]));
    expect(exported.luta_project?.stages).toHaveLength(1);
    expect(exported.luta_project?.hud).toMatchObject({
      layer: "bg0",
      tilemap: "fight_hud_v2_arena_bank_05",
      backdrop_from_tilemap_palette: true
    });
    expect(exported.luta_project?.assets?.tile_assets).toEqual(expect.arrayContaining([
      "arena_gba",
      "fight_hud_v2_arena_bank_05"
    ]));
    const startMenuScreenIndex = exported.menu_project?.start_menu_screen ?? -1;
    expect(startMenuScreenIndex).toBeGreaterThanOrEqual(0);
    const startMenuScreen = exported.menu_project?.screens[startMenuScreenIndex];
    expect(startMenuScreen?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Missoes" }),
      expect.objectContaining({ label: "Mapa" }),
      expect.objectContaining({ label: "Salvar" }),
      expect.objectContaining({ label: "Configuracoes" }),
      expect.objectContaining({ label: "Retomar" })
    ]));
    expect(exported.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "__gbastudio_start_menu__",
        script: [
          { op: "scene_stack_push", runtime: "topdown" },
          { op: "warp_runtime", runtime: "menu", room: startMenuScreenIndex, x: 0, y: 0 }
        ]
      })
    ]));
    const startMenuScriptIndex = exported.topdown_project?.scripts
      ?.findIndex((script) => script.name === "__gbastudio_start_menu__") ?? -1;
    expect(exported.topdown_project?.rooms.find((room) => room.name === "porto_lumen")?.on_enter)
      .toEqual(expect.arrayContaining([
        { op: "attach_button_event", button: "start", index: startMenuScriptIndex, override: true }
      ]));
    expect(exported.requires.features).toEqual(expect.arrayContaining([
      "racing_runtime.vehicle_physics",
      "racing_runtime.track_collision",
      "racing_runtime.topdown_track",
      "racing_runtime.rival_race_progression",
      "racing_runtime.checkpoint_pickup_progression",
      "racing_runtime.result_events"
    ]));
    expect(exported.racing_project?.rooms).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "circuito_final",
        config: expect.objectContaining({
          presentation: "topdown",
          laps_to_win: 3,
          checkpoints_per_lap: 3,
          pickups_per_lap: 2,
          rival_speed_x256_per_second: 26880,
          road_curve: 14,
          show_minimap: false
        })
      })
    ]));
  });

  it("exporta Configurações como uma tela compartilhada entre Menu Inicial e pausa", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const screens = exported.menu_project?.screens ?? [];
    const screen = (name) => screens.findIndex((candidate) => candidate.name === name);
    const item = (name, label) => screens[screen(name)]?.items.find((candidate) => candidate.label === label);
    const settingsScreen = screen("configuracoes");

    expect(settingsScreen).toBeGreaterThanOrEqual(0);
    expect(item("title_options", "Configurações")).toMatchObject({
      action: "push_screen",
      target_screen: settingsScreen
    });
    expect(item("menu_start", "Configuracoes")).toMatchObject({
      action: "push_screen",
      target_screen: settingsScreen
    });
    expect(item("configuracoes", "Idioma")).toMatchObject({
      action: "adjust_variable",
      adjust_variable: 15,
      min: 0,
      max: 2,
      step: 1
    });
    expect(item("configuracoes", "Voltar")).toMatchObject({ action: "pop_screen" });
    expect(exported.menu_project?.screens[settingsScreen]).toMatchObject({
      presentation_mode: "hud"
    });
    expect(exported.menu_project?.screens[settingsScreen]?.actors ?? []).toHaveLength(9);
    expect(exported.menu_project?.screens.some((candidate) => [
      "idioma",
      "configuracoes_audio",
      "configuracoes_controles"
    ].includes(candidate.name))).toBe(false);
  });

  it("materializa o circuito fechado V2 e mantém o pseudo-3D arquivado", () => {
    const project = verticeProject();
    const circuit = project.scenas.find((scene) => scene.name === "circuito_final");
    const exported = buildEngineExportProjectContract(project);

    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "circuit-final-loop-v2-runtime.png",
      "nara-racer.png",
      "rival-racer.png"
    ]));
    expect(circuit).toMatchObject({
      backgroundAssetName: "circuit-final-loop-v2-runtime.png",
      collisionTypes: expect.objectContaining({ encoding: "rle-v1", length: 2400 }),
      runtime: {
        type: "racing",
        config: {
          presentation: "topdown",
          topdownTrack: {
            cameraDeadZoneX: 56,
            cameraDeadZoneY: 40,
            startHeading: 4,
            pathPoints: expect.arrayContaining([{ x: 180, y: 56 }, { x: 442, y: 153 }]),
            checkpoints: [
              { id: "ilha-curva-leste", x: 439, y: 169, width: 48, height: 72 },
              { id: "ilha-retorno-sul", x: 237, y: 235, width: 80, height: 48 },
              { id: "ilha-curva-oeste", x: 42, y: 150, width: 48, height: 72 },
              { id: "ilha-largada", x: 210, y: 56, width: 28, height: 40 }
            ]
          }
        }
      }
    });
    expect(project.actors.filter((actor) => actor.roomName === "circuito_final")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "racing-nara", name: "Carro de Nara", x: 22, y: 6, spriteSheet: "nara-racer.png" }),
      expect.objectContaining({ id: "racing-rival", name: "Rival de Nara", x: 18, y: 6, spriteSheet: "rival-racer.png" }),
      expect.objectContaining({ id: "racing-rival-2", name: "Rival da Ilha", x: 15, y: 6, spriteSheet: "rival-racer.png" })
    ]));
    expect(circuit.hudPresetId).toBe("hud-corrida-topdown");
    expect(circuit.runtime.config.trackSegments.reduce((total, segment) => total + segment.lengthPixels, 0)).toBe(320);
    expect(project.settings.hudPresets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hud-corrida-topdown", width: 240, height: 160 })
    ]));
    for (const source of [project, JSON.parse(readFileSync(templateURL, "utf8"))]) {
      const raceHud = source.settings.hudPresets.find((preset) => preset.id === "hud-corrida-topdown");
      expect(raceHud.components.filter((component) => component.kind === "text").map((component) => component.text))
        .toEqual(["", "", ""]);
    }
    expect(project.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "circuit-final-loop-v2-runtime.png",
        metadata: expect.objectContaining({ reviewStatus: "approved", candidateStatus: "canonical-integrated", visualStatus: "approved", assetcStatus: "attention", width: 480, height: 320, optimizedTileCount: 894, backgroundPaletteBankBudget: 14 })
      }),
      expect.objectContaining({
        name: "nara-racer.png",
        metadata: expect.objectContaining({ maxVisibleColors: 15, reviewStatus: "approved", candidateStatus: "canonical-integrated", visualStatus: "approved" })
      })
    ]));
    expect(project.events.find((event) => event.name === "circuito_reiniciar")?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "change_scene circuito_final 22 6 right" })
    ]));
    for (const source of [project, JSON.parse(readFileSync(templateURL, "utf8"))]) {
      expect(source.events.find((event) => event.name === "circuito_ao_entrar")?.steps).toEqual(expect.arrayContaining([
        expect.objectContaining({ command: "play_music farol_corrida_final" }),
        expect.objectContaining({ command: "play_sfx farol_sfx_motor" })
      ]));
    }
    expect(exported.racing_project?.pseudo3d_visuals).toBeUndefined();
  });

  it("preserva apenas os atores da onda atual e remove os atores legados", () => {
    const project = verticeProject();

    expect(project.actors.map((actor) => actor.roomName)).toEqual(expect.arrayContaining(["titulo", "abertura"]));
    expect(project.actors.some((actor) => actor.roomName === "prologo")).toBe(false);
    expect(project.actors.filter((actor) => actor.roomName === "porto_lumen").map((actor) => actor.id))
      .toEqual([
        "port-nara",
        "port-mechanic",
        "porto-lume-captain-pilot",
        "porto-lume-traveler-pilot",
        "porto-lume-cartographer-pilot",
        "porto-lume-fisherchild-pilot",
        "porto-lume-lighthousekeeper-pilot"
      ]);
  });

  it("materializa o elenco top-down do Porto e suas animações 4 BPP", () => {
    const project = verticeProject();
    const portActors = project.actors.filter((actor) => actor.roomName === "porto_lumen");
    const portAnimations = project.animations.filter((animation) => ["nara-topdown.png", "mechanic.png"].includes(animation.spriteSheet));

    expect(portActors).toHaveLength(7);
    expect(portAnimations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "nara-topdown-walk-down", frameWidth: 32, frameHeight: 64, frameCount: 2, hitboxX: 0, hitboxY: -8, hitboxWidth: 16, hitboxHeight: 16, colorMode: "4bpp" }),
      expect.objectContaining({ id: "mechanic-work-down", frameWidth: 16, frameHeight: 32, frameCount: 1, hitboxWidth: 16, hitboxHeight: 16, colorMode: "4bpp" })
    ]));
    expect(project.animationStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "nara-topdown-state", animationType: "four_direction_movement", mirrorLeftFromRight: true })
    ]));
    expect(project.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "nara-topdown.png",
        metadata: expect.objectContaining({ frameWidth: 32, frameHeight: 64, frameCount: 9, logicalSourceFrameCount: 6, visibleColors: 14, colorMode: "4bpp", reviewStatus: "approved" })
      })
    ]));
    expect(Object.fromEntries(
      project.animations
        .filter((animation) => animation.spriteSheet === "nara-topdown.png")
        .map((animation) => [
          animation.name,
          animation.frames.map((frame) => ({
            sourceFrameIndex: frame.sourceFrameIndex,
            sliceX: frame.tiles[0].sliceX
          }))
        ])
    )).toEqual({
      idle_down: [{ sourceFrameIndex: 0, sliceX: 0 }],
      idle_up: [{ sourceFrameIndex: 2, sliceX: 32 }],
      idle_right: [{ sourceFrameIndex: 1, sliceX: 64 }],
      idle_left: [{ sourceFrameIndex: 1, sliceX: 64 }],
      walk_down: [
        { sourceFrameIndex: 0, sliceX: 96 },
        { sourceFrameIndex: 3, sliceX: 128 }
      ],
      walk_up: [
        { sourceFrameIndex: 2, sliceX: 160 },
        { sourceFrameIndex: 4, sliceX: 192 }
      ],
      walk_right: [
        { sourceFrameIndex: 1, sliceX: 224 },
        { sourceFrameIndex: 5, sliceX: 256 }
      ],
      walk_left: [
        { sourceFrameIndex: 1, sliceX: 224 },
        { sourceFrameIndex: 5, sliceX: 256 }
      ]
    });
    expect(project.assets.find((asset) => asset.name === "port-skiff.png")).toBeUndefined();
    expect(project.assets.find((asset) => asset.name === "port-cargo.png")).toBeUndefined();
    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "porto-lume-exterior-topdown-gba.png",
      "farol-interior-topdown-360x240-gba.png",
      "nara-topdown.png",
      "mechanic.png"
    ]));
  });

  it("promove o BG v4 e remove o lote legado do Porto quando a promoção é chamada", () => {
    const original = JSON.parse(readFileSync(templateURL, "utf8"));
    const project = promoteApprovedPortLumenAssets(original);

    expect(project.actors.filter((actor) => actor.roomName !== "porto_lumen"))
      .toEqual(original.actors.filter((actor) => actor.roomName !== "porto_lumen"));
    expect(project.actors.filter((actor) => actor.roomName === "porto_lumen")).toEqual([]);
    expect(project.assets.filter((asset) => asset.name.startsWith("port-")).length).toBe(0);
    expect(project.animations.map((animation) => animation.id)).not.toEqual(expect.arrayContaining([
      "mechanic-animation",
      "port-cargo-animation"
    ]));
  });

  it("expõe a cobertura dos pacotes visuais de Vértice sem aceitar assets de demonstração", () => {
    const coverage = projectAssetCoverage(verticeProject());

    expect(coverage.scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scene: "titulo",
        requiredRoles: expect.arrayContaining(["initial-menu-bg", "title-logo", "title-start-prompt"]),
        missingRequiredRoles: []
      }),
      expect.objectContaining({
        scene: "porto_lumen",
        requiredRoles: expect.arrayContaining(["port-tiles", "nara-topdown", "mechanic"]),
        missingRequiredRoles: []
      }),
      expect.objectContaining({
        scene: "mapa_rota",
        requiredRoles: expect.arrayContaining(["route-map", "route-islands", "route-marker", "route-airship"]),
        missingRequiredRoles: []
      })
    ]));
    expect(coverage.scenes.filter((scene) => [
      "titulo",
      "prologo",
      "porto_lumen",
      "mapa_rota"
    ].includes(scene.scene)).flatMap((scene) => scene.legacyDemoAssets)).toEqual([]);
    expect(coverage.scenes.find((scene) => scene.scene === "prologo")).toMatchObject({
      requiredRoles: ["prologue-frame-1", "prologue-frame-2", "prologue-frame-3"],
      missingRequiredRoles: []
    });
  });

  it("mantém o Exemplo GBA com o áudio autorado e os eventos sonoros resolvidos", () => {
    const project = verticeProject();
    const neutralManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/neutral-menu-v1-manifest.json", import.meta.url), "utf8"));
    const allowedAssets = new Set([
      ...Object.values(neutralManifest.backgrounds).map(asset=>asset.file),
      ...Object.values(neutralManifest.sprites).map(asset=>asset.file),
      "neutral-menu-font-gba.png",
      "gender-selection-approved-v2-gba.png",
      "gender-portrait-male-gba.png",
      "gender-portrait-female-gba.png",
      "gender-gold-frame-male-gba.png",
      "name-input-approved-v2-gba.png",
      "name-portrait-male-gba.png",
      "name-portrait-female-gba.png",
      "title-day-centered-240x160-4bpp.png",
      "press-start-actor-88x32.png",
      "tactical-cursor-diamond-32x16-v1.png",
      "tactical-range-diamond-32x16-v1.png",
      "tactical-target-diamond-32x16-v1.png",
      "frame-lumen-v2.png",
      "frame-narrativa-v2.png",
      "frame-usina-v2.png",
      "frame-tatica-v2.png",
      "frame-acao-v2.png",
      "frame-circuito-v2.png",
      "frame-cartografia-v2.png",
      "frame-menus-v2.png",
      "tactical-v5-surface.png",
      "tactical-v5-hud.png",
      "tactical-nara-v5.png",
      "tactical-sentinel-v5.png",
      "title-logo-actor-128x88.png",
      "menu-entry-back.png",
      "circuit-final-loop-v2-runtime.png",
      "usina-exploration-background-v3-4bpp.png",
      "hud-usina-exploration-v3-4bpp.png",
      "usina-combat-background-v3-4bpp.png",
      "hud-usina-combat-v3-4bpp.png",
      "usina-exit-background-v3-4bpp.png",
      "hud-usina-exit-v3-4bpp.png",
      "sentinel-depth-far-mid-near-192x64-v3-4bpp.png",
      "usina-energy-cell-v3-4bpp.png",
      "opening-v4-per-tile-14-banks.png",
      "opening-v3-guardia-idle-48x64.png",
      "opening-v3-guardia-turn-48x64.png",
      "opening-v3-guardia-signal-48x64.png",
      "opening-v3-menino-24x32.png",
      "opening-v3-gaivota-24x16.png",
      "route-map-paged-v2.png",
      "route-airship-v2.png",
      "market-adventure-merchant.png",
      "market-adventure-guard.png",
      "mercado-adventure-surface.png",
      "mercado-adventure-foreground.png",
      "council-v5-background.png",
      "council-v5-nara.png",
      "council-v5-guardian.png",
      "dialogue-selector-gba-v4.png",
      "gba-dialogue-font-v3.png",
      "gba-studio-startup-canvas-frame-00-gba.png",
      "gba-studio-startup-canvas-frame-01-gba.png",
      "gba-studio-startup-canvas-frame-02-gba.png",
      "gba-studio-startup-canvas-frame-03-gba.png",
      "menu-inicial-v3-gba.png",
      "gender-selection-gba.png",
      "name-input-bg-gba.png",
      "menu-inicial-new-game.png",
      "menu-gender-title.png",
      "menu-player-name-title.png",
      "menu-entry-cursor.png",
      "menu-inicial-load-game.png",
      "menu-inicial-language.png",
      "menu-inicial-settings.png",
      "menu-inicial-credits.png",
      "menu-inicial-cursor.png",
      "menu-male.png",
      "menu-female.png",
      "menu-confirm.png",
      "menu-project.png",
      "menu-engine.png",
      "mapa-detail-current.png",
      "mapa-detail-penedos.png",
      "prologue-frame-1-gba.png",
      "prologue-frame-2-gba.png",
      "prologue-frame-3-gba.png",
      "porto-lume-shmup-wide-v3.png",
      "tempestade-v3-player.png",
      "tempestade-v3-drone-horizontal.png",
      "tempestade-v3-drone-vertical.png",
      "tempestade-v3-boss-lighthouse.png",
      "storm-shot.png",
      "storm-bolt.png",
      "porto-lume-exterior-topdown-gba.png",
      "farol-interior-topdown-360x240-gba.png",
      "nara-topdown.png",
      "player-pilot-32x32.png",
      "npc-captain-pilot-32x32.png",
      "traveler-pilot-32x32.png",
      "mechanic-pilot-32x32.png",
      "cartographer-pilot-32x32.png",
      "fisherchild-pilot-32x32.png",
      "lighthousekeeper-pilot-32x32.png",
      "mechanic.png",
      "penedos-v13-fundo-240x160.png",
      "penedos-v13-terreno-240x160.png",
      "penedos-v10-nara.png",
      "penedos-v10-caranguejo.png",
      "penedos-v10-mariposa.png",
      "penedos-v10-trabalhador.png",
      "penedos-v10-marco.png",
      "armazem-das-mares-gba.png",
      "observatorio-do-farol-gba.png",
      "point-click-cursor.png",
      "point-click-lia-scroll.png",
      "point-click-dock-mechanic.png",
      "point-click-keeper-lantern.png",
      "usina-sentinel-v2.png",
      "usina-energy-cell-v2.png",
      "nara-portrait.png",
      "dialogue-sigil.png",
      "battle-rpg-scene-party-mechanic-alpha128-v2.png",
      "battle-rpg-usina-nearest-review.png",
      "battle-rpg-scene-enemy-large-robot-alpha128-v2.png",
      "arena-gba.png",
      "fight-hud-v2-arena-bank-05.png",
      "nara-fighter.png",
      "rival-fighter.png",
      "circuit-final-loop-v2-runtime.png",
      "nara-racer.png",
      "rival-racer.png",
      "gender-player-male-32x64.png",
      "gender-player-female-32x64.png",
    ]);
    const pendingSceneNames = [
      "usina_submersa",
      "usina_combate",
      "usina_saida",
      "arena_arrancada",
    ];

    expect(new Set(project.assets.map((asset) => asset.name))).toEqual(allowedAssets);
    expect(project.audioItems).toHaveLength(29);
    expect(project.events.flatMap((event) => event.steps ?? []).some((step) => /play_(music|sfx) /.test(step.command))).toBe(true);
    expect(project.scenas.filter((scene) => pendingSceneNames.includes(scene.name)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "usina_submersa", backgroundAssetName: "usina-exploration-background-v3-4bpp.png" }),
        expect.objectContaining({ name: "arena_arrancada", backgroundAssetName: "arena-gba.png" }),
      ]));
    expect(project.actors.every((actor) => [
      "titulo",
      "abertura",
      "escolha_genero",
      "nome_jogador",
      "carregar_jogo",
      "salvar",
      "menu_start",
      "missoes",
      "inventario",
      "mapa_menu",
      "perfil_equipe",
      "configuracoes",
      "creditos",
      "porto_lumen",
      "farol_interior",
      "mapa_rota",
      "penedos_vento",
      "tempestade",
      "guardiao_rele",
      "arena_arrancada",
      "armazem_das_mares",
      "observatorio_do_farol",
      "mercado_suspenso",
      "usina_submersa",
      "usina_combate",
      "usina_saida",
      "conselho_guardia",
      "circuito_final",
      "arena_tatica"
    ].includes(actor.roomName))).toBe(true);
  });

  it("materializa o primeiro lote de exploração sem arte genérica", () => {
    const coverage = projectAssetCoverage(verticeProject());
    const sceneNames = [
      "penedos_vento",
      "armazem_das_mares",
      "observatorio_do_farol",
      "mercado_suspenso",
      "usina_submersa",
      "usina_combate",
      "usina_saida"
    ];
    const firstExplorationBatch = coverage.scenes.filter((scene) => sceneNames.includes(scene.scene));

    expect(firstExplorationBatch).toHaveLength(sceneNames.length);
    expect(firstExplorationBatch.flatMap((scene) => scene.missingRequiredRoles)).toEqual([]);
    expect(firstExplorationBatch.flatMap((scene) => scene.legacyDemoAssets)).toEqual([]);
  });

  it("preserva a exploração do Mercado com superfície contínua e corrimãos separados", () => {
    const project = verticeProject();
    const market = project.scenas.find(scene => scene.name === "mercado_suspenso");
    expect(market).toMatchObject({ width: 36, height: 36,
      backgroundAssetName: "mercado-adventure-surface.png", gbStudioUseBackgroundLayout: true,
      cameraMode: "follow_player", runtime: { type: "isometric", config: {
        tileWidth: 24, tileHeight: 12, heightStep: 16, movement: "free",
        worldMode: "scrollable_tiled_world", gameplayMode: "adventure",
        pagedSurface: { backgroundAsset: "mercado-adventure-surface.png",
          foregroundAsset: "mercado-adventure-foreground.png", width: 512, height: 344 }
      }} });
    expect(market.tileLayers).toEqual([]);
    expect(market.tilemap).toHaveLength(36 * 36);
    expect(market.collisionTypes[13 * 36 + 21]).toBe("slope_up_right");
    expect(market.heightLevels[13 * 36 + 21]).toBe(1);
    expect(market.heightLevels[13 * 36 + 22]).toBe(2);
    expect(market.heightLevels[13 * 36 + 23]).toBe(3);
    expect(project.actors.filter(a => a.roomName === "mercado_suspenso")).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "market-nara", x: 16, y: 20, spriteSheet: "tactical-nara-v5.png"}),
      expect.objectContaining({id: "market-trader-v2", x: 15, y: 16, spriteSheet: "market-adventure-merchant.png", eventBindings: {onInteract: "mercado_falar_mercador"}}),
      expect.objectContaining({id: "market-guard-v1", x: 26, y: 12, z: 3, spriteSheet: "market-adventure-guard.png"})
    ]));
    const room = buildEngineExportProjectContract(project).isometric_project.rooms.find(r => r.name === "mercado_suspenso");
    expect(room.paged_surface).toEqual({background: "mercado_adventure_surface", foreground: "mercado_adventure_foreground", width: 512, height: 344});
    expect(room).not.toHaveProperty("tileset");
    expect(room).not.toHaveProperty("authored_background");
    expect(room).not.toHaveProperty("tactical");
    expect(room.camera).toMatchObject({follow_enabled: true, bounds: {x: 0, y: 0, width: 512, height: 344}});
    expect(room.tile_events).toEqual(expect.arrayContaining([
      expect.objectContaining({area: {x: 28, y: 22, width: 1, height: 1, z: 0}, on_interact: expect.any(Array)}),
      expect.objectContaining({area: {x: 27, y: 12, width: 1, height: 1, z: 3}, on_interact: expect.any(Array)})
    ]));
    const pack = buildAssetcTilesetPackGeneration(project).assetsBySheet;
    expect(pack["mercado-adventure-foreground.png"]).toMatchObject({kind: "paged_bg", paged_palette_owner: "mercado_adventure_surface", bank_groups: ["scene_mercado_suspenso"]});
  });

  it("mantém o diálogo do guarda e o atalho de treino tático consistentes", () => {
    const project = verticeProject();
    const eventCommands = (name) => project.events
      .find((event) => event.name === name)
      ?.steps.map((step) => step.command);

    expect(project.actors.find((actor) => actor.id === "market-guard-v1")?.eventBindings)
      .toEqual({ onInteract: "mercado_falar_guarda" });
    expect(eventCommands("mercado_falar_guarda")).toEqual([
      "attach_button r mercado_entrar_arena true",
      "show_dialogue mercado_guarda"
    ]);
    expect(eventCommands("mercado_entrar_arena")).toEqual([
      "change_scene arena_tatica 1 4 right"
    ]);
    expect(eventCommands("arena_tatica_ao_entrar")).toEqual([
      "remove_button r",
      "attach_button l arena_tatica_sair true",
      "show_dialogue arena_tatica_controles"
    ]);
    expect(eventCommands("arena_tatica_sair")).toEqual([
      "remove_button l",
      "change_scene mercado_suspenso 25 13 down"
    ]);
    expect(project.editorState.scenaConnections).toContainEqual(expect.objectContaining({
      from: "arena_tatica",
      to: "mercado_suspenso",
      eventName: "arena_tatica_sair",
      entry: { x: 25, y: 13, width: 1, height: 1 }
    }));
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);
    expect(() => buildEngineExportProjectContract(project)).not.toThrow();
  });

  it("declara a otimização nativa de tiles dos backgrounds top-down aprovados", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.name === "porto-lume-exterior-topdown-gba.png");
    const interior360 = project.assets.find((asset) => asset.name === "farol-interior-topdown-360x240-gba.png");
    const exported = buildEngineExportProjectContract(project);
    const packAsset = exported.asset_pack?.assets.find((asset) => asset.png?.endsWith("porto_lume_exterior_topdown_gba.png"));

    expect(background?.metadata).toMatchObject({
      width: 480,
      height: 320,
      tileCount: 2400,
      generatedBy: "gba-studio-topdown-reset-v1.3O15O9",
      sourcePipeline: "candidate-provided-480x320-assetc-per-tile",
      sourceSha256: "f5351fa509bf07f23a1f35954d7776e8e3a5b2dea66ce0e615d187e217095697",
      preparedSha256: "02193f95986e003ee017fb9e7e28d719fbe0318557ce326873e74556b8f700c6",
      backgroundPaletteBankBudget: 14,
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 }
    });
    expect(interior360?.metadata).toMatchObject({
      width: 360,
      height: 240,
      tileCount: 1350,
      generatedBy: "farol-interior-topdown-360x240-candidate",
      sourcePipeline: "nearest-cover-1448x1086-to-360x240-assetc-4bpp",
      sourceSha256: "d9b90beb68df29417b101151250e287c170e7eaa24536f0f9ad0a5bcef44b9da",
      preparedSha256: "e8944a17ea51d4c2ca65432331a3cb36545fa7a2d4aefbd9b24d01f077924181",
      backgroundPaletteBankBudget: 14,
      backgroundTileOptimizer: { enabled: true, tileBudget: 895 },
      reviewStatus: "visual-approved"
    });
    expect(packAsset).toMatchObject({
      kind: "bg",
      optimize_background_tiles: true,
      background_tile_budget: 895,
      background_palette_banks: 14
    });
  });

  it("fecha a cobertura do lote de clímax sem assets legados", () => {
    const coverage = projectAssetCoverage(verticeProject());
    const sceneNames = [
      "conselho_guardia",
      "tempestade",
      "guardiao_rele",
      "arena_arrancada"
    ];
    const climaxBatch = coverage.scenes.filter((scene) => sceneNames.includes(scene.scene));

    expect(climaxBatch).toHaveLength(sceneNames.length);
    expect(climaxBatch.flatMap((scene) => scene.missingRequiredRoles)).toEqual([]);
    expect(climaxBatch.flatMap((scene) => scene.legacyDemoAssets)).toEqual([]);
  });

  it("materializa a composição aprovada v3 da Tempestade no contrato shmup", () => {
    const project = verticeProject();
    const stormRoom = project.rooms.find((room) => room.name === "tempestade");
    const stormBackground = project.assets.find((asset) => asset.id === "tempestade-v3-regular-background");

    expect(stormRoom).toMatchObject({
      width: 90,
      height: 20,
      backgroundAssetName: "porto-lume-shmup-wide-v3.png",
      parallax: { mode: "disabled", speedX: 256, speedY: 256 },
      runtime: {
        type: "shmup",
        config: {
          capabilities: [],
          composition: { enabled: true, mode: "tilemap" },
          resources: { resources: [{ kind: "regular_bg", assetId: "porto-lume-shmup-wide-v3.png" }] }
        }
      }
    });
    expect(stormBackground).toMatchObject({
      name: "porto-lume-shmup-wide-v3.png",
      metadata: {
        generatedBy: "tempestade-shmup-integration-candidate-v2-quality",
        role: "shmup-background-regular",
        colorMode: "4bpp",
        width: 720,
        height: 160,
        tileWidth: 8,
        tileHeight: 8,
        preparedSha256: "6e5825ee65d8781b0a6ee5854585c88f7a44d67264b6d78610e0d341b032e82a",
        reviewStatus: "approved",
        approved: true
      }
    });
    expect(buildAssetcTilesetPackGeneration(project)?.assetsBySheet["porto-lume-shmup-wide-v3.png"])
      .toMatchObject({ kind: "bg", background_bpp: 4, optimize_background_tiles: true, background_tile_budget: 895 });

    expect(project.actors.filter((actor) => actor.roomName === "tempestade")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "tempestade-v3-player", x: 11, y: 8, spriteSheet: "tempestade-v3-player.png" }),
      expect.objectContaining({ id: "tempestade-v3-drone-horizontal", x: 46, y: 5, spriteSheet: "tempestade-v3-drone-horizontal.png" }),
      expect.objectContaining({ id: "tempestade-v3-drone-vertical", x: 64, y: 13, spriteSheet: "tempestade-v3-drone-vertical.png" }),
      expect.objectContaining({ id: "tempestade-v3-boss-lighthouse", x: 79, y: 11, spriteSheet: "tempestade-v3-boss-lighthouse.png" })
    ]));
  });

  it("conclui a Tempestade somente depois de limpar a onda", () => {
    const project = verticeProject();
    const stormRoom = project.rooms.find((room) => room.name === "tempestade");
    const stormDrones = project.actors.filter((actor) => (
      actor.roomName === "tempestade" && actor.name === "Drone"
    ));

    expect(stormRoom?.eventBindings).toMatchObject({
      onInit: "tempestade_ao_entrar",
      onClear: "tempestade_concluir"
    });
    expect(stormDrones).toHaveLength(2);
    expect(stormDrones.every((drone) => drone.eventName === "tempestade_drone_disparar")).toBe(true);
    expect(stormDrones.every((drone) => drone.eventBindings?.onInteract === "tempestade_drone_disparar")).toBe(true);
  });

  it("mantém o background compartilhado do menu inicial em 4 bpp", () => {
    const project = verticeProject();
    const title = project.assets.find((asset) => asset.id === "initial-menu-background-v3");

    expect(title).toMatchObject({
      name: "menu-inicial-v3-gba.png",
      metadata: {
        generatedBy: "exemplo-gba-menu-inicial-v3-reset-candidate",
        role: "initial-menu-bg",
        colorMode: "4bpp",
        visualProfile: "gba_neutral_cohesive_pixel_art",
        backgroundPaletteBankBudget: 16,
        reviewStatus: "approved"
      }
    });
  });

  it("mantém os três quadros novos do storyboard do Prólogo em 4 bpp", () => {
    const project = verticeProject();
    expect(project.assets.filter((asset) => asset.name.startsWith("prologue-frame-"))).toHaveLength(3);
    expect(project.assets.find((asset) => asset.name === "prologue-gba.png")).toBeUndefined();
    expect(project.assets.filter((asset) => asset.name.startsWith("prologue-frame-")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "prologue-frame-1-gba.png", metadata: expect.objectContaining({ colorMode: "4bpp", generatedBy: "exemplo-gba-prologo-storyboard-v3", backgroundPaletteBankBudget: 14, paletteBankCount: 14, backgroundTileOptimizer: { enabled: true, tileBudget: 1024, maxSourcePixelErrorRatio: 0.48010416666666667 }, width: 240, height: 160, tileCount: 600, reviewStatus: "approved" }) }),
        expect.objectContaining({ name: "prologue-frame-2-gba.png", metadata: expect.objectContaining({ colorMode: "4bpp", generatedBy: "exemplo-gba-prologo-storyboard-v3", backgroundPaletteBankBudget: 14, paletteBankCount: 14, backgroundTileOptimizer: { enabled: true, tileBudget: 1024, maxSourcePixelErrorRatio: 0.3729166666666667 }, width: 240, height: 160, tileCount: 600, reviewStatus: "approved" }) }),
        expect.objectContaining({ name: "prologue-frame-3-gba.png", metadata: expect.objectContaining({ colorMode: "4bpp", generatedBy: "exemplo-gba-prologo-storyboard-v3", backgroundPaletteBankBudget: 14, paletteBankCount: 14, backgroundTileOptimizer: { enabled: true, tileBudget: 1024, maxSourcePixelErrorRatio: 0.38859375 }, width: 240, height: 160, tileCount: 600, reviewStatus: "approved" }) })
      ]));

    expect(project.scenas.find((scene) => scene.name === "prologo")?.runtime.config.steps)
      .toEqual([
        expect.objectContaining({ dialogueKey: "prologo_frame_1", backgroundAssetName: "prologue-frame-1-gba.png" }),
        expect.objectContaining({ dialogueKey: "prologo_frame_2", backgroundAssetName: "prologue-frame-2-gba.png" }),
        expect.objectContaining({ dialogueKey: "prologo_frame_3", backgroundAssetName: "prologue-frame-3-gba.png" }),
        expect.objectContaining({ dialogueKey: "", eventName: "prologo_partir" })
      ]);
  });
});
