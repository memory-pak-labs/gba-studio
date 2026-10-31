/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBlankProjectData } from "../shared/newProject";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import { DEFAULT_HUD_PRESET, type HudPresetPresentation } from "../shared/hudPresets";
import { StudioI18nProvider } from "./i18n";
import { HudSceneInspector } from "./HudSceneInspector";
import { HudCanvasToolbar } from "./HudCanvasToolbar";

afterEach(() => { cleanup(); window.localStorage.clear(); });
describe("HUD interface localization", () => {
  it.each([
    ["pt-BR", "Vinculada à cena", "Altura está disponível apenas em cenas isométricas.", "Ícone", "Barra"],
    ["en-US", "Linked to the scene", "Height is available only in isometric scenes.", "Icon", "Bar"],
    ["es-ES", "Vinculada a la escena", "La altura solo está disponible en escenas isométricas.", "Icono", "Barra"]
  ])("localizes binding and disabled-tool feedback while preserving preset names in %s", (locale, linked, unavailable, icon, bar) => {
    window.localStorage.setItem("gbaStudio.locale", locale);
    const data = createBlankProjectData({ name: "HUD example" });
    const room = deriveRoomsWorkspacePresentation(data).rooms[0]!;
    const preset = { ...DEFAULT_HUD_PRESET, name: "Vinculada à cena {1}", builtIn: false } as HudPresetPresentation;
    render(<StudioI18nProvider><HudCanvasToolbar preset={preset} canEdit selectedComponentID={null}
      onSelectComponent={vi.fn()} viewMode="edit" onViewMode={vi.fn()} /><HudSceneInspector
      binding={{ preset, presetId: preset.id, requestedPresetId: preset.id, source: "room", status: "resolved" }}
      previewPreset={null} presets={[preset]} activePresetID={preset.id} room={room}
      projectData={data} selectedComponentID={null} editingSharedPresetID={null}
      onPreviewPreset={vi.fn()} onSelectComponent={vi.fn()} onEditSharedPreset={vi.fn()}
      viewMode="edit" onViewMode={vi.fn()}
      unavailableReason="Altura está disponível apenas em cenas isométricas."
    /></StudioI18nProvider>);
    expect(screen.getByRole("status")).toHaveTextContent(unavailable);
    expect(screen.getByRole("button", { name: `+ ${icon}` })).toHaveTextContent(icon);
    expect(screen.getByRole("button", { name: `+ ${bar}` })).toHaveTextContent(bar);
    expect(screen.getByRole("option", { name: "Vinculada à cena {1}" })).toHaveValue(preset.id);
    expect(screen.getByText(`Vinculada à cena {1} · ${linked}`)).toBeInTheDocument();
  });
});
