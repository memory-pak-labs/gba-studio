import { describe, expect, it } from "vitest";
import {
  cameraModeDescription,
  cameraModeLabel,
  centerRoomCameraBounds,
  defaultRoomCameraBounds,
  exportCameraModeId,
  GBA_VIEWPORT_TILES,
  normalizeCameraModeId,
  normalizeRoomCameraBounds,
  normalizeRoomCameraZoom,
  normalizeRoomParallaxSettings,
  parallaxModeDescription,
  parallaxModeLabel,
  roomExceedsGbaViewport,
  roomInspectorCameraModeOptions,
  roomInspectorParallaxOptions
} from "./roomCamera.js";

describe("roomCamera", () => {
  it("normalizes legacy camera mode labels to stable ids", () => {
    expect(normalizeCameraModeId("Fixed")).toBe("fixed_center");
    expect(normalizeCameraModeId("Fixa no centro")).toBe("fixed_center");
    expect(normalizeCameraModeId("Follow Player")).toBe("follow_player");
    expect(normalizeCameraModeId("Seguir jogador")).toBe("follow_player");
    expect(cameraModeLabel("follow_player")).toBe("Seguir jogador");
    expect(cameraModeDescription("fixed_center")).toContain("centralizada");
    expect(exportCameraModeId("Fixa no centro")).toBe("fixed");
    expect(exportCameraModeId("Follow Player")).toBe("follow");
  });

  it("exposes camera mode options for the room inspector", () => {
    expect(roomInspectorCameraModeOptions().map((option) => option.value)).toEqual([
      "fixed_center",
      "follow_player",
      "fixed_position",
      "manual"
    ]);
  });

  it("gates camera bound editing when the room exceeds the GBA viewport", () => {
    expect(GBA_VIEWPORT_TILES).toEqual({ width: 30, height: 20 });
    expect(roomExceedsGbaViewport(30, 20)).toBe(false);
    expect(roomExceedsGbaViewport(31, 20)).toBe(true);
    expect(roomExceedsGbaViewport(30, 21)).toBe(true);
  });

  it("normalizes and centers camera bounds inside the room", () => {
    expect(defaultRoomCameraBounds(40, 30)).toEqual({ x: 5, y: 5, width: 30, height: 20 });
    expect(normalizeRoomCameraBounds({ x: -4, y: 99, width: 80, height: 1 }, 40, 30)).toEqual({
      x: 0,
      y: 29,
      width: 40,
      height: 1
    });
    expect(centerRoomCameraBounds(40, 30, { width: 20, height: 10 })).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 10
    });
  });

  it("normalizes scene camera zoom to the editor-supported range", () => {
    expect(normalizeRoomCameraZoom(undefined)).toBe(100);
    expect(normalizeRoomCameraZoom(175)).toBe(175);
    expect(normalizeRoomCameraZoom(10)).toBe(50);
    expect(normalizeRoomCameraZoom(900)).toBe(400);
  });

  it("normalizes parallax modes and defaults to disabled", () => {
    expect(normalizeRoomParallaxSettings(null)).toEqual({
      mode: "disabled",
      offsetX: 0,
      offsetY: 0,
      speedX: 256,
      speedY: 256
    });
    expect(normalizeRoomParallaxSettings({ mode: "BG3", offsetX: 2, speedX: -1 })).toMatchObject({
      mode: "bg3",
      offsetX: 2,
      speedX: 0
    });
    expect(parallaxModeLabel("disabled")).toBe("Desativada");
    expect(parallaxModeDescription("disabled")).toContain("Desativada");
    expect(roomInspectorParallaxOptions().map((option) => option.value)).toEqual([
      "disabled",
      "bg3",
      "bg2_bg3",
      "bg1_bg2_bg3"
    ]);
  });
});
