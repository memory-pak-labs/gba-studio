import { SCENE_MAP_CONTENT_UNIT_SIZE } from "./sceneMapLayout.js";

export interface RoomCameraModeOption {
  id: string;
  label: string;
  description: string;
}

export interface RoomCameraBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomParallaxOption {
  id: string;
  label: string;
  description: string;
  layers: string[];
}

export interface RoomParallaxSettings {
  mode: string;
  offsetX: number;
  offsetY: number;
  speedX: number;
  speedY: number;
}

/** Viewport padrão GBA em tiles (240×160 → 30×20). */
export const GBA_VIEWPORT_TILES = {
  width: Math.round(SCENE_MAP_CONTENT_UNIT_SIZE.width / 8),
  height: Math.round(SCENE_MAP_CONTENT_UNIT_SIZE.height / 8)
} as const;

export const ROOM_CAMERA_ZOOM_MIN = 50;
export const ROOM_CAMERA_ZOOM_MAX = 400;
export const ROOM_CAMERA_ZOOM_DEFAULT = 100;

export function normalizeRoomCameraZoom(value: unknown, fallback = ROOM_CAMERA_ZOOM_DEFAULT): number {
  const parsed = typeof value === "number" ? value : Number(value);
  const normalizedFallback = Number.isFinite(fallback) ? Math.round(fallback) : ROOM_CAMERA_ZOOM_DEFAULT;
  const zoom = Number.isFinite(parsed) ? Math.round(parsed) : normalizedFallback;
  return Math.min(ROOM_CAMERA_ZOOM_MAX, Math.max(ROOM_CAMERA_ZOOM_MIN, zoom));
}

export const ROOM_CAMERA_MODE_OPTIONS: RoomCameraModeOption[] = [
  {
    id: "fixed_center",
    label: "Fixa no centro",
    description: "Mantém a câmera centralizada na cena."
  },
  {
    id: "follow_player",
    label: "Seguir jogador",
    description: "A câmera acompanha o jogador dentro dos limites da cena."
  },
  {
    id: "fixed_position",
    label: "Fixa na posição",
    description: "Trava a câmera na posição e na área definidas abaixo."
  },
  {
    id: "manual",
    label: "Manual / eventos",
    description: "A câmera só se move por comandos de eventos."
  }
];

export const ROOM_PARALLAX_OPTIONS: RoomParallaxOption[] = [
  {
    id: "disabled",
    label: "Desativada",
    description: "Desativada. Escolha uma ou mais camadas para ajustar deslocamento e velocidade.",
    layers: []
  },
  {
    id: "bg3",
    label: "BG3",
    description: "Usa BG3 como fundo distante com deslocamento e velocidade próprios.",
    layers: ["BG3"]
  },
  {
    id: "bg2_bg3",
    label: "BG2 + BG3",
    description: "Ajusta deslocamento e velocidade em BG2 e BG3.",
    layers: ["BG2", "BG3"]
  },
  {
    id: "bg1_bg2_bg3",
    label: "BG1 + BG2 + BG3",
    description: "Ajusta deslocamento e velocidade nas três camadas de fundo.",
    layers: ["BG1", "BG2", "BG3"]
  }
];

const CAMERA_MODE_ALIASES: Record<string, string> = {
  fixed: "fixed_center",
  "fixed center": "fixed_center",
  "fixa no centro": "fixed_center",
  fixed_center: "fixed_center",
  "follow player": "follow_player",
  follow: "follow_player",
  follow_player: "follow_player",
  "seguir jogador": "follow_player",
  "fixed position": "fixed_position",
  fixed_position: "fixed_position",
  "fixa na posicao": "fixed_position",
  "fixa na posição": "fixed_position",
  manual: "manual",
  "manual / eventos": "manual",
  events: "manual",
  project_default: "fixed_center"
};

const PARALLAX_ALIASES: Record<string, string> = {
  disabled: "disabled",
  desativada: "disabled",
  off: "disabled",
  none: "disabled",
  bg3: "bg3",
  "bg2 + bg3": "bg2_bg3",
  bg2_bg3: "bg2_bg3",
  "bg1 + bg2 + bg3": "bg1_bg2_bg3",
  bg1_bg2_bg3: "bg1_bg2_bg3"
};

function normalizedKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function integerOr(value: unknown, fallback: number): number {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
}

export function normalizeCameraModeId(cameraMode: string | null | undefined, fallback = "fixed_center"): string {
  const raw = typeof cameraMode === "string" ? cameraMode.trim() : "";
  if (!raw) return fallback;

  const byId = ROOM_CAMERA_MODE_OPTIONS.find((option) => option.id === raw);
  if (byId) return byId.id;

  const byLabel = ROOM_CAMERA_MODE_OPTIONS.find((option) => option.label === raw);
  if (byLabel) return byLabel.id;

  return CAMERA_MODE_ALIASES[normalizedKey(raw)] ?? fallback;
}

export function cameraModeLabel(cameraMode: string): string {
  const normalized = normalizeCameraModeId(cameraMode, cameraMode);
  return ROOM_CAMERA_MODE_OPTIONS.find((option) => option.id === normalized)?.label ?? cameraMode;
}

export function cameraModeDescription(cameraMode: string): string {
  const normalized = normalizeCameraModeId(cameraMode, cameraMode);
  return ROOM_CAMERA_MODE_OPTIONS.find((option) => option.id === normalized)?.description
    ?? "Defina como a câmera se comporta nesta cena.";
}

export function roomInspectorCameraModeOptions(currentMode?: string | null): Array<{ label: string; value: string }> {
  const options = ROOM_CAMERA_MODE_OPTIONS.map((option) => ({
    label: option.label,
    value: option.id
  }));
  const current = typeof currentMode === "string" ? currentMode.trim() : "";
  if (!current) return options;

  const normalized = normalizeCameraModeId(current, current);
  if (options.some((option) => option.value === normalized)) return options;
  return [{ label: current, value: current }, ...options];
}

export function roomExceedsGbaViewport(width: number, height: number): boolean {
  return width > GBA_VIEWPORT_TILES.width || height > GBA_VIEWPORT_TILES.height;
}

export function defaultRoomCameraBounds(roomWidth: number, roomHeight: number): RoomCameraBounds {
  const width = Math.max(1, Math.min(GBA_VIEWPORT_TILES.width, Math.max(1, Math.trunc(roomWidth) || 1)));
  const height = Math.max(1, Math.min(GBA_VIEWPORT_TILES.height, Math.max(1, Math.trunc(roomHeight) || 1)));
  const maxX = Math.max(0, Math.trunc(roomWidth) - width);
  const maxY = Math.max(0, Math.trunc(roomHeight) - height);
  return {
    x: Math.floor(maxX / 2),
    y: Math.floor(maxY / 2),
    width,
    height
  };
}

export function normalizeRoomCameraBounds(
  bounds: Partial<RoomCameraBounds> | null | undefined,
  roomWidth: number,
  roomHeight: number
): RoomCameraBounds {
  const fallback = defaultRoomCameraBounds(roomWidth, roomHeight);
  const width = Math.max(1, Math.min(Math.max(1, Math.trunc(roomWidth) || 1), integerOr(bounds?.width, fallback.width)));
  const height = Math.max(1, Math.min(Math.max(1, Math.trunc(roomHeight) || 1), integerOr(bounds?.height, fallback.height)));
  const maxX = Math.max(0, Math.trunc(roomWidth) - width);
  const maxY = Math.max(0, Math.trunc(roomHeight) - height);
  return {
    x: Math.max(0, Math.min(maxX, integerOr(bounds?.x, fallback.x))),
    y: Math.max(0, Math.min(maxY, integerOr(bounds?.y, fallback.y))),
    width,
    height
  };
}

export function centerRoomCameraBounds(roomWidth: number, roomHeight: number, current?: Partial<RoomCameraBounds> | null): RoomCameraBounds {
  const normalized = normalizeRoomCameraBounds(current, roomWidth, roomHeight);
  const maxX = Math.max(0, Math.trunc(roomWidth) - normalized.width);
  const maxY = Math.max(0, Math.trunc(roomHeight) - normalized.height);
  return {
    ...normalized,
    x: Math.floor(maxX / 2),
    y: Math.floor(maxY / 2)
  };
}

export function normalizeParallaxModeId(mode: string | null | undefined, fallback = "disabled"): string {
  const raw = typeof mode === "string" ? mode.trim() : "";
  if (!raw) return fallback;

  const byId = ROOM_PARALLAX_OPTIONS.find((option) => option.id === raw);
  if (byId) return byId.id;

  const byLabel = ROOM_PARALLAX_OPTIONS.find((option) => option.label === raw);
  if (byLabel) return byLabel.id;

  return PARALLAX_ALIASES[normalizedKey(raw)] ?? fallback;
}

export function parallaxModeLabel(mode: string): string {
  const normalized = normalizeParallaxModeId(mode, mode);
  return ROOM_PARALLAX_OPTIONS.find((option) => option.id === normalized)?.label ?? mode;
}

export function parallaxModeDescription(mode: string): string {
  const normalized = normalizeParallaxModeId(mode, mode);
  return ROOM_PARALLAX_OPTIONS.find((option) => option.id === normalized)?.description
    ?? "Desativada. Escolha uma ou mais camadas para ajustar deslocamento e velocidade.";
}

export function roomInspectorParallaxOptions(currentMode?: string | null): Array<{ label: string; value: string }> {
  const options = ROOM_PARALLAX_OPTIONS.map((option) => ({
    label: option.label,
    value: option.id
  }));
  const current = typeof currentMode === "string" ? currentMode.trim() : "";
  if (!current) return options;

  const normalized = normalizeParallaxModeId(current, current);
  if (options.some((option) => option.value === normalized)) return options;
  return [{ label: current, value: current }, ...options];
}

export function defaultRoomParallaxSettings(): RoomParallaxSettings {
  return {
    mode: "disabled",
    offsetX: 0,
    offsetY: 0,
    speedX: 256,
    speedY: 256
  };
}

export function normalizeRoomParallaxSettings(
  settings: Partial<RoomParallaxSettings> | null | undefined
): RoomParallaxSettings {
  const fallback = defaultRoomParallaxSettings();
  return {
    mode: normalizeParallaxModeId(settings?.mode, fallback.mode),
    offsetX: integerOr(settings?.offsetX, fallback.offsetX),
    offsetY: integerOr(settings?.offsetY, fallback.offsetY),
    speedX: Math.max(0, integerOr(settings?.speedX, fallback.speedX)),
    speedY: Math.max(0, integerOr(settings?.speedY, fallback.speedY))
  };
}

export function cameraModeFollowsPlayer(cameraMode: string): boolean {
  return normalizeCameraModeId(cameraMode) === "follow_player";
}

export function exportCameraModeId(cameraMode: string): "follow" | "fixed" | "manual" {
  const normalized = normalizeCameraModeId(cameraMode);
  if (normalized === "follow_player") return "follow";
  if (normalized === "manual") return "manual";
  return "fixed";
}
