/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveFilesWorkspacePresentation } from "../shared/filesWorkspace";
import { FilesWorkspace } from "./filesWorkspace";
import { StudioI18nProvider } from "./i18n";

const presentation = deriveFilesWorkspacePresentation({
  assets: [
    { id: "map", name: "map.png", kind: "Background", metadata: { source: "Assets/backgrounds/map.png" } },
    { id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } },
    { id: "old", name: "old.png", kind: "Sprite", metadata: { source: "Assets/sprites-old/old.png" } }
  ],
  scenas: [{ id: "room-map", name: "Mapa", backgroundAssetName: "map.png" }]
});
function mount() {
  const callbacks = {
    onBatchConvertAssets: vi.fn(), onBatchMoveAssets: vi.fn(), onBatchRemoveAssets: vi.fn(), onBatchRenameAssets: vi.fn(),
    onImportAssets: vi.fn(), onImportGifAnimation: vi.fn(), onRenameAsset: vi.fn(), onRemoveAsset: vi.fn(),
    onDuplicateAsset: vi.fn(), onRevealAsset: vi.fn(), onRepairReferences: vi.fn(), onReplaceAsset: vi.fn(), onOpenAssetWorkspace: vi.fn()
  };
  const rendered = render(<StudioI18nProvider><FilesWorkspace {...callbacks} presentation={presentation} projectPath="/tmp/game.gba-project" /></StudioI18nProvider>);
  return { ...callbacks, ...rendered };
}

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window, "gbaStudio", { configurable: true, value: { inspectAssetFile: vi.fn().mockResolvedValue({ exists: true, format: "PNG", width: 480, height: 320, byteSize: 8192, pipeline: { preparedStatus: "complete", exportedStatus: "attention", exportedDetail: "source_newer" } }) } });
});
afterEach(cleanup);

describe("Files library layout", () => {
  it("combines source folder, usage and search and clears a filter with no results", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Pasta: Assets/sprites" }));
    expect(screen.getByRole("button", { name: "hero.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "old.png" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filtrar uso Usados" }));
    expect(screen.getByText("Nenhum arquivo corresponde aos filtros.")).toBeInTheDocument();
    expect(screen.getByText("Selecione um arquivo para visualizar.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await user.type(screen.getByRole("searchbox"), "old");
    expect(screen.getByRole("button", { name: "old.png" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "hero.png" })).not.toBeInTheDocument();
  });

  it("imports files and GIFs from one menu and restores focus after Escape and outside click", async () => {
    const user = userEvent.setup();
    const { onImportAssets, onImportGifAnimation, container } = mount();
    const trigger = screen.getByRole("button", { name: "Importar" });
    await user.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Importar arquivos" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent.pointerDown(container.querySelector(".studio-context-menu-backdrop")!);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Importar arquivos" }));
    expect(onImportAssets).toHaveBeenCalledOnce();
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onImportGifAnimation).toHaveBeenCalledOnce();
  });

  it("opens the exact usage target and keeps asset actions available in the overflow menu", async () => {
    const user = userEvent.setup();
    const { onOpenAssetWorkspace, onDuplicateAsset, onRemoveAsset } = mount();
    await user.click(screen.getByRole("button", { name: "Abrir no Editor: Cena: Mapa" }));
    expect(onOpenAssetWorkspace).toHaveBeenCalledWith(expect.objectContaining({ assetID: "map", targetID: "room-map", targetName: "Mapa", workspace: "Editor" }));
    const more = screen.getByRole("button", { name: "Mais ações para map.png" });
    await user.click(more);
    await user.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    expect(onDuplicateAsset).toHaveBeenCalledWith("map", "map.png");
    await user.click(more);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Remover" })).toHaveClass("danger");
    await user.click(within(menu).getByRole("menuitem", { name: "Remover" }));
    expect(onRemoveAsset).toHaveBeenCalledWith("map", "map.png");
  });

  it("uses measured image dimensions for native preview scales and resets scale on file change", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await screen.findByText("480 × 320 px");
    await user.click(screen.getByRole("button", { name: "2×" }));
    expect(screen.getByRole("img", { name: "Preview de map.png" })).toHaveStyle({ width: "960px", height: "640px" });
    expect(container.querySelector(".files-preview-image-frame")).toHaveClass("is-native");
    await user.click(screen.getByRole("button", { name: "hero.png" }));
    expect(screen.getByRole("button", { name: "Ajustar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows stale export status without claiming ready and exposes the actual diagnostic", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await screen.findByText("Revisar exportação");
    expect(container.querySelector(".files-technical-details")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: "Ver detalhes" }));
    expect(container.querySelector(".files-technical-details")).toHaveAttribute("open");
    expect(screen.getByText("A fonte é mais nova que o relatório de exportação.")).toBeInTheDocument();
    expect(screen.queryByText("Validado")).not.toBeInTheDocument();
  });

  it("handles inspection failure and a missing image without an unhandled rejection", async () => {
    const user = userEvent.setup();
    vi.mocked(window.gbaStudio.inspectAssetFile).mockRejectedValue(new Error("File inaccessible"));
    mount();
    await screen.findByText("Não foi possível inspecionar o arquivo");
    fireEvent.error(screen.getByRole("img", { name: "Preview de map.png" }));
    expect(screen.getByText("Imagem indisponível")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2×" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver detalhes" }));
    expect(within(document.querySelector(".files-technical-details") as HTMLElement).getByText("Assets/backgrounds/map.png")).toBeInTheDocument();
  });

  it("does not draw a fallback icon through a successfully loaded transparent thumbnail", () => {
    const { container } = mount();
    const thumbnail = container.querySelector(".asset-grid-thumbnail")!;
    const image = thumbnail.querySelector("img")!;
    Object.defineProperties(image, { naturalWidth: { value: 480 }, naturalHeight: { value: 320 } });
    fireEvent.load(image);
    expect(thumbnail.querySelector(".asset-grid-thumbnail-fallback")).toBeNull();
    fireEvent.error(image);
    expect(thumbnail.querySelector(".asset-grid-thumbnail-fallback")).not.toBeNull();
    expect(image).not.toBeVisible();
  });

  it("ignores an inspection response for an asset that is no longer selected", async () => {
    const user = userEvent.setup();
    let resolveOld!: (info: { exists: boolean; format: string; width: number; height: number }) => void;
    vi.mocked(window.gbaStudio.inspectAssetFile)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ exists: true, format: "PNG", width: 32, height: 32 });
    mount();
    await user.click(screen.getByRole("button", { name: "hero.png" }));
    await screen.findByText("32 × 32 px");
    resolveOld({ exists: true, format: "PNG", width: 480, height: 320 });
    await user.click(screen.getByRole("button", { name: "2×" }));
    expect(screen.getByRole("img", { name: "Preview de hero.png" })).toHaveStyle({ width: "64px", height: "64px" });
    expect(screen.queryByText("480 × 320 px")).not.toBeInTheDocument();
  });
});
