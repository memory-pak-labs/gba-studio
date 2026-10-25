import { expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it.each(["topdown", "platformer"] as const)("exports visibility presets for %s", kind => {
  const data = createBlankProjectData({ name: "Visibility", sceneType: kind });
  data.events = [{ id: "light", name: "light", category: "Cena", steps: [
    { command: "lantern player 80 64 75 180" }, { command: "reveal_area player 24 24 100 60" }, { command: "clear_visibility" },
    { command: "lantern player 120 120 58 3600 circle" }
  ] }];
  const contract = buildEngineExportProjectContract(data);
  const project = kind === "topdown" ? contract.topdown_project! : contract.platformer_project!;
  expect(project.scripts).toEqual(expect.arrayContaining([expect.objectContaining({ name: "light", script: [
    { op: "visibility", effect: "lantern", actor: -1, width: 80, height: 64, intensity: 75, frames: 180 },
    { op: "visibility", effect: "reveal", actor: -1, width: 24, height: 24, intensity: 100, frames: 60 },
    { op: "visibility", effect: "clear", actor: -1, width: 8, height: 8, intensity: 0, frames: 0 },
    { op: "visibility", effect: "lantern", actor: -1, width: 120, height: 120, intensity: 58, frames: 3600, shape: "circle" }
  ] })]));
});
