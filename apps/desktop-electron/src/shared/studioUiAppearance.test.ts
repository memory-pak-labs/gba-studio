/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_UI_APPEARANCE,
  applyStudioUiAppearance,
  readStudioUiAppearance,
  studioUiBrightness,
  studioUiTextContrastTone,
  writeStudioUiAppearance
} from "./studioUiAppearance.js";

describe("studioUiAppearance", () => {
  it("reads defaults when storage is empty and normalizes saved values", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(readStudioUiAppearance(storage)).toEqual(DEFAULT_STUDIO_UI_APPEARANCE);
    writeStudioUiAppearance({
      appBackgroundGray: 140,
      canvasBackgroundGray: -4,
      textContrast: 35.4,
      brightness: 49.6,
      contrast: "high"
    }, storage);

    expect(readStudioUiAppearance(storage)).toEqual({
      appBackgroundGray: 100,
      canvasBackgroundGray: 0,
      textContrast: 35,
      brightness: 50,
      contrast: "high"
    });
  });

  it("applies the visual contract to the document root", () => {
    const root = document.createElement("html");

    applyStudioUiAppearance({
      appBackgroundGray: 24,
      canvasBackgroundGray: 68,
      textContrast: 90,
      brightness: 20,
      contrast: "high"
    }, root);

    expect(root.getAttribute("data-studio-ui-text-contrast")).toBe("high");
    expect(root.getAttribute("data-studio-ui-contrast")).toBe("high");
    expect(root.style.getPropertyValue("--studio-ui-app-gray")).toBe("24%");
    expect(root.style.getPropertyValue("--studio-ui-canvas-gray")).toBe("68%");
    expect(root.style.getPropertyValue("--studio-ui-brightness")).toBe("0.9099999999999999");
  });

  it("keeps range semantics stable at the boundaries", () => {
    expect(studioUiTextContrastTone(0)).toBe("low");
    expect(studioUiTextContrastTone(50)).toBe("standard");
    expect(studioUiTextContrastTone(100)).toBe("high");
    expect(studioUiBrightness(0)).toBe(0.85);
    expect(studioUiBrightness(50)).toBe(1);
  });
});
