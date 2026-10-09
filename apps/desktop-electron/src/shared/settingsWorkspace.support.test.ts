import { describe, expect, it } from "vitest";
import {
  deriveSettingsPathValidationTargets,
  deriveSettingsSectionsForScope,
  deriveSettingsWorkspacePresentation,
  resetSettingsSectionInProject,
  updateSettingsFieldInProject
} from "./settingsWorkspace.js";
import { resolveSceneRuntime } from "./sceneTypeProfiles.js";

describe("settings with operational consumers", () => {
  it("hides the legacy language field and preserves it when restoring General", () => {
    const data = { settings: { general: { defaultLanguage: "es", author: "Author", version: "2.0.0" } } };
    const general = deriveSettingsWorkspacePresentation(data).sections.find(section => section.id === "general")!;
    expect(general.editableFields.map(field => field.key)).not.toContain("defaultLanguage");
    expect(updateSettingsFieldInProject(data, "general", "defaultLanguage", "pt-BR")).toBe(data);
    expect(resetSettingsSectionInProject(data, "general").settings).toMatchObject({ general: { defaultLanguage: "es" } });
  });
  it("keeps graphics defaults in Cenas and removes inactive export groups", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: {} });
    const scenes = deriveSettingsSectionsForScope(presentation, "scene").map(s => s.id);
    const exports = deriveSettingsSectionsForScope(presentation, "export").map(s => s.id);
    expect(scenes).toContain("backgrounds");
    for (const id of ["backgrounds", "sprites", "projectiles", "preview"]) expect(exports).not.toContain(id);
    expect(exports).toEqual(expect.arrayContaining(["build", "hardware", "audio", "save", "runtimeCapabilities", "debug"]));
  });

  it("offers only functional fields and keeps hardware information read-only", () => {
    const sections = deriveSettingsWorkspacePresentation({ settings: {} }).sections;
    expect(sections.find(s => s.id === "topdown")!.editableFields.map(f => f.key)).toEqual(["interactButton", "gridSize", "walkSpeed"]);
    expect(sections.find(s => s.id === "pointAndClick")!.editableFields.map(f => f.key)).toEqual(["cursorSpeed", "hotspotPadding"]);
    expect(sections.find(s => s.id === "shmup")!.editableFields.map(f => f.key)).toEqual(["scrollSpeed", "playerSpeed", "fireRate"]);
    expect(sections.find(s => s.id === "audio")!.editableFields.map(f => f.key)).toEqual(["sampleRate"]);
    expect(sections.find(s => s.id === "hardware")!.editableFields.every(f => f.readOnly)).toBe(true);
    expect(sections.find(s => s.id === "build")!.editableFields.some(f => f.key === "runEmulatorAfterBuild")).toBe(false);
    expect(sections.find(s => s.id === "build")!.editableFields.find(f => f.key === "compilerPath")?.readOnly).toBe(true);
  });

  it("does not overwrite hidden, fixed or scene-local values when restoring defaults", () => {
    const data = { settings: { topdown: { walkSpeed: 3, runSpeed: 9, allowDiagonal: false }, hardware: { resolution: "custom" } }, scenas: [{ runtime: { type: "platformer", config: { gravity: 0.8 } } }] };
    const reset = resetSettingsSectionInProject(data, "topdown");
    expect(reset.settings).toMatchObject({ topdown: { walkSpeed: 1, runSpeed: 9, allowDiagonal: false } });
    expect(reset.scenas).toEqual(data.scenas);
    expect(updateSettingsFieldInProject(data, "topdown", "runSpeed", 2)).toBe(data);
    expect(updateSettingsFieldInProject(data, "hardware", "resolution", "480 x 320")).toBe(data);
  });

  it("limits intent cards to exposed editable controls", () => {
    const sections = deriveSettingsWorkspacePresentation({ settings: {} }).sections;
    for (const section of sections) {
      const keys = new Set(section.editableFields.filter(f => !f.readOnly).map(f => f.key));
      for (const group of section.intentGroups) for (const option of group.options) {
        expect(option.changes.length).toBeGreaterThan(0);
        expect(option.fieldCount).toBe(option.changes.length);
        for (const change of option.changes) expect(keys.has(change.fieldKey)).toBe(true);
      }
    }
  });

  it("preserves supported PCM rates and refuses an unsupported explicit rate", () => {
    const data = { settings: { audio: { sampleRate: 15768 } } };
    const rate = deriveSettingsWorkspacePresentation(data).sections.find(s => s.id === "audio")!.editableFields[0];
    expect(rate.options?.map(o => o.value)).toEqual(expect.arrayContaining([0, 15768, 32768]));
    expect(rate.options?.map(o => o.value)).not.toContain(44100);
    expect(updateSettingsFieldInProject(data, "audio", "sampleRate", 44100)).toBe(data);
    expect(updateSettingsFieldInProject(data, "audio", "sampleRate", 3000)).toBe(data);
  });

  it("resolves the export folder relative to the project, using the pipeline destination", () => {
    const presentation = deriveSettingsWorkspacePresentation({ settings: { general: { exportFolder: "build" } } });
    const targets = deriveSettingsPathValidationTargets(presentation, "export", { projectPath: "/games/farol/farol.gba-project" });
    expect(targets.find(t => t.id === "general.exportFolder")).toMatchObject({ path: "build", validationPath: "/games/farol/build", allowCreate: true });
  });

  it("keeps scene overrides above the retained project physics defaults", () => {
    const base = { settings: { platformer: { gravity: 0.44 } } };
    const changed = updateSettingsFieldInProject(base, "platformer", "gravity", 0.75);
    expect(resolveSceneRuntime("platformer", { type: "platformer", config: {} }, changed.settings).config).toMatchObject({ gravity: 0.75 });
    expect(resolveSceneRuntime("platformer", { type: "platformer", config: { gravity: 0.9 } }, changed.settings).config).toMatchObject({ gravity: 0.9 });
  });

  it.each([
    ["racing", "maxSpeed", 5, "maxSpeed", 5],
    ["dungeonCrawler", "stepDurationMs", 220, "stepDurationMs", 220],
    ["isometric", "tileWidth", "24 px", "tileWidth", 24],
    ["pointAndClick", "cursorSpeed", 2.5, "cursorSpeed", 2.5],
    ["shmup", "fireRate", 18, "fireCooldown", 18]
  ] as const)("passes retained %s defaults into the runtime contract", (type, key, value, runtimeKey, expected) => {
    const data = updateSettingsFieldInProject({ settings: {} }, type, key, value);
    expect(resolveSceneRuntime(type, { type, config: {} }, data.settings).config).toHaveProperty(runtimeKey, expected);
  });
});
