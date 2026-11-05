/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneNotesLayer } from "./SceneNotesLayer";
import { addSceneNote, readSceneNotes, removeSceneNote, updateSceneNote } from "../shared/sceneNotes";
import { createBlankProjectData } from "../shared/newProject";
import userEvent from "@testing-library/user-event";

function setup(zoom = 1) {
  const update = vi.fn(), select = vi.fn(), remove = vi.fn();
  function Harness() {
    const [data, setData] = useState(() => addSceneNote(createBlankProjectData({ name: "Notes" }), { id: "n", x: 100, y: 80 }));
    return <SceneNotesLayer notes={readSceneNotes(data)} zoom={zoom} onSelect={select}
      onUpdate={(id, patch, group) => { update(id, patch, group); setData(current => updateSceneNote(current, id, patch)); }}
      onRemove={id => { remove(id); setData(current => removeSceneNote(current, id)); }} />;
  }
  render(<Harness />);
  return { update, select, remove };
}

describe("scene note controls", () => {
  afterEach(cleanup);
  it("retains fast typing while the complete project's deferred presentation catches up", async () => {
    const onUpdate = vi.fn();
    const notes = readSceneNotes(addSceneNote(createBlankProjectData({ name: "Deferred" }), { id: "n", x: 0, y: 0 }));
    render(<SceneNotesLayer notes={notes} zoom={1} onSelect={vi.fn()} onUpdate={onUpdate} onRemove={vi.fn()} />);
    await userEvent.setup().type(screen.getByLabelText("Texto do post-it"), "Revisar o porto");
    expect(screen.getByLabelText("Texto do post-it")).toHaveValue("Revisar o porto");
    expect(onUpdate.mock.calls.at(-1)?.[1]).toEqual({ text: "Revisar o porto" });
  });
  it("edits authored text and color and deletes the note through labeled controls", () => {
    const { update, select, remove } = setup();
    fireEvent.focus(screen.getByLabelText("Título do post-it"));
    fireEvent.change(screen.getByLabelText("Título do post-it"), { target: { value: "Revisão" } });
    fireEvent.focus(screen.getByLabelText("Texto do post-it"));
    fireEvent.change(screen.getByLabelText("Texto do post-it"), { target: { value: "Lembrar\nTestar a porta" } });
    expect(screen.getByRole("region", { name: "Post-it: Revisão" })).toBeInTheDocument();
    expect(screen.getByLabelText("Texto do post-it")).toHaveValue("Lembrar\nTestar a porta");
    expect(update.mock.calls.at(-1)?.[2]).toMatch(/^note-text-n-/);
    expect(select).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Cor do post-it"), { target: { value: "green" } });
    expect(screen.getByRole("region")).toHaveAttribute("data-note-color", "green");
    fireEvent.click(screen.getByLabelText("Excluir post-it"));
    expect(remove).toHaveBeenCalledWith("n");
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("keeps editing shortcuts away from scene deletion and supports keyboard geometry", () => {
    const { update } = setup();
    const parentKey = vi.fn();
    window.addEventListener("keydown", parentKey);
    try {
      fireEvent.keyDown(screen.getByLabelText("Texto do post-it"), { key: "Backspace" });
      expect(parentKey).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByLabelText("Mover post-it"), { key: "ArrowRight" });
      expect(update).toHaveBeenLastCalledWith("n", { x: 108, y: 80 }, undefined);
      fireEvent.keyDown(screen.getByLabelText("Redimensionar post-it"), { key: "ArrowDown", shiftKey: true });
      expect(update).toHaveBeenLastCalledWith("n", { width: 240, height: 212 }, undefined);
      fireEvent.keyDown(screen.getByLabelText("Texto do post-it"), { key: "s", metaKey: true });
      expect(parentKey).toHaveBeenCalledOnce();
    } finally { window.removeEventListener("keydown", parentKey); }
  });

  it("moves in world coordinates at 50% zoom, commits once, and cancels a resize", () => {
    const { update } = setup(0.5);
    const move = screen.getByLabelText("Mover post-it");
    move.setPointerCapture = vi.fn();
    fireEvent.pointerDown(move, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 150, clientY: 120 });
    expect(update).not.toHaveBeenCalled();
    fireEvent.pointerUp(move, { pointerId: 1 });
    expect(update).toHaveBeenCalledExactlyOnceWith("n", { x: 200, y: 120 }, undefined);
    const resize = screen.getByLabelText("Redimensionar post-it");
    resize.setPointerCapture = vi.fn();
    fireEvent.pointerDown(resize, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 2, clientX: 160, clientY: 160 });
    fireEvent.pointerCancel(resize, { pointerId: 2 });
    expect(update).toHaveBeenCalledOnce();
  });

  it("commits a completed drag when native pointer capture ends before pointerup", () => {
    const { update } = setup();
    const move = screen.getByLabelText("Mover post-it");
    move.setPointerCapture = vi.fn();
    fireEvent.pointerDown(move, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 180, clientY: 150 });
    fireEvent.lostPointerCapture(move, { pointerId: 1 });
    fireEvent.pointerUp(move, { pointerId: 1 });
    expect(update).toHaveBeenCalledExactlyOnceWith("n", { x: 180, y: 130 }, undefined);
  });

  it("finishes a native drag released outside the handle", () => {
    const { update } = setup();
    const move = screen.getByLabelText("Mover post-it");
    move.setPointerCapture = vi.fn();
    fireEvent.pointerDown(move, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(move, { pointerId: 1, clientX: 180, clientY: 150 });
    fireEvent.mouseUp(window);
    expect(update).toHaveBeenCalledExactlyOnceWith("n", { x: 180, y: 130 }, undefined);
  });
});
