import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, dispatchPreviewRuntimeAction, tickPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";
import { verifyInputReplayCheckpoint, type InputReplay } from "./inputReplay.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";

it("replays the same button sequence through Preview and the compiled ROM checkpoint contract", async () => {
  const data = createBlankProjectData({ name: "Replay", sceneType: "topdown" });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  room.width = 64; room.height = 32; room.tilemap = Array(64 * 32).fill(1);
  room.mapStates = [{ id: "door", name: "Door", variable: "map.door", variants: [
    { id: "closed", value: 0, tiles: [12,13].map(y => ({ x: 12, y, tile: 2, count: 1, layer: "bg2", collision: "solid" })) },
    { id: "open", value: 1, tiles: [12,13].map(y => ({ x: 12, y, tile: 1, count: 1, layer: "bg2", collision: "free" })) }
  ] }];
  data.eventDiagnostics = true;
  data.actors = [...data.actors as Record<string, unknown>[], ...Array.from({ length: 12 }, (_, index) => ({ id: `crate-${index}`, name: `crate-${index}`, roomName: room.name, x: 10 + index * 2, y: 20 }))];
  const bindings = ["attach_button a open true", "attach_button start save true", "attach_button b closed true", "attach_button select load true"];
  data.events = [
    ["open", ["set_map_state door open"]], ["closed", ["set_map_state door closed"]], ["save", ["save_game 0"]], ["load", ["load_game 0"]], ["boot", bindings], ["restore", ["if_variable map.door 1", ...Array.from({ length: 12 }, (_, i) => 11 - i).flatMap(i => [`set_actor_visible crate-${i} false`, `set_actor_collision_enabled crate-${i} false`]), "condition_end", ...bindings]]
  ].map(([name, commands]) => ({ id: name, name, category: "Replay", roomName: room.name, steps: (commands as string[]).map((command,index) => ({ id: `${name}-${index}`, command })) }));
  room.eventBindings = { onInit: "boot", onRestore: "restore" };
  let state = createPreviewRuntime(data);
  const inputs = [{ button: 1, action: "action" }, { button: 8, action: "start" }, { button: 2, action: "back" }, { button: 4, action: "select" }] as const;
  const checkpoints: InputReplay["checkpoints"] = {};
  for (const [index, input] of inputs.entries()) {
    state = dispatchPreviewRuntimeAction(state, input.action);
    for (let frame = 0; frame < 32; ++frame) state = tickPreviewRuntime(state, 1000 / 60);
    checkpoints[index] = { variables: { "map.door": Number(state.variables["map.door"] ?? 0) }, collision: { cell: 12 + 12 * 64, type: state.currentRoom!.collisionTypes[12 + 12 * 64]! } };
  }
  expect(Object.values(checkpoints).map(checkpoint => checkpoint.variables?.["map.door"])).toEqual([1, 1, 0, 1]);
  expect(state.actors.find(actor => actor.id === "crate-0")?.visible).toBe(false);
  const contract = buildEngineExportProjectContract(data).topdown_project!;
  const output = process.env.GBA_STUDIO_EVENT_REPLAY_ROOT;
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "contract.json"), JSON.stringify({ restore: contract.rooms[0]!.on_restore, scripts: contract.scripts }, null, 2));
    await writeFile(path.join(output, "expected.json"), JSON.stringify({ inputs, checkpoints }, null, 2));
    if (process.env.GBA_STUDIO_EVENT_REPLAY_VERIFY === "1") {
      const actual = JSON.parse(await readFile(path.join(output, "actual.json"), "utf8"));
      for (const [frame, checkpoint] of Object.entries(actual.checkpoints)) expect(verifyInputReplayCheckpoint({ checkpoints } as InputReplay, Number(frame), checkpoint as never), `first divergence at checkpoint ${frame}`).toEqual({ ok: true, differences: [] });
      expect(actual.checkpoints).toHaveProperty("3");
    }
  }
});

it("expires the pressed-button condition after the frame that received the input", () => {
  const data = createBlankProjectData({ name: "Button lifetime", sceneType: "topdown" });
  const room = (data.rooms as Record<string, unknown>[])[0]!;
  room.eventBindings = { onInit: "boot" };
  data.events = [
    { id: "boot", name: "boot", category: "Cena", command: "attach_button a check true" },
    { id: "check", name: "check", category: "Cena", steps: [{ command: "if_button a" }, { command: "set_variable pressed 1" }] }
  ];
  let state = dispatchPreviewRuntimeAction(createPreviewRuntime(data), "action");
  expect(state.variables.pressed).toBe(1);
  state = tickPreviewRuntime(state, 1000 / 60);
  state = { ...state, variables: { ...state.variables, pressed: 0 } };
  state = runPreviewRuntimeEvent(state, "check");
  expect(state.variables.pressed).toBe(0);
});
