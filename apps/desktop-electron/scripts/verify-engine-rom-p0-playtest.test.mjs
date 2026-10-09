import { describe, expect, it } from "vitest";

import {
  applyManualP0PlaytestEvidence,
  validateManualP0PlaytestNote
} from "./verify-engine-rom-p0-playtest.mjs";

const evidence = {
  ok: true,
  romBuildVerified: true,
  romPath: "/tmp/electron_p0_functional.gba",
  source: {
    id: "electron-p0-technical-fixture",
    role: "technical-contract-fixture"
  },
  gameplayVerified: false,
  manualVisualPlaytestPassed: false
};

const approvedNote = [
  "# Playtest manual mGBA - fixture técnica P0",
  "",
  "ROM electron_p0_functional.gba aprovado.",
  "",
  "- [x] Boot sem tela branca, tela preta permanente ou travamento.",
  "- [x] Tilemap real da room inicial visivel (tileset importado, nao tiles coloridos de debug).",
  "- [x] Player / ator renderizado como sprite OBJ real (`player_topdown_4dir.png`), nao marcador quadrado de witness.",
  "- [x] Room inicial contem trigger e colisao conforme a fixture técnica P0.",
  "- [x] Interacao inicial mostra o dialogo intro_001.",
  "- [x] Caixa de dialogo legivel, com contraste suficiente sobre a cena.",
  "- [x] Trigger de porta troca para room_2 com tilemap da segunda room.",
  "- [x] A janela do mGBA permanece responsiva por pelo menos 10 segundos.",
  "",
  "## Resultado",
  "",
  "- [x] aprovado",
  "- [ ] reprovado"
].join("\n");

describe("verify-engine-rom-p0-playtest", () => {
  it("accepts an explicit approved note for the technical P0 ROM", () => {
    const validation = validateManualP0PlaytestNote(approvedNote, evidence.romPath);
    const updated = applyManualP0PlaytestEvidence(evidence, approvedNote, "/tmp/manual.md");

    expect(validation).toEqual({ ok: true, failures: [] });
    expect(updated.gameplayVerified).toBe(true);
    expect(updated.manualVisualPlaytestPassed).toBe(true);
    expect(updated.manualEvidenceNotePath).toBe("/tmp/manual.md");
    expect(updated.manualEvidenceNoteSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects notes that still contain pending checklist items", () => {
    const pendingNote = approvedNote.replace("- [x] Trigger de porta", "- [ ] Trigger de porta");

    const validation = validateManualP0PlaytestNote(pendingNote, evidence.romPath);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("A nota ainda contem checkbox pendente.");
    expect(() => applyManualP0PlaytestEvidence(evidence, pendingNote, "/tmp/manual.md")).toThrow("checkbox pendente");
  });

  it("rejects notes that do not cite the P0 gameplay criteria", () => {
    const weakNote = "electron_p0_functional.gba aprovado. Boot ok.";

    const validation = validateManualP0PlaytestNote(weakNote, evidence.romPath);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("A nota precisa citar: room_2.");
    expect(validation.failures).toContain("A nota precisa citar: intro_001.");
    expect(validation.failures).toContain("A nota precisa citar: ator.");
    expect(validation.failures).toContain("A nota precisa citar: trigger.");
  });

  it("rejects notes that do not confirm native tilemap and OBJ player evidence", () => {
    const noteWithoutNativeVisuals = approvedNote
      .replace(/tilemap/gi, "cena")
      .replace(/\bOBJ\b/g, "sprite");

    const validation = validateManualP0PlaytestNote(noteWithoutNativeVisuals, evidence.romPath);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("A nota precisa citar: tilemap.");
    expect(validation.failures).toContain("A nota precisa citar: OBJ.");
  });

  it("rejects notes with reprovado explicitly checked", () => {
    const failedNote = approvedNote.replace("- [ ] reprovado", "- [x] reprovado");

    const validation = validateManualP0PlaytestNote(failedNote, evidence.romPath);

    expect(validation.ok).toBe(false);
    expect(validation.failures).toContain("A nota contem falha ou reprovacao explicita.");
  });
});
