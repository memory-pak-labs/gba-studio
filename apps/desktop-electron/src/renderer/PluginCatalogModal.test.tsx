/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginCatalogModal } from "./PluginCatalogModal.js";
import { buildProjectPluginRegistry } from "../shared/gbaStudioPlugins.js";
import { useState } from "react";

const { confirm } = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("./studioDialog.js", () => ({ useStudioDialog: () => ({ confirm }) }));
const fetchPluginRepository = vi.fn(); const installPluginFromCatalog = vi.fn();
const props = { projectPath: "/projects/demo.gba-project", onClose: vi.fn(), onInstalled: vi.fn(), setStatus: vi.fn() };
const entry = { id: "acme/demo", type: "recipePack", gbaStudioVersion: ">=0.1.0", name: "Demo", author: "Acme", description: "Demo", version: "1.0.0", filename: "demo.zip" };

beforeEach(() => {
  window.localStorage.clear(); vi.resetAllMocks();
  Object.defineProperty(window, "gbaStudio", { configurable: true, value: { fetchPluginRepository, installPluginFromCatalog } });
  fetchPluginRepository.mockResolvedValue({ ok: true, repository: { name: "Community GBA", plugins: [] } });
});
afterEach(cleanup);

async function loadCatalog(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("URL do catálogo"), "https://example.com/repository.json");
  await user.click(screen.getByRole("button", { name: "Carregar catálogo" }));
}

describe("GBA Studio native plugin catalog", () => {
  it("returns focus to the opener after closing", async () => {
    function Harness(): React.ReactElement {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Abrir plugins</button>{open ? <PluginCatalogModal {...props} onClose={() => setOpen(false)} /> : null}</>;
    }
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir plugins" }));
    expect(screen.getByLabelText("URL do catálogo")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Abrir plugins" })).toHaveFocus();
  });

  it("opens empty without loading the old GB Studio preference or making a request", () => {
    window.localStorage.setItem("gba-studio.plugin-repository-url", "https://plugins.gbstudio.dev/repository.json");
    render(<PluginCatalogModal {...props} />);
    expect(screen.getByLabelText("URL do catálogo")).toHaveValue("");
    expect(screen.getByLabelText("URL do catálogo")).toHaveFocus();
    expect(screen.getByText("Nenhum catálogo configurado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carregar catálogo" })).toBeDisabled();
    expect(fetchPluginRepository).not.toHaveBeenCalled();
  });

  it("loads an empty future native catalog only on request", async () => {
    render(<PluginCatalogModal {...props} />); await loadCatalog();
    expect(await screen.findByText("Este catálogo ainda não tem plugins.")).toBeInTheDocument();
    expect(fetchPluginRepository).toHaveBeenCalledOnce();
  });

  it("keeps a catalog error visible without install actions", async () => {
    fetchPluginRepository.mockResolvedValue({ ok: false, error: "O catálogo aceita somente plugins do GBA Studio." });
    render(<PluginCatalogModal {...props} />); await loadCatalog();
    expect(await screen.findByText("O catálogo aceita somente plugins do GBA Studio.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
  });

  it("does not install after canceling the confirmation", async () => {
    fetchPluginRepository.mockResolvedValue({ ok: true, repository: { name: "Community GBA", plugins: [entry] } });
    confirm.mockResolvedValue(false);
    render(<PluginCatalogModal {...props} />); await loadCatalog();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Instalar" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(installPluginFromCatalog).not.toHaveBeenCalled();
  });

  it("clears old entries when the repository URL changes", async () => {
    fetchPluginRepository.mockResolvedValue({ ok: true, repository: { name: "Community GBA", plugins: [entry] } });
    render(<PluginCatalogModal {...props} />); await loadCatalog(); await screen.findByRole("button", { name: "Instalar" });
    await userEvent.setup().clear(screen.getByLabelText("URL do catálogo"));
    expect(screen.queryByRole("button", { name: "Instalar" })).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum catálogo configurado.")).toBeInTheDocument();
  });

  it("installs a native entry after confirmation", async () => {
    fetchPluginRepository.mockResolvedValue({ ok: true, repository: { name: "Community GBA", plugins: [entry] } });
    confirm.mockResolvedValue(true);
    installPluginFromCatalog.mockResolvedValue({ ok: true, pluginId: entry.id, registry: buildProjectPluginRegistry([]) });
    render(<PluginCatalogModal {...props} />); await loadCatalog();
    await userEvent.setup().click(await screen.findByRole("button", { name: "Instalar" }));
    expect(installPluginFromCatalog).toHaveBeenCalledWith({ projectPath: props.projectPath, repositoryBaseURL: "https://example.com/repository.json", entry, replacingExisting: true });
    expect(props.onInstalled).toHaveBeenCalledOnce();
  });

  it("shows a rejected request and restores the load button", async () => {
    fetchPluginRepository.mockRejectedValue(new Error("Catálogo offline"));
    render(<PluginCatalogModal {...props} />); await loadCatalog();
    expect(await screen.findByRole("alert")).toHaveTextContent("Catálogo offline");
    expect(screen.getByRole("button", { name: "Carregar catálogo" })).toBeEnabled();
  });
});
