import { describe, expect, it } from "vitest";
import { planAssetDeletion, resolveAssetDeletion } from "../shared/assetDeletion.js";
import { renameAssetInProject } from "../shared/filesWorkspace.js";
import { planHudPresetDeletion, resolveHudPresetDeletion } from "../shared/hudSceneAuthoring.js";
import { deriveHudPresetsWorkspacePresentation, removeHudPresetInProject, updateHudPresetInProject } from "../shared/hudPresets.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile.js";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject, removeRoomFromProject } from "../shared/roomsWorkspace.js";
import { updateSettingsFieldInProject } from "../shared/settingsWorkspace.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

const blank = () => buildProjectFromTemplate("blank", { name: "Meu jogo" });
const settings = (data: Record<string, unknown>) => data.settings as Record<string, any>;
const records = (data: Record<string, unknown>, key: string) => data[key] as Record<string, any>[];
const room = { id: "first", name: "Minha cena", sceneType: "topdown", width: 30, height: 20 } as const;

describe("editing a copy of the blank template", () => {
  it("unlinks the default background and respects the change when creating a scene after reopening", () => {
    const initial = blank();
    const name = settings(initial).sceneTypes.defaultBackgrounds.topdown;
    const id = records(initial, "assets").find(asset => asset.name === name)!.id;
    expect(planAssetDeletion(initial, [id]).canUnlink).toBe(true);
    const edited = resolveAssetDeletion(initial, [id], null);
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ data: edited, summary: summarizeGBAProject(edited) })).data;
    const created = createRoomInProject(reopened, room);
    expect(records(created, "scenas")[0]?.backgroundAssetName ?? "").toBe("");
    expect(records(created, "assets").some(asset => asset.id === id)).toBe(false);
    expect(() => buildEngineExportProjectContract(created)).not.toThrow();
    expect(records(removeRoomFromProject(created, room.id, null), "scenas")).toEqual([]);
    expect(settings(blank()).sceneTypes.defaultBackgrounds.topdown).toBe(name);
  });

  it("keeps a renamed default background selected in new scenes", () => {
    const initial = blank();
    const name = settings(initial).sceneTypes.defaultBackgrounds.topdown;
    const id = records(initial, "assets").find(asset => asset.name === name)!.id;
    const edited = renameAssetInProject(initial, id, "meu-fundo.png");
    expect(records(createRoomInProject(edited, room), "scenas")[0]?.backgroundAssetName).toBe("meu-fundo.png");
  });

  it("honors the explicit no-player setting for new scenes", () => {
    const edited = updateSettingsFieldInProject(blank(), "sceneTypes", "defaultPlayerSprites.topdown", "");
    expect(createRoomInProject(edited, room).actors).toEqual([]);
  });

  it("removes an unused starter sheet together with its own clips and states", () => {
    const initial = blank();
    const name = settings(initial).sceneTypes.defaultPlayerSprites.topdown;
    const id = records(initial, "assets").find(asset => asset.name === name)!.id;
    const plan = planAssetDeletion(initial, [id]);
    expect(plan.usages.some(usage => usage.includes("Animação"))).toBe(true);
    expect(plan.canUnlink).toBe(true);
    const next = resolveAssetDeletion(initial, [id], null);
    expect(records(next, "animations").some(animation => animation.spriteSheet === name)).toBe(false);
    expect(records(next, "animationStates").some(state => state.spriteSheet === name)).toBe(false);
    expect(createRoomInProject(next, room).actors).toEqual([]);
    expect(planAssetDeletion(createRoomInProject(initial, room), [id]).canUnlink).toBe(false);
  });

  it("protects the whole starter sheet when a script still uses one of its states", () => {
    const data = blank();
    const name = settings(data).sceneTypes.defaultPlayerSprites.topdown;
    const id = records(data, "assets").find(asset => asset.name === name)!.id;
    const state = records(data, "animationStates").find(item => item.spriteSheet === name)!;
    state.name = "Meu estado";
    data.events = [{ id: "event", name: "Evento", command: 'set_actor_animation_state Player "Meu estado"' }];
    expect(state.animationIDs.length).toBeGreaterThan(1);
    expect(planAssetDeletion(data, [id]).canUnlink).toBe(false);
  });

  it("edits and removes the local HUD kit and leaves the engine fallback available", () => {
    const initial = blank();
    const kit = deriveHudPresetsWorkspacePresentation(initial).activePreset;
    expect(kit.builtIn).toBe(false);
    const renamed = updateHudPresetInProject(initial, kit.id, { name: "Minha HUD" });
    expect(deriveHudPresetsWorkspacePresentation(renamed).activePreset.name).toBe("Minha HUD");
    const removed = removeHudPresetInProject(renamed, kit.id);
    expect(deriveHudPresetsWorkspacePresentation(removed).activePreset).toMatchObject({ builtIn: true, mode: "standard" });
    expect(deriveHudPresetsWorkspacePresentation(blank()).activePreset.name).toBe("HUD padrão");
  });

  it("resolves HUD references in a scene and its menu screens in the same deletion", () => {
    const initial = createRoomInProject(blank(), { ...room, sceneType: "menu" });
    const [scene] = records(initial, "scenas");
    scene!.hudPresetId = "hud-default";
    scene!.runtime.config.screens = [{ id: "options", screenType: "menu", hudPresetId: "@project" }];
    expect(planHudPresetDeletion(initial, "hud-default")?.usages).toContain("Cena: Minha cena");
    const next = resolveHudPresetDeletion(initial, "hud-default", null);
    expect(records(next, "scenas")[0]?.hudPresetId).toBeNull();
    expect(records(next, "scenas")[0]?.runtime.config.screens[0]).toMatchObject({ hudMode: "none" });
    expect(deriveHudPresetsWorkspacePresentation(next).activePreset.builtIn).toBe(true);
  });

  it("lets users unlink a Dungeon material and falls back to procedural materials", () => {
    const initial = createRoomInProject(blank(), { ...room, sceneType: "dungeonCrawler" });
    const name = records(initial, "scenas")[0]?.runtime.config.presentation.materialAssets[0];
    const id = records(initial, "assets").find(asset => asset.name === name)!.id;
    const plan = planAssetDeletion(initial, [id]);
    expect(plan.usages.some(usage => usage.includes(room.name))).toBe(true);
    expect(plan.canUnlink).toBe(true);
    const next = resolveAssetDeletion(initial, [id], null);
    expect(records(next, "scenas")[0]?.runtime.config.presentation.materialAssets).toBeUndefined();
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });
});
