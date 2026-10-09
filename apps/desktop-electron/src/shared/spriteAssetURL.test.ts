import { afterEach, describe, expect, it, vi } from "vitest";

import {
  desktopAssetURL,
  isDesktopAssetURL,
  parseDesktopAssetURL,
  resolveAssetURL,
  resolveAssetURLWithBundledDefault,
  resolveSpriteAssetURL
} from "./spriteAssetURL.js";

describe("resolveSpriteAssetURL", () => {
  it("resolves the approved native platformer sheet before saving", () => {
    expect(resolveAssetURL(undefined, null, "platformer-player"))
      .toContain("Assets/sprites/penedos-v10-nara.png");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the current approved player sprite before the project has been saved", () => {
    const url = resolveAssetURL(
      undefined,
      "Assets/sprites/nara-topdown.png",
      "topdown-player-4dir"
    );

    expect(url).toContain("default-assets/templates/exemplo-gba/Assets/sprites/nara-topdown.png");
    expect(url).not.toBeNull();
  });

  it("resolves the current dialogue frame before the project has been saved", () => {
    const url = resolveAssetURL(
      undefined,
      "Assets/ui/frame-lumen-v2.png",
      "dialogue-box"
    );

    expect(url).toContain("default-assets/templates/exemplo-gba/Assets/ui/frame-lumen-v2.png");
    expect(url).not.toBeNull();
  });

  it("resolves template-prefixed bundled default assets before the project has been saved", () => {
    const url = resolveAssetURL(
      undefined,
      "Assets/sprites/cursor-gba-16x16.png",
      "template:exemplo-gba/Assets/sprites/cursor-gba-16x16.png"
    );

    expect(url).toContain("default-assets/templates/exemplo-gba/Assets/sprites/cursor-gba-16x16.png");
    expect(url).not.toBeNull();
  });

  it("resolves the current isometric surface before the project has been saved", () => {
    const url = resolveAssetURL(
      undefined,
      "Assets/backgrounds/tactical-v5-surface.png",
      "isometric-sandbox-tiles"
    );

    expect(url).toContain("default-assets/templates/exemplo-gba/Assets/backgrounds/tactical-v5-surface.png");
    expect(url).not.toBeNull();
  });

  it("keeps project-relative sources tied to the saved project location", () => {
    expect(resolveAssetURL(
      "/Users/matheus/Game/project.gba-project",
      "Assets/sprites/player_topdown_4dir.png",
      "topdown-player-4dir"
    )).toBe("file:///Users/matheus/Game/Assets/sprites/player_topdown_4dir.png");
  });

  it("uses the guarded Electron asset protocol for project assets during development", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:5173",
        protocol: "http:"
      }
    });

    const url = resolveAssetURL(
      "/Users/matheus/Game/project.gba-project",
      "Assets/backgrounds/market.png"
    );

    expect(url).toBe(desktopAssetURL("/Users/matheus/Game/Assets/backgrounds/market.png"));
    expect(parseDesktopAssetURL(url ?? "")).toBe("/Users/matheus/Game/Assets/backgrounds/market.png");
  });

  it("identifies only desktop asset protocol URLs as cross-origin assets", () => {
    expect(isDesktopAssetURL(desktopAssetURL("/Users/matheus/Game/Assets/sprites/hero.png"))).toBe(true);
    expect(isDesktopAssetURL("file:///Users/matheus/Game/Assets/sprites/hero.png")).toBe(false);
    expect(isDesktopAssetURL(null)).toBe(false);
  });

  it("uses the saved project path for a default asset when it is available", () => {
    expect(resolveAssetURLWithBundledDefault(
      "/Users/matheus/Game/project.gba-project",
      "Assets/tiles/isometric-sandbox-sheet.png",
      "isometric-sandbox-tiles"
    )).toBe("file:///Users/matheus/Game/Assets/tiles/isometric-sandbox-sheet.png");
  });

  it("prefers a template bundled rendering URL when no project source path is available", () => {
    const url = resolveAssetURLWithBundledDefault(
      "/Users/matheus/Game/project.gba-project",
      null,
      "template:exemplo-gba/Assets/sprites/cursor-gba-16x16.png"
    );

    expect(url).toContain("default-assets/templates/exemplo-gba/Assets/sprites/cursor-gba-16x16.png");
  });

  it("keeps the existing sprite-specific export as an alias", () => {
    expect(resolveSpriteAssetURL(
      undefined,
      "Assets/sprites/point-click-cursor.png",
      "point-click-cursor"
    )).toContain("default-assets/templates/exemplo-gba/Assets/sprites/point-click-cursor.png");
  });
});
