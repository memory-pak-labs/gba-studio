import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createAdvancedHudPresetInProject, deriveHudPresetsWorkspacePresentation, resolveExplicitHudPresetBinding, setActiveHudPresetInProject, DEFAULT_HUD_PRESET } from "./hudPresets.js";
import { bindSceneHudInProject, createSceneHudVariationInProject, hudPresetUsages, updateHudComponentGeometry, HUD_PROJECT_PRESET_ID } from "./hudSceneAuthoring.js";

function projectWithHud() {
  const data = setActiveHudPresetInProject(createAdvancedHudPresetInProject(createBlankProjectData({ name: "Autoria HUD" }), DEFAULT_HUD_PRESET.id, "shared", "Compartilhada"), "shared");
  data.scenas = [{ id: "port", name: "Porto", sceneType: "topdown", hudPresetId: "shared" }, { id: "menu", name: "Pausa", sceneType: "menu", hudPresetId: "shared", runtime: { type: "menu", config: { screenType: "menu", hudPresetId: "shared" } } }];
  return data;
}

describe("HUD authoring scopes", () => {
  it("copies and binds a scene HUD without changing the project default or other scenes", () => {
    const data = projectWithHud();
    const before = JSON.stringify(data);
    const next = createSceneHudVariationInProject(data, "menu", "shared", "local", "Pausa local");
    expect(deriveHudPresetsWorkspacePresentation(next).activePresetId).toBe("shared");
    expect(next.scenas).toMatchObject([{ hudPresetId: "shared" }, { hudPresetId: "local", runtime: { config: { hudPresetId: "local" } } }]);
    expect(JSON.stringify(data)).toBe(before);
  });
  it("supports explicit project inheritance while an unbound scene has no HUD", () => {
    const data = projectWithHud();
    expect(resolveExplicitHudPresetBinding(data)).toBeNull();
    expect(resolveExplicitHudPresetBinding(data, { roomPresetId: HUD_PROJECT_PRESET_ID })).toMatchObject({ presetId: "shared", source: "project", status: "resolved" });
    const changed = setActiveHudPresetInProject(data, DEFAULT_HUD_PRESET.id);
    expect(resolveExplicitHudPresetBinding(changed, { roomPresetId: HUD_PROJECT_PRESET_ID })?.presetId).toBe(DEFAULT_HUD_PRESET.id);
  });
  it("turns off a menu HUD at both authoring and runtime bindings", () => {
    const next = bindSceneHudInProject(projectWithHud(), "menu", null);
    expect(next.scenas).toMatchObject([{}, { runtime: { config: { hudMode: "none" } } }]);
    const scene = (next.scenas as Array<Record<string, any>>)[1];
    expect(scene.hudPresetId).toBeUndefined();
    expect(scene.runtime.config.hudPresetId).toBeUndefined();
  });
  it("reports shared and inherited uses without counting mirrored rooms twice", () => {
    const data = projectWithHud();
    data.rooms = data.scenas;
    (data.scenas as Array<Record<string, unknown>>).push({ id: "map", name: "Mapa", hudPresetId: HUD_PROJECT_PRESET_ID });
    expect(hudPresetUsages(data, "shared").map(use => use.name)).toEqual(["Porto", "Pausa", "Mapa"]);
  });
  it("binds an embedded menu screen without changing its parent or sibling and rejects stale targets", () => {
    const data = projectWithHud();
    const menu = (data.scenas as Array<Record<string, any>>)[1];
    menu.runtime.config.screens = [{ id: "settings", screenType: "menu", hudMode: "none", items: [] }, { id: "pause", screenType: "menu", hudPresetId: "shared", items: [] }];
    const next = createSceneHudVariationInProject(data, "menu", "shared", "screen-local", "Configurações", "settings");
    const config = (next.scenas as Array<Record<string, any>>)[1].runtime.config;
    expect(config.hudPresetId).toBe("shared");
    expect(config.screens).toMatchObject([{ hudPresetId: "screen-local" }, { hudPresetId: "shared" }]);
    expect(config.screens[0].hudMode).toBeUndefined();
    expect(createSceneHudVariationInProject(data, "menu", "shared", "orphan", "Órfã", "missing")).toBe(data);
    expect(createSceneHudVariationInProject(data, "menu", "shared", "@project", "Reservado")).toBe(data);
  });

  it("moves an anchored element on the grid without stale anchor offsets", () => {
    const component = { id: "hp", kind: "text" as const, label: "HP", text: "HP", asset: "", x: 168, y: 8, width: 64, height: 8, visible: true, zIndex: 1, anchor: "top-right" as const, anchorOffsetX: 8, anchorOffsetY: 8 };
    expect(updateHudComponentGeometry(component, { x: 20, y: 19 })).toMatchObject({ x: 24, y: 16, anchor: "freeform", anchorOffsetX: 24, anchorOffsetY: 16 });
    expect(updateHudComponentGeometry(component, { width: 96 })).toMatchObject({ x: 136, width: 96, anchor: "top-right", anchorOffsetX: 8 });
  });
});
