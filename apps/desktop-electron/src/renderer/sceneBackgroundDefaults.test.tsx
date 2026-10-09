/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { deriveSettingsWorkspacePresentation } from "../shared/settingsWorkspace.js";
import { StudioI18nProvider } from "./i18n.js";
import { SettingsWorkspace } from "./settingsWorkspace.js";

afterEach(cleanup);
describe("scene background defaults", () => {
  it("lets users disable or replace future backgrounds alongside players, including scene variants", () => {
    const onUpdateSetting = vi.fn();
    render(<StudioI18nProvider><SettingsWorkspace scope="scene"
      presentation={deriveSettingsWorkspacePresentation(buildProjectFromTemplate("blank", { name: "Orange" }))}
      onUpdateSetting={onUpdateSetting} onSelectPath={vi.fn()} onValidatePaths={vi.fn()} onResetSection={vi.fn()}
      onRunEngineDoctor={vi.fn()} onRunEngineBuildDryRun={vi.fn()}
      pathValidation={null} pathValidationRunning={false} engineStatus={null} doctorResult={null}
      doctorRunning={false} buildDryRunResult={null} buildDryRunRunning={false}
      hasEngineAssetc={false} hasEngineBuild={false} /></StudioI18nProvider>);
    const select = screen.getByRole("combobox", { name: "Background padrão · Aventura / Top-down" });
    expect(select).toHaveValue("neutral-background-topdown.png");
    fireEvent.change(select, { target: { value: "" } });
    expect(onUpdateSetting).toHaveBeenLastCalledWith("sceneTypes", "defaultBackgrounds.topdown", "");
    fireEvent.change(select, { target: { value: "neutral-background-custom.png" } });
    expect(onUpdateSetting).toHaveBeenLastCalledWith("sceneTypes", "defaultBackgrounds.topdown", "neutral-background-custom.png");
    fireEvent.click(screen.getByRole("button", { name: "Isométrico seção de ajustes" }));
    expect(screen.getByRole("combobox", { name: "Background padrão · Isométrico tático" })).toHaveValue("neutral-background-isometric-tactical.png");
    fireEvent.click(screen.getByRole("button", { name: "Corrida seção de ajustes" }));
    expect(screen.getByRole("combobox", { name: "Background padrão · Corrida em perspectiva" })).toHaveValue("neutral-background-racing-rear.png");
  });
});
