/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveSettingsWorkspacePresentation } from "../shared/settingsWorkspace";
import { StudioI18nProvider } from "./i18n";
import { SettingsWorkspace } from "./settingsWorkspace";

const handlers = {
  pathValidation: null, pathValidationRunning: false, engineStatus: null,
  doctorResult: null, doctorRunning: false, buildDryRunResult: null,
  buildDryRunRunning: false, hasEngineAssetc: false, hasEngineBuild: false,
  onUpdateSetting: vi.fn(), onSelectPath: vi.fn(), onValidatePaths: vi.fn(),
  onResetSection: vi.fn(), onRunEngineDoctor: vi.fn(), onRunEngineBuildDryRun: vi.fn()
};
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); });

describe("settings presentation localization", () => {
  it.each([
    ["pt-BR", "Top-down", "Calmo", "Sem jogador automático"],
    ["en-US", "Top-down", "Calm", "No automatic player"],
    ["es-ES", "Vista cenital", "Tranquilo", "Sin jugador automático"]
  ])("localizes scene metadata and preserves authored sprite references in %s", (locale, title, preset, empty) => {
    window.localStorage.setItem("gbaStudio.locale", locale);
    const data = { settings: {}, assets: [{ name: "Buscar cenas", kind: "Sprite" }] };
    render(<StudioI18nProvider><SettingsWorkspace scope="scene" presentation={deriveSettingsWorkspacePresentation(data)} {...handlers} /></StudioI18nProvider>);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(preset) })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: empty })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Buscar cenas" })).toHaveValue("Buscar cenas");
    expect(screen.queryByRole("option", { name: "Search scenes" })).not.toBeInTheDocument();
  });
  it("searches translated settings labels in English", () => {
    window.localStorage.setItem("gbaStudio.locale", "en-US");
    render(<StudioI18nProvider><SettingsWorkspace presentation={deriveSettingsWorkspacePresentation({ settings: {} })} {...handlers} /></StudioI18nProvider>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "offline translation" } });
    expect(screen.getByRole("button", { name: "Open Offline translation" })).toBeInTheDocument();
  });
});
