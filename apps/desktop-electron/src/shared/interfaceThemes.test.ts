import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "./projectFile.js";
import { DEFAULT_HUD_PRESET, resolveExplicitHudPresetBinding } from "./hudPresets.js";
import { resolveInterfaceTheme, updateInterfaceThemeBinding, updateInterfaceThemeSkin, resolveSceneDialogueUiSettings } from "./interfaceThemes.js";

function fixture() {
  const p = createBlankProjectData({ name: "Themes" });
  p.rooms = [{ id: "port", name: "porto", sceneType: "topdown", hudPresetId: "hud-test" }, { id: "other", name: "outra", sceneType: "topdown" }, { id: "story", name: "historia", sceneType: "cutscene" }];
  p.scenas = undefined;
  p.assets = [{ id: "skin", name: "custom.png", type: "UI", metadata: { width: 24, height: 24 } }, { id: "panel", name: "panel.png", type: "UI", metadata: { width: 64, height: 112 } }];
  p.settings = { uiDialogs: { boxImage: "old.png", font: "font.png", boxWidth: 224 }, hudPresets: [{ ...DEFAULT_HUD_PRESET, id: "hud-test", components: [{ id: "panel", kind: "frame", asset: "panel.png", x: 0, y: 0, width: 64, height: 112, visible: true, zIndex: 0 }] }],
    interfaceThemes: { defaultThemeId: "story", sceneTypeThemeIds: { topdown: "sea" }, themes: [
      { id: "sea", name: "Mar", hudImage: "sea.png", boxImage: "sea-dialogue.png" },
      { id: "story", name: "História", hudImage: "story.png", boxImage: "story-dialogue.png" }
    ] } };
  return p;
}
describe("interface themes", () => {
  it("resolves scene, type and project independently of the HUD layout", () => {
    const p = fixture();
    expect(resolveInterfaceTheme(p, "port")).toMatchObject({ source: "type", theme: { id: "sea" } });
    expect(resolveInterfaceTheme(p, "story")).toMatchObject({ source: "project", theme: { id: "story" } });
    const local = updateInterfaceThemeBinding(p, { scope: "scene", roomId: "port", themeId: "story" });
    expect(resolveInterfaceTheme(local, "port")).toMatchObject({ source: "scene", theme: { id: "story" } });
    expect(resolveInterfaceTheme(local, "other").theme?.id).toBe("sea");
    const project = updateInterfaceThemeBinding(local, { scope: "scene", roomId: "port", themeId: "@project" });
    expect(resolveInterfaceTheme(project, "port").source).toBe("project");
    expect(resolveInterfaceTheme(updateInterfaceThemeBinding(project, { scope: "scene", roomId: "port", themeId: "" }), "port").source).toBe("type");
    expect(resolveInterfaceTheme(p, "port").source).toBe("type");
  });
  it("edits only the requested scope and round-trips through persisted JSON", () => {
    const p = fixture();
    const next = updateInterfaceThemeSkin(p, { scope: "scene", roomId: "port", field: "boxImage", image: "custom.png" });
    const loaded = parseGBAProjectFile(serializeGBAProjectFile(parseGBAProjectFile(JSON.stringify(next)))).data;
    expect(resolveInterfaceTheme(loaded, "port").theme).toMatchObject({ boxImage: "custom.png", hudImage: "sea.png" });
    expect(resolveInterfaceTheme(loaded, "other").theme?.boxImage).toBe("sea-dialogue.png");
    expect((loaded.settings as any).hudPresets).toEqual((p.settings as any).hudPresets);
    expect(resolveSceneDialogueUiSettings(loaded, "port")).toMatchObject({ boxImage: "custom.png", font: "font.png", boxWidth: 224 });
  });
  it("does not mutate a custom theme selected by another scene", () => {
    let p = updateInterfaceThemeSkin(fixture(), { scope: "scene", roomId: "port", field: "boxImage", image: "custom.png" });
    const sharedId = resolveInterfaceTheme(p, "port").themeId;
    p = updateInterfaceThemeBinding(p, { scope: "scene", roomId: "other", themeId: sharedId });
    const next = updateInterfaceThemeSkin(p, { scope: "scene", roomId: "port", field: "hudImage", image: "custom.png" });
    expect(resolveInterfaceTheme(next, "other").theme?.hudImage).toBe("sea.png");
    expect(resolveInterfaceTheme(next, "port").theme?.hudImage).toBe("custom.png");
  });
  it("keeps mirrored scene collections consistent", () => {
    const p = fixture();
    p.scenas = structuredClone(p.rooms);
    p.scena = structuredClone((p.rooms as any[])[0]);
    const next = updateInterfaceThemeBinding(p, { scope: "scene", roomId: "port", themeId: "story" });
    expect(next.rooms).toEqual(next.scenas);
    expect((next.scena as any).interfaceThemeId).toBe('story');
  });
  it("updates the type default without overriding explicit scene choices", () => {
    let p = updateInterfaceThemeBinding(fixture(), { scope: "scene", roomId: "port", themeId: "sea" });
    p = updateInterfaceThemeBinding(p, { scope: "type", roomId: "port", themeId: "story" });
    expect(resolveInterfaceTheme(p, "port").theme?.id).toBe("sea");
    expect(resolveInterfaceTheme(p, "other").theme?.id).toBe("story");
  });
  it("rejects missing theme ids and images that are not 24x24 skins", () => {
    const p = fixture();
    expect(updateInterfaceThemeBinding(p, { scope: "scene", roomId: "port", themeId: "missing" })).toBe(p);
    expect(updateInterfaceThemeSkin(p, { scope: "scene", roomId: "port", field: "boxImage", image: "panel.png" })).toBe(p);
  });
  it("applies a theme only to an existing HUD and keeps explicit component images", () => {
    const p = fixture();
    expect(resolveExplicitHudPresetBinding(p, { roomID: "other" })).toBeNull();
    const binding = resolveExplicitHudPresetBinding(p, { roomID: "port", roomPresetId: "hud-test" });
    expect(binding?.preset.backgroundImage).toBe("sea.png");
    expect(binding?.preset.components[0].asset).toBe("panel.png");
    (p.settings as any).hudPresets[0].backgroundImage = "own.png";
    expect(resolveExplicitHudPresetBinding(p, { roomID: "port", roomPresetId: "hud-test" })?.preset.backgroundImage).toBe("own.png");
  });
  it("does not mark an empty advanced layout ready just because it has a theme", () => {
    const p = fixture();
    (p.settings as any).hudPresets[0].mode = 'advanced';
    (p.settings as any).hudPresets[0].components = [];
    const preset = resolveExplicitHudPresetBinding(p, {roomID:'port', roomPresetId:'hud-test'})?.preset;
    expect(preset?.ready).toBe(false);
    expect(preset?.warning).toContain('elemento');
  });
});
