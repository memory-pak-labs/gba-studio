import type { SettingsSectionID } from "./settingsWorkspace.js";

// Expose operational defaults and project identification metadata. Scene-specific assets,
// modules, collision and cameras are authored in the Inspector. Hidden stored
// values remain untouched; this policy is not a project migration.
const supportedFields: Partial<Record<SettingsSectionID, readonly string[]>> = {
  // Only keyboard bindings reach the integrated Play; the old preset is a label.
  controls: ["up", "down", "left", "right", "aButton", "bButton", "lButton", "rButton", "startButton", "selectButton"],
  general: ["gameTitle", "author", "version", "startScene", "startPlayer", "exportFolder"],
  build: ["romFileName", "gameCode", "makerCode", "romVersion", "exportFormat", "engineBackend", "enginePackPath", "toolchain", "compilerPath", "splitProjectResources", "compactTilemaps", "persistentBuildCache"],
  hardware: ["resolution", "tileSize", "spritesPerScene", "vramBudget"],
  // exportEngineProject reads these directly, rather than resolveSceneRuntime.
  topdown: ["interactButton", "gridSize", "walkSpeed"],
  platformer: ["interactButton", "jumpButton", "runButton", "walkSpeed", "gravity", "maxFallSpeed", "airControl", "changeDirectionInAir", "jumpMinHeight", "jumpFrames", "coyoteTime", "jumpBuffer", "doubleJump", "wallJump", "wallSlide", "ladders", "dropThrough", "cameraDeadzoneX", "dash", "dashStyle", "dashRechargeFrames", "acceleration"],
  isometric: ["tileWidth", "tileHeight", "heightStep"],
  battleRpg: ["maxPartySize", "maxEnemies", "turnDelayFrames", "escapeEnabled", "experienceMultiplier", "typeEffectivenessEnabled", "criticalHitEnabled", "statusConditionsEnabled", "abilitiesEnabled", "rewardGold", "rewardExperience"],
  shmup: ["scrollSpeed", "playerSpeed", "fireRate"],
  pointAndClick: ["cursorSpeed", "hotspotPadding"],
  sprites: [],
  // advancedVideoComposition and gbaVideoModes consume these project defaults.
  backgrounds: ["defaultMapSize", "graphicsMode", "affineLayer", "affineAsset", "affineRotation", "affineScaleX", "affineScaleY", "affineOriginX", "affineOriginY", "affineWrap", "bitmapAsset", "bitmapPage"],
  audio: ["sampleRate"],
  save: ["saveType", "slots", "autoSave", "manualSave", "selectedSlot", "continueLabel", "loadLabel", "deleteLabel", "menuLayout", "confirmDelete", "showPlayerName", "showPlayTime", "showLocation"],
  projectiles: [],
  preview: [],
  // hardwareProfiler consumes the metric switches; log/temp flags have no consumer.
  debug: ["showCpuUsage", "showVramUsage", "showOamUsage", "showPaletteUsage", "showRomUsage", "showRamUsage"]
};

const informationFields: Partial<Record<SettingsSectionID, readonly string[]>> = {
  build: ["exportFormat", "engineBackend", "toolchain", "compilerPath"],
  hardware: ["resolution", "tileSize", "spritesPerScene", "vramBudget"],
  isometric: ["tileHeight"]
};

export function isSupportedSettingsField(sectionID: SettingsSectionID, key: string): boolean {
  return supportedFields[sectionID]?.includes(key) ?? true;
}

export function isSettingsInformationField(sectionID: SettingsSectionID, key: string): boolean {
  return informationFields[sectionID]?.includes(key) ?? false;
}

export function isEditableSettingsField(sectionID: SettingsSectionID, key: string): boolean {
  return isSupportedSettingsField(sectionID, key) && !isSettingsInformationField(sectionID, key);
}
