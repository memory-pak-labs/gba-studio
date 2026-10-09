import type { GBAProjectData } from "./projectFile.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(source: Record<string, unknown> | undefined, key: string, fallback = ""): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function parentDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : normalized;
}

function joinPath(parent: string, child: string): string {
  const normalizedParent = parent.replace(/[\\/]+$/, "");
  const normalizedChild = child.replace(/^[\\/]+/, "").replace(/\\/g, "/");
  return `${normalizedParent}/${normalizedChild}`;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

export function readProjectEnginePackPath(data: GBAProjectData): string {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const build = isRecord(settings?.build) ? settings.build : undefined;
  return stringField(build, "enginePackPath");
}

export function readProjectExportFolder(data: GBAProjectData): string {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const general = isRecord(settings?.general) ? settings.general : undefined;
  return stringField(general, "exportFolder", "build");
}

export function readProjectEmulatorPath(data: GBAProjectData): string {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const preview = isRecord(settings?.preview) ? settings.preview : undefined;
  return stringField(preview, "emulatorPath");
}

export function resolveRomExportRoot(projectPath: string, data: GBAProjectData): string {
  return resolveProjectRelativePath(projectPath, readProjectExportFolder(data));
}

export function resolveProjectRelativePath(projectPath: string, value: string): string {
  if (isAbsolutePath(value)) {
    return value;
  }
  return joinPath(parentDirectory(projectPath), value);
}

export function projectDataForPlay(
  data: GBAProjectData,
  target?: {
    roomID?: string;
    roomName?: string;
    startX?: number;
    startY?: number;
    startDirection?: string;
  }
): GBAProjectData {
  const activeRoom = isRecord(data.scena) ? data.scena : undefined;
  const rooms = Array.isArray(data.scenas) ? data.scenas.filter(isRecord) : [];
  const activeRoomID = stringField(activeRoom, "id");
  const activeRoomName = stringField(activeRoom, "name");
  const matchedRoom = rooms.find((room) => {
    const roomID = stringField(room, "id");
    const roomName = stringField(room, "name");
    return Boolean(
      (target?.roomID && roomID === target.roomID) ||
      (target?.roomName && roomName === target.roomName) ||
      (!target && activeRoomID && roomID === activeRoomID) ||
      (!target && activeRoomName && roomName === activeRoomName)
    );
  });
  const entryRoom = matchedRoom ?? activeRoom;
  const startScene = stringField(entryRoom, "name", stringField(entryRoom, "id"));
  if (!startScene) return data;

  const settings = isRecord(data.settings) ? data.settings : {};
  const general = isRecord(settings.general) ? settings.general : {};
  const hasStartPosition = Number.isFinite(target?.startX) && Number.isFinite(target?.startY);
  return {
    ...data,
    settings: {
      ...settings,
      general: {
        ...general,
        startScene,
        startSceneType: stringField(entryRoom, "sceneType", stringField(general, "startSceneType", "topdown")),
        ...(hasStartPosition ? {
          startX: Math.trunc(target?.startX ?? 0),
          startY: Math.trunc(target?.startY ?? 0),
          startDirection: stringField(target as Record<string, unknown>, "startDirection", stringField(general, "startDirection", "down"))
        } : {})
      }
    }
  };
}

export interface GenerateRomPrerequisites {
  hasSession: boolean;
  hasProjectPath: boolean;
  contractDiagnosticsOK: boolean | null;
  hasEngineAssetc: boolean;
  hasEngineBuild: boolean;
  buildRunning: boolean;
  exportRunning: boolean;
  projectHealthExportReady?: boolean | null;
}

export function generateRomBlockedReason(state: GenerateRomPrerequisites): string | undefined {
  if (!state.hasSession) return "Abra ou crie um projeto antes de gerar a ROM.";
  if (!state.hasProjectPath) return "Salve o projeto antes de gerar a ROM.";
  if (state.contractDiagnosticsOK === false) return "Corrija os diagnosticos do contrato antes de gerar a ROM.";
  if (state.projectHealthExportReady === false) return "Corrija os bloqueios de saude do projeto antes de gerar a ROM.";
  if (!state.hasEngineAssetc) return "GBAStudio Engine Pack com assetc nao localizado.";
  if (!state.hasEngineBuild) return "GBAStudio Engine Pack com gbsbuild nao localizado.";
  if (state.exportRunning) return "Exportacao em andamento.";
  if (state.buildRunning) return "Build de ROM em andamento.";
  return undefined;
}

export interface PlayProjectPrerequisites extends GenerateRomPrerequisites {
  emulatorPath?: string;
  platform?: NodeJS.Platform;
}

export function playProjectBlockedReason(state: PlayProjectPrerequisites): string | undefined {
  const romReason = generateRomBlockedReason(state);
  if (romReason) return romReason;
  return undefined;
}

export function canPlayProject(state: PlayProjectPrerequisites): boolean {
  return playProjectBlockedReason(state) === undefined;
}

export function canGenerateRom(state: GenerateRomPrerequisites): boolean {
  return generateRomBlockedReason(state) === undefined;
}
