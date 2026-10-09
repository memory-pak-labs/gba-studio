/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceInspectorRail } from "./WorkspaceInspectorRail";

describe("WorkspaceInspectorRail", () => {
  afterEach(cleanup);

  it("renders a keyboard-reachable scroll owner for inspector content", () => {
    render(
      <WorkspaceInspectorRail
        ariaLabel="Inspector de sprite"
        workspaceId="sprites-scroll-test"
      >
        <div>Conteúdo longo</div>
      </WorkspaceInspectorRail>
    );

    const body = screen.getByLabelText("Inspector de sprite conteúdo rolável");
    expect(body).toHaveClass("workspace-inspector-rail-body");
    expect(body).toHaveAttribute("data-scroll-owner", "inspector");
    expect(body).toHaveAttribute("tabindex", "0");
  });

  it("keeps the collapse action independent from the scroll owner", () => {
    render(
      <WorkspaceInspectorRail
        ariaLabel="Inspector de sprite"
        workspaceId="sprites-scroll-toggle-test"
      >
        <div>Conteúdo longo</div>
      </WorkspaceInspectorRail>
    );

    const rail = screen.getByLabelText("Inspector de sprite");
    fireEvent.click(screen.getByRole("button", { name: "Recolher inspetor" }));

    expect(rail).toHaveClass("is-collapsed");
    expect(screen.getByRole("button", { name: "Expandir inspetor" })).toBeInTheDocument();
  });

  it("keeps the rail expanded when collapsing is disabled", () => {
    render(
      <WorkspaceInspectorRail
        ariaLabel="Inspector de diálogos"
        collapsible={false}
        workspaceId="dialogues-always-visible-test"
      >
        <div>Conteúdo do inspetor</div>
      </WorkspaceInspectorRail>
    );

    const rail = screen.getByLabelText("Inspector de diálogos");
    expect(rail).not.toHaveClass("is-collapsed");
    expect(screen.queryByRole("button", { name: "Recolher inspetor" })).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo do inspetor")).toBeVisible();
  });
});
