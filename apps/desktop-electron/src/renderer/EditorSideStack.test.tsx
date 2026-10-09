/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorSideStack } from "./EditorSideStack";

describe("EditorSideStack", () => {
  afterEach(cleanup);

  it("renders the contextual inspector above the project navigator", () => {
    render(
      <EditorSideStack
        ariaLabel="Painel lateral"
        inspectorPane={<div>Inspector contextual</div>}
        projectPane={<div>Navegador</div>}
        workspaceId="rooms-test"
      />
    );

    const panes = screen.getByLabelText("Painel lateral").querySelectorAll(".editor-side-stack-pane");
    expect(panes).toHaveLength(2);
    expect(panes[0]).toHaveAttribute("aria-label", "Inspector");
    expect(panes[1]).toHaveAttribute("aria-label", "Navegador do projeto");
  });

  it("gives the inspector the complete height when the project pane is hidden", () => {
    render(
      <EditorSideStack
        ariaLabel="Painel lateral"
        hideProjectPane
        inspectorPane={<div>Inspector Pintura</div>}
        projectPane={<div>Navegador</div>}
        workspaceId="rooms-paint-test"
      />
    );

    expect(screen.getByLabelText("Inspector")).toHaveStyle({ flexGrow: "1" });
    expect(screen.queryByLabelText("Navegador do projeto")).not.toBeInTheDocument();
  });

  it("exposes a keyboard-accessible horizontal inspector resizer", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();

    render(
      <EditorSideStack
        ariaLabel="Painel lateral"
        hideProjectPane
        horizontalResize={{ max: 760, min: 320, onChange, onCommit, value: 420 }}
        inspectorPane={<div>Inspector de eventos</div>}
        workspaceId="rooms-resizable-test"
      />
    );

    const resizer = screen.getByRole("separator", { name: "Largura do inspetor" });
    expect(resizer).toHaveAttribute("aria-valuenow", "420");
    expect(resizer).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(resizer, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(436);
    expect(onCommit).toHaveBeenCalledWith(436);
  });
});
