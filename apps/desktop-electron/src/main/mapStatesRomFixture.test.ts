import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it.each(["topdown", "platformer"] as const)("exports complete door state scripts for the %s ROM fixture", async kind => {
const data = createBlankProjectData({ name: "Map state ROM verification", sceneType: kind });
const room = (data.rooms as Record<string, unknown>[])[0]!;
room.mapStates = [{ id: "door", name: "Door", variable: "map.door", variants: [
  { id: "closed", value: 0, tiles: [12, 13].map(y => ({ x: 12, y, tile: 2, count: 1, layer: "bg2", collision: "solid" })) },
  { id: "open", value: 1, tiles: [12, 13].map(y => ({ x: 12, y, tile: 1, count: 1, layer: "bg2", collision: "free" })) }
] }];
data.events = ["open", "closed"].map(variant => ({ id: variant, name: variant, category: "Cena", roomName: room.name, command: `set_map_state door ${variant}` }));
const contract = buildEngineExportProjectContract(data);
const project = kind === "topdown" ? contract.topdown_project! : contract.platformer_project!;
expect(project.rooms[0]!.on_restore).toHaveLength(8);
expect(project.scripts?.map(script => script.name)).toEqual(expect.arrayContaining(["open", "closed"]));
const output = process.env.GBA_STUDIO_MAP_STATE_FIXTURE_ROOT;
if (output) {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, kind + ".json"), JSON.stringify({ restore: project.rooms[0]!.on_restore, scripts: project.scripts }, null, 2));
}
});
