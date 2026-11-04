import { it, expect } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { readFileSync } from "node:fs";
import type { GBAProjectData } from "./projectFile.js";

it("carries authored scale through every native runtime export", () => {
  const data = JSON.parse(readFileSync("default-assets/templates/exemplo-gba/exemplo-gba.gba-project", "utf8")) as GBAProjectData;
  for (const animation of data.animations as Record<string, unknown>[]) { animation.scaleX = 1.25; animation.scaleY = 0.75; }
  const contract = buildEngineExportProjectContract(data);
  const profiles = Object.entries(contract).filter(([key, value]) => key.endsWith("_project") && value && key !== "mixed_project");
  expect(profiles).toHaveLength(13);
  expect(contract.requires.features).toContain("sprite_animation_scale");
  const missing = profiles.filter(([, exported]) => !JSON.stringify(exported).includes('"scale_x256":320')).map(([profile]) => profile);
  expect(missing).toEqual([]);
});
