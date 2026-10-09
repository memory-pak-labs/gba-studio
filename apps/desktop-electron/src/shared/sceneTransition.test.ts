import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCENE_TRANSITION_CONFIG,
  normalizeSceneTransition,
  sceneTransitionDisplayName,
  sceneTransitionFromProjectSettings,
  sceneTransitionVisualEffect,
  sceneTransitionUsesFade,
  sceneTransitionUsesVisualEffect
} from "./sceneTransition.js";

describe("scene transition config", () => {
  it("normalizes absent and out-of-range connection data while accepting the supported styles", () => {
    expect(normalizeSceneTransition(undefined)).toEqual(DEFAULT_SCENE_TRANSITION_CONFIG);
    expect(normalizeSceneTransition({ style: "slide", durationFrames: 9999, fadeOut: "yes" })).toEqual({
      style: "slide",
      durationFrames: 600,
      fadeOut: true,
      fadeIn: true
    });
  });

  it("only activates a fade when the style, duration and direction make it observable", () => {
    expect(sceneTransitionUsesFade({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "cut" })).toBe(false);
    expect(sceneTransitionUsesFade({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "fade", durationFrames: 0 })).toBe(false);
    expect(sceneTransitionUsesFade({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "fade", fadeOut: false, fadeIn: false })).toBe(false);
    expect(sceneTransitionUsesFade({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "fade" })).toBe(true);
  });

  it("accepts the compositor styles used by scene connections", () => {
    expect(normalizeSceneTransition({ style: "fade-color" }).style).toBe("fade-color");
    expect(normalizeSceneTransition({ style: "wipe" }).style).toBe("wipe");
    expect(normalizeSceneTransition({ style: "mosaic" }).style).toBe("mosaic");
    expect(normalizeSceneTransition({ style: "slide" }).style).toBe("slide");
    expect(normalizeSceneTransition({ style: "crossfade" }).style).toBe("crossfade");
    expect(sceneTransitionVisualEffect({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "slide" })).toBe("push");
    expect(sceneTransitionVisualEffect({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "crossfade" })).toBe("color_fade");
    expect(sceneTransitionUsesVisualEffect({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "wipe" })).toBe(true);
    expect(sceneTransitionUsesVisualEffect({ ...DEFAULT_SCENE_TRANSITION_CONFIG, style: "cut" })).toBe(false);
  });

  it("keeps user-facing labels aligned with the shared transition contract", () => {
    expect(sceneTransitionDisplayName("slide")).toBe("Deslize lateral");
    expect(sceneTransitionDisplayName("crossfade")).toBe("Crossfade de paleta");
  });

  it("resolves project defaults and the previous labels into the connection contract", () => {
    expect(sceneTransitionFromProjectSettings({
      style: "mosaic",
      durationFrames: 18,
      fadeOut: false,
      fadeIn: true
    })).toEqual({ style: "mosaic", durationFrames: 18, fadeOut: false, fadeIn: true });
    expect(sceneTransitionFromProjectSettings({
      defaultStyle: "Fade preto",
      duration: "0,5 s",
      onSceneChange: true
    })).toEqual({ style: "fade", durationFrames: 30, fadeOut: true, fadeIn: true });
  });
});
