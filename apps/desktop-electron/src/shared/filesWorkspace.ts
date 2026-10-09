import { audioInstrumentBank, resolveAudioInstrumentChannel } from "./audioInstruments.js";
import { audioSourceAsset } from "./audioContract.js";
import type { GBAProjectData } from "./projectFile.js";
import type { ImportedAssetFile } from "./ipc.js";
import { spriteColorMode } from "./spriteColorDepth.js";

export interface FilesWorkspaceAsset {
  id: string;
  name: string;
  kind: string;
  systemImage: string | null;
  source: string | null;
  bundledDefaultAsset: string | null;
  previewKind: FilesWorkspacePreviewKind;
  groupNames: string[];
  usageLabels: string[];
  usageLinks: FilesWorkspaceUsageLink[];
  isUsed: boolean;
  isReusableLibraryAsset: boolean;
  primaryAction: FilesWorkspacePrimaryAction | null;
  colorMode?: "8bpp";
}

export type FilesWorkspaceName = "Editor" | "Sprites" | "Audio" | "Dialogos" | "Eventos" | "Ajustes";
export type FilesWorkspacePreviewKind = "image" | "generic";

export interface FilesWorkspaceUsageLink {
  label: string;
  workspace: FilesWorkspaceName;
  targetID?: string;
  targetName?: string;
  usageKind: string;
}

export interface FilesWorkspacePrimaryAction {
  label: string;
  workspace: FilesWorkspaceName;
  targetID?: string;
  targetName?: string;
  usageKind?: string;
}

export interface FilesWorkspaceGroup {
  id: string;
  name: string;
  assetCount: number;
  depth: number;
  missingAssetIDs: string[];
}

export interface FilesWorkspaceKindCount {
  kind: string;
  count: number;
}

export interface FilesWorkspaceSummaryCard {
  id: "total" | "images" | "audio" | "fonts" | "attention" | "unused";
  label: string;
  value: number;
  tone: "primary" | "neutral" | "warning";
}

export interface FilesWorkspaceAssetKindGroup {
  kind: string;
  count: number;
  usedCount: number;
  assets: FilesWorkspaceAsset[];
}

export interface FilesWorkspacePresentation {
  assets: FilesWorkspaceAsset[];
  groups: FilesWorkspaceGroup[];
  kindCounts: FilesWorkspaceKindCount[];
  summaryCards: FilesWorkspaceSummaryCard[];
  ungroupedAssets: number;
  missingGroupAssetReferenceCount: number;
}

export interface FilesWorkspaceFilterOptions {
  query?: string;
  kind?: string;
  folder?: string;
  usage?: FilesWorkspaceUsageFilter;
}

export interface FilesWorkspaceFolder {
  path: string;
  name: string;
  depth: number;
  count: number;
}

export type FilesWorkspaceUsageFilter = "all" | "used" | "unused";

export interface FilesWorkspaceFilterChip<TValue extends string> {
  id: string;
  label: string;
  value: TValue;
  count: number;
  isActive: boolean;
}

export interface FilesWorkspaceFilterChips {
  kind: Array<FilesWorkspaceFilterChip<string>>;
  usage: Array<FilesWorkspaceFilterChip<FilesWorkspaceUsageFilter>>;
}

export interface DuplicateAssetOptions {
  sourceAssetID: string;
  newAssetID: string;
  newName: string;
}

export interface RenameAssetsPatternOptions {
  prefix?: string;
  suffix?: string;
}

export interface ImportedAssetRecordOptions {
  id: string;
  metadata?: Record<string, unknown>;
  name: string;
  relativePath: string;
  kind?: string;
  systemImage?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function assetID(asset: Record<string, unknown>, index: number): string {
  return stringField(asset.id, `asset-${index + 1}`);
}

function collectGroupMembership(
  group: Record<string, unknown>,
  membership: Map<string, string[]>,
  groups: FilesWorkspaceGroup[],
  depth: number,
  assetIDs: Set<string>
): void {
  const name = stringField(group.name, "Grupo");
  const ids = Array.isArray(group.assetIDs) ? group.assetIDs.filter((id): id is string => typeof id === "string") : [];
  groups.push({
    id: stringField(group.id, `${name}-${depth}-${groups.length}`),
    name,
    assetCount: ids.length,
    depth,
    missingAssetIDs: ids.filter((id) => !assetIDs.has(id))
  });

  for (const id of ids) {
    const names = membership.get(id) ?? [];
    names.push(name);
    membership.set(id, names);
  }

  const children = Array.isArray(group.children) ? group.children.filter(isRecord) : [];
  for (const child of children) {
    collectGroupMembership(child, membership, groups, depth + 1, assetIDs);
  }
}

type AssetUsageMap = Map<string, Map<string, FilesWorkspaceUsageLink>>;

function addUsage(
  usages: AssetUsageMap,
  assetName: string | null,
  link: FilesWorkspaceUsageLink
): void {
  if (!assetName) return;
  const links = usages.get(assetName) ?? new Map<string, FilesWorkspaceUsageLink>();
  links.set(link.label, link);
  usages.set(assetName, links);
}

function collectRoomUsages(data: GBAProjectData, usages: AssetUsageMap): void {
  const rooms = [
    ...projectArray(data, "scenas"),
    ...projectArray(data, "rooms")
  ];

  for (const room of rooms) {
    const roomName = stringField(room.name, "Cena");
    const roomID = nullableString(room.id) ?? undefined;
    addUsage(usages, nullableString(room.backgroundAssetName), {
      label: `Cena: ${roomName}`,
      workspace: "Editor",
      targetID: roomID,
      targetName: roomName,
      usageKind: "room-background"
    });
    addUsage(usages, nullableString(room.runtimeCompositeBackgroundAssetName), {
      label: `Composição de runtime: ${roomName}`,
      workspace: "Editor",
      targetID: roomID,
      targetName: roomName,
      usageKind: "room-background-runtime"
    });
    addUsage(usages, nullableString(room.runtimeBaseBackgroundAssetName), {
      label: `Base visual de runtime: ${roomName}`,
      workspace: "Editor",
      targetID: roomID,
      targetName: roomName,
      usageKind: "room-background-runtime"
    });
    const runtime = isRecord(room.runtime) ? room.runtime : null;
    const runtimeConfig = runtime && isRecord(runtime.config) ? runtime.config : null;
    addUsage(usages, nullableString(runtimeConfig?.hudAssetName), {
      label: `HUD de runtime: ${roomName}`,
      workspace: "Editor",
      targetID: roomID,
      targetName: roomName,
      usageKind: "runtime-hud"
    });
    if (runtime?.type === "racing" && runtimeConfig?.presentation === "pseudo3d") {
      const visuals = isRecord(runtimeConfig.pseudo3dVisuals) ? runtimeConfig.pseudo3dVisuals : {};
      for (const [field, label, usageKind] of [
        ["panoramaBackgroundId", "Panorama da pista", "racing-pseudo3d-panorama"],
        ["floorTilemapId", "Chão afim da pista", "racing-pseudo3d-floor"],
        ["minimapAssetId", "HUD e minimapa da pista", "racing-pseudo3d-minimap"]
      ] as const) {
        addUsage(usages, nullableString(visuals[field]), {
          label: `${label}: ${roomName}`,
          workspace: "Editor",
          targetID: roomID,
          targetName: roomName,
          usageKind
        });
      }
    }
    if (isRecord(runtimeConfig?.affine) && runtimeConfig.affine.enabled === true) {
      addUsage(usages, nullableString(runtimeConfig.affine.assetId), {
        label: `Background Affine: ${roomName}`,
        workspace: "Editor",
        targetID: roomID,
        targetName: roomName,
        usageKind: "affine-background"
      });
    }
    if (runtime?.type === "isometric" && isRecord(runtimeConfig?.tacticalPresentation)) {
      const tacticalPresentation = runtimeConfig.tacticalPresentation;
      const tacticalReferences = [
        ...(Array.isArray(tacticalPresentation.surfacePages)
          ? tacticalPresentation.surfacePages
            .filter(isRecord)
            .map((page) => page.asset)
          : []),
        ...(Array.isArray(tacticalPresentation.assets)
          ? tacticalPresentation.assets
            .filter(isRecord)
            .filter((binding) => binding.consumer !== "audio")
            .map((binding) => binding.path)
          : []),
        tacticalPresentation.surfaceAsset,
        tacticalPresentation.gridAsset,
        tacticalPresentation.hudLayout,
        tacticalPresentation.cursorAsset,
        tacticalPresentation.rangeAsset,
        tacticalPresentation.targetAsset,
        tacticalPresentation.emotesAsset,
        tacticalPresentation.feedbackAsset
      ];
      for (const assetName of new Set(tacticalReferences.map(nullableString).filter((name): name is string => Boolean(name)))) {
        addUsage(usages, assetName, {
          label: `Recurso tático: ${roomName}`,
          workspace: "Editor",
          targetID: roomID,
          targetName: roomName,
          usageKind: "tactical-resource"
        });
      }
    }
    if (runtime?.type === "isometric" && isRecord(runtimeConfig?.pagedSurface)) {
      for (const [field, label, usageKind] of [
        ["backgroundAsset", "Base paginada", "isometric-paged-background"],
        ["foregroundAsset", "Camada frontal paginada", "isometric-paged-foreground"]
      ] as const) {
        addUsage(usages, nullableString(runtimeConfig.pagedSurface[field]), {
          label: `${label}: ${roomName}`,
          workspace: "Editor",
          targetID: roomID,
          targetName: roomName,
          usageKind
        });
      }
    }
    if (runtime?.type === "menu" && runtimeConfig) {
      addUsage(usages, nullableString(runtimeConfig.titleOverlayAssetName), {
        label: `Título com fade: ${roomName}`,
        workspace: "Editor",
        targetID: roomID,
        targetName: roomName,
        usageKind: "menu-title-overlay"
      });
      const addBackgroundAnimationUsages = (animation: unknown) => {
        if (!isRecord(animation)) return;
        const frameAssetNames = Array.isArray(animation.frameAssetNames)
          ? animation.frameAssetNames.filter((name): name is string => typeof name === "string")
          : [];
        frameAssetNames.forEach((assetName, frameIndex) => {
          addUsage(usages, assetName, {
            label: `Quadro ${frameIndex + 1} do background: ${roomName}`,
            workspace: "Editor",
            targetID: roomID,
            targetName: roomName,
            usageKind: "menu-background-animation"
          });
        });
      };
      addBackgroundAnimationUsages(runtimeConfig.backgroundAnimation);
      const screens = Array.isArray(runtimeConfig.screens) ? runtimeConfig.screens.filter(isRecord) : [];
      for (const screen of screens) {
        addUsage(usages, nullableString(screen.titleOverlayAssetName), {
          label: `Título com fade: ${roomName}`,
          workspace: "Editor",
          targetID: roomID,
          targetName: roomName,
          usageKind: "menu-title-overlay"
        });
        addBackgroundAnimationUsages(screen.backgroundAnimation);
      }
    }
    if (runtime?.type === "cutscene" && runtimeConfig) {
      const steps = Array.isArray(runtimeConfig.steps) ? runtimeConfig.steps.filter(isRecord) : [];
      for (const step of steps) {
        addUsage(usages, nullableString(step.backgroundAssetName), {
          label: `Quadro da cutscene: ${roomName}`,
          workspace: "Editor",
          targetID: roomID,
          targetName: roomName,
          usageKind: "cutscene-step-background"
        });
      }
    }
    const tileLayers = Array.isArray(room.tileLayers) ? room.tileLayers.filter(isRecord) : [];
    for (const layer of tileLayers) {
      const mapping = stringField(layer.mapping, "BG");
      const sourceNames = Array.isArray(layer.tileSourceAssetNames)
        ? new Set(layer.tileSourceAssetNames.map(nullableString).filter((name): name is string => Boolean(name)))
        : new Set<string>();
      for (const sourceName of sourceNames) {
        addUsage(usages, sourceName, {
          label: `Camada ${mapping}: ${roomName}`,
          workspace: "Editor",
          targetID: roomID,
          targetName: roomName,
          usageKind: "room-background"
        });
      }
    }
    const references = Array.isArray(room.referenceImages) ? room.referenceImages.filter(isRecord) : [];
    for (const reference of references) {
      addUsage(usages, nullableString(reference.assetName), {
        label: `Referencia da cena: ${roomName}`,
        workspace: "Editor",
        targetID: roomID,
        targetName: roomName,
        usageKind: "room-reference"
      });
    }
  }
}

function collectSpriteUsages(data: GBAProjectData, usages: AssetUsageMap): void {
  for (const actor of projectArray(data, "actors")) {
    const spriteSheet = nullableString(actor.spriteSheet);
    addUsage(usages, spriteSheet, {
      label: `Ator: ${stringField(actor.name, "ator")}`,
      workspace: "Sprites",
      targetID: nullableString(actor.id) ?? undefined,
      targetName: spriteSheet ?? undefined,
      usageKind: "sprite-actor"
    });
  }

  for (const animation of projectArray(data, "animations")) {
    const spriteSheet = nullableString(animation.spriteSheet);
    addUsage(usages, spriteSheet, {
      label: `Animacao: ${stringField(animation.name, "sprite")}`,
      workspace: "Sprites",
      targetID: nullableString(animation.id) ?? undefined,
      targetName: spriteSheet ?? undefined,
      usageKind: "sprite-animation"
    });
  }

  for (const state of projectArray(data, "animationStates")) {
    const spriteSheet = nullableString(state.spriteSheet);
    addUsage(usages, spriteSheet, {
      label: `Estado de animacao: ${stringField(state.name, "estado")}`,
      workspace: "Sprites",
      targetName: spriteSheet ?? undefined,
      usageKind: "sprite-state"
    });
  }

  for (const reference of projectArray(data, "spriteReferenceImages")) {
    const title = stringField(reference.title, "referencia");
    const sourceAsset = nullableString(reference.assetName);
    const generatedAsset = nullableString(reference.generatedSpriteAssetName);
    addUsage(usages, sourceAsset, {
      label: `Referencia de sprite: ${title}`,
      workspace: "Sprites",
      targetID: nullableString(reference.id) ?? undefined,
      targetName: sourceAsset ?? undefined,
      usageKind: "sprite-reference"
    });
    addUsage(usages, generatedAsset, {
      label: `Sprite gerado: ${title}`,
      workspace: "Sprites",
      targetID: nullableString(reference.id) ?? undefined,
      targetName: generatedAsset ?? undefined,
      usageKind: "sprite-generated-reference"
    });
  }
}

function collectAudioUsages(data: GBAProjectData, usages: AssetUsageMap): void {
  for (const instrument of audioInstrumentBank(data)) {
    const sample = projectArray(data, "assets").find(asset => asset.id === instrument.sampleAssetID);
    addUsage(usages, nullableString(sample?.name), { label: `Banco de instrumentos: ${instrument.name}`, workspace: "Audio", usageKind: "audio-sample-instrument" });
  }
  for (const audio of projectArray(data, "audioItems")) {
    const name = nullableString(audio.name);
    const assignedScene = nullableString(audio.assignedScene);
    const label = assignedScene && assignedScene !== "Global"
      ? `Audio da cena: ${assignedScene}`
      : `Audio: ${stringField(audio.kind, "item")}`;
    for (const pattern of projectArray(audio as GBAProjectData, "patterns")) {
      for (const rawChannel of projectArray(pattern as GBAProjectData, "channels")) {
        const channel = resolveAudioInstrumentChannel(data, rawChannel);
        if (!channel.sampleAssetID) continue;
        const sample = projectArray(data, "assets").find(asset => asset.id === channel.sampleAssetID);
        addUsage(usages, nullableString(sample?.name), { label: `Instrumento: ${name}`, workspace: "Audio", targetID: nullableString(audio.id) ?? undefined, targetName: name ?? undefined, usageKind: "audio-sample-instrument" });
      }
    }
    addUsage(usages, nullableString(audioSourceAsset(data, audio)?.name) ?? name, {
      label,
      workspace: "Audio",
      targetID: nullableString(audio.id) ?? undefined,
      targetName: name ?? undefined,
      usageKind: "audio-item"
    });
  }
}

function collectSettingsUsages(data: GBAProjectData, usages: AssetUsageMap): void {
  const settings = isRecord(data.settings) ? data.settings : null;
  const uiDialogs = settings && isRecord(settings.uiDialogs) ? settings.uiDialogs : null;
  const pointAndClick = settings && isRecord(settings.pointAndClick) ? settings.pointAndClick : null;
  const hudPresets = settings && Array.isArray(settings.hudPresets)
    ? settings.hudPresets.filter(isRecord)
    : [];
  const interfaceThemes = settings && isRecord(settings.interfaceThemes) ? settings.interfaceThemes : null;

  for (const preset of hudPresets) {
    const presetName = stringField(preset.name, "HUD");
    const targetID = nullableString(preset.id) ?? undefined;
    for (const [field, label, usageKind] of [
      ["backgroundImage", "fundo", "hud-preset-background"],
      ["selectorImage", "seletor", "hud-preset-selector"],
      ["font", "fonte", "hud-preset-font"]
    ] as const) {
      addUsage(usages, nullableString(preset[field]), {
        label: `HUD ${presetName}: ${label}`,
        workspace: "Editor",
        targetID,
        targetName: presetName,
        usageKind
      });
    }

    const components = Array.isArray(preset.components) ? preset.components.filter(isRecord) : [];
    for (const component of components) {
      const componentName = stringField(component.label, stringField(component.id, "componente"));
      addUsage(usages, nullableString(component.asset), {
        label: `HUD ${presetName}: ${componentName}`,
        workspace: "Editor",
        targetID,
        targetName: presetName,
        usageKind: "hud-preset-component"
      });
    }
  }

  const themes = interfaceThemes && Array.isArray(interfaceThemes.themes)
    ? interfaceThemes.themes.filter(isRecord)
    : [];
  for (const theme of themes) {
    const themeName = stringField(theme.name, "Tema");
    for (const [field, label, usageKind] of [
      ["hudImage", "HUD", "settings-interface-theme-hud"],
      ["boxImage", "diálogo", "settings-interface-theme-dialogue"]
    ] as const) {
      addUsage(usages, nullableString(theme[field]), {
        label: `Tema ${themeName}: ${label}`,
        workspace: "Ajustes",
        targetName: "interfaceThemes",
        usageKind
      });
    }
  }

  if (uiDialogs) {
    addUsage(usages, nullableString(uiDialogs.boxImage), {
      label: "UI dialogo: caixa",
      workspace: "Dialogos",
      targetName: "uiDialogs",
      usageKind: "settings-ui-dialog"
    });
    addUsage(usages, nullableString(uiDialogs.selectorImage), {
      label: "UI dialogo: seletor",
      workspace: "Dialogos",
      targetName: "uiDialogs",
      usageKind: "settings-ui-dialog"
    });
    addUsage(usages, nullableString(uiDialogs.font), {
      label: "UI dialogo: fonte",
      workspace: "Dialogos",
      targetName: "uiDialogs",
      usageKind: "settings-ui-dialog"
    });
  }

  if (pointAndClick) {
    addUsage(usages, nullableString(pointAndClick.cursorImage), {
      label: "Cursor point-and-click",
      workspace: "Ajustes",
      targetName: "pointAndClick",
      usageKind: "settings-point-click-cursor"
    });
  }
}

function collectDialogueUsages(data: GBAProjectData, usages: AssetUsageMap): void {
  for (const dialogue of projectArray(data, "dialogues")) {
    const key = stringField(dialogue.key, "dialogo");
    addUsage(usages, nullableString(dialogue.portrait), {
      label: `Dialogo ${key}: retrato`,
      workspace: "Dialogos",
      targetName: key,
      usageKind: "dialogue-portrait"
    });
    addUsage(usages, nullableString(dialogue.emote), {
      label: `Dialogo ${key}: emote`,
      workspace: "Dialogos",
      targetName: key,
      usageKind: "dialogue-emote"
    });
    addUsage(usages, nullableString(dialogue.textSound), {
      label: `Dialogo ${key}: som texto`,
      workspace: "Dialogos",
      targetName: key,
      usageKind: "dialogue-text-sound"
    });
    addUsage(usages, nullableString(dialogue.confirmSound), {
      label: `Dialogo ${key}: som confirmar`,
      workspace: "Dialogos",
      targetName: key,
      usageKind: "dialogue-confirm-sound"
    });
  }
}

function commandText(event: Record<string, unknown>): string[] {
  const commands: string[] = [];
  const command = nullableString(event.command);
  if (command) commands.push(command);

  const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
  for (const step of steps) {
    const stepCommand = nullableString(step.command);
    if (stepCommand) commands.push(stepCommand);
  }

  return commands;
}

function collectEventCommandUsages(data: GBAProjectData, usages: AssetUsageMap, assetNames: Set<string>): void {
  for (const event of projectArray(data, "events")) {
    const eventName = stringField(event.name, "evento");
    const commands = commandText(event);
    for (const assetName of assetNames) {
      if (commands.some((command) => command.includes(assetName))) {
        addUsage(usages, assetName, {
          label: `Evento: ${eventName}`,
          workspace: "Eventos",
          targetID: nullableString(event.id) ?? undefined,
          targetName: eventName,
          usageKind: "event-command"
        });
      }
    }
  }
}

function collectAssetUsages(data: GBAProjectData, assetNames: Set<string>): AssetUsageMap {
  const usages: AssetUsageMap = new Map();
  collectRoomUsages(data, usages);
  collectSpriteUsages(data, usages);
  collectAudioUsages(data, usages);
  collectDialogueUsages(data, usages);
  collectSettingsUsages(data, usages);
  collectEventCommandUsages(data, usages, assetNames);
  return usages;
}

function primaryActionForAssetKind(kind: string): FilesWorkspacePrimaryAction | null {
  const normalizedKind = kind.toLocaleLowerCase("pt-BR");
  if (["sprite", "sprites", "ator", "imagem"].includes(normalizedKind)) {
    return { label: "Abrir no Animador", workspace: "Sprites" };
  }

  if (["audio", "musica", "música", "sfx", "som"].includes(normalizedKind)) {
    return { label: "Abrir no Áudio", workspace: "Audio" };
  }

  if (["tileset", "background", "fundo", "tilemap"].includes(normalizedKind)) {
    return { label: "Usar no Editor", workspace: "Editor" };
  }

  return null;
}

function primaryActionLabel(workspace: FilesWorkspaceName): string {
  if (workspace === "Editor") return "Abrir no Editor";
  if (workspace === "Sprites") return "Abrir no Animador";
  if (workspace === "Audio") return "Abrir no Áudio";
  if (workspace === "Dialogos") return "Abrir em Diálogos";
  if (workspace === "Eventos") return "Abrir em Eventos";
  return "Abrir em Ajustes";
}

function primaryActionForAsset(kind: string, usageLinks: FilesWorkspaceUsageLink[]): FilesWorkspacePrimaryAction | null {
  const fallback = primaryActionForAssetKind(kind);
  const contextualLink = usageLinks.find((link) => link.workspace === fallback?.workspace) ?? usageLinks[0];
  if (contextualLink) {
    return {
      label: primaryActionLabel(contextualLink.workspace),
      workspace: contextualLink.workspace,
      targetID: contextualLink.targetID,
      targetName: contextualLink.targetName,
      usageKind: contextualLink.usageKind
    };
  }

  return fallback;
}

function normalizedKind(kind: string): string {
  return kind.trim().toLocaleLowerCase("pt-BR");
}

function isImageAssetKind(kind: string): boolean {
  return [
    "background",
    "cursor",
    "frame",
    "fundo",
    "imagem",
    "image",
    "moldura",
    "sprite",
    "sprites",
    "tileset",
    "tilemap"
  ].includes(normalizedKind(kind));
}

function isImageFileName(fileName: string): boolean {
  const extension = fileExtension(fileName);
  return ["apng", "bmp", "gif", "jpg", "jpeg", "png", "webp"].includes(extension);
}

function previewKindForAsset(kind: string, name: string, source: string | null): FilesWorkspacePreviewKind {
  return source && (isImageAssetKind(kind) || isImageFileName(name) || isImageFileName(source)) ? "image" : "generic";
}

function isAudioAssetKind(kind: string): boolean {
  return ["audio", "musica", "música", "sfx", "som"].includes(normalizedKind(kind));
}

function isFontAssetKind(kind: string): boolean {
  return ["font", "fonte", "fontes"].includes(normalizedKind(kind));
}

function makeFilesSummaryCards(
  assets: FilesWorkspaceAsset[],
  missingGroupAssetReferenceCount: number
): FilesWorkspaceSummaryCard[] {
  return [
    { id: "total", label: "Total", value: assets.length, tone: "primary" },
    { id: "images", label: "Imagens", value: assets.filter((asset) => isImageAssetKind(asset.kind)).length, tone: "primary" },
    { id: "audio", label: "Áudio", value: assets.filter((asset) => isAudioAssetKind(asset.kind)).length, tone: "neutral" },
    { id: "fonts", label: "Fontes", value: assets.filter((asset) => isFontAssetKind(asset.kind)).length, tone: "neutral" },
    { id: "attention", label: "Com atenção", value: missingGroupAssetReferenceCount, tone: "warning" },
    {
      id: "unused",
      label: "Sem uso",
      value: assets.filter((asset) => !asset.isUsed && !asset.isReusableLibraryAsset).length,
      tone: "neutral"
    }
  ];
}

export function deriveFilesWorkspacePresentation(data: GBAProjectData): FilesWorkspacePresentation {
  const sourceAssets = projectArray(data, "assets");
  const sourceAssetIDs = new Set(sourceAssets.map((asset, index) => assetID(asset, index)));
  const sourceAssetNames = new Set(sourceAssets.map((asset) => nullableString(asset.name)).filter((name): name is string => Boolean(name)));
  const usages = collectAssetUsages(data, sourceAssetNames);
  const membership = new Map<string, string[]>();
  const groups: FilesWorkspaceGroup[] = [];
  for (const group of projectArray(data, "assetGroups")) {
    collectGroupMembership(group, membership, groups, 0, sourceAssetIDs);
  }

  const assets = sourceAssets.map((asset, index) => {
    const id = assetID(asset, index);
    const name = stringField(asset.name, "Asset sem nome");
    const kind = stringField(asset.kind, "Arquivo");
    const metadata = isRecord(asset.metadata) ? asset.metadata : undefined;
    const source = metadata ? nullableString(metadata.source) : null;
    const bundledDefaultAsset = metadata ? nullableString(metadata.bundledDefaultAsset) : null;
    const isReusableLibraryAsset = metadata?.reusableLibraryAsset === true;
    const usageLinks = Array.from(usages.get(name)?.values() ?? [])
      .sort((lhs, rhs) => lhs.label.localeCompare(rhs.label, "pt-BR"));
    const usageLabels = usageLinks.map((link) => link.label);
    return {
      id,
      name,
      kind,
      systemImage: nullableString(asset.systemImage),
      source,
      bundledDefaultAsset,
      previewKind: previewKindForAsset(kind, name, source),
      groupNames: membership.get(id) ?? [],
      usageLabels,
      usageLinks,
      isUsed: usageLabels.length > 0,
      isReusableLibraryAsset,
      primaryAction: primaryActionForAsset(kind, usageLinks),
      ...(metadata?.colorMode === "8bpp" ? { colorMode: "8bpp" as const } : {})
    };
  });

  const counts = new Map<string, number>();
  for (const asset of assets) {
    counts.set(asset.kind, (counts.get(asset.kind) ?? 0) + 1);
  }

  const kindCounts = Array.from(counts.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((lhs, rhs) => lhs.kind.localeCompare(rhs.kind, "pt-BR"));
  const missingGroupAssetReferenceCount = groups.reduce((sum, group) => sum + group.missingAssetIDs.length, 0);

  return {
    assets,
    groups,
    kindCounts,
    summaryCards: makeFilesSummaryCards(assets, missingGroupAssetReferenceCount),
    ungroupedAssets: assets.filter((asset) => asset.groupNames.length === 0).length,
    missingGroupAssetReferenceCount
  };
}

export interface FilesWorkspaceValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  assetID?: string;
}

export interface FilesWorkspaceValidationResult {
  issues: FilesWorkspaceValidationIssue[];
  ready: boolean;
}

export function deriveFilesWorkspaceValidation(presentation: FilesWorkspacePresentation): FilesWorkspaceValidationResult {
  const issues: FilesWorkspaceValidationIssue[] = [];

  if (presentation.missingGroupAssetReferenceCount > 0) {
    issues.push({
      severity: "error",
      message: `${presentation.missingGroupAssetReferenceCount} referencia(s) de grupo ausente(s).`
    });
  }

  for (const asset of presentation.assets) {
    if (asset.isUsed && !asset.source && !asset.bundledDefaultAsset) {
      issues.push({
        severity: "error",
        message: `${asset.name} esta em uso sem caminho de origem exportavel.`,
        assetID: asset.id
      });
    }
  }

  const unusedCount = presentation.assets.filter(
    (asset) => !asset.isUsed && !asset.isReusableLibraryAsset
  ).length;
  if (unusedCount > 0) {
    issues.push({
      severity: "warning",
      message: `${unusedCount} asset(s) sem uso no projeto.`
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "info",
      message: "Biblioteca validada: todos os assets em uso possuem origem exportavel."
    });
  }

  return {
    issues,
    ready: !issues.some((issue) => issue.severity === "error")
  };
}

export function deriveFilesWorkspaceFilterChips(
  presentation: FilesWorkspacePresentation,
  active: Pick<FilesWorkspaceFilterOptions, "kind" | "usage"> = {}
): FilesWorkspaceFilterChips {
  const activeKind = active.kind?.trim() ?? "";
  const activeUsage = active.usage ?? "all";
  const usedCount = presentation.assets.filter((asset) => asset.isUsed).length;
  const unusedCount = presentation.assets.filter(
    (asset) => !asset.isUsed && !asset.isReusableLibraryAsset
  ).length;
  const slugForKind = (kind: string) =>
    kind
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "arquivo";

  return {
    kind: [
      {
        id: "kind-all",
        label: "Todos",
        value: "",
        count: presentation.assets.length,
        isActive: activeKind === ""
      },
      ...presentation.kindCounts.map((item) => ({
        id: `kind-${slugForKind(item.kind)}`,
        label: item.kind === "Audio" ? "Áudio" : item.kind,
        value: item.kind,
        count: item.count,
        isActive: activeKind === item.kind
      }))
    ],
    usage: [
      {
        id: "usage-all",
        label: "Todos",
        value: "all",
        count: presentation.assets.length,
        isActive: activeUsage === "all"
      },
      {
        id: "usage-used",
        label: "Usados",
        value: "used",
        count: usedCount,
        isActive: activeUsage === "used"
      },
      {
        id: "usage-unused",
        label: "Sem uso",
        value: "unused",
        count: unusedCount,
        isActive: activeUsage === "unused"
      }
    ]
  };
}

export function groupFilesWorkspaceAssetsByKind(assets: FilesWorkspaceAsset[]): FilesWorkspaceAssetKindGroup[] {
  const groups = new Map<string, FilesWorkspaceAsset[]>();
  for (const asset of assets) {
    const group = groups.get(asset.kind) ?? [];
    group.push(asset);
    groups.set(asset.kind, group);
  }

  return Array.from(groups.entries())
    .map(([kind, groupAssets]) => ({
      kind,
      count: groupAssets.length,
      usedCount: groupAssets.filter((asset) => asset.isUsed).length,
      assets: groupAssets
    }))
    .sort((lhs, rhs) => lhs.kind.localeCompare(rhs.kind, "pt-BR"));
}

function normalizedSourcePath(source: string): string {
  return source.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

/** Virtual navigation over registered sources; does not move files or change project groups. */
export function deriveFilesWorkspaceFolders(assets: FilesWorkspaceAsset[]): FilesWorkspaceFolder[] {
  const folders = new Map<string, FilesWorkspaceFolder>();
  for (const asset of assets) {
    if (!asset.source) continue;
    const segments = normalizedSourcePath(asset.source).split("/");
    segments.pop();
    segments.forEach((name, depth) => {
      const path = segments.slice(0, depth + 1).join("/");
      const folder = folders.get(path) ?? { path, name, depth, count: 0 };
      folder.count += 1;
      folders.set(path, folder);
    });
  }
  return Array.from(folders.values()).sort((a, b) => {
    const left = a.path.split("/");
    const right = b.path.split("/");
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      const order = left[i].localeCompare(right[i], "pt-BR");
      if (order !== 0) return order;
    }
    return left.length - right.length;
  });
}

export function filterFilesWorkspaceAssets(
  assets: FilesWorkspaceAsset[],
  options: FilesWorkspaceFilterOptions
): FilesWorkspaceAsset[] {
  const query = options.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const kind = options.kind?.trim() ?? "";
  const folder = options.folder ? normalizedSourcePath(options.folder) : "";
  const usage = options.usage ?? "all";

  return assets.filter((asset) => {
    if (kind && asset.kind !== kind) return false;
    if (folder && (!asset.source || !normalizedSourcePath(asset.source).startsWith(`${folder}/`))) return false;
    if (usage === "used" && !asset.isUsed) return false;
    if (usage === "unused" && (asset.isUsed || asset.isReusableLibraryAsset)) return false;
    if (!query) return true;

    return [
      asset.name,
      asset.kind,
      asset.source ?? "",
      asset.groupNames.join(" "),
      asset.usageLabels.join(" ")
    ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
  });
}

function cloneProjectData(data: GBAProjectData): GBAProjectData {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as GBAProjectData);
}

function fileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function defaultExportID(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "audio_item";
}

export function assetKindForFileName(fileName: string): string {
  const extension = fileExtension(fileName);
  if (["apng", "bmp", "gif", "jpg", "jpeg", "png", "webp"].includes(extension)) {
    return "Sprite";
  }

  if (["flac", "it", "mod", "mp3", "ogg", "s3m", "wav", "xm"].includes(extension)) {
    return "Audio";
  }

  return "Arquivo";
}

export function systemImageForAssetKind(kind: string): string {
  if (kind === "Sprite" || kind === "Tileset" || kind === "UI" || kind === "Emote" || kind === "Background") {
    return "photo";
  }

  if (kind === "Animation Source") return "film";

  if (kind === "Audio" || kind === "Musica" || kind === "SFX") {
    return "music.note";
  }

  return "doc";
}

export function makeImportedAssetRecord(options: ImportedAssetRecordOptions): Record<string, unknown> {
  const kind = options.kind ?? assetKindForFileName(options.name);
  return {
    id: options.id,
    name: options.name,
    kind,
    systemImage: options.systemImage ?? systemImageForAssetKind(kind),
    metadata: {
      source: options.relativePath,
      ...(options.metadata ?? {})
    }
  };
}

function audioKindForFileName(fileName: string): "Musica" | "SFX" {
  const extension = fileExtension(fileName);
  return ["it", "mod", "s3m", "xm"].includes(extension) ? "Musica" : "SFX";
}

function audioFormatForFileName(fileName: string, kind: "Musica" | "SFX"): string {
  const extension = fileExtension(fileName);
  if (extension) return extension.toUpperCase();
  return kind === "Musica" ? "MOD" : "WAV";
}

function makeAudioItemForImportedAsset(asset: ImportedAssetFile): Record<string, unknown> | null {
  const assetKind = asset.kind || assetKindForFileName(asset.name);
  if (assetKind !== "Audio" && assetKind !== "Musica" && assetKind !== "SFX") {
    return null;
  }

  const kind = assetKind === "Musica" || assetKind === "SFX" ? assetKind : audioKindForFileName(asset.name);
  return {
    id: `audio-${asset.id}`,
    sourceAssetID: asset.id,
    name: asset.name,
    kind,
    format: audioFormatForFileName(asset.name, kind),
    assignedScene: kind === "SFX" ? "Global" : "",
    loops: kind === "Musica",
    bpm: 120,
    exportID: defaultExportID(asset.name),
    volume: kind === "SFX" ? 90 : 80,
    channels: []
  };
}

function makeImportedSpriteAnimationID(assetID: string, existingIDs: Set<string>): string {
  const baseID = `animation-${assetID.trim() || "imported-sprite"}-idle-down`;
  if (!existingIDs.has(baseID)) return baseID;

  let suffix = 2;
  while (existingIDs.has(`${baseID}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseID}-${suffix}`;
}

function makeSpriteAnimationForImportedAsset(asset: ImportedAssetFile, animationID: string): Record<string, unknown> | null {
  const assetKind = asset.kind || assetKindForFileName(asset.name);
  if (normalizedKind(assetKind) !== "sprite") {
    return null;
  }

  const spriteSheet = asset.name.trim();
  if (!spriteSheet || !animationID.trim()) {
    return null;
  }

  return {
    id: animationID,
    name: "idle_down",
    spriteSheet,
    frameWidth: 16,
    frameHeight: 32,
    fps: 8,
    loops: true,
    frameCount: 1,
    state: "idle",
    direction: "down",
    colorMode: spriteColorMode(asset.metadata?.colorMode ?? asset.metadata?.color_mode)
  };
}

function normalizedImportedKind(kind: string): string {
  return kind
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;
  return projectArray(data, "rooms");
}

function projectSettings(data: GBAProjectData): Record<string, unknown> {
  if (!isRecord(data.settings)) {
    data.settings = {};
  }
  return data.settings as Record<string, unknown>;
}

function seedImportedAssetUsage(data: GBAProjectData, asset: ImportedAssetFile): void {
  const name = asset.name.trim();
  if (!name) return;

  const kind = normalizedImportedKind(asset.kind || assetKindForFileName(asset.name));

  if (["tileset", "background", "fundo", "tilemap"].includes(kind)) {
    const metadata = asset.metadata;
    if (isRecord(metadata) && metadata.skipAutoUse === true) return;
    const firstRoom = projectRooms(data)[0];
    if (firstRoom && !nullableString(firstRoom.backgroundAssetName)) {
      firstRoom.backgroundAssetName = name;
    }
    return;
  }

  if (kind === "ui") {
    const settings = projectSettings(data);
    const uiDialogs = isRecord(settings.uiDialogs) ? settings.uiDialogs : {};
    settings.uiDialogs = uiDialogs;
    if (!nullableString(uiDialogs.boxImage)) uiDialogs.boxImage = name;
    if (!nullableString(uiDialogs.selectorImage)) uiDialogs.selectorImage = name;
    return;
  }

  if (kind === "emote") {
    const firstDialogue = projectArray(data, "dialogues")[0];
    if (firstDialogue && !nullableString(firstDialogue.emote)) {
      firstDialogue.emote = name;
    }
  }
}

export function appendImportedAssetsToProject(
  data: GBAProjectData,
  importedAssets: ImportedAssetFile[]
): GBAProjectData {
  if (importedAssets.length === 0) {
    return data;
  }

  const next = cloneProjectData(data);
  const existingAssets = projectArray(next, "assets");
  const existingAudioItems = projectArray(next, "audioItems");
  const existingAnimations = projectArray(next, "animations");
  const audioItemNames = new Set(existingAudioItems.map((audio) => stringField(audio.name, "")));
  const animatedSpriteSheets = new Set(existingAnimations.map((animation) => stringField(animation.spriteSheet, "")));
  const animationIDs = new Set(existingAnimations.map((animation, index) => stringField(animation.id, `animation-${index + 1}`)));
  const importedAudioItems = importedAssets
    .map(makeAudioItemForImportedAsset)
    .filter((audioItem): audioItem is Record<string, unknown> => Boolean(audioItem))
    .filter((audioItem) => {
      const name = stringField(audioItem.name, "");
      if (!name || audioItemNames.has(name)) return false;
      audioItemNames.add(name);
      return true;
    });
  const importedSpriteAnimations = importedAssets
    .map((asset) => {
      const spriteSheet = asset.name.trim();
      if (!spriteSheet || animatedSpriteSheets.has(spriteSheet)) return null;
      const animationID = makeImportedSpriteAnimationID(asset.id, animationIDs);
      const animation = makeSpriteAnimationForImportedAsset(asset, animationID);
      if (!animation) return null;
      animatedSpriteSheets.add(spriteSheet);
      animationIDs.add(animationID);
      return animation;
    })
    .filter((animation): animation is Record<string, unknown> => Boolean(animation));

  next.assets = [
    ...existingAssets,
    ...importedAssets.map((asset) => makeImportedAssetRecord(asset))
  ];
  if (importedAudioItems.length > 0) {
    next.audioItems = [...existingAudioItems, ...importedAudioItems];
  }
  if (importedSpriteAnimations.length > 0) {
    next.animations = [...existingAnimations, ...importedSpriteAnimations];
  }
  for (const asset of importedAssets) {
    seedImportedAssetUsage(next, asset);
  }
  return next;
}

export function renameAssetInProject(data: GBAProjectData, assetIDToRename: string, nextName: string): GBAProjectData {
  const trimmedName = nextName.trim();
  if (!trimmedName) {
    return data;
  }

  const next = cloneProjectData(data);
  const assets = projectArray(next, "assets");
  const asset = assets.find((item, index) => assetID(item, index) === assetIDToRename);
  if (!asset) {
    return data;
  }

  const previousName = nullableString(asset.name);
  asset.name = trimmedName;
  next.assets = assets;
  if (previousName && previousName !== trimmedName) {
    updateAssetReferences(next, previousName, trimmedName);
  }
  return next;
}

function updateExactAssetField(record: Record<string, unknown>, field: string, oldName: string, nextName: string): void {
  if (record[field] === oldName) {
    record[field] = nextName;
  }
}

function replaceAssetNameInCommand(command: unknown, oldName: string, nextName: string): unknown {
  if (typeof command !== "string" || !command.includes(oldName)) {
    return command;
  }

  return command
    .split(oldName)
    .join(nextName)
    .replace(/\s+/g, " ")
    .trim();
}

function updateRoomAssetReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const key of ["rooms", "scenas"]) {
    if (!Array.isArray(data[key])) continue;
    for (const room of projectArray(data, key)) {
      updateExactAssetField(room, "backgroundAssetName", oldName, nextName);
      updateExactAssetField(room, "runtimeCompositeBackgroundAssetName", oldName, nextName);
      updateExactAssetField(room, "runtimeBaseBackgroundAssetName", oldName, nextName);
      updateExactAssetField(room, "music", oldName, nextName);
      if (Array.isArray(room.referenceImages)) {
        room.referenceImages = room.referenceImages
          .filter(isRecord)
          .filter((reference) => nextName || reference.assetName !== oldName)
          .map((reference) => {
            updateExactAssetField(reference, "assetName", oldName, nextName);
            return reference;
          });
      }
    }
  }
}

function updateSpriteAssetReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const actor of projectArray(data, "actors")) {
    updateExactAssetField(actor, "spriteSheet", oldName, nextName);
    if (!nextName && actor.spriteSheet === "") {
      actor.animationName = "";
    }
  }

  for (const animation of projectArray(data, "animations")) {
    updateExactAssetField(animation, "spriteSheet", oldName, nextName);
    const frames = Array.isArray(animation.frames) ? animation.frames.filter(isRecord) : [];
    for (const frame of frames) {
      const tiles = Array.isArray(frame.tiles) ? frame.tiles.filter(isRecord) : [];
      for (const tile of tiles) {
        updateExactAssetField(tile, "sourceSheet", oldName, nextName);
      }
    }
  }

  for (const state of projectArray(data, "animationStates")) {
    updateExactAssetField(state, "spriteSheet", oldName, nextName);
  }

  for (const reference of projectArray(data, "spriteReferenceImages")) {
    updateExactAssetField(reference, "assetName", oldName, nextName);
    updateExactAssetField(reference, "generatedSpriteAssetName", oldName, nextName);
  }
}

function updateDialogueAssetReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const dialogue of projectArray(data, "dialogues")) {
    updateExactAssetField(dialogue, "portrait", oldName, nextName);
    updateExactAssetField(dialogue, "emote", oldName, nextName);
    updateExactAssetField(dialogue, "textSound", oldName, nextName);
    updateExactAssetField(dialogue, "confirmSound", oldName, nextName);
  }

  const settings = isRecord(data.settings) ? data.settings : null;
  const uiDialogs = settings && isRecord(settings.uiDialogs) ? settings.uiDialogs : null;
  if (uiDialogs) {
    updateExactAssetField(uiDialogs, "boxImage", oldName, nextName);
    updateExactAssetField(uiDialogs, "selectorImage", oldName, nextName);
    updateExactAssetField(uiDialogs, "font", oldName, nextName);
  }
}

function updateAudioAssetReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  const audioItems = projectArray(data, "audioItems");
  if (Array.isArray(data.audioItems)) {
    data.audioItems = nextName
      ? audioItems.map((audio) => {
        updateExactAssetField(audio, "name", oldName, nextName);
        return audio;
      })
      : audioItems.filter((audio) => audio.name !== oldName);
  }
}

function updateEventAssetReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const event of projectArray(data, "events")) {
    event.command = replaceAssetNameInCommand(event.command, oldName, nextName);
    const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
    for (const step of steps) {
      step.command = replaceAssetNameInCommand(step.command, oldName, nextName);
    }
  }
}

function updateAssetReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  updateRoomAssetReferences(data, oldName, nextName);
  updateSpriteAssetReferences(data, oldName, nextName);
  updateDialogueAssetReferences(data, oldName, nextName);
  updateAudioAssetReferences(data, oldName, nextName);
  updateEventAssetReferences(data, oldName, nextName);
}

function pruneAssetIDFromGroups(groups: unknown, assetIDToRemove: string): unknown {
  if (!Array.isArray(groups)) {
    return groups;
  }

  return groups.map((group) => {
    if (!isRecord(group)) {
      return group;
    }

    return {
      ...group,
      assetIDs: Array.isArray(group.assetIDs)
        ? group.assetIDs.filter((id) => id !== assetIDToRemove)
        : group.assetIDs,
      children: pruneAssetIDFromGroups(group.children, assetIDToRemove)
    };
  });
}

export function removeAssetFromProject(data: GBAProjectData, assetIDToRemove: string): GBAProjectData {
  const next = cloneProjectData(data);
  const assets = projectArray(next, "assets");
  const removedAsset = assets.find((item, index) => assetID(item, index) === assetIDToRemove);
  const filteredAssets = assets.filter((item, index) => assetID(item, index) !== assetIDToRemove);
  if (filteredAssets.length === assets.length) {
    return data;
  }

  next.assets = filteredAssets;
  next.assetGroups = pruneAssetIDFromGroups(next.assetGroups, assetIDToRemove);
  const removedAssetName = nullableString(removedAsset?.name);
  if (removedAssetName) {
    updateAssetReferences(next, removedAssetName, "");
  }
  return next;
}

function addAssetIDToMatchingGroups(groups: unknown, sourceAssetID: string, newAssetID: string): unknown {
  if (!Array.isArray(groups)) {
    return groups;
  }

  return groups.map((group) => {
    if (!isRecord(group)) {
      return group;
    }

    const assetIDs = Array.isArray(group.assetIDs) ? [...group.assetIDs] : group.assetIDs;
    if (Array.isArray(assetIDs) && assetIDs.includes(sourceAssetID) && !assetIDs.includes(newAssetID)) {
      assetIDs.push(newAssetID);
    }

    return {
      ...group,
      assetIDs,
      children: addAssetIDToMatchingGroups(group.children, sourceAssetID, newAssetID)
    };
  });
}

export function duplicateAssetInProject(data: GBAProjectData, options: DuplicateAssetOptions): GBAProjectData {
  const trimmedName = options.newName.trim();
  if (!trimmedName || options.newAssetID === options.sourceAssetID) {
    return data;
  }

  const next = cloneProjectData(data);
  const assets = projectArray(next, "assets");
  const source = assets.find((item, index) => assetID(item, index) === options.sourceAssetID);
  if (!source) {
    return data;
  }

  const duplicate = {
    ...cloneProjectData(source),
    id: options.newAssetID,
    name: trimmedName
  };
  next.assets = [...assets, duplicate];
  next.assetGroups = addAssetIDToMatchingGroups(next.assetGroups, options.sourceAssetID, options.newAssetID);
  return next;
}

function updateAssetGroupMembership(
  groups: unknown,
  selectedIDs: Set<string>,
  targetGroupID: string | null
): unknown {
  if (!Array.isArray(groups)) return groups;

  return groups.map((group) => {
    if (!isRecord(group)) return group;
    const groupID = nullableString(group.id);
    const retainedIDs = Array.isArray(group.assetIDs)
      ? group.assetIDs.filter((id) => typeof id === "string" && !selectedIDs.has(id))
      : [];
    const assetIDs = groupID === targetGroupID
      ? [...retainedIDs, ...Array.from(selectedIDs).filter((id) => !retainedIDs.includes(id))]
      : retainedIDs;
    return {
      ...group,
      assetIDs,
      children: updateAssetGroupMembership(group.children, selectedIDs, targetGroupID)
    };
  });
}

export function moveAssetsToGroupInProject(
  data: GBAProjectData,
  assetIDs: string[],
  targetGroupID: string | null
): GBAProjectData {
  const existingIDs = new Set(projectArray(data, "assets").map((asset, index) => assetID(asset, index)));
  const selectedIDs = new Set(assetIDs.filter((id) => existingIDs.has(id)));
  if (selectedIDs.size === 0) return data;

  const next = cloneProjectData(data);
  next.assetGroups = updateAssetGroupMembership(next.assetGroups, selectedIDs, targetGroupID);
  return next;
}

export function updateAssetKindsInProject(
  data: GBAProjectData,
  assetIDs: string[],
  kind: string
): GBAProjectData {
  const trimmedKind = kind.trim();
  if (!trimmedKind) return data;
  const selectedIDs = new Set(assetIDs);
  const next = cloneProjectData(data);
  let changed = false;
  const assets = projectArray(next, "assets");
  for (const [index, asset] of assets.entries()) {
    if (!selectedIDs.has(assetID(asset, index)) || asset.kind === trimmedKind) continue;
    asset.kind = trimmedKind;
    changed = true;
  }
  if (!changed) return data;
  next.assets = assets;
  return next;
}

function assetNameWithPattern(name: string, options: RenameAssetsPatternOptions): string {
  const extensionIndex = name.lastIndexOf(".");
  const basename = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
  return `${options.prefix ?? ""}${basename}${options.suffix ?? ""}${extension}`;
}

export function renameAssetsWithPatternInProject(
  data: GBAProjectData,
  assetIDs: string[],
  options: RenameAssetsPatternOptions
): GBAProjectData {
  const selectedIDs = new Set(assetIDs);
  let next = data;
  for (const [index, asset] of projectArray(data, "assets").entries()) {
    const id = assetID(asset, index);
    if (!selectedIDs.has(id)) continue;
    next = renameAssetInProject(next, id, assetNameWithPattern(stringField(asset.name, "Asset sem nome"), options));
  }
  return next;
}

export function removeAssetsFromProject(data: GBAProjectData, assetIDs: string[]): GBAProjectData {
  let next = data;
  for (const id of new Set(assetIDs)) {
    next = removeAssetFromProject(next, id);
  }
  return next;
}

function removeMissingIDsFromGroups(groups: unknown, validIDs: Set<string>): unknown {
  if (!Array.isArray(groups)) return groups;
  return groups.map((group) => {
    if (!isRecord(group)) return group;
    return {
      ...group,
      assetIDs: Array.isArray(group.assetIDs)
        ? group.assetIDs.filter((id) => typeof id === "string" && validIDs.has(id))
        : [],
      children: removeMissingIDsFromGroups(group.children, validIDs)
    };
  });
}

export function repairAssetGroupReferencesInProject(data: GBAProjectData): GBAProjectData {
  const next = cloneProjectData(data);
  const validIDs = new Set(projectArray(next, "assets").map((asset, index) => assetID(asset, index)));
  next.assetGroups = removeMissingIDsFromGroups(next.assetGroups, validIDs);
  return next;
}

export function replaceAssetFileInProject(
  data: GBAProjectData,
  assetIDToReplace: string,
  replacement: ImportedAssetFile
): GBAProjectData {
  const next = cloneProjectData(data);
  const assets = projectArray(next, "assets");
  const asset = assets.find((item, index) => assetID(item, index) === assetIDToReplace);
  if (!asset) return data;

  asset.kind = replacement.kind || asset.kind;
  asset.systemImage = replacement.systemImage || asset.systemImage;
  asset.metadata = {
    ...(isRecord(asset.metadata) ? asset.metadata : {}),
    source: replacement.relativePath
  };
  next.assets = assets;
  return next;
}

export function resolveAssetSourcePath(projectPath: string | undefined, source: string | null): string | null {
  if (!projectPath || !source) {
    return null;
  }

  if (source.startsWith("/") || /^[A-Za-z]:[\\/]/.test(source)) {
    return source;
  }

  const separator = projectPath.includes("\\") ? "\\" : "/";
  const directory = projectPath.split(/[\\/]/).slice(0, -1).join(separator);
  return directory ? `${directory}${separator}${source}` : source;
}
