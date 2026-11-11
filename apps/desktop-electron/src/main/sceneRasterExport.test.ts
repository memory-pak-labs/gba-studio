import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { defaultSceneComposition } from "../shared/sceneComposition.js";
import { normalizeSceneRasterEffects } from "../shared/sceneRasterEffects.js";
import { updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

describe("scene raster export", () => {
  it("retains authored effects, persistence and the required engine feature", () => {
    const original = createBlankProjectData({ name: "Ondas", includeStarterContent: false });
    const before = JSON.stringify(original), room = (original.rooms as any[])[0];
    const composition = defaultSceneComposition(); composition.enabled = true;
    composition.effects.raster = normalizeSceneRasterEffects({ ripple: { enabled: true }, gradient: { enabled: true } });
    const data = updateRoomFieldsInProject(original, room.id, { runtime: { type: "topdown", config: { composition } } });
    const reopened = JSON.parse(JSON.stringify(data));
    const contract = buildEngineExportProjectContract(reopened);
    expect(contract.topdown_project?.rooms[0]?.video?.raster).toEqual(composition.effects.raster);
    expect(contract.requires.features).toContain("render_runtime.scene_raster_effects");
    expect(JSON.stringify(original)).toBe(before);
  });
  it.each(["BG2", "BG3"])("rejects ripple on %s in perspective racing", layer => {
    const source = createBlankProjectData({ name: "Pista", includeStarterContent: false });
    const room = (source.rooms as any[])[0], composition = defaultSceneComposition(); composition.enabled = true;
    composition.effects.raster = normalizeSceneRasterEffects({ ripple: { enabled: true, layer } });
    const data = updateRoomFieldsInProject(source, room.id, { sceneType: "racing", runtime: { type: "racing", config: { presentation: "pseudo3d", composition } } });
    expect(() => buildEngineExportProjectContract(data)).toThrow(/ondulação exige uma camada regular/);
  });

});
