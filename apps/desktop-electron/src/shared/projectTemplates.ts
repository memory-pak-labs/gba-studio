import { parseGBAProjectFile, type GBAProjectData } from "./projectFile.js";
import { expandProjectTilemaps } from "./projectResourceFormat.js";
import { createBlankProjectData } from "./newProject.js";
import { blankPlayerContent, BLANK_PLAYER_DEFAULTS_PROFILE } from "./blankPlayerDefaults.js";
import { blankHudContent } from "./blankHudDefaults.js";
import { blankDialogueContent, BLANK_DIALOGUE_SKIN, BLANK_DIALOGUE_PORTRAIT } from "./blankDialogueDefaults.js";
import { blankSceneHudContent } from "./blankSceneHudDefaults.js";
import { blankBackgroundContent, applyDefaultRoomBackground, BLANK_BACKGROUND_DEFAULTS_PROFILE } from "./blankBackgroundDefaults.js";
import exemploGBAProjectRaw from "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project?raw";

export type ProjectTemplateID = "exemplo-gba" | "blank";

export interface ProjectTemplateDefinition {
  id: ProjectTemplateID;
  title: string;
  detail: string;
  icon: string;
}

export const projectTemplateDefinitions: ProjectTemplateDefinition[] = [
  {
    id: "exemplo-gba",
    title: "O Último Farol",
    detail: "Showcase completo de cenas e runtimes nativos para Game Boy Advance.",
    icon: "GBA"
  },
  {
    id: "blank",
    title: "Projeto em branco",
    detail: "Uma cena com player neutro e animações básicas para criar seu próprio jogo.",
    icon: "+"
  }
];

function buildExemploGBAProject(): GBAProjectData {
  const project = expandProjectTilemaps(parseGBAProjectFile(exemploGBAProjectRaw).data);
  const assets = Array.isArray(project.assets)
    ? project.assets.map((asset) => {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) return asset;
      const record = asset as Record<string, unknown>;
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? record.metadata as Record<string, unknown>
        : {};
      const source = typeof metadata.source === "string" ? metadata.source.trim() : "";
      const sourceOriginal = metadata.sourceOriginal;
      const hasLocalSourcePath = typeof sourceOriginal === "string"
        && /^(?:user-provided:\s*)?(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(sourceOriginal);
      if (!hasLocalSourcePath && !source.startsWith("Assets/")) return record;
      const copiedMetadata = { ...metadata };
      if (hasLocalSourcePath) delete copiedMetadata.sourceOriginal;
      if (source.startsWith("Assets/")) {
        copiedMetadata.bundledDefaultAsset = `template:exemplo-gba/${source}`;
      }
      return { ...record, metadata: copiedMetadata };
    })
    : [];

  return {
    ...project,
    assets
  };
}

function withProjectName(data: GBAProjectData, name: string): GBAProjectData {
  const trimmed = name.trim() || "Novo projeto";
  return {
    ...data,
    name: trimmed
  };
}

export function buildProjectFromTemplate(
  templateID: ProjectTemplateID,
  options: { name: string }
): GBAProjectData {
  if (templateID === "blank") {
    const project = createBlankProjectData({ name: options.name, includeStarterContent: false });
    const content = blankPlayerContent();
    const hud = blankHudContent();
    const sceneHuds = blankSceneHudContent();
    hud.assets.push(...sceneHuds.assets);
    const dialogueAssets = blankDialogueContent();
    const backgrounds = blankBackgroundContent();
    project.assets = [...content.assets, ...hud.assets, ...dialogueAssets, ...backgrounds.assets];
    project.animations = content.animations;
    project.animationStates = content.animationStates;
    project.assetGroups = [
      { id: "asset-group-neutral-players", name: "Players padrão", assetIDs: content.assets.map(asset => asset.id), children: [] },
      { id: "asset-group-neutral-hud", name: "HUD padrão", assetIDs: hud.assets.map(asset => asset.id), children: [] },
      { id: "asset-group-neutral-dialogue", name: "Diálogo padrão", assetIDs: dialogueAssets.map(asset => asset.id), children: [] },
      { id: "asset-group-neutral-backgrounds", name: "Backgrounds padrão", assetIDs: backgrounds.assets.map(asset => asset.id), children: [] }
    ];
    const room = (project.rooms as Record<string, unknown>[])[0]!;
    room.playerActorName = "Player";
    project.actors = [{ id: "actor-player", name: "Player", roomName: room.name,
      spriteSheet: content.defaultPlayerSprites.topdown, animationStateID: "state-neutral-topdown", animationName: "idle_down",
      x: 15, y: 10, eventBindings: {} }];
    const settings = project.settings as Record<string, Record<string, unknown>>;
    settings.general.startPlayer = "Player";
    settings.topdown.playerSprite = content.defaultPlayerSprites.topdown;
    settings.topdown.mirrorLeftFromRight = false;
    settings.pointAndClick.cursorImage = content.defaultPlayerSprites.pointAndClick;
    settings.shmup = { ...settings.shmup, playerSprite: content.defaultPlayerSprites.shmup,
      playerExplosionSprite: content.defaultShmupExplosionSprite };
    settings.sceneTypes.defaultPlayerSprites = {
      ...(settings.sceneTypes.defaultPlayerSprites as Record<string, string>),
      ...content.defaultPlayerSprites
    };
    settings.sceneTypes.playerDefaultsProfile = BLANK_PLAYER_DEFAULTS_PROFILE;
    settings.sceneTypes.backgroundDefaultsProfile = BLANK_BACKGROUND_DEFAULTS_PROFILE;
    settings.sceneTypes.defaultBackgrounds = backgrounds.defaultBackgrounds;
    applyDefaultRoomBackground(project, room);
    project.scena = structuredClone(room);
    (project.settings as Record<string, unknown>).hudPresets = [hud.preset,...sceneHuds.presets];
    (project.settings as Record<string, unknown>).hudPresetId = hud.preset.id;
    settings.uiDialogs = {
      ...settings.uiDialogs,
      boxImage: BLANK_DIALOGUE_SKIN, selectorImage: "neutral-dialogue-selector.png",
      defaultPortrait: BLANK_DIALOGUE_PORTRAIT, portraitLayout: "fixed_slots"
    };
    return project;
  }
  return withProjectName(buildExemploGBAProject(), options.name);
}
