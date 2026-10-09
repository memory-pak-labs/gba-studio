import type { GBAProjectData } from "./projectFile.js";
import {
  buildEngineProjectSaveConfig,
  type EngineProjectSaveConfig
} from "./sceneRuntimeExport.js";
import { normalizeAffineScenePresentation } from "./affineScene.js";
import { parseGbaVideoMode } from "./gbaVideoModes.js";
import { normalizeSceneComposition } from "./sceneComposition.js";

export const RUNTIME_CAPABILITY_IDS = ["save", "rtc", "link", "affine"] as const;
export type RuntimeCapabilityID = (typeof RUNTIME_CAPABILITY_IDS)[number];

export interface RuntimeCapabilityDeclaration {
  id: RuntimeCapabilityID;
  enabled: boolean;
  required: boolean;
  settings: Record<string, boolean | number | string>;
}

export interface ProjectRuntimeCapabilityManifest {
  schema: 1;
  registry: "gba-studio-runtime-capabilities";
  capabilities: RuntimeCapabilityDeclaration[];
}

export interface ProjectAffineCapabilityUsage {
  enabled: boolean;
  projectDefault: boolean;
  sceneCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function capabilityIsEnabled(source: Record<string, unknown> | undefined, id: Exclude<RuntimeCapabilityID, "save">): boolean {
  const declaration = source?.[id];
  if (typeof declaration === "boolean") return declaration;
  return isRecord(declaration) && declaration.enabled === true;
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;
  return projectArray(data, "rooms");
}

function roomRuntimeConfig(room: Record<string, unknown>): Record<string, unknown> | undefined {
  const runtime = isRecord(room.runtime) ? room.runtime : undefined;
  return runtime && isRecord(runtime.config) ? runtime.config : undefined;
}

function hasEnabledSceneCapability(config: Record<string, unknown>, ids: ReadonlySet<string>): boolean {
  return ["capabilities", "tacticalCapabilities"].some((key) => {
    const entries = config[key];
    return Array.isArray(entries) && entries.some((entry) => (
      isRecord(entry) && typeof entry.id === "string" && ids.has(entry.id) && entry.enabled === true
    ));
  });
}

function sceneUsesAffineCapability(room: Record<string, unknown>): boolean {
  const config = roomRuntimeConfig(room);
  if (!config) return false;
  if (config.cursorAffine === true) return true;

  if (Object.hasOwn(config, "composition")) {
    const composition = normalizeSceneComposition(config.composition);
    const hasAffineLayer = composition.layers.some((layer) => layer.enabled && layer.kind === "affine_bg");
    if (composition.enabled && (composition.mode === "affine" || hasAffineLayer || composition.effects.hblank.enabled)) {
      return true;
    }
  }

  if (normalizeAffineScenePresentation(config.affine).enabled) return true;

  return hasEnabledSceneCapability(config, new Set([
    "affine_background",
    "affine_obj",
    "hblank_timeline"
  ]));
}

/**
 * Derives Affine usage from the actual project default and scene opt-ins.
 * The old runtimeCapabilities.affine declaration is intentionally ignored:
 * Affine is a scene-level choice, while this result is only a project summary
 * consumed by preview/export/runtime manifests.
 */
export function deriveProjectAffineCapabilityUsage(data: GBAProjectData): ProjectAffineCapabilityUsage {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const backgrounds = settings && isRecord(settings.backgrounds) ? settings.backgrounds : undefined;
  const graphicsMode = typeof backgrounds?.graphicsMode === "string"
    ? parseGbaVideoMode(backgrounds.graphicsMode)
    : 0;
  const projectDefault = graphicsMode === 1 || graphicsMode === 2;
  const sceneCount = projectRooms(data).filter(sceneUsesAffineCapability).length;

  return {
    enabled: projectDefault || sceneCount > 0,
    projectDefault,
    sceneCount
  };
}

function saveCapabilitySettings(save: EngineProjectSaveConfig): Record<string, boolean | number | string> {
  return {
    device: "sram",
    autosave: save.autosave,
    slot_count: save.slot_count,
    slot_capacity: save.slot_capacity,
    offset: save.offset,
    version: save.version
  };
}

/**
 * Resolves the project-level platform capabilities shared by export and the
 * runtime. Scene capabilities remain in the separate scene manifest.
 */
export function buildProjectRuntimeCapabilityManifest(
  data: GBAProjectData,
  saveConfig: EngineProjectSaveConfig = buildEngineProjectSaveConfig(
    isRecord(data.settings) && isRecord(data.settings.save) ? data.settings.save : undefined
  )
): ProjectRuntimeCapabilityManifest {
  const projectSettings = isRecord(data.settings) ? data.settings : undefined;
  const declarations = isRecord(projectSettings?.runtimeCapabilities) ? projectSettings.runtimeCapabilities : undefined;
  const rtcEnabled = capabilityIsEnabled(declarations, "rtc");
  const linkEnabled = capabilityIsEnabled(declarations, "link");
  const affineEnabled = deriveProjectAffineCapabilityUsage(data).enabled;

  return {
    schema: 1,
    registry: "gba-studio-runtime-capabilities",
    capabilities: [
      {
        id: "save",
        enabled: saveConfig.enabled,
        required: saveConfig.enabled,
        settings: saveCapabilitySettings(saveConfig)
      },
      {
        id: "rtc",
        enabled: rtcEnabled,
        required: rtcEnabled,
        settings: { preview_clock: "fake", hardware_provider: "gba_rtc" }
      },
      {
        id: "link",
        enabled: linkEnabled,
        required: linkEnabled,
        settings: { transport: "link_cable", preview_transport: "loopback", max_peers: 2 }
      },
      {
        id: "affine",
        enabled: affineEnabled,
        required: affineEnabled,
        settings: { bg: true, obj: true, hblank: true }
      }
    ]
  };
}
