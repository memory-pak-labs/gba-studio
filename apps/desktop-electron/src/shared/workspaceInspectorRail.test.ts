import { describe, expect, it, vi } from "vitest";

import {
  readInspectorRailCollapsed,
  toggleInspectorRailCollapsed,
  workspaceInspectorStorageKey,
  writeInspectorRailCollapsed
} from "./workspaceInspectorRail.js";

describe("workspaceInspectorRail", () => {
  it("builds stable storage keys per workspace", () => {
    expect(workspaceInspectorStorageKey("events")).toBe("gba-studio:inspector:events");
  });

  it("persists collapsed and expanded states", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };

    writeInspectorRailCollapsed("rooms", true, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:inspector:rooms", "collapsed");

    storage.getItem.mockReturnValue("collapsed");
    expect(readInspectorRailCollapsed("rooms", storage)).toBe(true);

    writeInspectorRailCollapsed("rooms", false, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:inspector:rooms", "expanded");

    storage.getItem.mockReturnValue("expanded");
    expect(readInspectorRailCollapsed("rooms", storage)).toBe(false);
  });

  it("toggles collapsed state", () => {
    expect(toggleInspectorRailCollapsed(false)).toBe(true);
    expect(toggleInspectorRailCollapsed(true)).toBe(false);
  });
});
