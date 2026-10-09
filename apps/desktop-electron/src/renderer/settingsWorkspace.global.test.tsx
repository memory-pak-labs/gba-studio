/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveSettingsWorkspacePresentation, resetSettingsSectionInProject, updateSettingsFieldInProject } from "../shared/settingsWorkspace.js";
import { StudioI18nProvider } from "./i18n.js";
import { SettingsWorkspace } from "./settingsWorkspace.js";

// These tests exercise navigation; translation transport has separate tests.
vi.mock("./translationPacks.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./translationPacks.js")>(),
  getTranslationPackStatuses: vi.fn().mockResolvedValue([])
}));

const handlers = {
  pathValidation: null, pathValidationRunning: false, engineStatus: null,
  doctorResult: null, doctorRunning: false, buildDryRunResult: null,
  buildDryRunRunning: false, hasEngineAssetc: false, hasEngineBuild: false,
  onUpdateSetting: vi.fn(), onSelectPath: vi.fn(), onValidatePaths: vi.fn(),
  onResetSection: vi.fn(), onRunEngineDoctor: vi.fn(), onRunEngineBuildDryRun: vi.fn(),
  getMcpServerRegistration: vi.fn().mockResolvedValue('{"mcpServers":{}}'),
  getCodexMcpServerRegistration: vi.fn().mockResolvedValue("config")
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Ajustes operational scope", () => {
  it("hides the inactive preset while preserving its saved value during edit and reset", () => {
    const data = { settings: { controls: { up: "i", preset: "Custom antigo" } } };
    const controls = deriveSettingsWorkspacePresentation(data).sections.find(s => s.id === "controls")!;
    expect(controls.editableFields.map(f => f.key)).not.toContain("preset");
    expect(controls.exportScope).toBe("play-only");
    expect(updateSettingsFieldInProject(data, "controls", "preset", "Novo")).toBe(data);
    expect(resetSettingsSectionInProject(data, "controls").settings).toMatchObject({ controls: { preset: "Custom antigo", up: "ArrowUp,w" } });
    expect(deriveSettingsWorkspacePresentation(data).sections.find(s => s.id === "shortcuts")?.group).toBe("Projeto");
  });

  it("finds device preferences, offline translation and the real plugin catalog", async () => {
    const user = userEvent.setup();
    const onOpenPluginCatalog = vi.fn();
    render(<StudioI18nProvider><SettingsWorkspace presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...handlers} projectPath="/projects/demo.gba-project" onOpenPluginCatalog={onOpenPluginCatalog} /></StudioI18nProvider>);
    const search = screen.getByRole("searchbox", { name: "Buscar ajustes" });
    await user.type(search, "contraste");
    expect(screen.getByRole("button", { name: "Abrir Interface" })).toBeInTheDocument();
    await user.clear(search); await user.type(search, "tradução offline");
    expect(screen.getByRole("button", { name: "Abrir Tradução offline" })).toBeInTheDocument();
    await user.clear(search); await user.type(search, "plugins");
    expect(screen.getByRole("button", { name: "Abrir Plugins" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir Plugins" }));
    await user.click(screen.getByRole("button", { name: "Abrir catálogo de plugins" }));
    expect(onOpenPluginCatalog).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Seção de ajustes da interface" }));
    expect(screen.getByRole("combobox", { name: "Idioma do app" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Editar Interface" })).queryByRole("region", { name: "Pacotes de tradução offline" })).not.toBeInTheDocument();
  });

  it("keeps the active section and search while project settings change", async () => {
    const user = userEvent.setup();
    const view = (up: string) => <StudioI18nProvider><SettingsWorkspace presentation={deriveSettingsWorkspacePresentation({ settings: { controls: { up } } })} {...handlers} projectPath="/projects/demo.gba-project" /></StudioI18nProvider>;
    const { rerender } = render(view("w"));
    await user.click(screen.getByRole("button", { name: "Controles seção de ajustes" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar ajustes" }), "teclado");
    rerender(view("i"));
    expect(screen.getByRole("searchbox", { name: "Buscar ajustes" })).toHaveValue("teclado");
    expect(screen.getByRole("button", { name: "Controles seção de ajustes" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("region", { name: "Editar Controles" })).queryByLabelText("Preset")).not.toBeInTheDocument();
    expect(screen.getByText("Só Play")).toBeInTheDocument();
  });

  it("keeps local translation preferences reachable without an open project", async () => {
    render(<StudioI18nProvider><SettingsWorkspace presentation={null} {...handlers} /></StudioI18nProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Tradução offline seção de ajustes" }));
    expect(screen.getByRole("region", { name: "Pacotes de tradução offline" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Editar Interface" })).not.toBeInTheDocument();
  });

  it("replaces the inactive plugin development block with the real catalog entry", async () => {
    render(<StudioI18nProvider><SettingsWorkspace presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...handlers} advancedTools={<div>Hot reload sem consumidor</div>} onOpenPluginCatalog={vi.fn()} /></StudioI18nProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Plugins seção de ajustes" }));
    expect(screen.queryByText("Hot reload sem consumidor")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir catálogo de plugins" })).toBeDisabled();
  });

  it("keeps the chosen section when scrolling its content to the bottom", async () => {
    const { container } = render(<StudioI18nProvider><SettingsWorkspace presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...handlers} projectPath="/projects/demo.gba-project" onOpenPluginCatalog={vi.fn()} /></StudioI18nProvider>);
    await userEvent.click(screen.getByRole("button", { name: "MCP local seção de ajustes" }));
    const panel = container.querySelector<HTMLElement>(".settings-main-panel")!;
    Object.defineProperties(panel, {
      scrollHeight: { value: 2000 }, clientHeight: { value: 900 }, scrollTop: { value: 1100 }
    });
    fireEvent.scroll(panel);
    expect(screen.getByRole("button", { name: "Plugins seção de ajustes" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "MCP local seção de ajustes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: "Editar Interface" })).not.toBeInTheDocument();
  });

  it("bases MCP budget information on the generated configuration", async () => {
    const registration = JSON.stringify({ mcpServers: { "gba-studio": { args: ["--mcp", "--project", "/projects/demo.gba-project"] } } });
    render(<StudioI18nProvider><SettingsWorkspace presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...handlers} projectPath="/projects/demo.gba-project" enginePackPath="GBAStudioEnginePack" getMcpServerRegistration={vi.fn().mockResolvedValue(registration)} getCodexMcpServerRegistration={vi.fn().mockResolvedValue("config")} /></StudioI18nProvider>);
    await userEvent.click(screen.getByRole("button", { name: "MCP local seção de ajustes" }));
    await screen.findByDisplayValue(registration);
    expect(screen.getByText("Requer Engine Pack")).toBeInTheDocument();
    expect(screen.queryByText("Disponível com Engine Pack")).not.toBeInTheDocument();
  });
});
