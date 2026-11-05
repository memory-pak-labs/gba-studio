import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { findIsometricRoute, isometricDirectionButtons } from "./exemplo-isometric-route.mjs";

const project = JSON.parse(await readFile(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
const room = project.rooms.find((item) => item.name === "mercado_suspenso");

describe("rotas isométricas do Exemplo", () => {
  it("deriva os acordes do controle orientado à tela", () => {
    expect(isometricDirectionButtons(1, 0)).toEqual(["ArrowRight", "ArrowDown"]);
    expect(isometricDirectionButtons(-1, 0)).toEqual(["ArrowLeft", "ArrowUp"]);
    expect(isometricDirectionButtons(0, -1)).toEqual(["ArrowUp", "ArrowRight"]);
    expect(isometricDirectionButtons(0, 1)).toEqual(["ArrowDown", "ArrowLeft"]);
    expect(isometricDirectionButtons(1, 1)).toBeNull();
  });

  it("traça a rota real até a ponte e a saída sem atravessar células sólidas", () => {
    const player = project.actors.find((actor) => actor.id === "market-nara");
    const trader = project.actors.find((actor) => actor.id === "market-trader-v2");
    const bridge = project.triggers.find((trigger) => trigger.id === "trigger-market-bridge");
    const exit = project.triggers.find((trigger) => trigger.id === "trigger-market-exit");
    const blocked = project.actors.filter((actor) => actor.roomName === room.name && actor.id !== player.id);
    const toTrader = findIsometricRoute(room, player, { x: trader.x, y: trader.y + 1 }, blocked);
    const toBridge = findIsometricRoute(room, { x: trader.x, y: trader.y + 1 }, bridge, blocked);
    const toExit = findIsometricRoute(room, bridge, exit, blocked);
    expect(toTrader?.at(-1)).toEqual({ x: trader.x, y: trader.y + 1 });
    expect(toBridge?.at(-1)).toEqual({ x: bridge.x, y: bridge.y });
    expect(toExit?.at(-1)).toEqual({ x: exit.x, y: exit.y });
    const cells = room.collisionTypes.runs.flatMap(([type, count]) => Array(count).fill(type));
    expect(toExit.some(({ x, y }) => cells[y * room.width + x].startsWith("slope"))).toBe(true);
    for (const path of [toTrader, toBridge, toExit]) {
      for (const [index, point] of path.entries()) {
        expect(cells[point.y * room.width + point.x]).not.toBe("solid");
        if (index) expect(Math.abs(point.x - path[index - 1].x) + Math.abs(point.y - path[index - 1].y)).toBe(1);
      }
    }
  });

  it("rejeita destino bloqueado e dados de colisão incompletos", () => {
    const map = { width: 2, height: 2, collisionTypes: { runs: [["free", 1], ["solid", 3]] }, heightLevels: [0, 0, 0, 0] };
    expect(findIsometricRoute(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(() => findIsometricRoute({ ...map, collisionTypes: { runs: [["free", 1]] } }, { x: 0, y: 0 }, { x: 1, y: 1 })).toThrow();
  });
});
