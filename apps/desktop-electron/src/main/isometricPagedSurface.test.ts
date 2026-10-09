import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { buildAssetcTilesetPackGeneration } from "../shared/engineProjectExport.js";
import { isometricSceneConfigFromRuntime } from "../shared/sceneTypeProfiles.js";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace.js";

function fixture() {
  const data = JSON.parse(readFileSync("default-assets/templates/exemplo-gba/exemplo-gba.gba-project", "utf8"));
  for (const rows of [data.rooms, data.scenas]) {
    const room = rows.find((r: {name: string}) => r.name === "mercado_suspenso");
    room.backgroundAssetName = "market-surface.png";
    room.tilesetAssetName = "market-surface.png";
    room.gbStudioUseBackgroundLayout = true;
    room.runtime.config.pagedSurface = { backgroundAsset: "market-surface.png", foregroundAsset: "market-front.png", width: 512, height: 344 };
  }
  for (const name of ["market-surface.png", "market-front.png"]) data.assets.push({
    id: name, name, kind: "Background", metadata: {source: `Assets/backgrounds/${name}`, kind: "paged_bg", colorMode: "8bpp-indexed", tileWidth: 8, tileHeight: 8}
  });
  return data;
}

describe("isometric paged adventure surface", () => {
  it("compares the background with its authored surface dimensions", () => {
    const data = fixture();
    data.assets.find((a: {name: string}) => a.name === "market-surface.png").metadata = {
      width: 512, height: 344
    };
    const room = deriveRoomsWorkspacePresentation(data).rooms.find(r => r.name === "mercado_suspenso")!;
    expect(room.geometryDiagnostics?.backgroundAlignment).toMatchObject({
      status: "aligned", expectedWidth: 512, expectedHeight: 344
    });
  });
  it("preserves the explicit surface through runtime normalization", () => {
    const data = fixture();
    const room = data.rooms.find((r: {name: string}) => r.name === "mercado_suspenso");
    expect(isometricSceneConfigFromRuntime(room.runtime, data.settings)?.pagedSurface).toEqual(room.runtime.config.pagedSurface);
  });
  it("exports both ROM sources without installing them as resident atlases or changing gameplay", () => {
    const data = fixture();
    const pack = buildAssetcTilesetPackGeneration(data)!;
    const back = pack.assetsBySheet["market-surface.png"];
    const front = pack.assetsBySheet["market-front.png"];
    expect(front).toBeDefined();
    expect(front.paged_palette_owner).toBe(back.name);
    expect(front.bank_groups).toEqual(["scene_mercado_suspenso"]);
    const project = buildEngineExportProjectContract(data).isometric_project!;
    const room = project.rooms.find(r => r.name === "mercado_suspenso")!;
    expect(room.paged_surface).toEqual({background: back.name, foreground: front.name, width: 512, height: 344});
    expect(room.grid).toMatchObject({gameplay_mode: "adventure", movement_model: "free"});
    expect(room.camera).toMatchObject({follow_enabled: true, bounds: {x: 0, y: 0, width: 512, height: 344}});
    expect(room.authored_background).toBeUndefined();
    expect(room.tileset).toBeUndefined();
    expect(room.tactical).toBeUndefined();
    expect(project.assets?.tile_assets).not.toContain(back.name);
    expect(project.assets?.tile_assets).not.toContain(front.name);
  });
});
