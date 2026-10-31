import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { correctIsometricScenes } from "./isometric-scene-corrections.mjs";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.ts";
const source = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",import.meta.url)));
const fixed = correctIsometricScenes(source);
const commands = name => fixed.events.find(event => event.name === name).steps.flatMap(step => step.command.startsWith("call_procedure ") ? commands(step.command.split(" ")[1]) : [step.command]);
describe("isometric scene integration", () => {
  it("mantém as células caminháveis dentro do mapa amplo da Arena", () => {
    const arena = fixed.rooms.find(room => room.name === 'arena_tatica');
    const cells = Array.isArray(arena.collisions) ? arena.collisions : arena.collisions.runs.flatMap(([value,count])=>Array(count).fill(value));
    const {originX,originY,tileWidth,tileHeight,heightStep} = arena.runtime.config;
    for (let i=0;i<cells.length;i++) if (cells[i] !== 'solid') {
      const x=i%arena.width,y=Math.floor(i/arena.width);
      const px=originX+(x-y)*tileWidth/2;
      const py=originY+(x+y)*tileHeight/2-arena.heightLevels[i]*heightStep;
      expect(px-tileWidth/2).toBeGreaterThanOrEqual(0);
      expect(px+tileWidth/2).toBeLessThanOrEqual(arena.cameraBounds.width);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py+tileHeight).toBeLessThanOrEqual(arena.cameraBounds.height);
    }
  });
  it("exporta portas físicas, mantendo as conexões de conversa fora dos gatilhos", () => {
    const rooms = buildEngineExportProjectContract(fixed).isometric_project.rooms;
    for (const room of rooms) for (const event of room.tile_events ?? []) {
      expect(event.area.width).toBeGreaterThan(0);
      expect(event.area.height).toBeGreaterThan(0);
      expect(event.area.x + event.area.width).toBeLessThanOrEqual(room.width_tiles);
    }
    const market = rooms.find(room => room.name === "mercado_suspenso");
    expect(market.on_enter).toContainEqual({op:"set_camera_property",field:"pan_y",value:0});
    const guardIndex = fixed.actors.filter(actor=>actor.roomName==='mercado_suspenso').findIndex(actor=>actor.id==='market-guard-v1');
    expect(guardIndex).toBe(2);
    expect(market.on_enter).toContainEqual({op:"set_actor_position",actor:guardIndex,x:23,y:3});
    expect(market.on_enter).toContainEqual({op:"set_actor_position",actor:guardIndex,x:24,y:3});
    expect(market.tile_events.some(event => event.area.x === 25 && event.area.y === 3 && event.area.z === 3)).toBe(true);
  });
  it("abre uma passagem real e restaura seu estado ao voltar", () => {
    expect(fixed.actors.find(actor => actor.id === "market-guard-v1")).toMatchObject({ x:24, y:3, eventBindings: { onInteract: "mercado_falar_guarda" } });
    expect(commands("mercado_abrir_atalho")).toContain("move_actor_relative market-guard-v1 -1 0");
    expect(commands("mercado_ao_entrar")).toEqual(expect.arrayContaining(["if_variable var_market_shortcut 1", "set_actor_position market-guard-v1 24 3", "set_actor_position market-guard-v1 23 3"]));
  });
  it("liga o guarda à Arena e o retorno ao Mercado sem criar menu extra", () => {
    expect(commands("mercado_falar_guarda")).toContain("attach_button r mercado_entrar_arena true");
    expect(commands("arena_tatica_ao_entrar")).toContain("remove_button r");
    const entry = fixed.actors.find(actor => actor.id === "tactical-nara");
    expect(commands("mercado_entrar_arena")).toContain(`change_scene arena_tatica ${entry.x} ${entry.y} ${entry.direction}`);
    expect(commands("arena_tatica_sair")).toContain("change_scene mercado_suspenso 24 5 down");
    expect(fixed.events.some(event => event.name === "menu_start_arena_tatica")).toBe(false);
    for (const connection of fixed.editorState.scenaConnections.filter(item => item.from === "mercado_suspenso")) {
      expect(connection.exit.x + connection.exit.width).toBeLessThanOrEqual(52);
      expect(connection.exit.y + connection.exit.height).toBeLessThanOrEqual(52);
    }
  });
  it("inicia a música do Mercado e mostra uma ação real no lugar da barra sem vínculo", () => {
    expect(commands("mercado_ao_entrar")).toContain("play_music farol_falesias");
    const hud = fixed.settings.hudPresets.find(item => item.id === "hud-mercado-avancada");
    expect(hud.components.find(item => item.kind === "bar")).toMatchObject({valueVariable:"porto_player_health",valueMaximum:3});
    expect(hud.components).toContainEqual(expect.objectContaining({kind: "text", valueVariable: "var_market_shortcut"}));
  });
  it("é idempotente e preserva arte, animações e cenas fora do escopo", () => {
    expect(fixed).toEqual(source);
    expect(correctIsometricScenes(fixed)).toEqual(fixed);
    expect(fixed.assets).toEqual(source.assets);
    expect(fixed.animations).toEqual(source.animations);
    expect(fixed.rooms.filter(room => room.sceneType !== "isometric")).toEqual(source.rooms.filter(room => room.sceneType !== "isometric"));
    expect(fixed.rooms).toEqual(fixed.scenas);
  });
});
