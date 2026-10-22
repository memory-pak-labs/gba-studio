import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  EXEMPLO_BACKGROUNDLESS_SCENES,
  EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES,
  EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES,
  EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES,
  EXEMPLO_NON_SILENT_AUDIO_SCENES,
  EXEMPLO_PLAYER_FRAMEBUFFER_SCENES,
  EXEMPLO_PLAYERLESS_SCENES,
  EXEMPLO_RGB555_SCENE_THRESHOLDS,
  EXEMPLO_RGB555_TRANSITION,
  auditExemploSessionSoak,
  auditExemploInterfaceScenePlaytest,
  auditExemploVisualQualityGate,
  resolveTopdownActorFramebufferTarget,
  resolveTopdownCameraPosition,
  resolveTopdownActorFramebufferTargets,
  auditIntegerFramebufferDisplay,
  consolidateExemploScenePlaytestRuns,
  editorProjectReadyForScenePlaytest,
  exemploLaunchContract,
  exemploRuntimeLaunchContract,
  exemploSceneBackgroundAnimationAssetNames,
  exemploInterfaceScenePlaytestPlan,
  exemploProjectAssetSource,
  exemploScenePlaytestPlan,
  parseExemploSceneSoakMinutes,
  resolveExemploSmokeFaceButton,
  reusableExemploScenePlaytestRuns,
  selectExemploScenePlaytestPlan
} from "./exemplo-scene-playtest-contract.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const templatePath = join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
const project = JSON.parse(await readFile(templatePath, "utf8"));

describe("teclas do Play configuradas no projeto", () => {
  it("resolve A e B por aliases separados por vírgula, sem trocar as máscaras", () => {
    const controls = { aButton: "Alt,z,j", bButton: "Control,k,x" };
    expect(resolveExemploSmokeFaceButton(controls, "a")).toEqual({ code: "KeyZ", key: "z", windowsVirtualKeyCode: 90, mask: 1 });
    expect(resolveExemploSmokeFaceButton(controls, "b")).toEqual({ code: "KeyK", key: "k", windowsVirtualKeyCode: 75, mask: 2 });
    expect(resolveExemploSmokeFaceButton(controls, "a").mask).not.toBe(resolveExemploSmokeFaceButton(controls, "b").mask);
  });
});

describe("música das oito cenas canônicas", () => {
  it("cobra PCM não silencioso no Play dessas cenas", () => {
    expect(EXEMPLO_NON_SILENT_AUDIO_SCENES).toEqual([
      "porto_lumen", "farol_interior", "penedos_vento", "armazem_das_mares",
      "observatorio_do_farol", "tempestade", "guardiao_rele", "arena_arrancada", "circuito_final", "circuito_perspectiva"
    ]);
  });
  it("inicia a faixa declarada por cada cena no evento onInit", () => {
    const names = ["porto_lumen", "farol_interior", "penedos_vento", "armazem_das_mares", "observatorio_do_farol", "tempestade", "guardiao_rele", "arena_arrancada", "circuito_final", "circuito_perspectiva"];
    for (const name of names) {
      const scene = project.scenas.find((entry) => entry.name === name);
      const onInit = project.events.find((event) => event.name === scene?.eventBindings?.onInit);
      const commands=event=>(event?.steps??[]).flatMap(s=>s.command.startsWith("call_procedure ")?commands(project.events.find(e=>e.name===s.command.split(" ")[1])):[s.command]);
      expect(commands(onInit).find(c=>c.startsWith("play_music ")), name).toBe(`play_music ${scene?.music}`);
    }
  });
});

function healthyVisualResult(scene, index = 0) {
  return {
    ...scene,
    audio: { emittedAudioFrames: 90, emittedNonSilentSamples: 1024, audioUnderrunCount: 0 },
    actorFidelity: {
      actorCount: 0,
      audited: true,
      checks: { authoredActors: true, framebufferActors: true },
      framebufferActorCount: 0,
      framebufferRequired: false,
      ok: true
    },
    temporalVisualFidelity: {
      actors: { audited: true, ok: true, transientDisappearanceFrames: [] },
      background: { ok: true, transientBlankFrames: [] },
      frame: { ok: true, blankFrames: [], transientBlankFrames: [] },
      ok: true,
      sampleCount: 36
    },
    backgroundFidelity: { audited: true, checks: { dimensions: true }, ok: true, palette: [0x0000, 0x2108, 0x4210, 0x6318] },
    displayFidelity: { audited: true, ok: true },
    frame: {
      colorHistogram: [
        { count: 19_200, rgb: [8, 16, 24] },
        { count: 19_200, rgb: [224, 232, 240] }
      ],
      meaningful: true,
      pixelCount: 38_400,
      signature: `frame-${index}`,
      uniqueColorCount: 12
    },
    paletteFidelity: { audited: true, ok: true },
    playerFidelity: { audited: true, ok: true, palette: [0x0000, 0x2108, 0x4210, 0x7fff] }
  };
}

function healthyInterfaceResult(scene, index = 0) {
  return {
    ...scene,
    actorFidelity: {
      actorCount: 0,
      audited: true,
      checks: { authoredActors: true, framebufferActors: true },
      framebufferActorCount: 0,
      framebufferRequired: false,
      ok: true
    },
    audio: { audioUnderrunCount: 0, emittedAudioFrames: 90 },
    backgroundFidelity: { audited: true, ok: true },
    displayFidelity: { audited: true, ok: true },
    frame: { meaningful: true, signature: `interface-frame-${index}` },
    launchContract: { startScene: scene.name, startSceneType: scene.runtime },
    performance: { droppedFrameRatio: 0, emulationFps: 60, presentationFps: 60 },
    paletteFidelity: { audited: true, ok: true },
    romBytes: 1024,
    runtimeState: { frame: 90 },
    temporalVisualFidelity: {
      actors: { audited: true, ok: true, transientDisappearanceFrames: [] },
      background: { ok: true, transientBlankFrames: [] },
      frame: { ok: true, blankFrames: [], transientBlankFrames: [] },
      ok: true,
      sampleCount: 36
    }
  };
}

describe("GBA BG and OBJ palette capacity", () => {
  it("anchors the authored Porto actors to the following camera and their exported multipart offsets", () => {
    const parts = [{x:-8,y:-40,width:32,height:32},{x:-8,y:-8,width:32,height:16}];
    const entity = {position:{x:704,y:400},size:{x:16,y:16},animations:[{frame_metasprites:[{parts}]}]};
    const exported = {topdown_project:{player:entity,camera:{follow_player:true},rooms:[{name:"porto_lumen",width_tiles:126,height_tiles:86,npcs:[{...entity,name:"Mecânica",position:{x:752,y:376}}]}]}};
    const room = {name:"porto_lumen",playerActorName:"Nara"};
    const state = {player:{x:704,y:400}};
    expect(resolveTopdownActorFramebufferTarget(room,{name:"Nara"},state,exported)).toEqual({x:104,y:32});
    expect(resolveTopdownActorFramebufferTarget(room,{name:"Mecânica"},state,exported)).toEqual({x:152,y:8});
    expect(resolveTopdownActorFramebufferTarget(room,{name:"Nara"},{player:{x:0,y:0}},exported)).toEqual({x:-8,y:-40});
  });
  it("uses the current native position of a moving first NPC rather than its spawn", () => {
    const parts = [{x:-8,y:-40,width:32,height:32},{x:-8,y:-8,width:32,height:16}];
    const player = {size:{x:16,y:16}};
    const npc = {name:"Mecânica",position:{x:752,y:376},movement:{kind:"wander_box"},animations:[{frame_metasprites:[{parts}]}]};
    const exported = {topdown_project:{player,camera:{follow_player:true},rooms:[{name:"porto_lumen",width_tiles:126,height_tiles:86,npcs:[npc]}]}};
    const state = {player:{x:704,y:400},firstActor:{x:784,y:392}};
    expect(resolveTopdownActorFramebufferTarget({name:"porto_lumen",playerActorName:"Nara"},{name:"Mecânica"},state,exported)).toEqual({x:184,y:24});
  });
  it("admits only current or immediately previous native positions in the same room", () => {
    const parts=[{x:-8,y:-40,width:32,height:32}];
    const npc={name:"Mecânica",movement:{kind:"wander_box"},animations:[{frame_metasprites:[{parts}]}]};
    const exported={topdown_project:{player:{size:{x:16,y:16}},camera:{follow_player:true},rooms:[{name:"porto_lumen",width_tiles:126,height_tiles:86,npcs:[npc]}]}};
    const room={name:"porto_lumen",playerActorName:"Nara"}, actor={name:"Mecânica"};
    const current={frame:18,currentRoom:0,player:{x:704,y:400},firstActor:{x:748,y:392}};
    const previous={...current,frame:17,firstActor:{x:747,y:392}};
    expect(resolveTopdownActorFramebufferTargets(room,actor,current,exported,previous)).toEqual([{x:148,y:24},{x:147,y:24}]);
    expect(resolveTopdownActorFramebufferTargets(room,actor,current,exported,{...previous,frame:10})).toEqual([{x:148,y:24}]);
    expect(resolveTopdownActorFramebufferTargets(room,actor,current,exported,{...previous,currentRoom:1})).toEqual([{x:148,y:24}]);
    expect(()=>resolveTopdownActorFramebufferTarget(room,actor,{...current,firstActor:null},exported)).toThrow(/Telemetria/);
  });
  it("accepts separate BG/OBJ palettes while rejecting overflow and unknown colors", () => {
    const results = exemploScenePlaytestPlan(project).map(healthyVisualResult);
    const porto = results.find(result => result.name === "porto_lumen");
    porto.frame.uniqueColorCount = 281;
    expect(auditExemploVisualQualityGate(project,results).ok).toBe(true);
    porto.frame.uniqueColorCount = 513;
    expect(auditExemploVisualQualityGate(project,results).ok).toBe(false);
    porto.frame.uniqueColorCount = 281; porto.paletteFidelity.ok = false;
    expect(auditExemploVisualQualityGate(project,results).ok).toBe(false);
  });
  it("requires authored actor fidelity for Porto and Farol instead of the retired default sheet", () => {
    expect(EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES).toContain("porto_lumen");
    expect(EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES).toContain("farol_interior");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).toContain("farol_interior");
  });
});

describe("contrato de playtest de Vértice", () => {
  it("uses the same bounded Farol camera for background and actor pixel audits", () => {
    const room={name:'farol_interior'};
    const exported={topdown_project:{player:{size:{x:16,y:16}},camera:{follow_player:true},rooms:[{name:room.name,width_tiles:48,height_tiles:32}]}};
    expect(resolveTopdownCameraPosition(room,{player:{x:184,y:216}},exported)).toEqual({x:72,y:96});
    expect(resolveTopdownCameraPosition(room,{player:{x:0,y:0}},exported)).toEqual({x:0,y:0});
    expect(resolveTopdownCameraPosition(room,{player:{x:376,y:248}},exported)).toEqual({x:144,y:96});
  });
  it("resolve todos os assets declarados pela animação de background da cena", () => {
    expect(exemploSceneBackgroundAnimationAssetNames({
      id: "titulo",
      name: "titulo",
      runtime: {
        config: {
          backgroundAnimation: {
            frameAssetNames: ["title-base.png", "title-frame-01.png", "title-base.png"],
            frameDuration: 18,
            loop: true
          }
        }
      }
    })).toEqual(["title-base.png", "title-frame-01.png"]);
  });

  it("reconhece menu e luta como runtimes iniciais ou isolados", () => {
    const exported = {
      runtime_dispatch: { initial_runtime: "menu" },
      runtime_contract: { rooms: [{ name: "titulo", runtime_profile: "menu" }] },
      luta_project: { initial_stage: 0, stages: [{ name: "arena_arrancada" }] }
    };

    expect(exemploLaunchContract(exported)).toEqual({ startScene: "titulo", startSceneType: "menu" });
    expect(exemploLaunchContract({
      ...exported,
      runtime_dispatch: { initial_runtime: "menu", initial_scene: "logo" }
    })).toEqual({ startScene: "logo", startSceneType: "menu" });
    expect(exemploLaunchContract({
      ...exported,
      runtime_dispatch: { initial_runtime: "luta" },
      runtime_contract: { rooms: [] }
    })).toEqual({ startScene: "arena_arrancada", startSceneType: "luta" });
  });

  it("trata o template como campanha, showcases e separa telas de interface", () => {
    const plan = exemploScenePlaytestPlan(project);
    const results = plan.map(healthyVisualResult);

    expect(plan).toHaveLength(18);
    expect(plan.map((scene) => scene.name)).toEqual([
      "titulo", "prologo", "porto_lumen", "mapa_rota",
      "penedos_vento", "armazem_das_mares", "observatorio_do_farol", "mercado_suspenso", "usina_submersa",
      "usina_combate", "usina_saida",
      "conselho_guardia", "tempestade", "guardiao_rele", "arena_arrancada",
      "circuito_final", "arena_tatica", "circuito_perspectiva"
    ]);
    expect(auditExemploVisualQualityGate(project, results)).toMatchObject({
      ok: true,
      counts: { expected: 18, passed: 18, failed: 0 }
    });
  });

  it("mantém os critérios de framebuffer e transição alinhados aos novos IDs", () => {
    expect(EXEMPLO_RGB555_TRANSITION).toEqual({
      from: "titulo",
      intermediate: "title_options",
      settleFrames: 0,
      to: "prologo"
    });
    expect(EXEMPLO_PLAYER_FRAMEBUFFER_SCENES).toContain("arena_arrancada");
    expect(EXEMPLO_PLAYER_FRAMEBUFFER_SCENES).toContain("penedos_vento");
    expect(EXEMPLO_PLAYER_FRAMEBUFFER_SCENES).toContain("armazem_das_mares");
    expect(EXEMPLO_PLAYER_FRAMEBUFFER_SCENES).toContain("observatorio_do_farol");
    expect(EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES).toContain("circuito_final");
    expect(EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES).toContain("penedos_vento");
    expect(EXEMPLO_BACKGROUNDLESS_SCENES).not.toContain("circuito_final");
    expect(EXEMPLO_PLAYERLESS_SCENES).not.toContain("circuito_final");
    expect(EXEMPLO_PLAYERLESS_SCENES).not.toContain("penedos_vento");
    expect(EXEMPLO_PLAYERLESS_SCENES).not.toContain("mercado_suspenso");
    expect(EXEMPLO_PLAYER_FRAMEBUFFER_SCENES).toContain("mercado_suspenso");
    expect(EXEMPLO_PLAYER_FRAMEBUFFER_SCENES).not.toContain("arena_tatica");
    expect(EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES).toContain("arena_tatica");
    expect(EXEMPLO_EXPLICIT_ACTOR_BINDING_SCENES).toContain("penedos_vento");
    expect(EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES).toContain("mercado_suspenso");
    expect(EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES).toContain("armazem_das_mares");
    expect(EXEMPLO_EXACT_PLAYER_FRAMEBUFFER_SCENES).toContain("observatorio_do_farol");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).toContain("titulo");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).toContain("abertura");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).toContain("circuito_final");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).toContain("armazem_das_mares");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).toContain("observatorio_do_farol");
    expect(EXEMPLO_EXACT_BACKGROUND_FRAMEBUFFER_SCENES).not.toContain("penedos_vento");
    expect(EXEMPLO_RGB555_SCENE_THRESHOLDS.usina_submersa).toBe(0.1);
  });

  it("seleciona playtests isolados e preserva a escala inteira do framebuffer", () => {
    expect(selectExemploScenePlaytestPlan(project, "circuito_final")).toEqual([
      expect.objectContaining({ name: "circuito_final", runtime: "racing" })
    ]);
    expect(selectExemploScenePlaytestPlan(project, "mapa_rota")).toEqual([
      expect.objectContaining({ name: "mapa_rota", runtime: "worldMap" })
    ]);
    expect(selectExemploScenePlaytestPlan(project, "farol_interior")).toEqual([
      expect.objectContaining({ name: "farol_interior", runtime: "topdown" })
    ]);
    expect(selectExemploScenePlaytestPlan(project, "armazem_das_mares")).toEqual([
      expect.objectContaining({ name: "armazem_das_mares", runtime: "pointAndClick" })
    ]);
    expect(selectExemploScenePlaytestPlan(project, "observatorio_do_farol")).toEqual([
      expect.objectContaining({ name: "observatorio_do_farol", runtime: "pointAndClick" })
    ]);
    expect(() => selectExemploScenePlaytestPlan(project, "farol_corrida_final"))
      .toThrow(/Cena isolada nao encontrada/i);
    expect(auditIntegerFramebufferDisplay({ intrinsicWidth: 240, intrinsicHeight: 160, cssWidth: 720, cssHeight: 480, reportedScale: 3 }))
      .toMatchObject({ ok: true, scale: 3 });
  });

  it("aceita o projeto carregado como alterado quando as cenas estão prontas para Play", () => {
    expect(editorProjectReadyForScenePlaytest("Editor Cenas abertura Salvo", ["abertura"])).toBe(true);
    expect(editorProjectReadyForScenePlaytest("Editor Cenas abertura Alterado", ["abertura"])).toBe(true);
    expect(editorProjectReadyForScenePlaytest("Editor Cenas abertura Salvo", ["abertura", "titulo"])).toBe(false);
  });

  it("expõe o runtime e o índice inicial usados para validar o primeiro frame", () => {
    expect(exemploRuntimeLaunchContract({
      runtime_dispatch: {
        initial_runtime: "cutscene",
        initial_scene: "abertura",
        initial_room: 1
      },
      cutscene_project: {
        initial_scene: 1,
        scenes: [
          { name: "logo" },
          { name: "abertura" }
        ]
      }
    })).toEqual({
      currentRoom: 1,
      runtime: "cutscene",
      startScene: "abertura"
    });
  });

  it("seleciona e audita uma tela de interface sem misturá-la à campanha", () => {
    const plan = exemploInterfaceScenePlaytestPlan(project);
    expect(plan.map((scene) => scene.name)).toEqual([
      "logo", "abertura", "escolha_genero", "nome_jogador", "carregar_jogo",
      "configuracoes",
      "creditos", "missoes", "inventario", "mapa_menu",
      "salvar", "menu_start"
    ]);
    expect(selectExemploScenePlaytestPlan(project, "logo")).toEqual([
      expect.objectContaining({ name: "logo", runtime: "cutscene" })
    ]);

    expect(auditExemploInterfaceScenePlaytest(project, [{
      name: "logo",
      runtime: "cutscene",
      romBytes: 1024,
      frame: { meaningful: true },
      runtimeState: { frame: 90 },
      audio: { emittedAudioFrames: 90, audioUnderrunCount: 0 },
      actorFidelity: {
        actorCount: 0,
        audited: true,
        checks: { authoredActors: true, framebufferActors: true },
        framebufferActorCount: 0,
        framebufferRequired: false,
        ok: true
      },
      temporalVisualFidelity: {
        actors: { audited: true, ok: true, transientDisappearanceFrames: [] },
        background: { ok: true, transientBlankFrames: [] },
        frame: { ok: true, blankFrames: [], transientBlankFrames: [] },
        ok: true,
        sampleCount: 36
      },
      launchContract: { startScene: "logo", startSceneType: "cutscene" },
      backgroundFidelity: { audited: true, ok: true },
      paletteFidelity: { audited: true, ok: true },
      displayFidelity: { audited: true, ok: true },
      performance: { emulationFps: 60, presentationFps: 60, droppedFrameRatio: 0 }
    }])).toMatchObject({
      ok: true,
      counts: { expected: 1, passed: 1, failed: 0 }
    });
  });

  it("consolida e retoma o lote isolado de interfaces com seu próprio auditor", () => {
    const interfacePlan = exemploInterfaceScenePlaytestPlan(project);
    const runs = interfacePlan.map((scene, index) => ({
      attempts: 1,
      ok: true,
      sceneName: scene.name,
      result: healthyInterfaceResult(scene, index)
    }));

    const consolidated = consolidateExemploScenePlaytestRuns(project, runs, {
      audit: auditExemploInterfaceScenePlaytest,
      plan: exemploInterfaceScenePlaytestPlan
    });

    expect(consolidated).toMatchObject({
      audit: { ok: true, counts: { expected: 12, passed: 12, failed: 0 } },
      ok: true
    });
    expect(reusableExemploScenePlaytestRuns(project, runs, {
      plan: exemploInterfaceScenePlaytestPlan
    })).toHaveLength(12);
  });

  it("exige um soak que cubra as dezessete cenas e save/load", () => {
    const sceneSamples = exemploScenePlaytestPlan(project).map((scene) => ({ sceneName: scene.name }));
    const stableMemory = Array.from({ length: 20 }, () => ({ rssBytes: 64 * 1024 * 1024 }));
    const healthyPerformance = Array.from({ length: 20 }, () => ({ emulationFps: 60, presentationFps: 60, droppedFrameRatio: 0 }));
    expect(auditExemploSessionSoak({
      durationMs: 20 * 60_000,
      memorySamples: stableMemory,
      performanceSamples: healthyPerformance,
      audioSamples: [{ audioUnderrunCount: 0 }],
      saveLoad: { attempted: true, saveSucceeded: true, loadSucceeded: true, stateChanged: true, restored: true },
      sceneSamples
    })).toMatchObject({ ok: true, scenes: { count: 18, complete: true } });
    expect(parseExemploSceneSoakMinutes(["--soak-minutes=20"])).toBe(20);
  });

  it("resolve assets do template pelo metadado atual", () => {
    expect(exemploProjectAssetSource(project, "title-porto-lumen-240x160-4bpp.png"))
      .toBe("Assets/backgrounds/title-porto-lumen-240x160-4bpp.png");
    expect(() => exemploProjectAssetSource(project, "ausente.png")).toThrow("ausente.png");
  });
});
