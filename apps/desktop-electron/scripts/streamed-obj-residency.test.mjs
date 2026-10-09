import { describe, expect, it } from "vitest";
import { auditStreamedObjResidency } from "./streamed-obj-residency.mjs";

function header() {
  return `constexpr int hero_tile_count = 16;
const gbs::TileAsset hero_tile_asset = { reinterpret_cast<const uint8_t*>(hero_tiles), hero_tile_count, 32, true };
const gbs::TileAsset hero_frame_0_tile_asset = { reinterpret_cast<const uint8_t*>(hero_frame_0_tiles), 16, 32, true };
const gbs::TileAsset hero_frame_1_tile_asset = { reinterpret_cast<const uint8_t*>(hero_frame_1_tiles), 16, 32, true };
constexpr gbs::SpriteAnimationFrame hero_animation_frames[2] = {
    { hero_metasprites[0], 8, &hero_frame_0_tile_asset },
    { hero_metasprites[1], 8, &hero_frame_1_tile_asset },
};`;
}

function audit(headerSource = header(), options = {}) {
  return auditStreamedObjResidency({
    headerSource, symbol: "hero", frameCount: 2, frameWidth: 32,
    frameHeight: 32, residentTileCount: 16, ...options
  });
}

describe("streamed OBJ residency", () => {
  it("checks one resident frame and both distinct frame uploads", () => {
    expect(audit()).toMatchObject({ ok: true, residentTileCount: 16, destinationTile: 32 });
  });

  it.each([
    ["whole sheet resident", () => header().replace("hero_tile_count = 16", "hero_tile_count = 32")],
    ["missing upload", () => header().replace(/const gbs::TileAsset hero_frame_1_tile_asset[^\n]*\n/, "")],
    ["wrong upload size", () => header().replace("hero_frame_1_tiles), 16", "hero_frame_1_tiles), 15")],
    ["different VRAM destination", () => header().replace("hero_frame_1_tiles), 16, 32", "hero_frame_1_tiles), 16, 48")],
    ["wrong pixel table", () => header().replace("(hero_frame_1_tiles)", "(hero_frame_0_tiles)")],
    ["duplicate frame upload", () => header().replace("&hero_frame_1_tile_asset", "&hero_frame_0_tile_asset")],
    ["wrong metasprite binding", () => header().replace("hero_metasprites[1]", "hero_metasprites[0]")],
    ["wrong animation length", () => header().replace("hero_animation_frames[2]", "hero_animation_frames[3]")],
    ["background tiles", () => header().replaceAll("32, true", "32, false")]
  ])("rejects %s", (_label, broken) => {
    expect(audit(broken()).ok).toBe(false);
  });

  it("rejects geometry and an invalid symbol", () => {
    expect(audit(header(), { frameWidth: 31 }).ok).toBe(false);
    expect(audit(header(), { residentTileCount: 8 }).ok).toBe(false);
    expect(audit(header(), { symbol: "hero.*" }).ok).toBe(false);
  });
});
