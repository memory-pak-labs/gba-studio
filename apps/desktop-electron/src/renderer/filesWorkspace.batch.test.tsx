/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FilesWorkspacePresentation } from "../shared/filesWorkspace.js";
import { FilesWorkspace } from "./filesWorkspace.js";
import { StudioI18nProvider } from "./i18n.js";

const presentation: FilesWorkspacePresentation = {
  assets: [
    { id: "hero", name: "hero.png", kind: "Sprite", systemImage: null, source: "Assets/hero.png", bundledDefaultAsset: null, previewKind: "image", groupNames: [], usageLabels: [], usageLinks: [], isUsed: false, isReusableLibraryAsset: false, primaryAction: { label: "Abrir no Animador", workspace: "Sprites" } },
    { id: "npc", name: "npc.png", kind: "Sprite", systemImage: null, source: "Assets/npc.png", bundledDefaultAsset: null, previewKind: "image", groupNames: ["Personagens"], usageLabels: [], usageLinks: [], isUsed: false, isReusableLibraryAsset: false, primaryAction: { label: "Abrir no Animador", workspace: "Sprites" } }
  ],
  groups: [{ id: "characters", name: "Personagens", assetCount: 1, depth: 0, missingAssetIDs: ["missing"] }],
  kindCounts: [{ kind: "Sprite", count: 2 }],
  summaryCards: [{ id: "total", label: "Total", value: 2, tone: "primary" }],
  ungroupedAssets: 1,
  missingGroupAssetReferenceCount: 1
};

describe("FilesWorkspace batch actions", () => {
  afterEach(cleanup);

  it("abre o menu contextual do asset com renomear, duplicar e excluir", () => {
    const onRenameAsset = vi.fn();
    const onDuplicateAsset = vi.fn();
    const onRemoveAsset = vi.fn();
    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
          onBatchConvertAssets={vi.fn()}
          onBatchMoveAssets={vi.fn()}
          onBatchRemoveAssets={vi.fn()}
          onBatchRenameAssets={vi.fn()}
          onDuplicateAsset={onDuplicateAsset}
          onImportAssets={vi.fn()}
          onOpenAssetWorkspace={vi.fn()}
          onRemoveAsset={onRemoveAsset}
          onRenameAsset={onRenameAsset}
          onRepairReferences={vi.fn()}
          onReplaceAsset={vi.fn()}
          onRevealAsset={vi.fn()}
        />
      </StudioI18nProvider>
    );

    const asset = screen.getByRole("button", { name: "hero.png" });
    fireEvent.contextMenu(asset, { clientX: 120, clientY: 140 });
    expect(screen.getByRole("menu", { name: "Ações para hero.png" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Renomear" }));
    expect(onRenameAsset).toHaveBeenCalledWith("hero", "hero.png");

    fireEvent.contextMenu(asset, { clientX: 120, clientY: 140 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onDuplicateAsset).toHaveBeenCalledWith("hero", "hero.png");

    fireEvent.contextMenu(asset, { clientX: 120, clientY: 140 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
    expect(onRemoveAsset).toHaveBeenCalledWith("hero", "hero.png");
  });

  it("seleciona varios assets e executa organizacao em lote", async () => {
    const user = userEvent.setup();
    const onBatchMoveAssets = vi.fn();
    const onBatchConvertAssets = vi.fn();
    const onBatchRenameAssets = vi.fn();
    const onBatchRemoveAssets = vi.fn();
    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
          onBatchConvertAssets={onBatchConvertAssets}
          onBatchMoveAssets={onBatchMoveAssets}
          onBatchRemoveAssets={onBatchRemoveAssets}
          onBatchRenameAssets={onBatchRenameAssets}
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

    await user.click(screen.getByRole("button", { name: "Selecionar" }));
    await user.click(screen.getByRole("button", { name: "Selecionar hero.png" }));
    expect(screen.getByText("1 selecionado")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Selecionar npc.png" }));
    expect(screen.getByText("2 selecionados")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Mover seleção para grupo" }), "characters");
    expect(onBatchMoveAssets).toHaveBeenCalledWith(["hero", "npc"], "characters");
    await user.selectOptions(screen.getByRole("combobox", { name: "Converter tipo da seleção" }), "Tileset");
    expect(onBatchConvertAssets).toHaveBeenCalledWith(["hero", "npc"], "Tileset");
    await user.click(screen.getByRole("button", { name: "Renomear seleção" }));
    expect(onBatchRenameAssets).toHaveBeenCalledWith(["hero", "npc"]);
    await user.click(screen.getByRole("button", { name: "Remover seleção" }));
    expect(onBatchRemoveAssets).toHaveBeenCalledWith(["hero", "npc"]);
    await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.queryByLabelText("Ações para seleção de arquivos")).not.toBeInTheDocument();
  });

  it("mantem a importacao principal funcional sem reintroduzir o fluxo removido", async () => {
    const user = userEvent.setup();
    const onImportAssets = vi.fn();
    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
          onBatchConvertAssets={vi.fn()}
          onBatchMoveAssets={vi.fn()}
          onBatchRemoveAssets={vi.fn()}
          onBatchRenameAssets={vi.fn()}
          onDuplicateAsset={vi.fn()}
          onImportAssets={onImportAssets}
          onOpenAssetWorkspace={vi.fn()}
          onRemoveAsset={vi.fn()}
          onRenameAsset={vi.fn()}
          onRepairReferences={vi.fn()}
          onReplaceAsset={vi.fn()}
          onRevealAsset={vi.fn()}
        />
      </StudioI18nProvider>
    );

    const importButtons = screen.getAllByRole("button", { name: "Importar" });
    expect(importButtons).toHaveLength(1);
    await user.click(importButtons[0]);
    expect(onImportAssets).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Revisar sem uso" })).not.toBeInTheDocument();
  });

  it("recolhe e expande categorias de arquivos", async () => {
    const user = userEvent.setup();
    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
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

    const categoryButton = screen.getByRole("button", { name: "Sprites" });
    expect(categoryButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "hero.png" })).toBeInTheDocument();

    await user.click(categoryButton);
    expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "hero.png" })).not.toBeInTheDocument();

    await user.click(categoryButton);
    expect(screen.getByRole("button", { name: "hero.png" })).toBeInTheDocument();
  });

  it("renders a thumbnail gallery when the grid view is selected", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
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

    await user.click(screen.getByRole("button", { name: "Grade" }));

    expect(container.querySelector(".asset-list-grid")).toBeTruthy();
    expect(container.querySelectorAll(".asset-grid-thumbnail")).toHaveLength(2);
  });

  it("oferece reparo de referencias e substituicao preservando o asset", async () => {
    const user = userEvent.setup();
    const onRepairReferences = vi.fn();
    const onReplaceAsset = vi.fn();
    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
          onBatchConvertAssets={vi.fn()}
          onBatchMoveAssets={vi.fn()}
          onBatchRemoveAssets={vi.fn()}
          onBatchRenameAssets={vi.fn()}
          onDuplicateAsset={vi.fn()}
          onImportAssets={vi.fn()}
          onOpenAssetWorkspace={vi.fn()}
          onRemoveAsset={vi.fn()}
          onRenameAsset={vi.fn()}
          onRepairReferences={onRepairReferences}
          onReplaceAsset={onReplaceAsset}
          onRevealAsset={vi.fn()}
        />
      </StudioI18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Reparar 1 referência inválida" }));
    expect(onRepairReferences).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Substituir arquivo de hero.png" }));
    expect(onReplaceAsset).toHaveBeenCalledWith("hero", "hero.png");
  });

  it("exibe referências de recurso tático no inspetor do asset", async () => {
    const user = userEvent.setup();
    const tacticalPresentation: FilesWorkspacePresentation = {
      ...presentation,
      assets: [{
        id: "surface-r0c0",
        name: "surface-r0c0.png",
        kind: "Background",
        systemImage: null,
        source: "Assets/surface-r0c0.png",
        bundledDefaultAsset: null,
        previewKind: "image",
        groupNames: [],
        usageLabels: ["Recurso tático: Arena Tática"],
        usageLinks: [{
          label: "Recurso tático: Arena Tática",
          workspace: "Editor",
          targetID: "tactical-arena",
          targetName: "Arena Tática",
          usageKind: "tactical-resource"
        }],
        isUsed: true,
        isReusableLibraryAsset: false,
        primaryAction: { label: "Abrir no Editor", workspace: "Editor", targetID: "tactical-arena", targetName: "Arena Tática", usageKind: "tactical-resource" }
      }],
      groups: [],
      kindCounts: [{ kind: "Background", count: 1 }],
      summaryCards: [{ id: "total", label: "Total", value: 1, tone: "primary" }],
      ungroupedAssets: 1,
      missingGroupAssetReferenceCount: 0
    };

    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={tacticalPresentation}
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

    await user.click(screen.getByRole("button", { name: "surface-r0c0.png" }));
    expect(screen.getByText("1 referência de recurso tático")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma referência encontrada.")).not.toBeInTheDocument();
  });

  it("exibe o uso do seletor de diálogo nas configurações", async () => {
    const user = userEvent.setup();
    const dialoguePresentation: FilesWorkspacePresentation = {
      ...presentation,
      assets: [{
        id: "dialogue-selector",
        name: "dialogue-selector.png",
        kind: "UI",
        systemImage: null,
        source: "Assets/dialogue-selector.png",
        bundledDefaultAsset: null,
        previewKind: "image",
        groupNames: [],
        usageLabels: ["UI diálogo: seletor"],
        usageLinks: [{
          label: "UI diálogo: seletor",
          workspace: "Dialogos",
          targetID: "uiDialogs",
          targetName: "Diálogos",
          usageKind: "settings-ui-dialog"
        }],
        isUsed: true,
        isReusableLibraryAsset: false,
        primaryAction: null
      }],
      groups: [],
      kindCounts: [{ kind: "UI", count: 1 }],
      ungroupedAssets: 1
    };

    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={dialoguePresentation}
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

    await user.click(screen.getByRole("button", { name: "dialogue-selector.png" }));
    expect(screen.getByText("1 referência em Diálogos")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma referência encontrada.")).not.toBeInTheDocument();
  });

  it("shows physical file metadata and GBA budget in the inspector", async () => {
    Object.defineProperty(window, "gbaStudio", {
      configurable: true,
      value: {
        inspectAssetFile: vi.fn().mockResolvedValue({
          exists: true,
          format: "PNG",
          byteSize: 8192,
          width: 128,
          height: 64,
          estimatedGbaBytes: 4128,
          gbaBudgetPercent: 4.2
        })
      }
    });
    render(
      <StudioI18nProvider>
        <FilesWorkspace
          presentation={presentation}
          projectPath="/tmp/game.gba-project"
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

    expect(await screen.findByText("128 × 64 px")).toBeInTheDocument();
    expect(screen.getByText("PNG · 8 KB")).toBeInTheDocument();
    expect(screen.getByText("4 KB em 4bpp · 4,2% da VRAM")).toBeInTheDocument();
    expect(within(document.querySelector(".files-pipeline-notice") as HTMLElement).getByText("Pendente")).toBeInTheDocument();
    expect(screen.queryByText("Validado")).not.toBeInTheDocument();
    expect(screen.getByText("Assets/hero.png")).toBeInTheDocument();
  });
});
