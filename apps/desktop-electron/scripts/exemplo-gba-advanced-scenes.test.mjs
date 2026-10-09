import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const templateURL = new URL(
  "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
  import.meta.url
);

function canonicalProject() {
  return JSON.parse(readFileSync(templateURL, "utf8"));
}

function encodedLength(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && Number.isInteger(value.length)) return value.length;
  return 0;
}

describe("cenas avançadas do template Exemplo GBA", () => {
  it("mantém a abertura e o carrossel de opções na cena de título", () => {
    const project = canonicalProject();
    const title = project.scenas.find((scene) => scene.name === "titulo");
    const titleScreen = title.runtime.config.screens.find((screen) => screen.id === "title");
    const options = title.runtime.config.screens.find((screen) => screen.id === "title_options");

    expect(project.scenas.slice(0, 6).map(({ name, sceneType }) => [name, sceneType])).toEqual([
      ["logo", "cutscene"],
      ["abertura", "cutscene"],
      ["titulo", "menu"],
      ["prologo", "cutscene"],
      ["porto_lumen", "topdown"],
      ["mapa_rota", "worldMap"]
    ]);
    expect(project.rooms.map((scene) => scene.name)).toEqual(project.scenas.map((scene) => scene.name));
    expect(project.scenas.some((scene) => scene.name === "menu_inicial")).toBe(false);
    expect(titleScreen.items).toEqual([
      expect.objectContaining({ id: "start", action: "push_screen", targetScreenID: "title_options" })
    ]);
    expect(options).toMatchObject({ carousel: true, hudMode: "none" });
    expect(options.items.map(({ id, targetScreenID, targetItemID }) => ({ id, targetScreenID, targetItemID })))
      .toEqual([
        { id: "new-game", targetScreenID: "escolha_genero", targetItemID: undefined },
        { id: "load-game", targetScreenID: "carregar_jogo", targetItemID: undefined },
        { id: "language", targetScreenID: "configuracoes", targetItemID: "language" },
        { id: "settings", targetScreenID: "configuracoes", targetItemID: undefined },
        { id: "credits", targetScreenID: "creditos", targetItemID: undefined }
      ]);
    expect(project.scenas.filter((scene) => scene.name === "configuracoes")).toHaveLength(1);
  });

  it("mantém a Arena Tática e o Mercado Suspenso como experiências isométricas distintas", () => {
    const project = canonicalProject();
    const arena = project.scenas.find((scene) => scene.name === "arena_tatica");
    const market = project.scenas.find((scene) => scene.name === "mercado_suspenso");
    const arenaActors = project.actors.filter((actor) => actor.roomName === "arena_tatica");

    expect(arena).toMatchObject({
      sceneType: "isometric",
      width: 6,
      height: 6,
      backgroundAssetName: "tactical-v5-surface.png",
      tilesetAssetName: "tactical-v5-surface.png",
      cameraMode: "fixed_center",
      runtime: {
        type: "isometric",
        config: {
          profile: "diamond-2to1",
          movement: "tile",
          worldMode: "static_composition",
          gameplayMode: "tactical",
          tactical: { enabled: true, activeTeam: "player", units: [
            expect.objectContaining({ actorIndex: 0, team: "player", moveRange: 2, attackRange: 1 }),
            expect.objectContaining({ actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 1 })
          ] }
        }
      }
    });
    expect(arenaActors).toEqual([
      expect.objectContaining({ name: "Nara · Arena Tática", x: 1, y: 4, spriteSheet: "tactical-nara-v5.png", animationName: "idle_right" }),
      expect.objectContaining({ name: "Sentinela · Arena Tática", x: 4, y: 1, spriteSheet: "tactical-sentinel-v5.png", animationName: "idle_left" })
    ]);
    expect(arena.runtime.config.tacticalPresentation).toMatchObject({
      schema: 1,
      surfacePages: [expect.objectContaining({ asset: "tactical-v5-surface.png", world: { x: 0, y: 0, width: 240, height: 160 } })],
      cursorAsset: "tactical-cursor-diamond-32x16-v1.png",
      rangeAsset: "tactical-range-diamond-32x16-v1.png",
      targetAsset: "tactical-target-diamond-32x16-v1.png"
    });
    expect(arena.runtime.config.tacticalPresentation.audio).toMatchObject({
      music: "farol_arena_tatica",
      cues: { move: "farol_sfx_tatica_mover", attack: "farol_sfx_tatica_ataque", victory: "farol_sfx_tatica_vitoria" }
    });

    expect(market).toMatchObject({
      sceneType: "isometric",
      width: 36,
      height: 36,
      backgroundAssetName: "mercado-adventure-surface.png",
      playerActorName: "Aventureiro · Mercado",
      cameraMode: "follow_player",
      runtime: { type: "isometric", config: {
        profile: "market-suspenso-isometric-world-v1",
        movement: "free",
        worldMode: "scrollable_tiled_world",
        gameplayMode: "adventure",
        pagedSurface: { backgroundAsset: "mercado-adventure-surface.png", foregroundAsset: "mercado-adventure-foreground.png" }
      } }
    });
    expect(project.actors.filter((actor) => actor.roomName === "mercado_suspenso").map(({ name, spriteSheet }) => [name, spriteSheet]))
      .toEqual([
        ["Aventureiro · Mercado", "tactical-nara-v5.png"],
        ["Mercador suspenso", "market-adventure-merchant.png"],
        ["Guarda do mercado", "market-adventure-guard.png"]
      ]);
  });

  it("preserva mapas e colisões na extensão declarada por cada cena", () => {
    const project = canonicalProject();
    for (const scene of project.scenas) {
      const cells = scene.width * scene.height;
      expect(encodedLength(scene.collisionTypes), `tipos de colisão: ${scene.name}`).toBe(cells);
      if (scene.collisions !== undefined) {
        expect(encodedLength(scene.collisions), `colisões: ${scene.name}`).toBe(cells);
      }
      for (const layer of scene.tileLayers ?? []) {
        expect(encodedLength(layer.tilemap), `${scene.name} ${layer.mapping}: tiles`).toBe(cells);
        expect(encodedLength(layer.tileSourceAssetNames), `${scene.name} ${layer.mapping}: origem`).toBe(cells);
      }
    }
  });

  it("configura o Circuito dos Faróis com pista top-down, câmera e três competidores", () => {
    const project = canonicalProject();
    const racing = project.scenas.find((scene) => scene.name === "circuito_final");
    const racers = project.actors.filter((actor) => actor.roomName === "circuito_final");

    expect(racing).toMatchObject({
      sceneType: "racing",
      backgroundAssetName: "circuit-final-loop-v2-runtime.png",
      playerActorName: "Carro de Nara",
      cameraMode: "follow_player",
      runtime: { type: "racing", config: {
        presentation: "topdown",
        rivalSpeed: 105,
        showMinimap: false,
        topdownTrack: {
          cameraDeadZoneX: 56,
          cameraDeadZoneY: 40,
          pathPoints: expect.arrayContaining([expect.objectContaining({ x: 180, y: 56 })]),
          checkpoints: expect.arrayContaining([expect.objectContaining({ id: "ilha-largada" })])
        }
      } },
      eventBindings: { onVictory: "circuito_concluir", onDefeat: "circuito_reiniciar" }
    });
    expect(racers.map(({ name, spriteSheet }) => [name, spriteSheet])).toEqual([
      ["Carro de Nara", "nara-racer.png"],
      ["Rival de Nara", "rival-racer.png"],
      ["Rival da Ilha", "rival-racer.png"]
    ]);
  });

  it("mantém o Armazém e o Observatório como cenas point-and-click com atores e saídas", () => {
    const project = canonicalProject();
    for (const expected of [
      { name: "armazem_das_mares", background: "armazem-das-mares-gba.png", cursor: "Cursor do Armazém", triggers: ["Carta Náutica", "Baú Vermelho", "Saída do Armazém"] },
      { name: "observatorio_do_farol", background: "observatorio-do-farol-gba.png", cursor: "Cursor do Observatório", triggers: ["Telescópio", "Mesa da Maré", "Saída do Observatório"] }
    ]) {
      const scene = project.scenas.find((candidate) => candidate.name === expected.name);
      expect(scene).toMatchObject({
        sceneType: "pointAndClick",
        width: 30,
        height: 20,
        backgroundAssetName: expected.background,
        playerActorName: expected.cursor,
        runtime: { type: "pointAndClick" }
      });
      const actors = project.actors.filter((actor) => actor.roomName === expected.name);
      expect(actors).toHaveLength(4);
      expect(actors[0]).toMatchObject({ name: expected.cursor, spriteSheet: "point-click-cursor.png" });
      expect(project.triggers.filter((trigger) => trigger.roomName === expected.name).map((trigger) => trigger.name))
        .toEqual(expected.triggers);
    }
  });
});
