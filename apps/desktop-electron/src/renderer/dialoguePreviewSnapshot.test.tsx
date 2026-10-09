/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";

import { dialoguePreviewLayoutForSettings, resolveDialogueUiSettings } from "../shared/sceneRuntimeExport.js";
import { deriveDialoguePreviewTextLayout, dialogueFontSourceRect } from "./dialoguePreviewSnapshot.js";

describe("dialogue font source atlas", () => {
  it("reads Unicode source cells instead of the reordered compiled glyph tiles", () => {
    expect(dialogueFontSourceRect("A")).toEqual({ x: 8, y: 16, width: 8, height: 8 });
    expect(dialogueFontSourceRect("N")).toEqual({ x: 112, y: 16, width: 8, height: 8 });
    expect(dialogueFontSourceRect(".")).toEqual({ x: 112, y: 0, width: 8, height: 8 });
    expect(dialogueFontSourceRect("é")).toEqual({ x: 72, y: 96, width: 8, height: 8 });
    expect(dialogueFontSourceRect("a")).not.toEqual(dialogueFontSourceRect("A"));
    expect(dialogueFontSourceRect("“")).toEqual(dialogueFontSourceRect('"'));
    expect(dialogueFontSourceRect("—")).toEqual(dialogueFontSourceRect("-"));
    expect(dialogueFontSourceRect("🙂")).toEqual(dialogueFontSourceRect("?"));
  });
});

describe("dialogue preview snapshot text layout", () => {
  it("reserves runtime rows for choices and marks text that continues on the next page", () => {
    const settings = {
      boxImage: "dialogue-box.png",
      selectorImage: "selector.png",
      font: "GBA padrao",
      boxWidth: 224,
      boxHeight: 40,
      boxPosition: "Inferior",
      portraitLayout: "inline" as const,
      portraitPosition: "Esquerda",
      showCharacterName: false,
      showPortrait: false,
      nameLabelMode: "inline" as const,
      textSpeed: "Normal"
    };
    const layout = dialoguePreviewLayoutForSettings(settings);

    const result = deriveDialoguePreviewTextLayout(
      settings,
      layout,
      "Nara",
      "Esta frase é longa o bastante para continuar na próxima página sem ser cortada silenciosamente.",
      ["Continuar", "Voltar"]
    );

    expect(result.rows).toBe(3);
    expect(result.lines).toHaveLength(3);
    expect(result.lines[1]).toMatch(/^! /);
    expect(result.lines[2]).toMatch(/^- /);
    expect(result.lines.every((line) => line.length <= result.columns)).toBe(true);
    expect(result.overflow).toBe(true);
  });
});

// The editor truncates only the snapshot, preserving the full source and runtime box geometry.
it("limits frozen scene text to three lines without changing dialogue settings", () => {
  const settings = resolveDialogueUiSettings({ boxHeight: 80, showCharacterName: false });
  const layout = dialoguePreviewLayoutForSettings(settings);
  const text = "Linha um\nLinha dois\nLinha tres\nLinha quatro\nLinha cinco";
  const preview = deriveDialoguePreviewTextLayout(settings, layout, "", text, [], 0, 3);
  expect(preview.lines).toHaveLength(3);
  expect(preview.lines[2]).toContain("...");
  expect(preview.overflow).toBe(true);
  expect(deriveDialoguePreviewTextLayout(settings, layout, "", text, []).lines.length).toBeGreaterThan(3);
  expect(settings.boxHeight).toBe(80);
});
