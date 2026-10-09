import { describe, expect, it } from "vitest";
import {
  auditProjectDialogueAssetWarnings,
  auditProjectDialogueUiBoxImageWarnings,
  auditProjectDialogueUiFontWarnings,
  auditProjectEventReferenceWarnings
} from "./eventReferenceAudit.js";

describe("auditProjectEventReferenceWarnings", () => {
  it("flags missing dialogue, audio, room and event references", () => {
    const warnings = auditProjectEventReferenceWarnings({
      scenas: [{ name: "start", width: 10, height: 10 }],
      dialogues: [{ key: "intro", text: "Oi" }],
      audioItems: [{ name: "theme.mod", kind: "Music" }],
      events: [
        {
          name: "broken",
          steps: [
            { command: "show_dialogue missing" },
            { command: "play_music missing" },
            { command: "change_scene missing_room" },
            { command: "call_event missing_event" },
            { command: "switch_variable route 0 missing_case" },
            { command: "repeat_expression counter lt 10 missing_loop 3" }
          ]
        }
      ]
    });

    expect(warnings).toEqual([
      "Referencia: dialogo ausente em broken (missing).",
      "Referencia: audio ausente em broken (missing).",
      "Referencia: room ausente em broken (missing_room).",
      "Referencia: evento ausente em broken (missing_event).",
      "Referencia: evento ausente em broken (missing_case).",
      "Referencia: evento ausente em broken (missing_loop)."
    ]);
  });

  it("returns no warnings when references resolve", () => {
    expect(auditProjectEventReferenceWarnings({
      scenas: [{ name: "start", width: 10, height: 10 }],
      dialogues: [{ key: "intro", text: "Oi" }],
      audioItems: [{ name: "theme.mod", kind: "Music" }],
      events: [
        { name: "boot", steps: [{ command: "show_dialogue intro" }] },
        { name: "music", steps: [{ command: "play_music theme.mod" }] },
        { name: "warp", steps: [{ command: "change_scene start" }] },
        { name: "caller", steps: [{ command: "call_event boot" }] }
      ]
    })).toEqual([]);
  });
});

describe("auditProjectDialogueAssetWarnings", () => {
  it("flags missing portrait, emote and dialogue audio assets", () => {
    const warnings = auditProjectDialogueAssetWarnings({
      dialogues: [{
        key: "intro",
        text: "Oi",
        portrait: "missing.png",
        emote: "Smile.png",
        textSound: "text_blip.wav",
        confirmSound: "confirm.wav"
      }],
      assets: [{ name: "Smile.png", kind: "Emote" }],
      audioItems: [{ name: "text_blip.wav", kind: "SFX" }]
    });

    expect(warnings).toEqual([
      "Referencia: portrait ausente em dialogo intro (missing.png).",
      "Referencia: confirmSound ausente em dialogo intro (confirm.wav)."
    ]);
  });
});

describe("auditProjectDialogueUiFontWarnings", () => {
  it("warns when uiDialogs.font points to a custom asset missing from the project", () => {
    expect(auditProjectDialogueUiFontWarnings({
      settings: {
        uiDialogs: { font: "ui/dialogue_font.png" }
      }
    })).toEqual([
      'Fonte custom "ui/dialogue_font.png" selecionada, mas nenhum asset do projeto com esse nome pode ser convertido para a ROM.'
    ]);
  });

  it("ignores built-in font labels that are not asset paths", () => {
    expect(auditProjectDialogueUiFontWarnings({
      settings: {
        uiDialogs: { font: "gba_variable_width" }
      }
    })).toEqual([]);
  });
});

describe("auditProjectDialogueUiBoxImageWarnings", () => {
  it("warns when uiDialogs.boxImage does not match any project asset", () => {
    expect(auditProjectDialogueUiBoxImageWarnings({
      settings: {
        uiDialogs: { boxImage: "does_not_exist.png" }
      }
    })).toEqual([
      'Caixa de dialogo custom "does_not_exist.png" exportada em dialogue_ui.box_image, mas nenhum asset do projeto tem esse nome.'
    ]);
  });

  it("does not warn when uiDialogs.boxImage matches an existing project asset", () => {
    expect(auditProjectDialogueUiBoxImageWarnings({
      settings: {
        uiDialogs: { boxImage: "dialogue_box.png" }
      },
      assets: [{ name: "dialogue_box.png", kind: "UI" }]
    })).toEqual([]);
  });
});
