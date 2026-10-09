import { describe, expect, it, vi } from "vitest";

import {
  readExplorerRailCollapsed,
  toggleExplorerRailCollapsed,
  workspaceExplorerStorageKey,
  writeExplorerRailCollapsed
} from "./workspaceExplorerRail.js";

describe("workspaceExplorerRail", () => {
  it("builds stable storage keys per workspace", () => {
    expect(workspaceExplorerStorageKey("rooms")).toBe("gba-studio:explorer:rooms");
  });

  it("persists collapsed and expanded states", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };

    writeExplorerRailCollapsed("rooms", true, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:explorer:rooms", "collapsed");

    storage.getItem.mockReturnValue("collapsed");
    expect(readExplorerRailCollapsed("rooms", storage)).toBe(true);

    writeExplorerRailCollapsed("rooms", false, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:explorer:rooms", "expanded");

    storage.getItem.mockReturnValue("expanded");
    expect(readExplorerRailCollapsed("rooms", storage)).toBe(false);
  });

  it("toggles collapsed state", () => {
    expect(toggleExplorerRailCollapsed(false)).toBe(true);
    expect(toggleExplorerRailCollapsed(true)).toBe(false);
  });
});
