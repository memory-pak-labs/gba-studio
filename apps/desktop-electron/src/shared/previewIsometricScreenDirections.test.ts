import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bootPreviewRuntimeAtRoom, dispatchPreviewRuntimeAction, tickPreviewRuntime, type PreviewRuntimeAction } from "./previewRuntime.js";
import type { GBAProjectData } from "./projectFile.js";
import { setRoomCollisionCellInProject } from "./roomsWorkspace.js";

const project = JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8")) as GBAProjectData;
const cases: Array<{ key: PreviewRuntimeAction; held?: PreviewRuntimeAction[]; delta: [number, number]; walk: string; idle: string }> = [
  { key: "up", delta: [-1, -1], walk: "walk_screen_up", idle: "idle_screen_up" },
  { key: "down", delta: [1, 1], walk: "walk_screen_down", idle: "idle_screen_down" },
  { key: "left", delta: [-1, 1], walk: "walk_screen_left", idle: "idle_screen_left" },
  { key: "right", delta: [1, -1], walk: "walk_screen_right", idle: "idle_screen_right" },
  { key: "up", held: ["right"], delta: [0, -1], walk: "walk_up", idle: "idle_up" },
  { key: "down", held: ["right"], delta: [1, 0], walk: "walk_right", idle: "idle_right" },
  { key: "down", held: ["left"], delta: [0, 1], walk: "walk_left", idle: "idle_left" },
  { key: "up", held: ["left"], delta: [-1, 0], walk: "walk_down", idle: "idle_down" }
];

describe("prévia isométrica orientada à tela", () => {
  it.each(cases)("projeta e anima corretamente $key com $held", ({ key, held, delta, walk, idle }) => {
    const start = bootPreviewRuntimeAtRoom(project, "mercado_suspenso", { skipBootEvents: true });
    const moving = tickPreviewRuntime(start, 100, key, held);
    expect(moving.player).not.toBeNull();
    expect(Math.sign(moving.player!.x - start.player!.x)).toBe(delta[0]);
    expect(Math.sign(moving.player!.y - start.player!.y)).toBe(delta[1]);
    expect(moving.player!.animationName).toBe(walk);
    expect(tickPreviewRuntime(moving, 0).player!.animationName).toBe(idle);
  });

  it("bloqueia a diagonal quando uma das células laterais está ocupada", () => {
    const room = (project.scenas as Array<Record<string, unknown>>).find((item) => item.name === "mercado_suspenso")!;
    const blocked = setRoomCollisionCellInProject(project, String(room.id), 22 * Number(room.width) + 19, true);
    const start = bootPreviewRuntimeAtRoom(blocked, "mercado_suspenso", { skipBootEvents: true });
    const moved = tickPreviewRuntime(start, 100, "up");
    expect(moved.player).toMatchObject({ x: start.player!.x, y: start.player!.y, animationName: "idle_screen_up" });
  });

  it("impede que a diagonal atravesse um ator visível e permite a passagem quando ele está oculto", () => {
    const occupied = structuredClone(project);
    const actor = (occupied.actors as Array<Record<string, unknown>>).find((item) => item.id === "market-trader-v2")!;
    Object.assign(actor, { x: 19, y: 22, z: 0, visible: true });
    const start = bootPreviewRuntimeAtRoom(occupied, "mercado_suspenso", { skipBootEvents: true });
    const blocked = tickPreviewRuntime(start, 100, "up");
    expect(blocked.player).toMatchObject({ x: start.player!.x, y: start.player!.y });
    actor.visible = false;
    const hidden = bootPreviewRuntimeAtRoom(occupied, "mercado_suspenso", { skipBootEvents: true });
    expect(tickPreviewRuntime(hidden, 100, "up").player!.x).toBeLessThan(hidden.player!.x);
  });

  it("usa a animação legada quando não há pose de tela para a direção", () => {
    const legacy = structuredClone(project);
    const state = (legacy.animationStates as Array<Record<string, unknown>>).find((item) => item.id === "market-adventure-player-state")!;
    state.animationIDs = (state.animationIDs as string[]).filter((id) => !id.includes("_screen_"));
    const start = bootPreviewRuntimeAtRoom(legacy, "mercado_suspenso", { skipBootEvents: true });
    const moved = tickPreviewRuntime(start, 100, "up");
    expect(moved.player!.animationName).toBe("walk_down");
    expect(tickPreviewRuntime(moved, 0).player!.animationName).toBe("idle_down");
  });

  it("cancela entradas opostas", () => {
    const start = bootPreviewRuntimeAtRoom(project, "mercado_suspenso", { skipBootEvents: true });
    const stopped = tickPreviewRuntime(start, 100, "up", ["down"]);
    expect(stopped.player).toMatchObject({ x: start.player!.x, y: start.player!.y });
  });

  it("usa a mesma compensação de velocidade projetada que a ROM", () => {
    const start = bootPreviewRuntimeAtRoom(project, "mercado_suspenso", { skipBootEvents: true });
    const vertical = tickPreviewRuntime(start, 100, "up");
    const horizontal = tickPreviewRuntime(start, 100, "right");
    const diagonal = tickPreviewRuntime(start, 100, "up", ["right"]);
    // Mercado uses 24x12 tiles, whose integer-projected vertical step is 17/256.
    expect(start.player!.x - vertical.player!.x).toBeCloseTo(6 * 17 / 256);
    expect(horizontal.player!.x - start.player!.x).toBeCloseTo(6 * 9 / 256);
    expect(start.player!.y - diagonal.player!.y).toBeCloseTo(6 * 16 / 256);
  });

  it("aplica a mesma projeção ao disparar um movimento isolado", () => {
    const start = bootPreviewRuntimeAtRoom(project, "mercado_suspenso", { skipBootEvents: true });
    const moved = dispatchPreviewRuntimeAction(start, "up");
    expect(moved.player).toMatchObject({ x: start.player!.x - 1, y: start.player!.y - 1, animationName: "walk_screen_up" });
  });
});
