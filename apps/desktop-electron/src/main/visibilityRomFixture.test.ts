import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it.each(["topdown", "platformer"] as const)("exports actor visibility and combined graphics scripts for %s", async kind => {
  let data = createBlankProjectData({ name: "Visibility ROM verification", sceneType: kind });
  data = createRoomInProject(data, { id: "other", name: "other", width: 30, height: 20, sceneType: kind });
  const rooms = data.rooms as Record<string, unknown>[];
  const room = rooms[0]!;
  const actors = data.actors as Record<string, unknown>[];
  actors.push({ ...structuredClone(actors[0]!), id: "guide", name: "Guide", roomName: room.name, x: 16, y: 12, eventBindings: {} });
  const event = (name: string, commands: string[]) => ({ id: name, name, category: "Cena", roomName: room.name, steps: commands.map(command => ({ command })) });
  data.events = [
    event("lantern_player", ["lantern player 80 64 75 240"]),
    event("clear", ["clear_visibility"]),
    event("reveal_player", ["reveal_area player 24 24 100 120"]),
    event("lantern_guide", ["lantern Guide 64 48 75 240"]),
    event("move_guide", ["set_actor_position Guide 22 12", "lantern Guide 64 48 75 240"]),
    event("graphics_combo", [
      "set_variable graphics.mode 1", "visual_effect mask all 48 100 cover", "wait 1",
      "visual_effect fade all 48 50", "wait 8", "set_variable graphics.mode 2", "wait 8",
      "set_variable graphics.mode 0", "wait 8", "change_scene other 10 12", "visual_effect mask all 48 100 reveal"
    ]),
    event("boot", ["attach_button a lantern_player true", "attach_button b clear true", "attach_button l reveal_player true", "attach_button select lantern_guide true", "attach_button r move_guide true", "attach_button start graphics_combo true", "attach_button down cover_test true"]),
    event("cover_test", ["visual_effect mask all 4 100 cover", "wait 8", "set_variable graphics.cover 1", "wait 8", "visual_effect mask all 4 100 reveal"])
  ];
  for (const current of rooms) current.eventBindings = { onInit: "boot" };
  const contract = buildEngineExportProjectContract(data);
  const project = kind === "topdown" ? contract.topdown_project! : contract.platformer_project!;
  expect(project.rooms).toHaveLength(2);
  expect(project.scripts?.find(script => script.name === "lantern_guide")?.script[0]).toMatchObject({ op: "visibility", actor: 0, width: 64, height: 48 });
  expect(project.scripts?.find(script => script.name === "graphics_combo")?.script).toEqual(expect.arrayContaining([{ op: "visual_effect", effect: "fade", layer: "all", frames: 48, intensity: 50 }]));
  const root = process.env.GBA_STUDIO_VISIBILITY_FIXTURE_ROOT;
  if (root) {
    await mkdir(root, { recursive: true });
    const settings = data.settings as Record<string, unknown>;
    const build = settings.build as Record<string, unknown>;
    if (process.env.GBA_STUDIO_VISIBILITY_ENGINE_PACK) build.enginePackPath = process.env.GBA_STUDIO_VISIBILITY_ENGINE_PACK;
    const combo = project.scripts!.find(script => script.name === "graphics_combo")!;
    const cover = project.scripts!.find(script => script.name === "cover_test")!.script.find(command => command.op === "set_variable")!;
    await writeFile(path.join(root, kind + ".json"), JSON.stringify({ scripts: project.scripts, boot: project.rooms[0]!.on_enter, modeVariable: combo.script[0]!.variable, coverVariable: cover.variable }, null, 2));
    await writeFile(path.join(root, kind + ".gba-project"), JSON.stringify(data, null, 2));
  }
});
