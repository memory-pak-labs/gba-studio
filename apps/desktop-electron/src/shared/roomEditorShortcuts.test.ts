import { describe, expect, it } from "vitest";

import {
  ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS,
  formatRoomEditorShortcut,
  roomEditorShortcutFromKeyboardEvent,
  roomEditorShortcutIssues,
  resolveRoomEditorToolShortcuts,
  roomEditorToolModeFromShortcut
} from "./roomEditorShortcuts.js";

describe("room editor shortcuts", () => {
  it("maps the default tool keys case-insensitively", () => {
    expect(roomEditorToolModeFromShortcut("V")).toBe("select");
    expect(roomEditorToolModeFromShortcut("b")).toBe("paint");
    expect(roomEditorToolModeFromShortcut("C")).toBe("collision");
    expect(roomEditorToolModeFromShortcut("p")).toBe("warp");
    expect(roomEditorToolModeFromShortcut("r")).toBe("room");
    expect(roomEditorToolModeFromShortcut("?")).toBeNull();
  });

  it("captures portable modifier combinations from keyboard events", () => {
    expect(roomEditorShortcutFromKeyboardEvent({ key: "B", shiftKey: true })).toBe("shift+b");
    expect(roomEditorShortcutFromKeyboardEvent({ key: "k", metaKey: true, shiftKey: true })).toBe("mod+shift+k");
    expect(roomEditorShortcutFromKeyboardEvent({ code: "Digit1", key: "!", shiftKey: true })).toBe("shift+1");
    expect(roomEditorShortcutFromKeyboardEvent({ key: "Shift", shiftKey: true })).toBeNull();
  });

  it("matches configured modifier combinations without accepting missing modifiers", () => {
    const shortcuts = resolveRoomEditorToolShortcuts({ select: "mod+shift+b" });

    expect(roomEditorToolModeFromShortcut({ key: "b", ctrlKey: true, shiftKey: true }, shortcuts)).toBe("select");
    expect(roomEditorToolModeFromShortcut({ key: "b", shiftKey: true }, shortcuts)).toBeNull();
    expect(formatRoomEditorShortcut("mod+shift+b")).toBe("⌘/Ctrl+Shift+B");
  });

  it("uses valid project bindings and keeps defaults for invalid or conflicting keys", () => {
    const shortcuts = resolveRoomEditorToolShortcuts({
      actor: "q",
      collision: "q",
      paint: "invalid",
      select: "x"
    });

    expect(shortcuts).toMatchObject({
      select: "x",
      paint: ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS.paint,
      collision: "q",
      actor: ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS.actor
    });
    expect(roomEditorToolModeFromShortcut("q", shortcuts)).toBe("collision");
  });

  it("reports invalid and conflicting settings before fallback resolution", () => {
    expect(roomEditorShortcutIssues({ select: "b", paint: "b", collision: "!" })).toEqual({
      select: [{
        conflictingFieldKeys: ["paint"],
        kind: "conflict",
        message: "Conflita com Pintura."
      }],
      paint: [{
        conflictingFieldKeys: ["select"],
        kind: "conflict",
        message: "Conflita com Selecionar."
      }],
      collision: [{
        kind: "invalid",
        message: "Use uma letra ou número, com no máximo Shift, Ctrl/Cmd ou Alt."
      }]
    });
  });

  it("detects a custom key colliding with another tool default", () => {
    expect(roomEditorShortcutIssues({ select: "b" })).toMatchObject({
      select: [{ kind: "conflict", conflictingFieldKeys: ["paint"] }],
      paint: [{ kind: "conflict", conflictingFieldKeys: ["select"] }]
    });
  });

  it("reports reserved editor commands and keeps them out of fallback resolution", () => {
    expect(roomEditorShortcutIssues({ select: "mod+k" })).toMatchObject({
      select: [{ kind: "conflict", message: "Conflita com a Paleta de comandos." }]
    });
    expect(resolveRoomEditorToolShortcuts({ select: "mod+k" }).select).toBe(ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS.select);
  });
});
