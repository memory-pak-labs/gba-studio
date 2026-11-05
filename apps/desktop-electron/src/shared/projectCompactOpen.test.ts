import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateRoomSchemaCoverage } from "../../../../packages/project-contract/src/index.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { openProjectFile } from "../main/projectPersistence.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "./projectFile.js";
import { expandProjectTilemaps, normalizeProjectTilemaps } from "./projectResourceFormat.js";

describe("opening compact project tilemaps", () => {
  it("preserves stored grids in structural parsing and normalizes them for runtime consumers", () => {
    const stored = {
      name: "Saved track",
      editorState: { selectedScene: "track" },
      rooms: [{
        name: "track", width: 4, height: 2,
        tilemap: { encoding: "metatile-v1", width: 4, height: 2, blockWidth: 2, blockHeight: 2,
          dictionary: [[1, 2, 3, 4], [5, 6, 7, 8]], indices: [0, 1] },
        collisionTypes: { encoding: "rle-v1", length: 8, runs: [["free", 4], ["solid", 4]] },
        tileLayers: [{ mapping: "BG2", tilemap: { encoding: "rle-v1", length: 8, runs: [[9, 8]] } }],
        customSceneMetadata: { author: "preserved" }
      }]
    };
    const opened = parseGBAProjectFile(JSON.stringify(stored));
    expect(opened.data.rooms).toEqual(stored.rooms);
    const normalized = normalizeProjectTilemaps(opened.data);
    expect(normalized.rooms).toEqual([expect.objectContaining({
      tilemap: [1, 2, 5, 6, 3, 4, 7, 8],
      collisionTypes: ["free", "free", "free", "free", "solid", "solid", "solid", "solid"],
      tileLayers: [expect.objectContaining({ mapping: "BG2", tilemap: Array(8).fill(9) })],
      customSceneMetadata: { author: "preserved" }
    })]);
    expect(opened.data.editorState).toEqual(stored.editorState);
    expect(validateRoomSchemaCoverage(opened.data)).toEqual([]);
    expect(parseGBAProjectFile(serializeGBAProjectFile(opened)).data).toEqual(opened.data);
  });

  it("opens circuito_perspectiva and exports the same racing data as its expanded map", async () => {
    const projectURL = new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url);
    const raw = readFileSync(projectURL, "utf8");
    const expanded = expandProjectTilemaps(JSON.parse(raw));
    const result = await openProjectFile(fileURLToPath(projectURL));
    expect(result.error).toBeUndefined();
    const opened = result.project!.data;
    const track = (opened.scenas as Array<Record<string, unknown>>).find(scene => scene.name === "circuito_perspectiva")!;
    expect(Array.isArray(track.tilemap)).toBe(true);
    expect(track.tilemap).toHaveLength(64 * 64);
    expect(validateRoomSchemaCoverage(opened)).toEqual([]);
    expect(opened).toEqual(expanded);
    const expected = buildEngineExportProjectContract(expanded).racing_project;
    expect(buildEngineExportProjectContract(opened).racing_project).toEqual(expected);
    expect(buildEngineExportProjectContract(JSON.parse(raw)).racing_project).toEqual(expected);
  });

  it("rejects an out-of-range metatile index instead of opening a partial map", () => {
    expect(() => normalizeProjectTilemaps({
      scenas: [{ name: "broken", width: 2, height: 2,
        tilemap: { encoding: "metatile-v1", width: 2, height: 2, blockWidth: 2, blockHeight: 2,
          dictionary: [[1, 2, 3, 4]], indices: [1] }
      }]
    })).toThrow(/metatiles/);
  });

  it("rejects metatiles with a different room shape even when cell counts match", () => {
    expect(() => normalizeProjectTilemaps({
      rooms: [{ name: "wrong-shape", width: 4, height: 2,
        tilemap: { encoding: "metatile-v1", width: 2, height: 4, blockWidth: 2, blockHeight: 2,
          dictionary: [[1, 2, 3, 4]], indices: [0, 0] }
      }]
    })).toThrow(/dimens/i);
  });
});
