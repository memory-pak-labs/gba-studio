import { expect, it } from "vitest";
import { parseEventInstruction, eventExecutionContract, sceneEntryPlan } from "./eventExecutionContract.js";
import { nativeRuntimeEventCommandVerbs } from "./eventCommandRegistry.js";
import { verifyInputReplayCheckpoint } from "./inputReplay.js";

it("declares handling and timing for every native command without claiming unknown semantics", () => {
  for (const verb of nativeRuntimeEventCommandVerbs()) expect(eventExecutionContract(verb).handling).toBe("runtime");
  expect(eventExecutionContract("wait")).toMatchObject({ timing: "frames", blocks: true });
  expect(eventExecutionContract("load_game")).toMatchObject({ timing: "restore", resetsSceneResources: true });
  expect(eventExecutionContract("lantern").resources).toEqual(["window1", "brightness"]);
});
it("parses a common IR with source location and validates frame and save bounds", () => {
  expect(parseEventInstruction("wait 12", { eventID: "door", stepID: "s2" })).toMatchObject({ verb: "wait", operands: ["12"], source: { eventID: "door", stepID: "s2" }, numeric: { frames: 12 } });
  expect(() => parseEventInstruction("wait -1")).toThrow(/frames/);
  expect(() => parseEventInstruction("save_game 8")).toThrow(/slot/);
});
it("distinguishes restore, resume and restart from ordinary scene entry", () => {
  expect(sceneEntryPlan("load", { hasMapStates: true })).toMatchObject({ runInit: false, restoreSavedState: true, resetResources: true });
  expect(sceneEntryPlan("load", { hasMapStates: false })).toMatchObject({ runInit: true });
  expect(sceneEntryPlan("resume")).toMatchObject({ runInit: false, resetResources: false });
  expect(sceneEntryPlan("restart")).toMatchObject({ runInit: true, restoreSavedState: false });
});
it("finds the first position, collision or event divergence without comparing unspecified fields", () => {
  const replay = { checkpoints: { 12: { position: { x: 5, y: 8 }, collision: { cell: 4, type: "solid" }, event: { id: "door", step: 2, waiting: "frames" } } } } as never;
  expect(verifyInputReplayCheckpoint(replay, 12, { position: { x: 6, y: 8 }, collision: { cell: 4, type: "free" }, event: { id: "door", step: 2, waiting: "frames" } } as never)).toMatchObject({ ok: false, differences: [expect.stringContaining("position.x"), expect.stringContaining("collision.type")] });
});

it("preserves long frame waits in both Preview and ROM export", async () => {
  const { createBlankProjectData } = await import("./newProject.js");
  const { createPreviewRuntime, runPreviewRuntimeEvent } = await import("./previewRuntime.js");
  const { buildEngineExportProjectContract } = await import("../main/exportEngineProject.js");
  const data = createBlankProjectData({ name: "Long wait", sceneType: "topdown" });
  data.events = [{ id: "long", name: "long", category: "Cena", command: "wait 2000" }];
  expect(runPreviewRuntimeEvent(createPreviewRuntime(data), "long").scriptWaitFrames).toBe(2000);
  expect(buildEngineExportProjectContract(data).topdown_project?.scripts?.find(script => script.name === "long")?.script[0]).toMatchObject({ op: "wait", frames: 2000 });
});

it.each(["topdown", "platformer"] as const)("rejects animation waits in synchronous %s restoration", async sceneType => {
  const { createBlankProjectData } = await import("./newProject.js");
  const { buildEngineExportProjectContract } = await import("../main/exportEngineProject.js");
  const data = createBlankProjectData({ name: "Restore animation wait", sceneType });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  const actorID = "restore-target";
  data.actors = [...data.actors as Record<string, unknown>[], {
    id: actorID, name: "RestoreTarget", roomID: room.id, roomName: room.name, x: 4, y: 4
  }];
  room.eventBindings = { onRestore: "restore" };
  data.events = [{ id: "restore", name: "restore", category: "Cena", steps: [
    { id: "wait", command: `wait_actor_animation ${actorID}` },
    { id: "restored", command: "set_variable restored 1" }
  ] }];
  expect(() => buildEngineExportProjectContract(data)).toThrow(/Restauração não pode aguardar/);
});
