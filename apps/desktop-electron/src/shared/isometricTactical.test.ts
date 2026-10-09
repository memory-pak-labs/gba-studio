import { describe, expect, it } from "vitest";
import {
  applyIsometricTacticalAction,
  createIsometricTacticalState,
  normalizeIsometricTacticalConfig,
  type IsometricTacticalActorPosition
} from "./isometricTactical.js";

const actors: IsometricTacticalActorPosition[] = [
  { actorIndex: 0, x: 2, y: 2, z: 0, visible: true },
  { actorIndex: 1, x: 5, y: 2, z: 0, visible: true },
  { actorIndex: 2, x: 7, y: 2, z: 0, visible: true }
];

describe("isometric tactical core", () => {
  it("normaliza unidades, turnos e limites de alcance para a cena", () => {
    expect(normalizeIsometricTacticalConfig({
      enabled: true,
      activeTeam: "player",
      units: [
        { actorIndex: 0, team: "player", moveRange: 3, attackRange: 1, maxHp: 5, attackPower: 2 },
        { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 2, maxHp: 4, attackPower: 1 }
      ]
    }, actors.length)).toEqual({
      enabled: true,
      activeTeam: "player",
      activeUnitIndex: 0,
      units: [
        { actorIndex: 0, team: "player", moveRange: 3, attackRange: 1, hp: 5, maxHp: 5, attackPower: 2 },
        { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 2, hp: 4, maxHp: 4, attackPower: 1 }
      ]
    });
  });

  it("seleciona, move por alcance e encerra o turno sem atravessar ocupação", () => {
    let state = createIsometricTacticalState({
      enabled: true,
      activeTeam: "player",
      units: [
        { actorIndex: 0, team: "player", moveRange: 3, attackRange: 1, maxHp: 5, attackPower: 2 },
        { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 2, maxHp: 4, attackPower: 1 }
      ]
    }, actors.length);

    state = applyIsometricTacticalAction(state, actors, { x: 2, y: 2, z: 0 }, "confirm", () => false).state;
    expect(state.phase).toBe("target");
    expect(state.selectedUnitIndex).toBe(0);

    const blocked = applyIsometricTacticalAction(state, actors, { x: 5, y: 2, z: 0 }, "confirm", () => false);
    expect(blocked.state.notice).toBe("Casa ocupada.");
    expect(blocked.moves).toEqual([]);

    const moved = applyIsometricTacticalAction(state, actors, { x: 4, y: 2, z: 0 }, "confirm", () => false);
    expect(moved.moves).toEqual([{ actorIndex: 0, tile: { x: 4, y: 2, z: 0 } }]);
    expect(moved.state.turnNumber).toBe(2);
    expect(moved.state.activeTeam).toBe("enemy");
    expect(moved.audioCues).toEqual(["move", "turn"]);
    expect(moved.visualEvents.map((event) => event.kind)).toEqual(["move", "turn"]);
  });

  it("recusa salto sobre parede e só sobe pela rampa", () => {
    const selected = {
      ...createIsometricTacticalState({
        enabled: true,
        activeTeam: "player" as const,
        units: [
          { actorIndex: 0, team: "player" as const, moveRange: 3, attackRange: 1, maxHp: 5, attackPower: 2 },
          { actorIndex: 1, team: "enemy" as const, moveRange: 2, attackRange: 1, maxHp: 4, attackPower: 1 }
        ]
      }, actors.length),
      phase: "target" as const,
      selectedUnitIndex: 0
    };
    const wall = applyIsometricTacticalAction(
      selected, actors, { x: 4, y: 2, z: 0 }, "confirm",
      (tile) => tile.x === 3 || tile.y !== 2
    );
    expect(wall.moves).toEqual([]);

    const rampActors = [{ ...actors[0], x: 0, y: 0 }];
    const raisedTarget = { x: 2, y: 0, z: 1 };
    const heightAt = (x: number) => x > 0 ? 1 : 0;
    const noRamp = applyIsometricTacticalAction(
      selected, rampActors, raisedTarget, "confirm", () => false,
      (x) => heightAt(x), () => false
    );
    expect(noRamp.moves).toEqual([]);
    const climb = applyIsometricTacticalAction(
      selected, rampActors, raisedTarget, "confirm", () => false,
      (x) => heightAt(x), (from, to) => from.z === to.z || from.x === 0 && to.x === 1
    );
    expect(climb.moves).toEqual([{ actorIndex: 0, tile: raisedTarget }]);
  });

  it("aplica ataque dentro do alcance e marca a unidade derrotada", () => {
    const state = {
      ...createIsometricTacticalState({
        enabled: true,
        activeTeam: "player",
        units: [
          { actorIndex: 0, team: "player", moveRange: 3, attackRange: 3, maxHp: 5, attackPower: 4 },
          { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 2, maxHp: 4, attackPower: 1 }
        ]
      }, actors.length),
      phase: "target" as const,
      selectedUnitIndex: 0
    };
    const result = applyIsometricTacticalAction(state, actors, { x: 5, y: 2, z: 0 }, "confirm", () => false);
    expect(result.attacks).toEqual([{ attackerIndex: 0, targetIndex: 1, damage: 4 }]);
    expect(result.defeatedActorIndexes).toEqual([1]);
    expect(result.state.units.find((unit) => unit.actorIndex === 1)?.hp).toBe(0);
    expect(result.state.turnNumber).toBe(2);
    expect(result.state.outcome).toBe("victory");
    expect(result.audioCues).toEqual(["attack", "hit", "victory"]);
    expect(result.visualEvents.map((event) => event.kind)).toEqual(["attack", "hurt", "defeat", "victory"]);
  });

  it("mantém feedback visual e sonoro separado para seleção, bloqueio e cancelamento", () => {
    let state = createIsometricTacticalState({
      enabled: true,
      activeTeam: "player",
      units: [
        { actorIndex: 0, team: "player", moveRange: 3, attackRange: 1, maxHp: 5, attackPower: 2 },
        { actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 1, maxHp: 4, attackPower: 1 }
      ]
    }, actors.length);

    const blocked = applyIsometricTacticalAction(state, actors, { x: 3, y: 3, z: 0 }, "confirm", () => true);
    expect(blocked.audioCues).toEqual(["cancel"]);
    expect(blocked.visualEvents).toEqual([{ kind: "blocked", tile: { x: 3, y: 3, z: 0 } }]);

    state = applyIsometricTacticalAction(state, actors, { x: 2, y: 2, z: 0 }, "confirm", () => false).state;
    const cancelled = applyIsometricTacticalAction(state, actors, { x: 2, y: 2, z: 0 }, "cancel", () => false);
    expect(cancelled.audioCues).toEqual(["cancel"]);
    expect(cancelled.visualEvents).toEqual([{ kind: "cancel", tile: { x: 2, y: 2, z: 0 } }]);
  });
});
