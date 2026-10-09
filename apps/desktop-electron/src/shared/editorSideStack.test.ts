import { describe, expect, it, vi } from "vitest";

import {
  clampEditorSideStackWidth,
  clampEditorSideStackSplit,
  DEFAULT_EDITOR_SIDE_STACK_WIDTH,
  DEFAULT_EDITOR_SIDE_STACK_SPLIT,
  readEditorSideStackCollapsed,
  readEditorSideStackSplit,
  readEditorSideStackWidth,
  writeEditorSideStackCollapsed,
  writeEditorSideStackSplit,
  writeEditorSideStackWidth
} from "./editorSideStack.js";

describe("editorSideStack", () => {
  it("clamps split ratios inside the supported range", () => {
    expect(clampEditorSideStackSplit(0.1)).toBe(0.24);
    expect(clampEditorSideStackSplit(0.5)).toBe(0.5);
    expect(clampEditorSideStackSplit(0.9)).toBe(0.72);
    expect(clampEditorSideStackSplit(Number.NaN)).toBe(DEFAULT_EDITOR_SIDE_STACK_SPLIT);
  });

  it("persists split ratio and collapsed state per workspace", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };

    expect(readEditorSideStackSplit("rooms", storage)).toBe(DEFAULT_EDITOR_SIDE_STACK_SPLIT);
    writeEditorSideStackSplit("rooms", 0.58, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:editor-side:v2:rooms:split", "0.58");

    storage.getItem.mockImplementation((key: string) => (
      key === "gba-studio:editor-side:v2:rooms:split" ? "0.58" : null
    ));
    expect(readEditorSideStackSplit("rooms", storage)).toBe(0.58);

    expect(readEditorSideStackCollapsed("rooms", storage)).toBe(false);
    writeEditorSideStackCollapsed("rooms", true, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:editor-side:v2:rooms:collapsed", "collapsed");

    storage.getItem.mockImplementation((key: string) => (
      key === "gba-studio:editor-side:v2:rooms:collapsed" ? "collapsed" : null
    ));
    expect(readEditorSideStackCollapsed("rooms", storage)).toBe(true);
  });

  it("clamps and persists horizontal inspector width per workspace", () => {
    expect(clampEditorSideStackWidth(280)).toBe(320);
    expect(clampEditorSideStackWidth(520)).toBe(520);
    expect(clampEditorSideStackWidth(900)).toBe(760);
    expect(clampEditorSideStackWidth(Number.NaN)).toBe(DEFAULT_EDITOR_SIDE_STACK_WIDTH);

    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn()
    };

    expect(readEditorSideStackWidth("rooms", storage)).toBe(DEFAULT_EDITOR_SIDE_STACK_WIDTH);
    writeEditorSideStackWidth("rooms", 540, storage);
    expect(storage.setItem).toHaveBeenCalledWith("gba-studio:editor-side:v2:rooms:width", "540");

    storage.getItem.mockImplementation((key: string) => (
      key === "gba-studio:editor-side:v2:rooms:width" ? "540" : null
    ));
    expect(readEditorSideStackWidth("rooms", storage)).toBe(540);
  });
});
