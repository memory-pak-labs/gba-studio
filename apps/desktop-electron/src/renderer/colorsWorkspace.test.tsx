/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject.js";
import { deriveColorsWorkspacePresentation } from "../shared/colorsWorkspace/core.js";
import { ColorsWorkspace } from "./colorsWorkspace.js";

describe("ColorsWorkspace", () => {
  afterEach(cleanup);

  it("limpa a família selecionada quando o filtro deixa de exibi-la", async () => {
    const user = userEvent.setup();
    const project = createBlankProjectData({ name: "Cores" });
    project.paletteFamilies = [
      { id: "ok", name: "Paleta OK", background: [0], objects: [0] }
    ];
    const onSelectPaletteFamily = vi.fn();

    render(
      <ColorsWorkspace
        projectData={project}
        presentation={deriveColorsWorkspacePresentation(project, "ok")}
        onCreatePaletteFamily={vi.fn()}
        onDuplicatePaletteFamily={vi.fn()}
        onRenamePaletteFamily={vi.fn()}
        onRemovePaletteFamily={vi.fn()}
        onSetPaletteColor={vi.fn()}
        onResetPaletteColor={vi.fn()}
        onOptimizeDuplicateColors={vi.fn()}
        onSelectPaletteFamily={onSelectPaletteFamily}
        onReorderPaletteFamilies={vi.fn()}
        onReorderPaletteColor={vi.fn()}
        onCopyPaletteSlot={vi.fn()}
        onPastePaletteSlot={vi.fn()}
        onGenerateAutomaticFamilies={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Com problemas" }));

    await waitFor(() => expect(onSelectPaletteFamily).toHaveBeenCalledWith(null));
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma família encontrada neste filtro.");
  });

  it("mantém o painel central vazio quando a seleção é explicitamente limpa", () => {
    const project = createBlankProjectData({ name: "Cores" });
    project.paletteFamilies = [
      { id: "first", name: "Primeira", background: [0], objects: [0] },
      { id: "second", name: "Segunda", background: [0], objects: [0] }
    ];

    const presentation = deriveColorsWorkspacePresentation(project, null);

    expect(presentation.selectedFamilyID).toBeNull();
    expect(presentation.selectedFamily).toBeNull();
  });

  it("expõe nomes acessíveis para filtros, paleta e ações icon-only", () => {
    const project = createBlankProjectData({ name: "Acessibilidade" });
    project.paletteFamilies = [
      { id: "family", name: "Família", background: [0], objects: [0] }
    ];

    render(
      <ColorsWorkspace
        projectData={project}
        presentation={deriveColorsWorkspacePresentation(project, "family")}
        onCreatePaletteFamily={vi.fn()}
        onDuplicatePaletteFamily={vi.fn()}
        onRenamePaletteFamily={vi.fn()}
        onRemovePaletteFamily={vi.fn()}
        onSetPaletteColor={vi.fn()}
        onResetPaletteColor={vi.fn()}
        onOptimizeDuplicateColors={vi.fn()}
        onSelectPaletteFamily={vi.fn()}
        onReorderPaletteFamilies={vi.fn()}
        onReorderPaletteColor={vi.fn()}
        onCopyPaletteSlot={vi.fn()}
        onPastePaletteSlot={vi.fn()}
        onGenerateAutomaticFamilies={vi.fn()}
      />
    );

    expect(screen.getByRole("group", { name: "Origem das famílias" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Uso e problemas das famílias" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar paleta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Slot 0:/ })).toBeInTheDocument();
  });

  it("mantém a criação de família na biblioteca e remove o cabeçalho redundante", async () => {
    const user = userEvent.setup();
    const onCreatePaletteFamily = vi.fn();
    const project = createBlankProjectData({ name: "Acessibilidade" });
    project.paletteFamilies = [
      { id: "family", name: "Família", background: [0], objects: [0] }
    ];

    render(
      <ColorsWorkspace
        projectData={project}
        presentation={deriveColorsWorkspacePresentation(project, "family")}
        onCreatePaletteFamily={onCreatePaletteFamily}
        onDuplicatePaletteFamily={vi.fn()}
        onRenamePaletteFamily={vi.fn()}
        onRemovePaletteFamily={vi.fn()}
        onSetPaletteColor={vi.fn()}
        onResetPaletteColor={vi.fn()}
        onOptimizeDuplicateColors={vi.fn()}
        onSelectPaletteFamily={vi.fn()}
        onReorderPaletteFamilies={vi.fn()}
        onReorderPaletteColor={vi.fn()}
        onCopyPaletteSlot={vi.fn()}
        onPastePaletteSlot={vi.fn()}
        onGenerateAutomaticFamilies={vi.fn()}
      />
    );

    expect(document.querySelector(".colors-header")).not.toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: "Nova família" });
    expect(createButton.closest(".colors-panel-header-row")).toBeInTheDocument();

    await user.click(createButton);
    expect(onCreatePaletteFamily).toHaveBeenCalledTimes(1);
  });
});
