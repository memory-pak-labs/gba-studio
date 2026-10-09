/** @vitest-environment happy-dom */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilesWorkspacePresentation } from "../shared/filesWorkspace";
import { StudioI18nProvider } from "./i18n";
import { FilesWorkspace } from "./filesWorkspace";

const emptyPresentation: FilesWorkspacePresentation = {
  assets: [],
  groups: [],
  kindCounts: [],
  missingGroupAssetReferenceCount: 0,
  summaryCards: [
    { id: "total", label: "Assets", value: 0, tone: "primary" },
    { id: "unused", label: "Sem uso", value: 0, tone: "neutral" }
  ],
  ungroupedAssets: 0
};

function renderFilesWorkspace(locale: "en-US" | "es-ES"): void {
  window.localStorage.setItem("gbaStudio.locale", locale);
  render(
    <StudioI18nProvider>
      <FilesWorkspace
        presentation={emptyPresentation}
        onBatchConvertAssets={vi.fn()}
        onBatchMoveAssets={vi.fn()}
        onBatchRemoveAssets={vi.fn()}
        onBatchRenameAssets={vi.fn()}
        onDuplicateAsset={vi.fn()}
        onImportAssets={vi.fn()}
        onOpenAssetWorkspace={vi.fn()}
        onRemoveAsset={vi.fn()}
        onRenameAsset={vi.fn()}
        onRepairReferences={vi.fn()}
        onReplaceAsset={vi.fn()}
        onRevealAsset={vi.fn()}
      />
    </StudioI18nProvider>
  );
}

describe("FilesWorkspace i18n", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the Files workspace chrome in English", () => {
    renderFilesWorkspace("en-US");

    expect(screen.getByRole("region", { name: "Files workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Files" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Import" }).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Search files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Where it is used" })).toBeInTheDocument();
    expect(screen.getByText("No asset found in the open project.")).toBeInTheDocument();
    expect(screen.getByText("Select a file to preview.")).toBeInTheDocument();
  });

  it("renders the Files workspace chrome in Latin American Spanish", () => {
    renderFilesWorkspace("es-ES");

    expect(screen.getByRole("region", { name: "Workspace Archivos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Archivos" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Importar" }).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Buscar archivos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lista" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Donde se usa" })).toBeInTheDocument();
    expect(screen.getByText("Ningun asset encontrado en el proyecto abierto.")).toBeInTheDocument();
    expect(screen.getByText("Selecciona un archivo para previsualizar.")).toBeInTheDocument();
  });
});
