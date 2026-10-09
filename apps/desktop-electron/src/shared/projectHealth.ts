import {
  formatGBAEntityEventProjectionIssue,
  validateGBAEntityEventProjection
} from "../../../../packages/project-contract/src/index.js";
import type { GBAProjectData } from "./projectFile.js";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import {
  deriveDialoguesWorkspacePresentation,
  deriveDialoguesWorkspaceValidationIssues
} from "./dialoguesWorkspace.js";
import {
  deriveEventsWorkspacePresentation,
  deriveEventsWorkspaceValidationIssues
} from "./eventsWorkspace.js";
import {
  deriveFilesWorkspacePresentation,
  deriveFilesWorkspaceValidation
} from "./filesWorkspace.js";
import { resolveHudPresetBinding } from "./hudPresets.js";
import { deriveProjectBudgetPresentation, type AssetPackBudgetReport } from "./projectBudget.js";
import { deriveProjectContractDiagnostics, type ProjectContractDiagnostics } from "./projectContractDiagnostics.js";
import {
  deriveRoomsWorkspacePresentation,
  deriveRoomsWorkspaceValidationIssues
} from "./roomsWorkspace.js";
import {
  resolveSceneCapabilityManifest,
  SCENE_FEATURE_MODULES,
  validateSceneBudget,
  type SceneBudget,
  type SceneCapabilityID,
  type SceneCapabilityManifest,
  type SceneFeatureModule
} from "./sceneFeatureModules.js";
import { buildScenePreflightReport, type ScenePreflightReport } from "./scenePreflight.js";
import { sceneTypeProfile } from "./sceneTypeProfiles.js";
import {
  deriveSettingsWorkspacePresentation
} from "./settingsWorkspace.js";
import {
  deriveSpritesWorkspacePresentation,
  deriveSpritesWorkspaceValidationIssues
} from "./spritesWorkspace.js";
import { auditProjectSpriteVramHealthWarnings, spriteVramWarningLabels } from "./spriteVramAnalysis.js";
import { buildGbaHardwareContract } from "./gbaHardwareContract.js";

export type ProjectDiagnosticSeverity = "info" | "warning" | "error";
export type ProjectDiagnosticScope = "project" | "scene" | "asset" | "audio" | "runtime" | "export";
export type ProjectHealthStatus = "ready" | "warning" | "blocked";
export type ProjectDiagnosticWorkspace = "Arquivos" | "Editor" | "Sprites" | "Dialogos" | "Audio" | "Exportar" | "Ajustes";

export interface ProjectDiagnostic {
  id: string;
  code: string;
  severity: ProjectDiagnosticSeverity;
  scope: ProjectDiagnosticScope;
  workspace: ProjectDiagnosticWorkspace;
  sceneName?: string;
  targetID?: string;
  targetName?: string;
  message: string;
  detail?: string;
  fixAction?: "open_editor" | "open_files" | "open_sprites" | "open_dialogues" | "open_audio" | "open_export" | "open_settings";
}

export interface SceneCapabilitySummary {
  sceneName: string;
  sceneType: string;
  sceneLabel: string;
  featureModules: SceneFeatureModule[];
  enabledModules: SceneFeatureModule[];
  enabledCapabilities?: SceneCapabilityID[];
  runtimeCapabilities: string[];
  assetRules: string[];
  previewMode: "map" | "focus" | "play";
  budget: SceneBudget;
  capabilityManifest: SceneCapabilityManifest;
  preflight: ScenePreflightReport;
}

export interface ProjectHealthReport {
  status: ProjectHealthStatus;
  diagnostics: ProjectDiagnostic[];
  scenes: SceneCapabilitySummary[];
  counts: { info: number; warning: number; error: number };
  contract: ProjectContractDiagnostics;
  exportReady: boolean;
}

export interface ProjectHealthOptions {
  assetPackReport?: AssetPackBudgetReport | null;
  engine?: { ok: boolean; blockers: Array<{ id: string; message: string }> } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function sceneCollection(data: GBAProjectData): Record<string, unknown>[] {
  const scenes = records(data.scenas);
  return scenes.length > 0 ? scenes : records(data.rooms);
}

function sceneRuntime(scene: Record<string, unknown>): { type: string; config: Record<string, unknown> } {
  const runtime = isRecord(scene.runtime) ? scene.runtime : {};
  const config = isRecord(runtime.config)
    ? runtime.config
    : isRecord(scene.config)
      ? scene.config
      : {};
  return {
    type: stringField(runtime.type, stringField(scene.sceneType, "topdown")),
    config
  };
}

function addDiagnostic(diagnostics: ProjectDiagnostic[], diagnostic: ProjectDiagnostic): void {
  diagnostics.push(diagnostic);
}

function workspaceAction(workspace: ProjectDiagnosticWorkspace): ProjectDiagnostic["fixAction"] {
  if (workspace === "Arquivos") return "open_files";
  if (workspace === "Sprites") return "open_sprites";
  if (workspace === "Dialogos") return "open_dialogues";
  if (workspace === "Audio") return "open_audio";
  if (workspace === "Exportar") return "open_export";
  if (workspace === "Ajustes") return "open_settings";
  return "open_editor";
}

function validationSeverity(value: unknown): ProjectDiagnosticSeverity {
  return value === "error" ? "error" : value === "info" ? "info" : "warning";
}

function addSceneDiagnostics(
  diagnostics: ProjectDiagnostic[],
  data: GBAProjectData,
  scene: Record<string, unknown>,
  sceneIndex: number,
  assetPackReport: AssetPackBudgetReport | null | undefined
): SceneCapabilitySummary {
  const sceneName = stringField(scene.name, `Cena ${sceneIndex + 1}`);
  const runtime = sceneRuntime(scene);
  const profile = sceneTypeProfile(runtime.type);
  const requestedModules = runtime.config.modules;
  const requestedCapabilities = runtime.config.capabilities;
  const capabilityManifest = resolveSceneCapabilityManifest(profile.id, requestedModules, profile.editorTools, requestedCapabilities);
  for (const issue of capabilityManifest.issues) {
    const code = issue.code === "UNKNOWN_MODULE"
      ? "scene.module.unknown"
      : issue.code === "INCOMPATIBLE_MODULE"
        ? "scene.module.incompatible"
        : issue.code === "UNKNOWN_CAPABILITY"
          ? "scene.capability.unknown"
          : issue.code === "INCOMPATIBLE_CAPABILITY"
            ? "scene.capability.incompatible"
            : issue.code === "MISSING_EDITOR_TOOL" && Boolean(issue.module && !SCENE_FEATURE_MODULES.includes(issue.module as SceneFeatureModule))
              ? "scene.capability.editor_tool_missing"
        : issue.code === "MISSING_EDITOR_TOOL"
          ? "scene.module.editor_tool_missing"
          : "scene.module.invalid";
    const severity: ProjectDiagnosticSeverity = issue.code === "MISSING_EDITOR_TOOL" ? "warning" : "error";
    addDiagnostic(diagnostics, {
      id: `scene-${sceneIndex}-${code}-${issue.module ?? issue.field ?? "config"}`,
      code,
      severity,
      scope: "scene",
      workspace: "Editor",
      sceneName,
      targetName: sceneName,
      message: issue.message,
      detail: issue.module ? `Módulo: ${issue.module}.` : undefined,
      fixAction: "open_editor"
    });
  }

  const requestedBudget = isRecord(runtime.config.budget) ? runtime.config.budget as Partial<SceneBudget> : undefined;
  if (requestedBudget) {
    for (const issue of validateSceneBudget(profile.id, requestedBudget)) {
      const isExceeded = issue.code === "BUDGET_EXCEEDED";
      addDiagnostic(diagnostics, {
        id: `scene-${sceneIndex}-budget-${issue.field ?? "invalid"}`,
        code: isExceeded ? "scene.budget.exceeded" : "scene.budget.invalid",
        severity: "error",
        scope: "scene",
        workspace: "Editor",
        sceneName,
        targetName: sceneName,
        message: issue.message,
        detail: issue.field ? `Recurso: ${issue.field}.` : undefined,
        fixAction: "open_editor"
      });
    }
  }

  const hudBinding = resolveHudPresetBinding(data, { roomPresetId: scene.hudPresetId });
  if (hudBinding.status === "missing") {
    addDiagnostic(diagnostics, {
      id: `scene-${sceneIndex}-hud-binding-missing`,
      code: "hud.binding.missing",
      severity: "warning",
      scope: "scene",
      workspace: "Editor",
      sceneName,
      targetName: sceneName,
      message: `O preset de HUD “${hudBinding.requestedPresetId}” não existe no catálogo atual.`,
      detail: "A sala continua preservando o ID autoral, mas o projeto usará o preset padrão até a correção.",
      fixAction: "open_editor"
    });
  }

  const budget = deriveProjectBudgetPresentation(data, sceneName, assetPackReport);
  if (budget.tone === "error" || !budget.projectReady) {
    const compilerConfirmed = budget.source === "compiler";
    addDiagnostic(diagnostics, {
      id: `scene-${sceneIndex}-asset-budget`,
      code: "asset.budget.blocked",
      severity: compilerConfirmed ? "error" : "warning",
      scope: "asset",
      workspace: "Arquivos",
      sceneName,
      targetName: sceneName,
      message: compilerConfirmed
        ? "O orçamento de assets da cena excede um limite de exportação."
        : "A estimativa de assets da cena excede um limite; confirme no preflight do compilador.",
      detail: `${budget.blockingOverflowCount} overflow(s) bloqueante(s); fonte: ${budget.source}.`,
      fixAction: "open_files"
    });
  } else if (budget.tone === "warning") {
    addDiagnostic(diagnostics, {
      id: `scene-${sceneIndex}-asset-budget-warning`,
      code: "asset.budget.warning",
      severity: "warning",
      scope: "asset",
      workspace: "Arquivos",
      sceneName,
      targetName: sceneName,
      message: "O orçamento de assets da cena está próximo do limite.",
      detail: `Pressão máxima estimada: ${budget.maxScenePressure}%; fonte: ${budget.source}.`,
      fixAction: "open_files"
    });
  }

  const preflight = buildScenePreflightReport(data, sceneName);

  return {
    sceneName,
    sceneType: profile.id,
    sceneLabel: profile.label,
    featureModules: [...profile.capabilities.featureModules],
    enabledCapabilities: capabilityManifest.capabilities
      .filter((capability) => capability.status.enabled)
      .map((capability) => capability.id),
    enabledModules: capabilityManifest.capabilities
      .filter((capability) => capability.status.enabled && SCENE_FEATURE_MODULES.includes(capability.id as SceneFeatureModule))
      .map((capability) => capability.id as SceneFeatureModule),
    runtimeCapabilities: [...profile.capabilities.runtimeCapabilities],
    assetRules: [...profile.capabilities.assetRules],
    previewMode: profile.capabilities.preview.mode,
    budget: { ...profile.capabilities.budget },
    capabilityManifest,
    preflight
  };
}

function addWorkspaceDiagnostics(data: GBAProjectData, diagnostics: ProjectDiagnostic[]): void {
  for (const issue of validateGBAEntityEventProjection(data)) {
    addDiagnostic(diagnostics, {
      id: `projection-${issue.source}-${issue.itemIndex}`,
      code: issue.source === "events" ? "runtime.event_projection.invalid" : "runtime.entity_projection.invalid",
      severity: "warning",
      scope: "runtime",
      workspace: "Editor",
      targetName: issue.itemName,
      message: formatGBAEntityEventProjectionIssue(issue),
      detail: `Origem: ${issue.source}.`,
      fixAction: "open_editor"
    });
  }

  const filesPresentation = deriveFilesWorkspacePresentation(data);
  for (const issue of deriveFilesWorkspaceValidation(filesPresentation).issues) {
    addDiagnostic(diagnostics, {
      id: `files-${issue.assetID ?? issue.message}`,
      code: `files.${issue.severity}`,
      severity: validationSeverity(issue.severity),
      scope: "asset",
      workspace: "Arquivos",
      targetID: issue.assetID,
      targetName: issue.assetID ? filesPresentation.assets.find((asset) => asset.id === issue.assetID)?.name : undefined,
      message: issue.message,
      fixAction: "open_files"
    });
  }

  const roomsPresentation = deriveRoomsWorkspacePresentation(data);
  for (const issue of deriveRoomsWorkspaceValidationIssues(roomsPresentation)) {
    addDiagnostic(diagnostics, {
      id: `rooms-${issue.id}`,
      code: `rooms.${issue.severity}`,
      severity: validationSeverity(issue.severity),
      scope: "scene",
      workspace: "Editor",
      targetName: issue.roomName,
      message: issue.message,
      fixAction: "open_editor"
    });
  }

  const spritesPresentation = deriveSpritesWorkspacePresentation(data);
  for (const issue of deriveSpritesWorkspaceValidationIssues(spritesPresentation)) {
    if (issue.message.includes(spriteVramWarningLabels.highVRAMUsage)) continue;
    addDiagnostic(diagnostics, {
      id: `sprites-${issue.id}`,
      code: `sprites.${issue.severity}`,
      severity: validationSeverity(issue.severity),
      scope: "asset",
      workspace: "Sprites",
      targetName: issue.spriteSheet,
      message: issue.message,
      fixAction: "open_sprites"
    });
  }

  const eventsPresentation = deriveEventsWorkspacePresentation(data);
  for (const issue of deriveEventsWorkspaceValidationIssues(eventsPresentation)) {
    addDiagnostic(diagnostics, {
      id: `events-${issue.id}`,
      code: `events.${issue.severity}`,
      severity: validationSeverity(issue.severity),
      scope: "runtime",
      workspace: "Editor",
      targetID: issue.nodeID,
      targetName: issue.eventName,
      message: issue.message,
      fixAction: "open_editor"
    });
  }

  const dialoguesPresentation = deriveDialoguesWorkspacePresentation(data);
  for (const issue of deriveDialoguesWorkspaceValidationIssues(dialoguesPresentation)) {
    addDiagnostic(diagnostics, {
      id: `dialogues-${issue.id}`,
      code: `dialogues.${issue.severity}`,
      severity: validationSeverity(issue.severity),
      scope: "scene",
      workspace: "Dialogos",
      targetName: issue.dialogueKey,
      message: issue.message,
      fixAction: "open_dialogues"
    });
  }

  const audioPresentation = deriveAudioWorkspacePresentation(data);
  for (const item of audioPresentation.items) {
    for (const [warningIndex, warning] of item.warnings.entries()) {
      addDiagnostic(diagnostics, {
        id: `audio-${item.id}-${warningIndex}`,
        code: "audio.warning",
        severity: "warning",
        scope: "audio",
        workspace: "Audio",
        targetID: item.id,
        targetName: item.name,
        message: `${item.name}: ${warning}`,
        fixAction: "open_audio"
      });
    }
  }

  const settingsPresentation = deriveSettingsWorkspacePresentation(data);
  for (const diagnostic of settingsPresentation.diagnostics) {
    if (diagnostic.tone === "muted" || diagnostic.tone === "default") continue;
    const exportDiagnostic = new Set(["engine-backend", "engine-pack", "export-folder", "emulator-path"]).has(diagnostic.id);
    addDiagnostic(diagnostics, {
      id: `settings-${diagnostic.id}`,
      code: `settings.${diagnostic.tone}`,
      severity: diagnostic.tone === "ok" ? "info" : "warning",
      scope: "project",
      workspace: exportDiagnostic ? "Exportar" : "Ajustes",
      targetName: diagnostic.id,
      message: `${diagnostic.label}: ${diagnostic.detail}`,
      fixAction: exportDiagnostic ? "open_export" : "open_settings"
    });
  }
}

function addSpriteVramDiagnostics(data: GBAProjectData, diagnostics: ProjectDiagnostic[]): void {
  for (const warning of auditProjectSpriteVramHealthWarnings(data)) {
    const targetName = warning.split(" (")[0] || "animação";
    addDiagnostic(diagnostics, {
      id: `sprite-vram-${targetName}`,
      code: "asset.sprite_vram",
      severity: "warning",
      scope: "asset",
      workspace: "Sprites",
      targetName,
      message: `${targetName}: uso estimado de VRAM OBJ acima de 32 KB.`,
      detail: `${warning}. Reduza frames únicos ou divida o asset antes de exportar.`,
      fixAction: "open_sprites"
    });
  }
}

function addGbaHardwareDiagnostics(data: GBAProjectData, diagnostics: ProjectDiagnostic[]): void {
  const hardware = buildGbaHardwareContract(data);
  for (const [index, item] of hardware.issues.entries()) {
    const isSprite = item.code.includes("SPRITE");
    const workspace = isSprite ? "Sprites" : item.sceneName ? "Editor" : "Arquivos";
    const scope = isSprite ? "asset" : item.sceneName ? "scene" : "asset";
    addDiagnostic(diagnostics, {
      id: `gba-hardware-${item.code}-${item.sceneName ?? "project"}-${index}`,
      code: `gba.hardware.${item.code.toLowerCase()}`,
      severity: item.severity,
      scope,
      workspace,
      sceneName: item.sceneName,
      targetName: item.sceneName,
      message: item.message,
      detail: item.resolution,
      fixAction: isSprite ? "open_sprites" : item.sceneName ? "open_editor" : "open_files"
    });
  }
}

function addContractDiagnostics(contract: ProjectContractDiagnostics, diagnostics: ProjectDiagnostic[]): void {
  if (contract.ok) return;
  for (const item of contract.validatorCounts) {
    addDiagnostic(diagnostics, {
      id: `contract-${item.validator}`,
      code: "contract.invalid",
      severity: "error",
      scope: "export",
      workspace: "Exportar",
      targetName: item.validator,
      message: `O contrato ${item.validator} possui ${item.count} pendência(s).`,
      detail: contract.detail,
      fixAction: "open_export"
    });
  }
}

export function deriveProjectHealthReport(
  data: GBAProjectData,
  options: ProjectHealthOptions = {}
): ProjectHealthReport {
  const diagnostics: ProjectDiagnostic[] = [];
  const contract = deriveProjectContractDiagnostics(data);
  addContractDiagnostics(contract, diagnostics);

  const scenes = sceneCollection(data).map((scene, index) => (
    addSceneDiagnostics(diagnostics, data, scene, index, options.assetPackReport)
  ));
  addWorkspaceDiagnostics(data, diagnostics);
  addSpriteVramDiagnostics(data, diagnostics);
  addGbaHardwareDiagnostics(data, diagnostics);

  if (options.engine && !options.engine.ok) {
    const blockers = options.engine.blockers.length > 0
      ? options.engine.blockers
      : [{ id: "engine", message: "O Engine Pack não está pronto para exportação." }];
    for (const blocker of blockers) {
      addDiagnostic(diagnostics, {
        id: `engine-${blocker.id}`,
        code: "engine.blocked",
        severity: "error",
        scope: "runtime",
        workspace: "Exportar",
        targetName: blocker.id,
        message: blocker.message,
        fixAction: "open_export"
      });
    }
  }

  const counts = diagnostics.reduce((result, diagnostic) => {
    result[diagnostic.severity] += 1;
    return result;
  }, { info: 0, warning: 0, error: 0 });
  const status: ProjectHealthStatus = counts.error > 0 ? "blocked" : counts.warning > 0 ? "warning" : "ready";
  return {
    status,
    diagnostics,
    scenes,
    counts,
    contract,
    exportReady: counts.error === 0
  };
}

export function projectDiagnosticWorkspaceAction(workspace: ProjectDiagnosticWorkspace): ProjectDiagnostic["fixAction"] {
  return workspaceAction(workspace);
}
