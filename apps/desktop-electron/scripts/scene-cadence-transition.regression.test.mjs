import { describe, expect, it } from "vitest";
import { selectTransitionCadenceWindow } from "./exemplo-scene-playtest-contract.mjs";

const scope = { notBeforeUnixMs: 3000, initialFrame: 109, runtimeKind: 4, currentRoom: 0 };
const sample = (time, frame, room = 0, changes = 0, fps = 60) => ({
  sampledAtUnixMs: time, presentationFps: fps, emulationFps: fps,
  runtimeState: { frame, runtimeKind: 4, currentRoom: room, roomChangeCount: changes }
});
const before = () => [
  { sampledAtUnixMs: 100, runtimeState: { frame: 0, runtimeKind: -1, currentRoom: -1 } },
  sample(500, 16), sample(1000, 47, 0, 0, 40), sample(1500, 78), sample(2500, 109)
];
const after = () => [sample(3500, 140), sample(4000, 170), sample(4500, 200), sample(5000, 223, 1, 1)];

describe("janela de cadência antes de uma transição automática", () => {
  it("usa as primeiras quatro amostras contínuas da cena observada sem excluir a queda", () => {
    expect(selectTransitionCadenceWindow(before(), after(), scope)).toEqual(before().slice(1));
  });
  it("rejeita janela anterior incompleta, antiga ou com reinício", () => {
    expect(() => selectTransitionCadenceWindow(before().slice(0, 4), after(), scope)).toThrow();
    expect(() => selectTransitionCadenceWindow(before(), after(), { ...scope, initialFrame: 200 })).toThrow();
    const restarted = before(); restarted[3].runtimeState.frame = 1;
    expect(() => selectTransitionCadenceWindow(restarted, after(), scope)).toThrow();
  });
  it("não aceita outro runtime ou cena anterior como aquecimento", () => {
    const mixed = before(); mixed[2].runtimeState.currentRoom = 2;
    expect(() => selectTransitionCadenceWindow(mixed, after(), scope)).toThrow();
    const other = before(); other[0].runtimeState = { frame: 8, runtimeKind: 3, currentRoom: 1 };
    expect(() => selectTransitionCadenceWindow(other, after(), scope)).toThrow();
  });
  it("exige uma transição comprovada, não um reinício ou telemetria ambígua", () => {
    const noTransition = after(); noTransition[3].runtimeState.currentRoom = 0;
    expect(() => selectTransitionCadenceWindow(before(), noTransition, scope)).toThrow();
    const noCount = after(); noCount[3].runtimeState.roomChangeCount = 0;
    expect(() => selectTransitionCadenceWindow(before(), noCount, scope)).toThrow();
    const reset = after(); reset[3].runtimeState.frame = 1;
    expect(() => selectTransitionCadenceWindow(before(), reset, scope)).toThrow();
    const countReset = after(); countReset[1].runtimeState.roomChangeCount = 1; countReset[2].runtimeState.roomChangeCount = 0;
    expect(() => selectTransitionCadenceWindow(before(), countReset, scope)).toThrow();
    const wrongRuntime = after(); wrongRuntime[3].runtimeState.runtimeKind = 3;
    expect(() => selectTransitionCadenceWindow(before(), wrongRuntime, scope)).toThrow();
    const missingRoom = after(); delete missingRoom[3].runtimeState.currentRoom;
    expect(() => selectTransitionCadenceWindow(before(), missingRoom, scope)).toThrow();
  });
});
