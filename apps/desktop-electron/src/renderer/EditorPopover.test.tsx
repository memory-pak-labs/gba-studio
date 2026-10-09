/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorPopover } from "./EditorPopover";

afterEach(cleanup);
describe("EditorPopover", () => {
 it("fecha com Escape e devolve o foco sem propagar o atalho do canvas", async () => {
  const user = userEvent.setup();
  const canvasShortcut = vi.fn();
  window.addEventListener("keydown", canvasShortcut);
  try {
   render(<EditorPopover label="Camadas"><button type="button">Bloquear atores</button></EditorPopover>);
   const summary = screen.getByLabelText("Camadas");
   await user.click(summary);
   await user.click(screen.getByRole("button", { name: "Bloquear atores" }));
   await user.keyboard("{Escape}");
   expect(summary.closest("details")).not.toHaveAttribute("open");
   expect(summary).toHaveFocus();
   expect(canvasShortcut).not.toHaveBeenCalled();
  } finally { window.removeEventListener("keydown", canvasShortcut); }
 });
 it("mantém controles de camadas abertos e fecha fora do menu", async () => {
  const user = userEvent.setup();
  render(<><EditorPopover label="Camadas"><button type="button">Ocultar grade</button></EditorPopover><button type="button">Canvas</button></>);
  const summary = screen.getByLabelText("Camadas");
  await user.click(summary);
  await user.click(screen.getByRole("button", { name: "Ocultar grade" }));
  expect(summary.closest("details")).toHaveAttribute("open");
  fireEvent.pointerDown(screen.getByRole("button", { name: "Canvas" }));
  expect(summary.closest("details")).not.toHaveAttribute("open");
 });
 it("fecha ao escolher uma seção do inspetor", async () => {
  const user = userEvent.setup(); const select = vi.fn();
  render(<EditorPopover label="Mais" closeOnAction><button type="button" onClick={select}>Movimento</button></EditorPopover>);
  const summary = screen.getByLabelText("Mais");
  await user.click(summary); await user.click(screen.getByRole("button", { name: "Movimento" }));
  expect(select).toHaveBeenCalledOnce(); expect(summary.closest("details")).not.toHaveAttribute("open");
  expect(summary).toHaveFocus();
 });
});
