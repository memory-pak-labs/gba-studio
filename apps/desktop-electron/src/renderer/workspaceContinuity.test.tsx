/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deriveFilesWorkspacePresentation } from "../shared/filesWorkspace";
import { FilesWorkspace } from "./filesWorkspace";
import { StudioProviders } from "./studioProviders";

const presentation = deriveFilesWorkspacePresentation({ assets: [
  { id: "map", name: "map.png", kind: "Background", metadata: { source: "Assets/map.png" } },
  { id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }
] });
const callbacks = {
  onBatchConvertAssets: vi.fn(), onBatchMoveAssets: vi.fn(), onBatchRemoveAssets: vi.fn(), onBatchRenameAssets: vi.fn(),
  onImportAssets: vi.fn(), onRenameAsset: vi.fn(), onRemoveAsset: vi.fn(), onDuplicateAsset: vi.fn(),
  onRevealAsset: vi.fn(), onRepairReferences: vi.fn(), onReplaceAsset: vi.fn(), onOpenAssetWorkspace: vi.fn()
};
function Harness() {
  const [files, setFiles] = useState(true);
  return <><button onClick={() => setFiles(value => !value)}>Trocar workspace</button>
    {files ? <FilesWorkspace {...callbacks} presentation={presentation} projectPath="/qa/game.gba-project"/> : <p>Outro workspace</p>}
  </>;
}
beforeEach(() => Object.defineProperty(window, "gbaStudio", { configurable: true, value: {
  inspectAssetFile: vi.fn().mockResolvedValue({ exists: true, format: "PNG", width: 32, height: 32 })
} }));
afterEach(cleanup);

it("restores file search, selected asset and preview scale after a workspace round trip", async () => {
  const user = userEvent.setup();
  render(<StudioProviders><Harness/></StudioProviders>);
  await user.type(screen.getByRole("searchbox"), "hero");
  await user.click(screen.getByRole("button", { name: "hero.png" }));
  await screen.findByText("32 × 32 px");
  await user.click(screen.getByRole("button", { name: "2×" }));
  await user.click(screen.getByRole("button", { name: "Trocar workspace" }));
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Trocar workspace" }));
  expect(screen.getByRole("searchbox")).toHaveValue("hero");
  expect(screen.getByRole("img", { name: "Preview de hero.png" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2×" })).toHaveAttribute("aria-pressed", "true");
});
