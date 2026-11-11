/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InspectorNumber } from "./InspectorControls";
import { roomEntityFieldValidation } from "../shared/roomEntityFieldValidation";
import { deriveProjectProblems } from "../shared/projectProblems";
afterEach(cleanup);
it("keeps an invalid persisted value visible and explains the legal interval", () => {
  const validation = roomEntityFieldValidation({ kind: "actor", name: "Guia", x: 59, y: 3, width: 2, height: 2 }, { width: 30, height: 20 });
  const update = vi.fn();
  render(<InspectorNumber label="X" value={59} onChange={update} min={0} max={29} preserveInvalidValue validationMessage={validation.errors.x} />);
  const input = screen.getByRole("spinbutton", { name: "X" });
  expect(input).toHaveValue(59); expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent("Guia: X = 59. Use um valor de 0 a 29 tiles.");
  fireEvent.change(input, { target: { value: "58" } }); expect(update).toHaveBeenCalledWith(58);
});
it("replaces the generic contract error with a navigable field error while retaining export blocking", () => {
  const problems = deriveProjectProblems({ scenas: [{ id: "r", name: "praia", width: 30, height: 20 }], actors: [{ id: "a", name: "Guia", roomName: "praia", x: 59, y: 3 }] });
  expect(problems).toEqual(expect.arrayContaining([expect.objectContaining({ code: "room-entity.field.x", targetID: "a", severity: "error", workspace: "Editor" })]));
  expect(problems.some(item => item.targetName === "roomEntities" && item.code === "contract.invalid")).toBe(false);
  expect(problems.filter(item => /Ator fora da grade.*Guia/.test(item.message))).toHaveLength(0);
});
