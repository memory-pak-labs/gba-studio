import { describe, expect, it } from "vitest";

import {
  backgroundReferenceOptions,
  sceneReferenceOptions,
  validateSceneProfileReferences,
  worldMapTargetOptions
} from "./sceneProfileReferences.js";

const project = {
  assets: [{ id: "asset-bg", name: "forest.png", kind: "Tileset" }],
  scenas: [
    { id: "vn-a", name: "chapter_a", sceneType: "visualNovel", runtime: { type: "visualNovel", config: { nextSceneIndex: 4, backgroundIndex: 2 } } },
    { id: "level-a", name: "forest_level", sceneType: "platformer", backgroundAssetName: "forest.png" },
    { id: "vn-b", name: "chapter_b", sceneType: "visualNovel", runtime: { type: "visualNovel", config: {} } },
    { id: "cut-a", name: "intro_cutscene", sceneType: "cutscene", runtime: { type: "cutscene", config: {} } },
    { id: "map-a", name: "world", sceneType: "worldMap", runtime: { type: "worldMap", config: { targetLevel: 9 } } }
  ]
};

describe("scene profile references", () => {
  it("builds stable named options using native index order", () => {
    expect(sceneReferenceOptions(project, "visualNovel")).toEqual([
      { value: 0, label: "chapter_a" },
      { value: 1, label: "chapter_b" }
    ]);
    expect(backgroundReferenceOptions(project)).toEqual([{ value: 0, label: "forest.png" }]);
    expect(worldMapTargetOptions(project)).toEqual([{ value: 0, label: "forest_level" }]);
  });

  it("reports invalid room and settings references", () => {
    expect(validateSceneProfileReferences({
      ...project,
      settings: { visualNovel: { nextSceneIndex: 8, backgroundIndex: 3 } }
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ owner: "chapter_a", field: "nextSceneIndex", value: 4 }),
      expect.objectContaining({ owner: "chapter_a", field: "backgroundIndex", value: 2 }),
      expect.objectContaining({ owner: "world", field: "targetLevel", value: 9 }),
      expect.objectContaining({ owner: "Ajustes · Visual Novel", field: "nextSceneIndex", value: 8 })
    ]));
  });
});
