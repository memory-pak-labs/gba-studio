import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import {
  DEFAULT_HUD_PRESET,
  createAdvancedHudPresetInProject,
  deriveHudPresetBudget,
  deriveHudPresetsWorkspacePresentation,
  duplicateHudPresetInProject,
  removeHudPresetInProject,
  resolveExplicitHudPresetBinding,
  resolveHudPresetBinding,
  resolveHudPresetForRoom,
  setActiveHudPresetInProject,
  updateHudPresetInProject
} from "./hudPresets.js";

describe("hudPresets", () => {
  it("preserves opted-in text pixel positions without changing legacy grid snapping", () => {
    const project = createBlankProjectData({ name: "Pixel HUD" });
    project.settings = {...(project.settings as Record<string, unknown>), hudPresets: [{ ...DEFAULT_HUD_PRESET, id: "pixel-hud", mode: "advanced", components: [
      {id:"precise",kind:"text",label:"Precise",text:"Mapa",asset:"",x:36,y:44,width:80,height:8,zIndex:1,visible:true,pixelPosition:true},
      {id:"legacy",kind:"text",label:"Legacy",text:"Mapa",asset:"",x:36,y:44,width:80,height:8,zIndex:1,visible:true}
    ] }]};
    const components = deriveHudPresetsWorkspacePresentation(project).presets.find(p => p.id === "pixel-hud")!.components;
    expect(components[0]).toMatchObject({x:36,y:44,pixelPosition:true});
    expect(components[1]).toMatchObject({x:40,y:48});
  });
  it("derives a stable default preset and uses the project active id", () => {
    const project = createBlankProjectData({ name: "HUD test" });
    const initial = deriveHudPresetsWorkspacePresentation(project);

    expect(initial.activePreset).toMatchObject({
      id: DEFAULT_HUD_PRESET.id,
      name: "HUD padrão",
      builtIn: true,
      width: 240,
      height: 24
    });

    const withCustom = duplicateHudPresetInProject(project, DEFAULT_HUD_PRESET.id, "hud-compact", "HUD compacto");
    const updated = updateHudPresetInProject(withCustom, "hud-compact", {
      backgroundImage: "hud-compact.png",
      position: "Inferior",
      width: 224,
      height: 32,
      showExperienceBar: false,
      showHealthBars: true
    });
    const active = setActiveHudPresetInProject(updated, "hud-compact");

    expect(deriveHudPresetsWorkspacePresentation(active).activePreset).toMatchObject({
      id: "hud-compact",
      name: "HUD compacto",
      backgroundImage: "hud-compact.png",
      position: "Inferior",
      width: 224,
      height: 32,
      showExperienceBar: false,
      showHealthBars: true,
      builtIn: false
    });
  });

  it("keeps a room override independent from the project active preset", () => {
    const project = duplicateHudPresetInProject(createBlankProjectData({ name: "HUD test" }), DEFAULT_HUD_PRESET.id, "hud-room", "HUD da sala");
    const active = setActiveHudPresetInProject(project, DEFAULT_HUD_PRESET.id);

    expect(resolveHudPresetForRoom(active, { hudPresetId: "hud-room" })).toMatchObject({
      id: "hud-room",
      name: "HUD da sala"
    });
    expect(resolveHudPresetForRoom(active, { hudPresetId: "missing" }).id).toBe(DEFAULT_HUD_PRESET.id);
  });

  it("resolve a HUD da tela antes da sala e do preset ativo do projeto", () => {
    const project = setActiveHudPresetInProject(
      duplicateHudPresetInProject(
        duplicateHudPresetInProject(createBlankProjectData({ name: "HUD binding" }), DEFAULT_HUD_PRESET.id, "hud-room", "HUD da sala"),
        DEFAULT_HUD_PRESET.id,
        "hud-screen",
        "HUD da tela"
      ),
      DEFAULT_HUD_PRESET.id
    );

    expect(resolveHudPresetBinding(project, { roomPresetId: "hud-room" })).toMatchObject({
      presetId: "hud-room",
      source: "room",
      status: "resolved",
      preset: { name: "HUD da sala" }
    });
    expect(resolveHudPresetBinding(project, { scenePresetId: "hud-screen", roomPresetId: "hud-room" })).toMatchObject({
      presetId: "hud-screen",
      source: "scene",
      status: "resolved",
      preset: { name: "HUD da tela" }
    });
    expect(resolveHudPresetBinding(project, { scenePresetId: "missing", roomPresetId: "missing" })).toMatchObject({
      presetId: DEFAULT_HUD_PRESET.id,
      source: "project",
      status: "missing",
      requestedPresetId: "missing"
    });
    expect(resolveHudPresetBinding(project)).toMatchObject({
      source: "project",
      status: "resolved",
      requestedPresetId: null
    });
    expect(resolveExplicitHudPresetBinding(project)).toBeNull();
    expect(resolveExplicitHudPresetBinding(project, { roomPresetId: "hud-room" })).toMatchObject({
      source: "room",
      presetId: "hud-room",
      status: "resolved"
    });
  });

  it("removes a custom preset and falls back to the default", () => {
    const project = duplicateHudPresetInProject(createBlankProjectData({ name: "HUD test" }), DEFAULT_HUD_PRESET.id, "hud-remove", "Remover");
    const active = setActiveHudPresetInProject(project, "hud-remove");
    const removed = removeHudPresetInProject(active, "hud-remove");
    const presentation = deriveHudPresetsWorkspacePresentation(removed);

    expect(presentation.activePresetId).toBe(DEFAULT_HUD_PRESET.id);
    expect(presentation.presets.some((preset) => preset.id === "hud-remove")).toBe(false);
  });

  it("creates an advanced HUD with movable components from a standard preset", () => {
    const project = createAdvancedHudPresetInProject(
      createBlankProjectData({ name: "HUD advanced test" }),
      DEFAULT_HUD_PRESET.id,
      "hud-advanced",
      "HUD avançada"
    );
    const advanced = deriveHudPresetsWorkspacePresentation(project).presets.find((preset) => preset.id === "hud-advanced");

    expect(advanced).toMatchObject({
      id: "hud-advanced",
      mode: "advanced",
      ready: true
    });
    expect(advanced?.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "frame", x: 0, y: 0 }),
      expect.objectContaining({ kind: "text", text: "HP 03" })
    ]));
  });

  it("normalizes advanced components to the GBA viewport and preserves updates", () => {
    const project = duplicateHudPresetInProject(createBlankProjectData({ name: "HUD bounds" }), DEFAULT_HUD_PRESET.id, "hud-bounds", "HUD bounds");
    const updated = updateHudPresetInProject(project, "hud-bounds", {
      mode: "advanced",
      components: [{
        id: "status",
        kind: "text",
        label: "Status",
        text: "HP",
        asset: "",
        x: 999,
        y: -20,
        width: 2,
        height: 2,
        zIndex: 3,
        visible: true
      }]
    });
    const component = deriveHudPresetsWorkspacePresentation(updated).presets.find((preset) => preset.id === "hud-bounds")?.components[0];

    expect(component).toMatchObject({ x: 232, y: 0, width: 8, height: 8, zIndex: 3 });
  });

  it("reposiciona componentes ancorados nos quatro cantos do viewport GBA", () => {
    const project = duplicateHudPresetInProject(createBlankProjectData({ name: "HUD anchors" }), DEFAULT_HUD_PRESET.id, "hud-anchors", "HUD anchors");
    const updated = updateHudPresetInProject(project, "hud-anchors", {
      mode: "advanced",
      components: [
        {
          id: "top-right",
          kind: "frame",
          label: "Superior direito",
          text: "",
          asset: "",
          x: 0,
          y: 0,
          width: 80,
          height: 24,
          zIndex: 0,
          visible: true,
          anchor: "top-right",
          anchorOffsetX: 8,
          anchorOffsetY: 8
        },
        {
          id: "bottom-left",
          kind: "text",
          label: "Inferior esquerdo",
          text: "DESTINO",
          asset: "",
          x: 0,
          y: 0,
          width: 96,
          height: 8,
          zIndex: 1,
          visible: true,
          anchor: "bottom-left",
          anchorOffsetX: 8,
          anchorOffsetY: 8
        }
      ]
    });
    const components = deriveHudPresetsWorkspacePresentation(updated).presets.find((preset) => preset.id === "hud-anchors")?.components;

    expect(components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "top-right", anchor: "top-right", x: 152, y: 8 }),
      expect.objectContaining({ id: "bottom-left", anchor: "bottom-left", x: 8, y: 144 })
    ]));
  });

  it("estima o orçamento de OBJ e VRAM e sinaliza ícone sem imagem", () => {
    const project = createAdvancedHudPresetInProject(
      createBlankProjectData({ name: "HUD budget" }),
      DEFAULT_HUD_PRESET.id,
      "hud-budget",
      "HUD budget"
    );
    const updated = updateHudPresetInProject(project, "hud-budget", {
      components: [
        {
          id: "icon",
          kind: "icon",
          label: "Sinal",
          text: "",
          asset: "sigil.png",
          x: 8,
          y: 8,
          width: 16,
          height: 16,
          zIndex: 1,
          visible: true
        },
        {
          id: "fallback",
          kind: "icon",
          label: "Fallback",
          text: "S",
          asset: "",
          x: 32,
          y: 8,
          width: 8,
          height: 8,
          zIndex: 2,
          visible: true
        }
      ]
    });
    const preset = deriveHudPresetsWorkspacePresentation(updated).presets.find((candidate) => candidate.id === "hud-budget");
    expect(preset).toBeDefined();

    expect(deriveHudPresetBudget(preset!)).toMatchObject({
      visibleComponentCount: 2,
      imageBackedIconCount: 1,
      fallbackIconCount: 1,
      estimatedOamEntries: 2,
      estimatedVramTiles: 4,
      status: "warning"
    });
  });

  it("copies an existing advanced composition when creating another advanced HUD", () => {
    const base = createAdvancedHudPresetInProject(
      createBlankProjectData({ name: "HUD copy" }),
      DEFAULT_HUD_PRESET.id,
      "hud-source",
      "HUD fonte"
    );
    const customized = updateHudPresetInProject(base, "hud-source", {
      components: [{
        id: "custom-frame",
        kind: "frame",
        label: "Frame customizado",
        text: "",
        asset: "hud-frame.png",
        x: 16,
        y: 24,
        width: 160,
        height: 32,
        zIndex: 2,
        visible: true
      }]
    });
    const copied = createAdvancedHudPresetInProject(customized, "hud-source", "hud-copy", "HUD cópia");
    const component = deriveHudPresetsWorkspacePresentation(copied).presets.find((preset) => preset.id === "hud-copy")?.components[0];

    expect(component).toMatchObject({
      id: "custom-frame",
      asset: "hud-frame.png",
      x: 16,
      y: 24,
      width: 160,
      height: 32
    });
  });
});
