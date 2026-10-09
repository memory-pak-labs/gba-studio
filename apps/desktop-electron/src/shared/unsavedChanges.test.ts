import { describe, expect, it, vi } from "vitest";
import { canDiscardUnsavedChanges, canDiscardUnsavedChangesAsync } from "./unsavedChanges.js";

describe("unsaved changes guard", () => {
  it("allows replacing a clean or empty session without confirmation", () => {
    const confirmDiscard = vi.fn();

    expect(canDiscardUnsavedChanges(null, confirmDiscard)).toBe(true);
    expect(canDiscardUnsavedChanges({ dirty: false }, confirmDiscard)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it("asks before discarding a dirty session", () => {
    const confirmDiscard = vi.fn(() => true);

    expect(canDiscardUnsavedChanges({ dirty: true }, confirmDiscard)).toBe(true);
    expect(confirmDiscard).toHaveBeenCalledWith("Continuar sem salvar as alteracoes do projeto?");
  });

  it("blocks the action when the user keeps editing", () => {
    expect(canDiscardUnsavedChanges({ dirty: true }, () => false)).toBe(false);
  });

  it("supports async confirmation for dirty sessions", async () => {
    const confirmDiscard = vi.fn(async () => true);

    await expect(canDiscardUnsavedChangesAsync({ dirty: true }, confirmDiscard)).resolves.toBe(true);
    expect(confirmDiscard).toHaveBeenCalledWith("Continuar sem salvar as alteracoes do projeto?");
  });
});
