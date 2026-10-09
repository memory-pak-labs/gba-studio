import { describe, expect, it, vi } from "vitest";

import {
  applyStudioTheme,
  readStudioTheme,
  toggleStudioTheme,
  writeStudioTheme
} from "./studioTheme.js";

describe("studioTheme", () => {
  it("defaults to light theme", () => {
    const storage = { getItem: vi.fn().mockReturnValue(null) };
    expect(readStudioTheme(storage)).toBe("light");
  });

  it("persists and reads dark theme", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };

    writeStudioTheme("dark", storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:theme", "dark");

    storage.getItem.mockReturnValue("dark");
    expect(readStudioTheme(storage)).toBe("dark");
  });

  it("toggles between light and dark", () => {
    expect(toggleStudioTheme("light")).toBe("dark");
    expect(toggleStudioTheme("dark")).toBe("light");
  });

  it("applies theme attributes on the document root", () => {
    const root = {
      style: { colorScheme: "" },
      setAttribute: vi.fn(),
      getAttribute: vi.fn()
    } as unknown as HTMLElement;

    applyStudioTheme("dark", root);
    expect(root.setAttribute).toHaveBeenCalledWith("data-studio-theme", "dark");
    expect(root.style.colorScheme).toBe("dark");

    applyStudioTheme("light", root);
    expect(root.setAttribute).toHaveBeenCalledWith("data-studio-theme", "light");
    expect(root.style.colorScheme).toBe("light");
  });
});
