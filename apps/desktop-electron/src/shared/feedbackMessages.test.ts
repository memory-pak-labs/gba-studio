import { describe, expect, it } from "vitest";

import {
  exportArtifactFeedback,
  saveProjectFeedback,
  settingsPathValidationFeedback
} from "./feedbackMessages.js";

describe("feedback messages", () => {
  it("promotes project save success to toast-worthy success feedback", () => {
    expect(saveProjectFeedback({ canceled: false, path: "/tmp/game/topdown.gba-project" })).toEqual({
      message: "Projeto salvo: topdown.gba-project",
      tone: "success"
    });
  });

  it("promotes project save failures to error feedback and cancellations to status-only info", () => {
    expect(saveProjectFeedback({ canceled: false, error: "Sem permissao." })).toEqual({
      message: "Sem permissao.",
      tone: "error"
    });
    expect(saveProjectFeedback({ canceled: true })).toEqual({
      message: "Salvamento cancelado.",
      tone: "info"
    });
  });

  it("keeps export cancellation as info while promoting success and failures", () => {
    expect(exportArtifactFeedback("Evento", "intro", { canceled: true })).toEqual({
      message: "Exportacao de Evento cancelada.",
      tone: "info"
    });
    expect(exportArtifactFeedback("Audio", "theme", { canceled: false, path: "/tmp/theme.json" })).toEqual({
      message: "Audio exportado: /tmp/theme.json.",
      tone: "success"
    });
    expect(exportArtifactFeedback("Dialogo", "intro", { canceled: false, error: "Destino invalido." })).toEqual({
      message: "Destino invalido.",
      tone: "error"
    });
  });

  it("promotes settings path validation problems to error feedback", () => {
    expect(settingsPathValidationFeedback({ ok: true, items: [] })).toEqual({
      message: "Paths de Ajustes validados.",
      tone: "info"
    });
    expect(settingsPathValidationFeedback({
      ok: false,
      items: [
        {
          id: "engine",
          label: "Engine Pack",
          path: "/missing",
          mode: "directory",
          kind: "missing",
          exists: false,
          ok: false,
          missingFiles: [],
          missingTools: []
        }
      ]
    })).toEqual({
      message: "Ajustes tem 1 path com pendencia.",
      tone: "error"
    });
  });
});
