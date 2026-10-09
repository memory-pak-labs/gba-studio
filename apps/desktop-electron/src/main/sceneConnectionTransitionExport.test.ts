import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";

const canonical = parseGBAProjectFile(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8")).data;
function fixture(from: string, to: string, style = "slide") {
  const data = structuredClone(canonical);
  const connection = (data.editorState as any).scenaConnections.find((c: any) => c.from === from && c.to === to);
  connection.transition = { style, durationFrames: 24, fadeOut: true, fadeIn: true };
  return { data, connection };
}
function script(data: typeof canonical, kind: string, eventName: string) {
  const runtime = (buildEngineExportProjectContract(data) as any)[`${kind}_project`];
  return runtime.scripts.find((s: any) => s.name === eventName).script as Array<Record<string, any>>;
}

describe("scene connection transitions on event-driven navigation", () => {
  it.each([
    ["abertura", "titulo", "cutscene"],
    ["escolha_genero", "nome_jogador", "menu"],
    ["armazem_das_mares", "observatorio_do_farol", "point_click"],
    ["usina_submersa", "usina_combate", "dungeon_crawler"],
    ["mapa_rota", "penedos_vento", "world_map"],
    ["guardiao_rele", "arena_arrancada", "battle_rpg"],
    ["circuito_final", "titulo", "racing"]
  ])("honors %s → %s in the %s event script", (from, to, kind) => {
    const { data, connection } = fixture(from, to);
    const commands = script(data, kind, connection.eventName);
    const warp = commands.findIndex(c => c.op === "warp" || c.op === "warp_runtime");
    const cover = commands.findIndex(c => c.op === "visual_effect" && c.phase === "cover");
    expect(cover).toBeGreaterThanOrEqual(0);
    expect(cover + 1).toBeLessThan(warp);
    expect(commands.slice(cover, cover + 2)).toEqual([
      { op: "visual_effect", effect: "push", layer: "all", frames: 24, intensity: 100, phase: "cover" },
      { op: "wait", frames: 24 }
    ]);
    expect(commands[warp + 1]).toEqual({ op: "visual_effect", effect: "push", layer: "all", frames: 24, intensity: 100, phase: "reveal" });
  });

  it("keeps a blocked exit outside the cover/reveal branch and avoids double wrapping its door", () => {
    const { data, connection } = fixture("mercado_suspenso", "usina_submersa", "wipe");
    const contract = buildEngineExportProjectContract(data);
    const commands = contract.isometric_project!.scripts!.find(s => s.name === connection.eventName)!.script;
    const cover = commands.findIndex(c => c.op === "visual_effect" && c.phase === "cover");
    expect(cover).toBeGreaterThan(1);
    const branch = commands[1] as { offset: number };
    expect(1 + branch.offset).toBeGreaterThan(commands.findIndex(c => c.op === "warp_runtime"));
    const door = contract.isometric_project!.rooms[0].tile_events!.find(t => t.on_interact?.some(c => c.op === "warp_runtime"))!;
    expect(door.on_interact!.filter(c => c.op === "visual_effect" && c.phase === "cover")).toHaveLength(1);
    expect(door.on_interact![0].op).toMatch(/jump_if/);
  });

  it("uses the shared compositor for fade in runtimes without local fade consumers", () => {
    const { data, connection } = fixture("abertura", "titulo", "fade");
    const commands = script(data, "cutscene", connection.eventName);
    expect(commands).toContainEqual({ op: "visual_effect", effect: "fade", layer: "all", frames: 24, intensity: 100, phase: "cover" });
    expect(commands.at(-1)).toMatchObject({ op: "visual_effect", effect: "fade", phase: "reveal" });
  });

  it("preserves effects explicitly authored in the event", () => {
    const { data, connection } = fixture("abertura", "titulo");
    const event = (data.events as any[]).find(e => e.name === connection.eventName)!;
    event.steps.unshift({ command: "fade_out 10" }, { command: "wait 10" });
    event.steps.push({ command: "fade_in 10" });
    const commands = script(data, "cutscene", connection.eventName);
    expect(commands.filter(c => c.op === "fade_out")).toHaveLength(1);
    expect(commands.filter(c => c.op === "visual_effect")).toHaveLength(0);
  });

  it("keeps configured native menu navigation when reveal follows the warp", () => {
    const { data } = fixture("escolha_genero", "nome_jogador", "wipe");
    (data.scenas as any[]).find(r => r.name === "escolha_genero").runtime.config.items[0].action = "push_screen";
    (data.scenas as any[]).find(r => r.name === "escolha_genero").runtime.config.items[0].targetScreenID = "nome_jogador";
    const menu = buildEngineExportProjectContract(data).menu_project!;
    const target = menu.screens.findIndex(s => s.name === "nome_jogador");
    const source = menu.screens.find(s => s.name === "escolha_genero")!;
    for (const item of source.items) {
      expect(item.target_screen).toBe(target);
      expect(item.action).toBe(item.label === "Homem" ? "push_screen" : "select");
      expect(item.on_select?.some(c => c.op === "warp" || c.op === "warp_runtime")).toBe(false);
      expect(item.on_select?.at(-1)).toMatchObject({ op: "visual_effect", phase: "reveal" });
    }
  });

  it("routes dungeon rooms through the scene dispatcher instead of an unconsumed local warp", () => {
    const { data, connection } = fixture("usina_submersa", "usina_combate", "fade");
    const commands = script(data, "dungeon_crawler", connection.eventName);
    expect(commands).toContainEqual(expect.objectContaining({ op: "warp_runtime", runtime: "dungeon_crawler", room: 1 }));
    expect(commands.some(c => c.op === "warp")).toBe(false);
  });

  it.each([
    ["porto_lumen", "farol_interior", "topdown"],
    ["arena_tatica", "mercado_suspenso", "isometric"]
  ])("preserves the cover wait and atomic handoff for %s → %s", (from, to, kind) => {
    const { data, connection } = fixture(from, to, "fade");
    const commands = script(data, kind, connection.eventName);
    expect(commands).toContainEqual(expect.objectContaining({ op: "warp_runtime", runtime: kind }));
    expect(commands.some(c => c.op === "warp")).toBe(false);
  });

  it("keeps an immediate local topdown warp for a cut connection", () => {
    const { data, connection } = fixture("porto_lumen", "farol_interior", "cut");
    const commands = script(data, "topdown", connection.eventName);
    expect(commands).toContainEqual(expect.objectContaining({ op: "warp" }));
  });
});
