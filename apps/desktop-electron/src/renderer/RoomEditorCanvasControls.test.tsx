/** @vitest-environment happy-dom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import type { RoomCanvasLayerID } from "../shared/roomsWorkspace/core";
import { StudioI18nProvider } from "./i18n";
import { RoomEditorCanvasControls } from "./RoomEditorSecondaryToolbar";

const room = deriveRoomsWorkspacePresentation(createBlankProjectData({ name: "Layers" })).rooms[0]!;
const layers = ["background", "grid", "collision", "actors", "hitboxes", "triggers", "hud", "composition", "cameraBounds", "worldBounds"];
const visibility = Object.fromEntries(layers.map(layer => [layer, true])) as Record<RoomCanvasLayerID, boolean>;
const locks = Object.fromEntries(layers.map(layer => [layer, false])) as Record<RoomCanvasLayerID, boolean>;

function CanvasControls() {
  const [visible, setVisible] = useState(visibility);
  const [locked, setLocked] = useState(locks);
  return <RoomEditorCanvasControls room={room} canvasLayerVisibility={visible} canvasLayerLocks={locked}
    setCanvasLayerVisibility={(layer, value) => setVisible(current => ({ ...current, [layer]: value }))}
    setCanvasLayerLock={(layer, value) => setLocked(current => ({ ...current, [layer]: value }))} />;
}

afterEach(() => { cleanup(); window.localStorage.clear(); });

describe("scene layers side panel", () => {
  it("opens by keyboard, keeps toggles available and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<div className="room-editor-tool-rail"><CanvasControls /></div>);
    const trigger = screen.getByRole("button", { name: "Camadas" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Camadas" })).not.toBeInTheDocument();
    trigger.focus();
    await user.keyboard(" ");
    const panel = screen.getByRole("region", { name: "Camadas" });
    expect(trigger).toHaveAttribute("aria-controls", panel.id);
    await user.click(within(panel).getByRole("button", { name: "Ocultar camada Grade" }));
    expect(within(panel).getByRole("button", { name: "Mostrar camada Grade" })).toHaveAttribute("aria-pressed", "false");
    await user.click(within(panel).getByRole("button", { name: "Bloquear camada Atores" }));
    expect(within(panel).getByRole("button", { name: "Desbloquear camada Atores" })).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Camadas" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("dismisses outside, closes with its button and retains layer choices on reopening", async () => {
    const user = userEvent.setup();
    render(<><div className="room-editor-tool-rail"><CanvasControls /></div><button type="button">Canvas</button></>);
    const trigger = screen.getByRole("button", { name: "Camadas" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Ocultar camada HUD" }));
    await user.click(screen.getByRole("button", { name: "Canvas" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Canvas" })).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Mostrar camada HUD" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Fechar painel de camadas" }));
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["pt-BR", "Camadas", "Fechar painel de camadas", "Ocultar camada Fundo", "Bloquear camada Atores"],
    ["en-US", "Layers", "Close layers panel", "Hide Background layer", "Lock Actors layer"],
    ["es-ES", "Capas", "Cerrar panel de capas", "Ocultar capa Fondo", "Bloquear capa Actores"]
  ])("localizes the panel and action labels in %s", async (locale, label, close, hide, lock) => {
    const user = userEvent.setup();
    window.localStorage.setItem("gbaStudio.locale", locale);
    render(<StudioI18nProvider><CanvasControls /></StudioI18nProvider>);
    await user.click(screen.getByRole("button", { name: label }));
    const panel = screen.getByRole("region", { name: label });
    expect(within(panel).getByRole("button", { name: close })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: hide })).toHaveAttribute("title", hide);
    expect(within(panel).getByRole("button", { name: lock })).toHaveAttribute("title", lock);
  });
});
