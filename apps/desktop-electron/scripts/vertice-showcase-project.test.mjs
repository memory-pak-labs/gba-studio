import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { decodePngRgba } from "./lib/png-icons.mjs";
import { describe, expect, it } from "vitest";
import { startupFadeManifest } from './startup-fade-promotion.mjs';

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

const retiredAssets = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/example-library-cleanup.json", import.meta.url))).retiredAssets;

function canonicalProject() {
  return expandProjectTilemaps(parseGBAProjectFile(readFileSync(templateURL, "utf8")).data);
}

let materializedVertice;
function verticeProject() {
  materializedVertice ??= promoteExemploGBAVerticeCampaign(canonicalProject());
  return structuredClone(materializedVertice);
}

function canonicalVerticeSceneCount() {
  const sceneNames = [
    ...VERTICE_CAMPAIGN_SCENES.map((scene) => scene.name),
    ...VERTICE_SUPPORT_SCENES.map((scene) => scene.name),
    "circuito_perspectiva",
    "galeria_das_mares",
    "sala_mare_vazante",
    "corrida_preparacao",
    "corrida_resultados",
    "inventario_ferramentas"
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

  it.each([
    ["canônico", () => JSON.parse(readFileSync(templateURL, "utf8"))],
    ["reconstruído", verticeProject]
  ])("enquadra o mercador inteiro ao iniciar o Mercado sem mudar o zoom ou o seguimento (%s)", (_name, projectFactory) => {
    const room = buildEngineExportProjectContract(projectFactory()).isometric_project.rooms
      .find((candidate) => candidate.name === "mercado_suspenso");
    expect(room.camera).toMatchObject({ follow_enabled: true, zoom_x256: 256 });
    expect(room.on_enter).toEqual(expect.arrayContaining([
      { op: "set_camera_property", field: "pan_y", value: 0 }
    ]));
  });

  it("exports the market exit on the walkable upper deck height", () => {
    for (const project of [JSON.parse(readFileSync(templateURL, "utf8")), verticeProject()]) {
      const exported = buildEngineExportProjectContract(project);
      const room = exported.isometric_project.rooms.find(room => room.name === "mercado_suspenso");
      expect(room.tile_events).toEqual(expect.arrayContaining([
        expect.objectContaining({ area: { x: 25, y: 3, width: 1, height: 1, z: 3 } })
      ]));
      expect(room.height_levels[3 * 52 + 25]).toBe(3);
      expect(room.collision_flags[3 * 52 + 25]).toBe(0);
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

  it("preserva as quatro direções das sheets de 48px ativas do Porto", () => {
    for (const project of [canonicalProject(), verticeProject()]) {
      for (const sheet of ['porto-nara-animations48.png', 'porto-mechanic-animations48.png']) {
        const animations = project.animations.filter(a => a.spriteSheet === sheet);
        expect(animations).toHaveLength(8);
        for (const direction of ['down', 'up', 'left', 'right']) {
          expect(animations.find(a => a.name === `idle_${direction}`)).toMatchObject({frameWidth:32,frameHeight:48,frameCount:1});
          const walk = animations.find(a => a.name === `walk_${direction}`);
          expect(walk).toMatchObject({frameWidth:32,frameHeight:48,frameCount:4,hitboxWidth:16,hitboxHeight:sheet==='porto-nara-animations48.png'?8:16,hitboxY:sheet==='porto-nara-animations48.png'?0:-8});
          expect(new Set(walk.frames.map(f => f.sourceFrameIndex)).size).toBe(4);
        }
      }
    }
  });

  it("mantém seis cenas de menu in-game com HUD própria e retorno lógico", () => {
    const project = verticeProject();
    const names = ["menu_start", "missoes", "inventario", "mapa_menu", "salvar", "configuracoes"];
    for (const name of names) {
      const scene = project.scenas.find(scene => scene.name === name);
      expect(scene.runtime.config).toMatchObject({ presentationMode: "hud", hudPresetId: name === "inventario" ? "hud-toolcase-approved-modules" : `hud-book-${name}` });
      expect(scene.runtime.config.hudListRows ?? 0).toBe({menu_start:6,missoes:4,inventario:0,mapa_menu:0,salvar:4,configuracoes:5}[name]);
      if (name === "inventario") expect(scene.runtime.config.returnPolicy).toBe("resume");
      else expect(scene.runtime.config.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: "back", action: "pop_screen" })]));
      const hud = project.settings.hudPresets.find(hud => hud.id === scene.hudPresetId);
      expect(hud).toMatchObject({ backgroundImage: "", width: 240, height: 160 });
      expect(hud.components.filter(c => c.kind === "text")).toHaveLength(8);
      expect(hud.components.filter(c => c.runtimeText).length).toBeLessThanOrEqual(7);
      expect(hud.components.every(c => c.visible)).toBe(true);
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
          frameAssetNames: ["title-porto-lumen-240x160-4bpp.png"],
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
      width: 126,
      height: 86,
      backgroundAssetName: "porto-lumen-continuous-paged.png",
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: true,
      cameraMode: "follow_player",
      cameraBounds: { x: 0, y: 0, width: 126, height: 86 },
      playerActorName: "Nara",
      runtime: { type: "topdown", config: { presentation: "topdown", profile: "port-lumen-paged-topdown-v2" } }
    });
    expect(game?.tilemap).toHaveLength(126 * 86);
    expect(game?.collisionTypes).toHaveLength(126 * 86);
    expect(game?.collisionTypes?.[50 * 126 + 88]).toBe("free");
    expect(game?.collisionTypes?.[0]).toBe("solid");
    expect(project.actors.filter((actor) => actor.roomName === "porto_lumen")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "port-nara", name: "Nara", spriteSheet: "nara-topdown-walk-run-v1.png" }),
      expect.objectContaining({ id: "port-mechanic", name: "Mecânica de Lúmen", spriteSheet: "porto-mechanic-animations48.png", eventBindings: { onInteract: "porto_recuperar_estrutura" } }),
      expect.objectContaining({ id: "porto-lume-captain-pilot", spriteSheet: "porto-captain-body48.png" }),
      expect.objectContaining({ id: "porto-lume-traveler-pilot", spriteSheet: "porto-traveler-body48.png" }),
      expect.objectContaining({ id: "porto-lume-cartographer-pilot", spriteSheet: "porto-cartographer-body48.png" }),
      expect.objectContaining({ id: "porto-lume-fisherchild-pilot", spriteSheet: "porto-fisherchild-body48.png" }),
      expect.objectContaining({ id: "porto-lume-lighthousekeeper-pilot", spriteSheet: "porto-lighthousekeeper-body48.png" })
    ]));
    expect(project.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "trigger-porto-exit",
        roomName: "porto_lumen",
        x: 60,
        y: 0,
        width: 9,
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
      width: 48,
      height: 32,
      sceneType: "topdown",
      backgroundAssetName: "farol-interior-approved-paged-384x256.png",
      backgroundRenderMode: "tilemap",
      cameraMode: "follow_player",
      playerActorName: "Nara · Farol",
      runtime: { type: "topdown", config: { presentation: "topdown", profile: "farol-interior-scale-v2-approved" } }
    });
    expect(project.actors.filter((actor) => actor.roomName === "farol_interior")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "farol-nara", name: "Nara · Farol", x: 23, y: 27, spriteSheet: "nara-topdown-walk-run-v1.png" }),
      expect.objectContaining({ id: "farol-keeper", name: "Guardião do farol", x: 17, y: 14, spriteSheet: "porto-lighthousekeeper-body48.png", eventName: "farol_falar_guardiao" })
    ]));
    expect(project.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "trigger-lighthouse-lens", roomName: "farol_interior", x: 21, y: 13, width: 6, height: 2, eventName: "farol_examinar_lente" }),
      expect.objectContaining({ id: "trigger-lighthouse-exit", roomName: "farol_interior", x: 22, y: 30, width: 4, height: 2, eventName: "farol_sair_porto" })
    ]));
    const prologue = project.scenas.find((scene) => scene.name === "prologo");
    expect(prologue?.runtime).toMatchObject({
      type: "cutscene",
      config: {
        steps: [
          expect.objectContaining({ id: "prologo-frame-1", dialogueKey: "prologo_frame_1", backgroundAssetName: "prologue-clean-frame-1-240x160-4bpp.png" }),
          expect.objectContaining({ id: "prologo-frame-2", dialogueKey: "prologo_frame_2", backgroundAssetName: "prologue-clean-frame-2-240x160-4bpp.png" }),
          expect.objectContaining({ id: "prologo-frame-3", dialogueKey: "prologo_frame_3", backgroundAssetName: "prologue-clean-frame-3-240x160-4bpp.png" }),
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
    expect(project.editorState.sceneMapPositions).toMatchObject(canonicalProject().editorState.sceneMapPositions);

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

  it("reserva o viewport uniforme dos cards após promover o Mercado", () => {
    const source = canonicalProject();
    const sourceMarket = source.scenas.find((scene) => scene.name === "mercado_suspenso");
    sourceMarket.runtime.config.pagedSurface.width = 240;
    sourceMarket.runtime.config.pagedSurface.height = 160;

    const project = promoteExemploGBAVerticeCampaign(source);
    const market = project.scenas.find((scene) => scene.name === "mercado_suspenso");
    const positions = project.editorState.sceneMapPositions;
    const marketSize = sceneMapCardSize(market);

    expect(marketSize).toEqual({ width: 240, height: 250 });
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
    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(project.scenas).toHaveLength(canonicalVerticeSceneCount());
    expect(project.scenas.some((scene) => scene.sceneType === "custom")).toBe(false);
    expect(project.scenas.find((scene) => scene.name === "arena_arrancada"))
      .toMatchObject({
        sceneType: "luta",
        backgroundAssetName: "arena-coastal-240x160.png",
        tileLayers: [],
        runtime: { type: "luta", config: { hudPresetId: "hud-arena-approved" } }
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
        spriteSheet: "arena-nara-complete-64x64.png",
        animationName: "arena_nara_idle",
        animationStateID: "arena-nara-approved-state",
        lutaAnimations: {
          fallback: "idle_animation",
          idle: "arena_nara_idle",
          attack: "arena_nara_attack",
          special: "arena_nara_special",
          guard: "arena_nara_guard",
          hurt: "arena_nara_hurt",
          walk: "arena_nara_walk",
          jump: "arena_nara_jump"
        },
        battle: expect.objectContaining({ side: "player1", maxHp: 100 })
      }),
      expect.objectContaining({
        id: "rival-fighter",
        spriteSheet: "arena-rival-complete-64x64.png",
        animationName: "arena_rival_idle",
        animationStateID: "arena-rival-approved-state",
        lutaAnimations: {
          fallback: "idle_animation",
          idle: "arena_rival_idle",
          attack: "arena_rival_attack",
          special: "arena_rival_special",
          guard: "arena_rival_guard",
          hurt: "arena_rival_hurt",
          walk: "arena_rival_walk",
          jump: "arena_rival_jump"
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

  it("usa a arena aprovada com orçamento explícito e nenhuma perda adicional de pixels", () => {
    const project = verticeProject();
    expect(project.assets.some(a => a.name === 'arena-gba.png')).toBe(false);
    const background = project.assets.find(a => a.name === 'arena-coastal-240x160.png');
    expect(background.metadata).toMatchObject({colorMode:'4bpp',width:240,height:160,backgroundPaletteBankBudget:12,
      backgroundTileOptimizer:{enabled:true,tileBudget:600,maxSourcePixelErrorRatio:0,maxFramebufferMismatchRatio:0},reviewStatus:'approved'});
    expect(createHash('sha256').update(readFileSync(new URL(background.metadata.source,templateURL))).digest('hex')).toBe(background.metadata.preparedSha256);
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
          stepDurationFrames: 216,
          autoAdvance: true,
          steps: startupFadeManifest.timeline.map((step, index) => expect.objectContaining({
            id: step.id, durationFrames: step.durationFrames, backgroundAssetName: step.file,
            targetSceneIndex: index === startupFadeManifest.timeline.length - 1 ? 1 : -1,
            onSkipEventName: 'logo_concluir'
          }))
        }
      }
    });
    expect(abertura).toMatchObject({
      sceneType: "cutscene", backgroundAssetName: "opening-medium-shot-240x160.png",
      runtime: { type: "cutscene", config: { stepDurationFrames: 120, autoAdvance: true } }
    });
    expect(abertura.runtime.config.steps).toHaveLength(18);
    expect(abertura.runtime.config.steps.reduce((sum, step) => sum + step.durationFrames, 0)).toBe(480);
    expect(abertura.runtime.config.steps.at(-1)).toMatchObject({ eventName: "abertura_concluir", skippable: false });
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
    const posterAsset = startupFadeManifest.assets.find(asset => asset.file === startupFadeManifest.posterAsset);
    const logoAsset = project.assets.find((asset) => asset.name === posterAsset.file);
    const titleAsset = project.assets.find((asset) => asset.name === "title-porto-lumen-240x160-4bpp.png");

    expect(logo).toMatchObject({
      backgroundAssetName: posterAsset.file,
      backgroundRenderMode: "tilemap"
    });
    expect(title).toMatchObject({
      backgroundAssetName: "title-porto-lumen-240x160-4bpp.png"
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
      name: posterAsset.file,
      metadata: {
        source: posterAsset.source,
        role: "startup-logo-bg",
        sceneRoles: expect.arrayContaining(["startup-logo-bg", "logo-bg"]),
        colorMode: "4bpp",
        width: 240,
        height: 160,
        backgroundPaletteBankBudget: 1,
        generatedBy: "approved-startup-fade-a",
        provenance: expect.stringContaining("canvas"),
        reviewStatus: "approved"
      }
    });
  });

  it("preserva a composição V2 aprovada e o carrossel de opções no título", () => {
    const saved = JSON.parse(readFileSync(templateURL, "utf8"));
    for (const project of [saved, promoteExemploGBAVerticeCampaign(saved)]) {
      expect(project.scenas).toHaveLength(canonicalVerticeSceneCount());
      const title = project.scenas.find((scene) => scene.name === "titulo");
      const titleOptions = title.runtime.config.screens.find((screen) => screen.id === "title_options");
      expect(title.backgroundAssetName).toBe("title-porto-lumen-240x160-4bpp.png");
      expect(title.runtime.config.backgroundAnimation.frameAssetNames).toEqual(["title-porto-lumen-240x160-4bpp.png"]);
      expect(title.runtime.config.screens[0].backgroundAnimation.frameAssetNames).toEqual(["title-porto-lumen-240x160-4bpp.png"]);
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
      expect(project.assets.find((asset) => asset.name === "title-porto-lumen-240x160-4bpp.png")?.metadata).toMatchObject({ reviewStatus: "approved", candidateStatus: "canonical-integrated", assetcStatus: "attention", backgroundPaletteBankBudget: 14 });
      expect(project.assets.find((asset) => asset.name === "title-logo-actor-128x88.png")?.metadata).toMatchObject({ reviewStatus: "approved", candidateStatus: "canonical-integrated", technicalStatus: "attention" });
      expect(project.assets.find((asset) => asset.name === "press-start-actor-88x32.png")?.metadata).toMatchObject({ reviewStatus: "approved", candidateStatus: "canonical-integrated" });
      expect(project.animations.find((animation) => animation.id === "title-logo-actor-128x88-animation")).toMatchObject({ frameWidth: 128, frameHeight: 88, frames: [{ tiles: expect.arrayContaining([expect.objectContaining({ tileWidth: 64, tileHeight: 64 })]) }] });
      expect(project.animationStates.some((state) => state.id === "title-logo-actor-128x88-state")).toBe(true);
      expect(project.animations.some((animation) => animation.id === "press-start-actor-animation")).toBe(true);
      expect(project.animationStates.some((state) => state.id === "press-start-actor-state")).toBe(true);
    }
    for (const [path, sha256] of [
      ["Assets/backgrounds/title-porto-lumen-240x160-4bpp.png", "ace39e438172a2fa8c1abcdc8075f1d5c999f5b9ea7960f2372129c720cbf9f5"],
      ["Assets/sprites/title-logo-actor-128x88.png", "f2fa056433d6b43629edb8ef65a9d1fb0ced41b391030a84bdf96931f021c3e0"],
      ["Assets/sprites/press-start-actor-88x32.png", "b3c0d69aa24afe1b4d4bde7aca15ba10a8f7fb03b94150271b34dffecdd2669c"]
    ]) {
      expect(createHash("sha256").update(readFileSync(new URL(path, templateURL))).digest("hex")).toBe(sha256);
    }
  });

  it("preserva os 14 bancos preparados do Título sem quantizar o PNG novamente", () => {
    const report = canonicalProject().assets.find(asset => asset.name === "title-porto-lumen-240x160-4bpp.png").metadata.backgroundPaletteReferencePlan;
    const plan = { banks: report.banks, tile_palette_banks: report.tile_palette_banks };
    const source = decodePngRgba(readFileSync(new URL(
      "Assets/backgrounds/title-porto-lumen-240x160-4bpp.png", templateURL
    )));
    expect(plan.banks).toHaveLength(14);
    expect(plan.tile_palette_banks).toHaveLength(600);
    for (const project of [canonicalProject(), verticeProject()]) {
      const exported = buildAssetcTilesetPackGeneration(project)
        ?.assetsBySheet?.["title-porto-lumen-240x160-4bpp.png"];
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

  it("separa o quadro em plano médio da paisagem do Menu Título", () => {
    const project = verticeProject();
    const opening = project.scenas.find(scene => scene.name === "abertura");
    expect(opening).toMatchObject({ backgroundAssetName: "opening-medium-shot-240x160.png", backgroundRenderMode: "tilemap" });
    expect(project.assets.find(asset => asset.name === opening.backgroundAssetName)).toMatchObject({
      kind: "Background", metadata: { reviewStatus: "approved", colorMode: "4bpp", backgroundPaletteBankBudget: 14 }
    });
    expect(project.scenas.find(scene => scene.name === "titulo").backgroundAssetName).toBe("title-porto-lumen-240x160-4bpp.png");
  });

  it("usa as dez poses locais de Nara e da mecânica sem os sprites substituídos", () => {
    const project = verticeProject();
    expect(project.actors.filter(actor => actor.roomName === "abertura")).toEqual([
      expect.objectContaining({ id: "opening-approved-local-animation-actor", x: 8, y: 7, spriteSheet: "opening-local-animation-128x96.png" })
    ]);
    expect(project.assets.find(asset => asset.name === "opening-local-animation-128x96.png").metadata)
      .toMatchObject({ colorMode: "8bpp", streamFrames: true, frameCount: 10, hardwareObjectsPerFrame: 4 });
    expect(project.assets.some(asset => asset.name === "opening-v3-guardia-idle-48x64.png")).toBe(false);
    expect(project.actors.filter(actor => actor.roomName === "titulo")).toHaveLength(7);
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
    expect(title).toMatchObject({ backgroundAssetName: "title-porto-lumen-240x160-4bpp.png" });
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
      steps: startupFadeManifest.timeline.map((step,index)=>expect.objectContaining({
        duration_frames:step.durationFrames,auto_advance:true,skippable:true,
        target_scene:index===startupFadeManifest.timeline.length-1?aberturaIndex:-1
      }))
    });
    expect(logoBackground).toMatchObject({
      name: startupFadeManifest.posterAsset.replace('.png','').replaceAll('-','_'),
      layer: "bg1",
      tilemap: startupFadeManifest.posterAsset.replace('.png','').replaceAll('-','_')
    });
  });

  it("exporta a Abertura com seu próprio background e avanço para o Menu Título", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const scenes = exported.cutscene_project?.scenes ?? [];
    const aberturaIndex = scenes.findIndex((scene) => scene.name === "abertura");
    const abertura = scenes[aberturaIndex];
    const aberturaBackground = exported.cutscene_project?.backgrounds?.[abertura?.background ?? -1];

    expect(abertura).toMatchObject({ name: "abertura", background: expect.any(Number) });
    expect(abertura.steps).toHaveLength(18);
    expect(abertura.steps[0]).toMatchObject({ duration_frames: 60, auto_advance: true, skippable: true, actor_frames: [{ actor_index: 0, frame_index: 0 }] });
    expect(abertura.steps.reduce((sum, step) => sum + step.duration_frames, 0)).toBe(480);
    expect(abertura.steps.at(-1)).toMatchObject({ script: expect.any(Array), skippable: false });
    expect(aberturaBackground).toMatchObject({ name: "opening_medium_shot_240x160", layer: "bg1", tilemap: "opening_medium_shot_240x160" });
  });

  it("exporta as poses da Abertura como metasprite OBJ com streaming", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const opening = exported.cutscene_project.scenes.find(scene => scene.name === "abertura");
    expect(opening.actors).toEqual([expect.objectContaining({ metasprite: { asset: "opening_local_animation_128x96", index: 0 }, animation: { asset: "opening_local_animation_128x96" } })]);
    expect(exported.cutscene_project.assets).toMatchObject({ obj_palettes: expect.arrayContaining(["opening_local_animation_128x96"]), tile_assets: expect.arrayContaining(["opening_local_animation_128x96"]) });
    expect(exported.asset_pack.assets.find(asset => asset.name === "opening_local_animation_128x96")).toMatchObject({ stream_frames: true, sprite_bpp: 8 });
  });

  it("exporta o fundo aprovado do título para as telas do carrossel", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const title = exported.menu_project?.screens.find((candidate) => candidate.name === "title");
    const options = exported.menu_project?.screens.find((candidate) => candidate.name === "title_options");
    const background = exported.menu_project?.backgrounds?.[options?.background ?? -1];

    expect(title?.background).toEqual(expect.any(Number));
    expect(options?.background).toBe(title?.background);
    expect(background).toMatchObject({
      name: "title_porto_lumen_240x160_4bpp",
      layer: "bg1",
      tilemap: "title_porto_lumen_240x160_4bpp"
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

  it("mantém os cursores dos Créditos no livro aprovado, ligados à seleção", () => {
    const project = verticeProject();
    const initialMenuPageNames = new Set(["creditos"]);
    const initialMenuPageActors = project.actors.filter((actor) => initialMenuPageNames.has(actor.roomName));

    expect(initialMenuPageActors).not.toHaveLength(0);
    expect(initialMenuPageActors.every((actor) => (
      actor.spriteSheet === "book-cursor-approved-8x8.png"
      && actor.menuActorSelectedOnly === true
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
      "traveler-gender-bg-240x160.png", "traveler-name-bg-240x160.png",
      "book-carregar_jogo-bg-240x160.png", "book-salvar-bg-240x160.png", "book-menu_start-bg-240x160.png",
      "book-configuracoes-bg-240x160.png", "book-creditos-bg-240x160.png"
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
    expect(project.actors.find(actor => actor.name === "Moldura de seleção").menuPositionPixels).toEqual({x: 24, y: 32});
    expect(genderActorPositions).toEqual(expect.objectContaining({
      "gender-portrait-male-gba": { x: 4, y: 6 },
      "gender-portrait-female-gba": { x: 17, y: 6 },
      "Moldura de seleção": { x: 3, y: 4 }
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
    expect(project.events.find(event => event.name === 'missoes_detalhar_proximo').steps.map(step => step.command)).toEqual(['call_procedure signal_mission_status', 'call_procedure signal_campaign_objective']);
    const commands = project.events.find(event => event.name === "signal_campaign_objective").steps.map(step => step.command);
    expect(commands[0]).toBe("if_variable var_campaign_finished 1");
    expect(commands).toContain("if_variable var_frame 1");
    expect(commands.filter(command => command === "condition_end")).toHaveLength(12);
    expect(commands.some(command => /set_variable|save_game|change_scene|push_screen|pop_screen/.test(command))).toBe(false);
    expect(project.actors.filter(actor => actor.roomName === "missoes")).toHaveLength(12);
  });


  it("materializa o Inventário com cinco módulos principais e o estabilizador opcional", () => {
    const project = verticeProject();
    const items = project.scenas.find(scene => scene.name === "inventario").runtime.config.screens.flatMap(screen => screen.items);
    expect(items.filter(item => item.binding).map(item => item.binding.index)).toEqual([1, 4, 2, 6, 7, 5]);
    for (const item of items.filter(item => item.eventName)) {
      const commands = project.events.find(event => event.name === item.eventName).steps.map(step => step.command);
      if(item.id==='stabilizer')expect(commands).toEqual(expect.arrayContaining(['if_variable var_stabilizer 1','show_dialogue tide_owned','show_dialogue tide_location']));
      else expect(commands).toEqual([expect.stringMatching(/^show_dialogue ingame-item-/)]);
    }
    expect(project.actors.filter(actor => actor.roomName === "inventario").length).toBeGreaterThanOrEqual(14);
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
    const background = project.assets.find((asset) => asset.name === "route-lumen-paged.png");

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
    expect(portraits.map(actor => actor.spriteSheet)).toEqual(["book-nara-approved-32x48.png", "book-player-female-approved-48x48.png"]);
    expect(portraits.map(actor => actor.menuVisibilityValue)).toEqual([0, 1]);
    expect(portraits.every(actor => actor.menuVisibilityVariable === "var_character_gender")).toBe(true);
  });


  it("exporta a entrada de nome do jogador sem recorrer à caixa de diálogo", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const playerName = exported.menu_project?.screens.find((screen) => screen.name === "nome_jogador");

    expect(playerName?.text_input).toEqual(expect.objectContaining({
      variable_index: expect.any(Number),
      max_length: 8,
      x: 15,
      y: 5,
      width: 8,
      keyboard_layout: "grid",
      keyboard_x: 11,
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

  it("mantém títulos no background, rótulos separados e o nome livre para o input runtime", () => {
    const project = verticeProject();
    const gender = project.actors.find((actor) => actor.id === "menu-escolha-genero-title");
    const name = project.actors.find((actor) => actor.id === "menu-nome-jogador-title");
    const playerName = project.scenas.find((scene) => scene.name === "nome_jogador");

    expect(gender).toBeUndefined();
    expect(name).toBeUndefined();
    expect(project.actors.filter((actor) => actor.roomName === "nome_jogador")).toHaveLength(2);
    expect(playerName?.runtime?.config?.textInput).toMatchObject({ x: 15, y: 5, width: 8 });
  });

  it("mantém cada tela ligada limitada aos próprios atores e ao BG compartilhado", () => {
    const project = verticeProject();
    const exported = buildEngineExportProjectContract(project);
    const expectedActors = {
      escolha_genero: ["gender-portrait-male-gba", "gender-portrait-female-gba", "Moldura de seleção", "Canto de seleção 2", "Canto de seleção 3", "Canto de seleção 4", "Homem · rótulo", "Mulher · rótulo"],
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
      if (["menu_start", "missoes", "configuracoes", "carregar_jogo", "creditos"].includes(screenName)) {
        const selected = screenActors.filter(actor => actor.selected_only);
        expect(new Set(selected.map(actor => actor.menu_item_index)).size).toBe(screen.items.length);
      } else if (neutral) expect(screenActors.filter(actor => actor.role === "cursor")).toHaveLength(1);
      else expect(new Set(actorAssets)).toEqual(new Set(screenName === "escolha_genero"
        ? ["traveler_gender_portraits_64x64", "traveler_focus_corners_8x8", "traveler_gender_labels_48x8"]
        : ["traveler_name_portraits_48x48"]));
    }

    const gender = exported.menu_project?.screens.find((screen) => screen.name === "escolha_genero");
    expect(gender?.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "gender-portrait-male-gba", role: "option", metasprite: { asset: "traveler_gender_portraits_64x64", index: 0 } }),
      expect.objectContaining({ name: "gender-portrait-female-gba", role: "option", metasprite: { asset: "traveler_gender_portraits_64x64", index: 1 } })
    ]));

    expect(exported.menu_project?.screens.find((screen) => screen.name === "menu_start")?.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ label: "RETOMAR", action: "pop_screen" })]));
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
    const settingsHud = project.settings.hudPresets.find((preset) => preset.id === "hud-book-configuracoes");

    expect(project.scenas).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idioma" }),
      expect.objectContaining({ name: "configuracoes_audio" }),
      expect.objectContaining({ name: "configuracoes_controles" })
    ]));
    expect(settings).toMatchObject({
      backgroundAssetName: "book-configuracoes-bg-240x160.png",
      hudPresetId: "hud-book-configuracoes",
      runtime: {
        type: "menu",
        config: {
          role: "settings",
          presentationMode: "hud",
          hudPresetId: "hud-book-configuracoes"
        }
      }
    });
    expect(settingsItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "audio-master", variableIndex: 18, action: "adjust_variable", audioChannel: "all" }),
      expect.objectContaining({ id: "audio-music", variableIndex: 19, action: "adjust_variable", audioChannel: "music" }),
      expect.objectContaining({ id: "audio-sfx", variableIndex: 20, action: "adjust_variable", audioChannel: "sfx" }),
      expect.objectContaining({ id: "audio-enabled", variableIndex: 21, action: "toggle_variable", audioChannel: "all" }),
      expect.objectContaining({ id: "language", variableIndex: 15, action: "adjust_variable" }),
      expect.objectContaining({ id: "controls", label: "CONTROLES" }),
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
        expect.objectContaining({ id: "book-configuracoes-slot-1", kind: "text", x:39, y:36, height:8, runtimeText:true })
      ])
    });
    expect(settingsHud.components.some(component => component.id === "configuracoes-title")).toBe(false);
    expect(project.assets.find(asset => asset.name === settings.backgroundAssetName)?.metadata.generatedBy).toBe("approved-book-menus-v5-toolcase-v3");
    expect(project.actors.filter((actor) => actor.roomName === "configuracoes")).toHaveLength(16);
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
    expect(scenes.get("mapa_rota").runtime.config.profile).toBe("route-lumen-dirigible-approved");
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
        spriteSheet: "tactical-approved-nara-64x64.png",
        animationStateID: "tactical-approved-nara-state"
      }),
      expect.objectContaining({
        id: "tactical-sentinel",
        spriteSheet: "tactical-approved-sentinel-64x64.png",
        animationStateID: "tactical-approved-sentinel-state"
      })
    ]));
    expect(project.animations.filter((animation) => animation.spriteSheet === "tactical-approved-nara-64x64.png")).toHaveLength(24);
    expect(project.animationStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ spriteSheet: "tactical-approved-nara-64x64.png" }),
      expect.objectContaining({ spriteSheet: "tactical-approved-sentinel-64x64.png" })
    ]));
    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "tactical-arena-large-768x512.png",
      "tactical-compact-turnPanel.png",
      "tactical-approved-nara-64x64.png",
      "tactical-approved-sentinel-64x64.png",
      "tactical-cursor-48x24.png"
    ]));
    expect(project.animations.some((animation) => animation.spriteSheet === "tactical-nara-v3.png")).toBe(false);
    expect(project.animationStates.some((state) => ["tactical-nara-v3.png", "tactical-sentinel-v3.png"].includes(state.spriteSheet))).toBe(false);
  });

  it("materializa Créditos como tela informativa reutilizável", () => {
    const project = verticeProject();
    const credits = project.scenas.find((scene) => scene.name === "creditos");

    expect(credits).toMatchObject({
      backgroundAssetName: "book-creditos-bg-240x160.png",
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
      "book-cursor-approved-8x8.png", "book-cursor-approved-8x8.png"
    ]);
    expect(creditsActors.every((actor) => actor.x >= 0 && actor.y >= 0 && actor.x * 8 < 240 && actor.y * 8 < 160)).toBe(true);
  });

  it("materializa Salvar e Carregar com três slots correspondentes", () => {
    const project = verticeProject();
    for (const [name, prefix, requiresSave] of [["salvar", "menu_salvar", false], ["carregar_jogo", "carregar_jogo", true]]) {
      const scene = project.scenas.find(scene => scene.name === name);
      expect(scene.backgroundAssetName).toBe(name === "salvar" ? "book-salvar-bg-240x160.png" : "book-carregar_jogo-bg-240x160.png");
      expect(scene.runtime.config.items.filter(item => Number.isInteger(item.saveSlot)).map(item => item.saveSlot)).toEqual([0, 1, 2]);
      for (let slot = 0; slot < 3; slot++) {
        const item = scene.runtime.config.items[slot];
        expect(item.action).toBe("select");
        expect(Boolean(item.requiresSave)).toBe(requiresSave);
        const commands = project.events.find(event => event.name === `${prefix}_slot_${slot + 1}`).steps.map(step => step.command);
        expect(commands).toEqual(requiresSave ? [`if_save_game ${slot}`, `load_game ${slot}`, "condition_end"] : [`save_game ${slot}`]);
      }
      expect(project.actors.filter(actor => actor.roomName === name)).toHaveLength(4);
    }
    expect(project.settings.save).toMatchObject({ autoSave: true, manualSave: true, slots: 3 });
  });


  it("materializa o Menu Start com sete opções e retorno à partida", () => {
    const project = verticeProject();
    const startMenu = project.scenas.find(scene => scene.name === "menu_start");
    expect(project.scenas).toHaveLength(canonicalVerticeSceneCount());
    expect(startMenu.runtime.config.items.map(item => item.id)).toEqual(["missions", "inventory", "map", "save", "load", "settings", "back"]);
    expect(startMenu.runtime.config.items.at(-1)).toMatchObject({ label: "RETOMAR", action: "pop_screen" });
    expect(startMenu.eventBindings).toMatchObject({ onInit: "menu_start_ao_entrar" });
  });


  it("promove o mapa de viagem aprovado com atlas em ROM e janela BG paginada", () => {
    const project = verticeProject();
    const scene = project.scenas.find(scene => scene.name === "mapa_rota");
    const exported = buildEngineExportProjectContract(project);
    expect(scene).toMatchObject({width:60,height:40,backgroundAssetName:"route-lumen-paged.png",hudPresetId:"hud-route-travel"});
    expect(project.assets.find(asset => asset.id === "world-map-lumen-background")?.metadata)
      .toMatchObject({kind:"paged_bg",colorMode:"8bpp-indexed",backgroundPaletteBankBudget:14,reviewStatus:"approved"});
    expect(exported.asset_pack.assets.find(asset => asset.name === "route_lumen_paged")).toMatchObject({kind:"paged_bg"});
    expect(project.actors.filter(actor => actor.roomName === "mapa_rota")).toEqual([
      expect.objectContaining({id:"map-cursor",worldMapRole:"cursor",spriteSheet:"route-dirigible-lumen-64.png"})
    ]);
  });

  it("exporta os oito destinos, voo affine e HUD sem carregar o atlas inteiro na VRAM", () => {
    const exported = buildEngineExportProjectContract(verticeProject());
    const map = exported.world_map_project;
    expect(map).toMatchObject({scene_name:"mapa_rota",embedded_nodes:true,cursor_affine:true,journey_frames:120,
      cursor:{metasprite:{asset:"route_dirigible_lumen_64",index:0}}});
    expect(map.backgrounds[0]).toMatchObject({tilemap:"route_lumen_paged",source_tiles:"route_lumen_paged"});
    expect(map.assets.tile_assets).not.toContain("route_lumen_paged");
    expect(map.assets.bg_palettes).toContain("route_lumen_paged");
    expect(map.nodes.map(node => node.name)).toEqual(["porto","penedos","armazem","observatorio","mercado","usina","conselho","circuito"]);
    expect(map.nodes[6]).toMatchObject({position:{x:453,y:62},label:"Conselho Guardia",required_variable:2});
    expect(map.on_start).toEqual(expect.arrayContaining([expect.objectContaining({op:"scene_stack_push",runtime:"world_map"})]));
    expect(map.dialogue_ui.hud_scene_bindings).toEqual(expect.arrayContaining([{scene_name:"mapa_rota",preset_id:"hud-route-travel"}]));
  });

  it("materializa os três fundos e os atores aprovados da Usina", () => {
    const project = verticeProject();
    const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/dungeon-approved-manifest.json',import.meta.url)));
    for(const [i,name]of ['usina_submersa','usina_combate','usina_saida'].entries()){
      const room=project.rooms.find(r=>r.name===name);
      expect(room).toMatchObject({width:11,height:11,backgroundAssetName:manifest.scenes.scenes[i].background,runtime:{type:'dungeonCrawler'}});
      expect(project.assets.find(a=>a.name===room.backgroundAssetName)?.metadata).toMatchObject({approved:true,colorMode:'4bpp',runtimeDependencies:expect.arrayContaining([manifest.cache.tilesAsset,manifest.cache.mapsAsset,manifest.cache.palettesAsset])});
    }
    expect(project.actors.filter(a=>a.roomName==='usina_submersa').map(a=>a.id)).toEqual(["coast-valve-a-off","coast-valve-a-on","coast-valve-b-off","coast-valve-b-on","coast-valve-c-off","coast-valve-c-on"]);
    expect(project.actors.find(a=>a.id==='usina-sentinel-v2')).toMatchObject({x:9,y:2,spriteSheet:manifest.sentinel.near,animationName:'poses',dungeonDepthSheets:manifest.sentinel});
    expect(project.actors.find(a=>a.id==='usina-energy-cell-v2')).toMatchObject({x:5,y:6,spriteSheet:manifest.cell.near,animationName:'poses',eventName:'usina_coletar_celula'});
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
      "warehouse-frontal-bg-240x160.png",
      "observatory-frontal-bg-240x160.png",
      "white-hand-cursor-32x32.png"
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
      expect(project.actors.filter((actor) => actor.roomName === scene.name)).toHaveLength(scene.name === "observatorio_do_farol" ? 4 : 2);
      expect(project.triggers.filter((trigger) => trigger.roomName === scene.name)).toHaveLength(scene.name === "observatorio_do_farol" ? 3 : 4);
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

    expect(isFree("porto_lumen", 88, 50)).toBe(true);
    expect(isFree("porto_lumen", 64, 2)).toBe(true);
    expect(isFree("farol_interior", 23, 27)).toBe(true);
    expect(isFree("farol_interior", 17, 14)).toBe(true);
    expect(isFree("farol_interior", 24, 10)).toBe(false);
    expect(isFree("circuito_final", 22, 6)).toBe(true);
    expect(isFree("circuito_final", 30, 20)).toBe(false);
  });

  it("materializa a composição ampliada aprovada dos Penedos em duas camadas", () => {
    const project = verticeProject();
    const scene = project.scenas.find(scene => scene.name === "penedos_vento");
    expect(scene).toMatchObject({width:120,height:40,cameraMode:"follow_player",
      backgroundAssetName:"penedos-approved-terrain.png",
      tileLayers:[expect.objectContaining({mapping:"BG3"}),expect.objectContaining({mapping:"BG2"})]});
    expect(scene.hudPresetId).toBe("hud-penedos-approved");
    const cells = scene.collisionTypes;
    expect(cells).toHaveLength(4800);
    expect(cells[34*120+2]).toBe("solid");
    expect(cells[39*120+16]).toBe("damage");
    expect(cells[30*120+27]).toBe("down");
    expect(project.actors.filter(a => a.roomName === "penedos_vento")).toHaveLength(9);
  });

  it("exporta o contrato compacto aprovado dos Penedos com BG3 e BG2", () => {
    const project = verticeProject();
    const exported = buildEngineExportProjectContract(project);
    const room = exported.platformer_project.rooms.find(r => r.name === "penedos_vento");
    expect(room).toMatchObject({width_tiles:120,height_tiles:40,
      visual_tilemap:"penedos_approved_terrain",visual_tilemap_layout:"source_asset",
      collision_types:expect.arrayContaining(["solid","down","damage"]),
      background_layers:[expect.objectContaining({layer:"bg3",tilemap:"penedos_approved_sky"}),
        expect.objectContaining({layer:"bg2",tilemap:"penedos_approved_terrain"})]});
    expect(project.actors).toEqual(expect.arrayContaining([expect.objectContaining({
      id:"penedos-player",x:8,y:34,spriteSheet:"penedos-approved-nara.png",gbStudioPlayerRuntime:"PLATFORM"})]));
    expect(project.sceneRouteTables.find(t => t.id === "map-routes").routes).toEqual(expect.arrayContaining([
      expect.objectContaining({scene:"penedos_vento",x:8,y:34})]));
    expect(exported.platformer_project.dialogue_ui.hud_scene_bindings.some(b => b.scene_name === "penedos_vento")).toBe(true);
    for (const name of ["penedos_approved_sky", "penedos_approved_terrain"]) {
      const asset = exported.asset_pack.assets.find(a => a.id === name);
      expect(asset).toMatchObject({id:name,background_palette_banks:14});
      expect(asset.background_tile_budget).toBeUndefined();
    }
  });

  it("materializa o Conselho V1.3 com retratos apenas no diálogo", () => {
    const project = verticeProject();
    const scene = project.scenas.find((candidate) => candidate.name === "conselho_guardia");
    const actors = project.actors.filter((actor) => actor.roomName === "conselho_guardia");
    const councilDialogue = project.dialogues.find((dialogue) => dialogue.key === "conselho");
    const naraDialogue = project.dialogues.find((dialogue) => dialogue.key === "conselho_nara");
    expect(scene).toMatchObject({
      width: 30,
      height: 20,
      backgroundAssetName: "council-v13-background.png",
      dialoguePresentation: "portrait_tab",
      interfaceThemeId: "council-v13",
      runtime: { type: "visualNovel", config: { dialogueKey: "conselho" } },
      playerActorName: ""
    });
    expect(councilDialogue).toMatchObject({
      character: "Guardiã",
      portrait: "council-v13-guardian.png",
      portraitSlot: "right"
    });
    expect(naraDialogue).toMatchObject({
      character: "Nara",
      portrait: "council-v13-nara.png",
      portraitSlot: "left"
    });
    expect(actors).toEqual([]);
    for (const name of ["council-v13-nara.png", "council-v13-guardian.png"]) {
      expect(project.assets.find((asset) => asset.name === name)).toMatchObject({
        kind: "Sprite",
        metadata: { width: 48, height: 48, frameWidth: 48, frameHeight: 48, reviewStatus: "approved" }
      });
      expect(project.animations.find((animation) => animation.spriteSheet === name)).toMatchObject({
        frameWidth: 48, frameHeight: 48, frameCount: 1
      });
    }
    expect(project.assets.find((asset) => asset.name === "council-v13-background.png")).toMatchObject({
      kind: "Background",
      metadata: { width: 240, height: 160, reviewStatus: "approved" }
    });
  });

  it("materializa o pacote aprovado da batalha do Guardião do Relé", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.id === "relay-approved-background");
    const scene = project.scenas.find((candidate) => candidate.name === "guardiao_rele");

    expect(background).toMatchObject({
      kind: "Background",
      name: "relay-approved-background.png",
      metadata: {
        role: "relay-arena",
        profile: "battleRpg",
        colorMode: "4bpp"
      }
    });
    expect(scene).toMatchObject({
      width: 30,
      height: 20,
      backgroundAssetName: "relay-approved-background.png",
      sceneType: "battleRpg",
      runtime: { type: "battleRpg" }
    });
    expect(project.actors.filter((actor) => actor.roomName === "guardiao_rele")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "nara-guardian",
        spriteSheet: "relay-approved-nara.png",
        animationStateID: "relay-approved-nara-state",
        battle: expect.objectContaining({ side: "party" })
      }),
      expect.objectContaining({
        id: "relay-guardian",
        spriteSheet: "relay-approved-guardian.png",
        animationStateID: "relay-approved-guardian-state",
        battle: expect.objectContaining({ side: "enemy" })
      })
    ]));
    expect(project.animations.map((animation) => animation.spriteSheet)).toEqual(expect.arrayContaining([
      "relay-approved-nara.png",
      "relay-approved-guardian.png"
    ]));
    expect(project.assets.map((asset) => asset.name)).toEqual(expect.arrayContaining([
      "relay-approved-nara.png",
      "relay-approved-guardian.png"
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

    expect(project.events.every((event) => event.category === "Global" || project.scenas.some((scene) => scene.name === event.roomName))).toBe(true);
    expect(project.events.map((event) => event.name)).toEqual(expect.arrayContaining([
      "titulo_abrir_menu",
      "missoes_detalhar_proximo",
      "arena_vencer_rival",
      "circuito_concluir"
    ]));
    expect(project.events.map(event => event.name)).not.toContain("missoes_detalhar_ativa");
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
      for(const asset of data.assets)if(directReferences.has(asset.name))collectReferences(asset.metadata?.runtimeDependencies);
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
    expect(exported.luta_project?.hud).toBeUndefined();
    expect(exported.luta_project?.dialogue_ui.hud_scene_bindings).toContainEqual({scene_name:"arena_arrancada",preset_id:"hud-arena-approved"});
    expect(exported.luta_project?.assets?.tile_assets).toEqual(expect.arrayContaining([
      "arena_coastal_240x160"
    ]));
    const startMenuScreenIndex = exported.menu_project?.start_menu_screen ?? -1;
    expect(startMenuScreenIndex).toBeGreaterThanOrEqual(0);
    const startMenuScreen = exported.menu_project?.screens[startMenuScreenIndex];
    expect(startMenuScreen?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "MISSÕES" }),
      expect.objectContaining({ label: "MAPA" }),
      expect.objectContaining({ label: "SALVAR" }),
      expect.objectContaining({ label: "AJUSTES" }),
      expect.objectContaining({ label: "RETOMAR" })
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
          checkpoints_per_lap: 4,
          pickups_per_lap: 0,
          rival_speed_x256_per_second: 26880,
          road_curve: 0,
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
    expect(item("menu_start", "AJUSTES")).toMatchObject({
      action: "push_screen",
      target_screen: settingsScreen
    });
    expect(item("configuracoes", "IDIOMA")).toMatchObject({
      action: "adjust_variable",
      adjust_variable: 15,
      min: 0,
      max: 2,
      step: 1
    });
    expect(item("configuracoes", "VOLTAR")).toMatchObject({ action: "pop_screen" });
    expect(exported.menu_project?.screens[settingsScreen]).toMatchObject({
      presentation_mode: "hud"
    });
    expect(exported.menu_project?.screens[settingsScreen]?.actors ?? []).toHaveLength(16);
    expect(exported.menu_project?.screens.some((candidate) => [
      "idioma",
      "configuracoes_audio",
      "configuracoes_controles"
    ].includes(candidate.name))).toBe(false);
  });

  it("materializa as duas corridas aprovadas, com mapas completos e animações próprias",()=>{
    const p=verticeProject(), c=buildEngineExportProjectContract(p).racing_project;
    expect(c.rooms.map(r=>r.name)).toEqual(['circuito_final','circuito_perspectiva']);
    const m=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/racing-approved-manifest.json',import.meta.url),'utf8'));
    for(const name of m.scenes.map(s=>s.name)){
      const room=p.scenas.find(r=>r.name===name);
      expect([room.width,room.height]).toEqual([64,64]);
      expect(room.hudPresetId).toBe('hud-porto-corrida');
      expect(room.runtime.config.topdownTrack.checkpoints).toHaveLength(4);
      expect(p.actors.filter(a=>a.roomName===name)).toHaveLength(3);
    }
    expect(c.rooms[1].floor_tilemap).toHaveLength(4096);
    expect(c.rooms[1].player.animations.brake_left).toBeDefined();
    expect(c.pseudo3d_visuals).toHaveLength(1);
    for(const a of m.assets)expect(p.assets.find(x=>x.name===a.name).metadata.preparedSha256).toBe(a.metadata.preparedSha256);
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
        "porto-lume-lighthousekeeper-pilot",
        "coast-port-lamp-0", "coast-port-lamp-1"
      ]);
  });

  it("materializa o elenco atual do Porto sem as animações das versões aposentadas", () => {
    const project = verticeProject(), actors = project.actors.filter(a => a.roomName === 'porto_lumen');
    expect(actors).toHaveLength(9);
    for(const actor of actors) {
      expect(project.assets.some(a => a.name === actor.spriteSheet)).toBe(true);
      expect(project.animationStates.some(state => state.id === actor.animationStateID && state.spriteSheet === actor.spriteSheet)).toBe(true);
      expect(project.animations.some(a => a.spriteSheet === actor.spriteSheet)).toBe(true);
    }
    for(const name of ['nara-topdown.png','mechanic.png','porto-nara-body48.png','porto-mechanic-body48.png']) {
      expect(project.assets.some(a => a.name === name)).toBe(false);
      expect(project.animations.some(a => a.spriteSheet === name)).toBe(false);
    }
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
      ...startupFadeManifest.assets.map(asset => asset.file),
      ...JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/dungeon-approved-manifest.json",import.meta.url))).assets.map(a=>a.name),
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
      "title-porto-lumen-240x160-4bpp.png",
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
      "tactical-sentinel-v5.png",
      "title-logo-actor-128x88.png",
      "menu-entry-back.png",
      "circuit-final-loop-v2-runtime.png",
      "dungeon-approved-exploracao-background.png",
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
      "route-lumen-paged.png",
      "route-dirigible-lumen-64.png",
      "market-approved-actors-64x64.png",
      "market-approved-surface-768x512.png",
      "market-approved-foreground-768x512.png",
      "council-v13-background.png",
      "council-v13-nara.png",
      "council-v13-guardian.png",
      "frame-council-v13.png",
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
      "penedos-approved-sky.png",
      "penedos-approved-terrain.png",
      "penedos-approved-nara.png",
      "penedos-approved-crab.png",
      "penedos-approved-moth.png",
      "penedos-approved-worker.png",
      "penedos-approved-checkpoint.png",
      "penedos-approved-crab-east.png", "penedos-approved-moth-east.png",
      "warehouse-frontal-bg-240x160.png",
      "observatory-frontal-bg-240x160.png",
      "white-hand-cursor-32x32.png",
      "usina-sentinel-v2.png",
      "usina-energy-cell-v2.png",
      "nara-portrait.png",
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

    const bookManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/book-menu-manifest.json", import.meta.url)));
    for (const entry of Object.values(bookManifest.assets)) allowedAssets.add(entry.file);
    const travelerManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/traveler-entry-manifest.json", import.meta.url)));
    for (const entry of Object.values(travelerManifest.assets)) allowedAssets.add(entry.file);
    const prologueManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/prologue-clean-manifest.json", import.meta.url)));
    for (const entry of prologueManifest.assets) allowedAssets.add(entry.file);
    const loadCreditsManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/load-credits-book-manifest.json", import.meta.url)));
    for (const entry of loadCreditsManifest.assets) allowedAssets.add(entry.file);
    const warehouseManifest = JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/warehouse-frontal-manifest.json", import.meta.url)));
    allowedAssets.add(warehouseManifest.asset.file);
    const observatoryManifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/observatory-frontal-manifest.json', import.meta.url)));
    allowedAssets.add(observatoryManifest.asset.file);
    const farolManifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/farol-interior-manifest.json', import.meta.url)));
    allowedAssets.add(farolManifest.asset.file);
    const farolRelayManifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/farol-relay-v2.json', import.meta.url)));
    allowedAssets.add(farolRelayManifest.sheet);
    const arenaManifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/arena-approved-manifest.json', import.meta.url)));
    for (const entry of arenaManifest.assets) allowedAssets.add(entry.name);
    const tacticalManifest=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/tactical-arena-manifest.json",import.meta.url)));
    for(const asset of tacticalManifest.assets)allowedAssets.add(asset.name);
    allowedAssets.add("white-hand-cursor-32x32.png");
    allowedAssets.add("opening-medium-shot-240x160.png");
    allowedAssets.add("opening-local-animation-128x96.png");
    allowedAssets.add("porto-lumen-continuous-paged.png");
    for (const role of ["captain", "traveler", "cartographer", "fisherchild", "lighthousekeeper"]) allowedAssets.add(`porto-${role}-body48.png`);
    for (const name of ["porto-nara-body48.png", "porto-mechanic-body48.png", "porto-hud-b-life-frame.png", "porto-hud-b-coin-frame.png", "porto-hud-b-hearts-full.png", "porto-hud-b-hearts-empty.png", "porto-hud-b-coin.png", "porto-hud-b-font.png", "porto-nara-animations48.png", "porto-mechanic-animations48.png"]) allowedAssets.add(name);
    for (const asset of retiredAssets) allowedAssets.delete(asset.name);
    const racingManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/racing-approved-manifest.json',import.meta.url),'utf8'));
    for(const name of racingManifest.replacedAssetNames)allowedAssets.delete(name);
    for(const asset of racingManifest.assets)allowedAssets.add(asset.name);
    const stormManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tempestade-approved-manifest.json',import.meta.url)));
    for(const name of stormManifest.replacedAssetNames)allowedAssets.delete(name);
    for(const asset of stormManifest.assets)allowedAssets.add(asset.name);
    const relayManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/relay-approved-manifest.json',import.meta.url)));
    for(const name of relayManifest.replacedAssetNames)allowedAssets.delete(name);
    for(const asset of relayManifest.assets)allowedAssets.add(asset.name);
    for(const original of startupFadeManifest.retainedOriginals)allowedAssets.delete(original.source.split('/').at(-1));
    const dungeonManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/dungeon-approved-manifest.json',import.meta.url)));
    for(const name of [...dungeonManifest.replacedAssetNames,...dungeonManifest.unusedPreparedAssetNames])allowedAssets.delete(name);
    const routeManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/world-map-lumen-manifest.json',import.meta.url)));
    for(const asset of Object.values(routeManifest.assets))allowedAssets.add(asset.name);
    for (const a of JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/market-approved-manifest.json',import.meta.url))).assets) allowedAssets.add(a.name);
    for (const a of JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/platformer-approved-manifest.json',import.meta.url))).assets) allowedAssets.add(a.name);
    const evolutionsManifest=JSON.parse(readFileSync(new URL("../fixtures/asset-provenance/campaign-evolutions-approved.json",import.meta.url)));
    for(const asset of evolutionsManifest.assets)allowedAssets.add(asset.name);
    const coastManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/coastal-depth-approved.json',import.meta.url)));
    for(const asset of coastManifest.assets)allowedAssets.add(asset.name);
    for(const alias of coastManifest.retainedAliases)allowedAssets.delete(alias.source.split('/').at(-1));
    const encoreManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/encore-approved.json',import.meta.url)));
    for(const asset of encoreManifest.assets)allowedAssets.add(asset.name);
    const tideManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tide-annex-approved.json',import.meta.url)));
    for(const asset of tideManifest.assets)allowedAssets.add(asset.name);
    const menuAudioManifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/initial-menu-audio-approved.json', import.meta.url)));
    expect(menuAudioManifest.approval.auditory).toBe(true);
    for (const asset of menuAudioManifest.assets) allowedAssets.add(asset.name);
    for (const asset of JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/approved-menu-scenes-v21.json', import.meta.url))).assets) allowedAssets.add(asset.name);
    allowedAssets.add(JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/nara-topdown-running-v1.json', import.meta.url))).prepared.file.split('/').at(-1));
    expect(new Set(project.assets.map((asset) => asset.name))).toEqual(allowedAssets);
    expect(project.audioItems).toHaveLength(74);
    expect(project.audioItems.filter(item => item.id.startsWith('initial-menu-'))).toEqual(menuAudioManifest.audioItems);
    expect(project.audioItems.find(a=>a.name==='mapa_mar_aberto')).toMatchObject({bpm:84,format:'COMPOSED',loops:true});
    expect(project.events.flatMap((event) => event.steps ?? []).some((step) => /play_(music|sfx) /.test(step.command))).toBe(true);
    expect(project.scenas.filter((scene) => pendingSceneNames.includes(scene.name)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "usina_submersa", backgroundAssetName: "dungeon-approved-exploracao-background.png" }),
        expect.objectContaining({ name: "arena_arrancada", backgroundAssetName: "arena-coastal-240x160.png" }),
      ]));
    const sceneNames = new Set(project.scenas.map(scene => scene.name));
    expect(project.actors.every(actor => sceneNames.has(actor.roomName))).toBe(true);
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
    expect(market).toMatchObject({ width: 52, height: 52,
      backgroundAssetName: "market-approved-surface-768x512.png", gbStudioUseBackgroundLayout: true,
      cameraMode: "follow_player", runtime: { type: "isometric", config: {
        tileWidth: 24, tileHeight: 12, heightStep: 12, movement: "free",
        worldMode: "scrollable_tiled_world", gameplayMode: "adventure",
        pagedSurface: { backgroundAsset: "market-approved-surface-768x512.png",
          foregroundAsset: "market-approved-foreground-768x512.png", width: 768, height: 512 }
      }} });
    expect(market.tileLayers).toEqual([]);
    expect(market.tilemap).toHaveLength(52 * 52);
    expect(market.collisionTypes[9 * 52 + 21]).toBe("slope_up_left");
    expect(market.heightLevels[9 * 52 + 21]).toBe(1);
    expect(market.heightLevels[8 * 52 + 21]).toBe(2);
    expect(market.heightLevels[7 * 52 + 21]).toBe(3);
    expect(project.actors.filter(a => a.roomName === "mercado_suspenso")).toEqual(expect.arrayContaining([
      expect.objectContaining({id: "market-nara", x: 20, y: 22, spriteSheet: "market-approved-actors-64x64.png"}),
      expect.objectContaining({id: "market-trader-v2", x: 18, y: 18, spriteSheet: "market-approved-actors-64x64.png", eventBindings: {onInteract: "mercado_falar_mercador"}}),
      expect.objectContaining({id: "market-guard-v1", x: 24, y: 3, z: 3, spriteSheet: "market-approved-actors-64x64.png"})
    ]));
    const room = buildEngineExportProjectContract(project).isometric_project.rooms.find(r => r.name === "mercado_suspenso");
    expect(room.paged_surface).toEqual({background: "market_approved_surface_768x512", foreground: "market_approved_foreground_768x512", width: 768, height: 512});
    expect(room).not.toHaveProperty("tileset");
    expect(room).not.toHaveProperty("authored_background");
    expect(room).not.toHaveProperty("tactical");
    expect(room.camera).toMatchObject({follow_enabled: true, bounds: {x: 0, y: 0, width: 768, height: 512}});
    expect(room.tile_events).toEqual(expect.arrayContaining([
      expect.objectContaining({area: {x: 41, y: 24, width: 1, height: 1, z: 0}, on_interact: expect.any(Array)}),
      expect.objectContaining({area: {x: 25, y: 3, width: 1, height: 1, z: 3}, on_interact: expect.any(Array)})
    ]));
    const pack = buildAssetcTilesetPackGeneration(project).assetsBySheet;
    expect(pack["market-approved-foreground-768x512.png"]).toMatchObject({kind: "paged_bg", paged_palette_owner: "market_approved_surface_768x512", bank_groups: ["scene_mercado_suspenso"]});
  });

  it("mantém o diálogo do guarda e o atalho de treino tático consistentes", () => {
    const project = verticeProject();
    const eventCommands = (name) => project.events
      .find((event) => event.name === name)
      ?.steps.map((step) => step.command);

    expect(project.actors.find((actor) => actor.id === "market-guard-v1")?.eventBindings)
      .toEqual({ onInteract: "mercado_falar_guarda" });
    expect(eventCommands("mercado_falar_guarda")).toEqual(["call_procedure showcase_base_market_guard", "if_variable_greater_than var_council_path 0", "call_procedure showcase_coast_report", "condition_end"]);
    expect(eventCommands("showcase_base_market_guard")).toEqual([
      "attach_button r mercado_entrar_arena true",
      "show_dialogue mercado_guarda"
    ]);
    expect(eventCommands("mercado_entrar_arena")).toEqual([
      "change_scene arena_tatica 5 9 down"
    ]);
    expect(eventCommands("arena_tatica_ao_entrar")).toEqual([
      "call_procedure coast_audio_preferences", "call_procedure coast_audio_mute", "fade_audio_volume music 100 45 var_audio_music_volume var_audio_master_volume",
      "remove_button r",
      "attach_button l arena_tatica_sair true",
      "show_dialogue arena_tatica_controles"
    ]);
    expect(eventCommands("arena_tatica_sair")).toEqual([
      "remove_button l",
      "change_scene mercado_suspenso 24 5 down"
    ]);
    expect(project.editorState.scenaConnections).toContainEqual(expect.objectContaining({
      from: "arena_tatica",
      to: "mercado_suspenso",
      eventName: "arena_tatica_sair",
      entry: { x: 24, y: 5, width: 1, height: 1 }
    }));
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);
    expect(() => buildEngineExportProjectContract(project)).not.toThrow();
  });

  it("keeps static tile budgets and exports the approved Porto atlas through paging", () => {
    const project = verticeProject();
    const background = project.assets.find((asset) => asset.name === "porto-lume-exterior-topdown-gba.png");
    const interior360 = project.assets.find((asset) => asset.name === "farol-interior-topdown-360x240-gba.png");
    const exported = buildEngineExportProjectContract(project);
    const packAsset = exported.asset_pack?.assets.find((asset) => asset.png?.endsWith("porto_lume_exterior_topdown_gba.png"));

    expect(background).toBeUndefined();
    expect(interior360).toBeUndefined();
    expect(packAsset).toBeUndefined(); // Preserved library source is no longer a resident room background.
    const paged = exported.asset_pack?.assets.find(asset => asset.name === "porto_lumen_continuous_paged");
    expect(paged).toMatchObject({ kind: "paged_bg", background_bpp: 8 });
    expect(paged).not.toHaveProperty("optimize_background_tiles");
    expect(exported.asset_pack?.assets.find(asset => asset.name === "farol_interior_topdown_360x240_gba")).toBeUndefined();
    expect(exported.asset_pack?.assets.find(asset => asset.name === "farol_interior_approved_paged_384x256"))
      .toMatchObject({ kind: "paged_bg", background_bpp: 8 });
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

  it("materializa a Tempestade aprovada sem redução adicional da arte", () => {
    const project=verticeProject(),room=project.rooms.find(r=>r.name==='tempestade');
    expect(room).toMatchObject({width:96,height:20,backgroundAssetName:'tempestade-approved-background.png',hudPresetId:'hud-tempestade-voo-livre'});
    const bg=buildAssetcTilesetPackGeneration(project).assetsBySheet[room.backgroundAssetName];
    expect(bg).toMatchObject({kind:'bg',background_bpp:4,background_palette_banks:14});
    expect(bg.background_palette_reference_plan.banks).toHaveLength(14);
    expect(bg.optimize_background_tiles).toBeUndefined();
    expect(project.actors.filter(a=>a.roomName==='tempestade')).toHaveLength(4);
  });

  it("conclui a Tempestade somente depois das duas ondas", () => {
    const project=verticeProject(),room=project.rooms.find(r=>r.name==='tempestade');
    expect(room.eventBindings).toMatchObject({onInit:'tempestade_ao_entrar',onClear:'tempestade_concluir'});
    expect(room.runtime.config.wavePlan).toHaveLength(2);
    const drones=project.actors.filter(a=>a.roomName==='tempestade'&&a.waveIndex===0&&!a.id.endsWith('-player'));
    expect(drones).toHaveLength(2);
    expect(drones.every(a=>a.eventBindings.onInteract==='tempestade_dano'&&a.eventBindings.onHit1==='tempestade_destruir')).toBe(true);
  });

  it("mantém o título aprovado em 4bpp sem o background antigo do menu inicial", () => {
    const project = verticeProject();
    expect(project.assets.some(a => a.name === 'menu-inicial-v3-gba.png')).toBe(false);
    expect(project.assets.find(a => a.name === 'title-porto-lumen-240x160-4bpp.png')?.metadata)
      .toMatchObject({colorMode:'4bpp',width:240,height:160,backgroundPaletteBankBudget:14,reviewStatus:'approved'});
  });

  it("mantém somente o storyboard limpo aprovado do Prólogo", () => {
    const project = verticeProject();
    expect(project.assets.some(asset => asset.name.startsWith('prologue-frame-'))).toBe(false);
    expect(project.assets.filter(asset => asset.name.startsWith('prologue-clean-frame-'))).toHaveLength(3);

    expect(project.scenas.find((scene) => scene.name === "prologo")?.runtime.config.steps)
      .toEqual([
        expect.objectContaining({ dialogueKey: "prologo_frame_1", backgroundAssetName: "prologue-clean-frame-1-240x160-4bpp.png" }),
        expect.objectContaining({ dialogueKey: "prologo_frame_2", backgroundAssetName: "prologue-clean-frame-2-240x160-4bpp.png" }),
        expect.objectContaining({ dialogueKey: "prologo_frame_3", backgroundAssetName: "prologue-clean-frame-3-240x160-4bpp.png" }),
        expect.objectContaining({ dialogueKey: "", eventName: "prologo_partir" })
      ]);
  });
});
