/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceExplorerRail } from "./WorkspaceExplorerRail";

describe("WorkspaceExplorerRail", () => {
  afterEach(cleanup);

  it("renders children inside the explorer rail body", () => {
    render(
      <WorkspaceExplorerRail
        ariaLabel="Navegador do projeto"
        workspaceId="rooms-test"
      >
        <div>Navegador</div>
      </WorkspaceExplorerRail>
    );

    const rail = screen.getByLabelText("Navegador do projeto");
    expect(rail).toHaveClass("workspace-explorer-rail");
    expect(rail.querySelector(".workspace-explorer-rail-body")).toContainHTML(
      "<div>Navegador</div>"
    );
  });

  it("toggles between expanded and collapsed when the toggle button is clicked", () => {
    render(
      <WorkspaceExplorerRail
        ariaLabel="Navegador do projeto"
        workspaceId="rooms-toggle-test"
      >
        <div>Navegador</div>
      </WorkspaceExplorerRail>
    );

    const rail = screen.getByLabelText("Navegador do projeto");
    expect(rail).not.toHaveClass("is-collapsed");
    expect(screen.getByRole("button", { name: "Recolher navegador" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Recolher navegador" }));

    expect(rail).toHaveClass("is-collapsed");
    expect(screen.getByRole("button", { name: "Expandir navegador" })).toBeInTheDocument();
  });
});
