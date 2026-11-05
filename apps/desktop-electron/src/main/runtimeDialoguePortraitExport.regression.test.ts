import { expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it.each([
  ["isometric", "isometric_project"],
  ["racing", "racing_project"],
  ["shmup", "shmup_project"],
  ["pointAndClick", "point_click_project"],
  ["battleRpg", "battle_rpg_project"]
] as const)("keeps a configured dialogue portrait resolvable in %s", (sceneType, field) => {
  const data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Portrait contract" }), {
    id: "scene", name: "Scene", sceneType, width: 30, height: 20
  });
  data.dialogues = [{ key: "guide", text: "Hello", speaker: "Guide", portrait: "neutral-portrait.png" }];
  const exported = buildEngineExportProjectContract(data);
  const profile = exported[field] as { dialogue_lines?: unknown[]; portrait_assets?: unknown[] };
  expect(profile.dialogue_lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ portrait: "neutral-portrait.png" })
  ]));
  expect(profile.portrait_assets).toEqual([
    { name: "neutral-portrait.png", metasprite: { asset: "neutral_portrait", index: 0 } }
  ]);
  expect(exported.asset_pack?.assets).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "neutral_portrait", kind: "obj" })
  ]));
});
