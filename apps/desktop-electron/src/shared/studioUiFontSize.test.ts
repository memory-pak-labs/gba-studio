import { describe, expect, it, vi } from "vitest";

import {
  applyStudioUiFontSize,
  readStudioUiFontSize,
  studioUiFontScale,
  writeStudioUiFontSize
} from "./studioUiFontSize.js";

describe("studioUiFontSize", () => {
  it("falls back to the compact size when the local preference is missing or invalid", () => {
    expect(readStudioUiFontSize({ getItem: vi.fn().mockReturnValue(null) })).toBe("compact");
    expect(readStudioUiFontSize({ getItem: vi.fn().mockReturnValue("unexpected") })).toBe("compact");
  });

  it("persists the selected size for the current user", () => {
    const storage = { setItem: vi.fn() };

    writeStudioUiFontSize("large", storage);

    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:ui-font-size", "large");
  });

  it("maps each supported preference to its approved font scale", () => {
    expect(studioUiFontScale("compact")).toBe(0.9);
    expect(studioUiFontScale("default")).toBe(1);
    expect(studioUiFontScale("large")).toBe(1.15);
  });

  it("applies the selected scale to the supplied document root", () => {
    const root = {
      setAttribute: vi.fn(),
      style: { setProperty: vi.fn() }
    } as unknown as HTMLElement;

    applyStudioUiFontSize("compact", root);

    expect(root.setAttribute).toHaveBeenCalledWith("data-studio-font-size", "compact");
    expect(root.style.setProperty).toHaveBeenCalledWith("--studio-font-scale", "0.9");
  });
});
