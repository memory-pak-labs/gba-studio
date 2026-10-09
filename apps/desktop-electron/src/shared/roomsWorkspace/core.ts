import type { GBAProjectData } from "../projectFile.js";
import { applyDefaultRoomBackground, defaultBackgroundActorPosition, defaultBackgroundForRoom } from "../blankBackgroundDefaults.js";
import { createBlankProjectData } from "../newProject.js";
import { buildProjectFromTemplate } from "../projectTemplates.js";
import {
  GBA_MIN_SCENE_HEIGHT_TILES,
  GBA_MIN_SCENE_WIDTH_TILES,
  normalizeGBAAssetDocument,
  normalizeGBAEntityDocument,
  type GBASceneCampaignDocument
} from "../../../../../packages/project-contract/src/index.js";
import { normalizeGBASceneDocument } from "../../../../../packages/project-contract/src/index.js";
import {
  clampSceneMapZoom,
  defaultSceneMapPosition,
  organizedSceneMapPositions,
  preferredSceneMapPositionBeside,
  sceneMapCardSize,
  SCENE_MAP_HORIZONTAL_GAP,
  type SceneMapPosition
} from "../sceneMapLayout.js";
import { findNextFreeCanvasPosition } from "../canvasWorkspace.js";
import { gbaRenderLayers, resolveGbaActorSprite } from "../gbaRendering.js";
import { renameSceneRouteTableReferences } from "../sceneRouteTables.js";
import {
  activeTileLayerMappingFromProject,
  composeSceneTilemap,
  defaultSceneTileLayers,
  ensureRoomSceneTileLayers,
  normalizeActiveTileLayerForVideoMode,
  normalizeSceneTileLayerMapping,
  normalizeSceneTileLayers,
  paintedTileCount,
  readActiveLayerTileCells,
  readSceneTileLayersFromRoom,
  sceneTileLayerAvailableForVideoMode,
  sceneTileLayerCatalog,
  sceneTileLayerOrderedMappings,
  sceneTileLayerPaintOptions,
  sceneTileLayerSupportsLayers,
  setSceneTileLayerCell,
  type SceneTileLayerMapping
} from "../sceneTileLayers.js";
import {
  resolveSceneTilemapContract,
  sceneTilemapCellIndexesForCell,
  type SceneTilemapContract
} from "../sceneTilemapContract.js";
import { gbaVideoModeFromProject } from "../gbaVideoModes.js";
import {
  blockedCollisionCellsFromRoom,
  collisionTypeCellsFromRoom,
  isBlockedCollisionType,
  isRoomCollisionType,
  normalizeRoomCollisionType,
  resizeCollisionTypeCells,
  roomCollisionTypeLabel,
  type RoomCollisionType
} from "../roomCollisionTypes.js";
import { isometricGameplayModeForSceneTypeChoice, normalizeSceneTypeId, sceneTypeLabel } from "../sceneTypes.js";
import {
  defaultSceneRuntime,
  isometricSceneConfigFromRuntime,
  normalizeSceneRuntime,
  resolveSceneControlledEntityContract,
  DEFAULT_ISOMETRIC_SCENE_CONFIG,
  sceneTypeProfile,
  type CutsceneSceneConfig,
  type IsometricSceneConfig,
  type SceneRuntimeConfig
} from "../sceneTypeProfiles.js";
import { resolveShmupSceneComposition } from "../shmupSceneComposition.js";
import {
  canvasPointToIsometricRoomTile,
  projectIsometricRoomPoint
} from "../isometricProjection.js";
import {
  applyDefaultIsometricRoomVisuals,
  DEFAULT_ISOMETRIC_TILESET_NAME,
  ensureDefaultIsometricTilesetAsset
} from "../isometricDefaultTileset.js";
import { deriveIsometricWorldSize, type IsometricWorldSize } from "../isometricAuthoring.js";
import {
  cameraModeLabel,
  centerRoomCameraBounds,
  normalizeCameraModeId,
  normalizeRoomCameraBounds,
  normalizeRoomCameraZoom,
  normalizeRoomParallaxSettings,
  roomExceedsGbaViewport,
  type RoomCameraBounds,
  type RoomParallaxSettings
} from "../roomCamera.js";
import { defaultMenuSceneConfig, type MenuSceneRole, type MenuScreenType } from "../menuScene.js";
import {
  normalizeSceneTransition,
  sceneTransitionFromProjectSettings,
  type SceneTransitionConfig
} from "../sceneTransition.js";
import {
  normalizeScenePaletteBankPolicy,
  type ScenePaletteBankPolicy
} from "../paletteContract.js";
import {
  defaultPlayerSpriteForSceneType,
  defaultSceneActorPosition
} from "../sceneDefaultActors.js";
import { blankPlayerSpriteForRoom, usesBlankPlayerDefaults } from "../blankPlayerDefaults.js";
import { BLANK_SCENE_HUD_IDS } from "../blankSceneHudDefaults.js";

export type { RoomCollisionType } from "../roomCollisionTypes.js";
export { ROOM_COLLISION_TYPES, isBlockedCollisionType, roomCollisionTypeLabel } from "../roomCollisionTypes.js";
export type { RoomCameraBounds, RoomParallaxSettings } from "../roomCamera.js";

export type RoomGeometryAlignmentStatus = "aligned" | "mismatch" | "unknown" | "not_applicable";

export interface RoomGeometryDiagnostics {
  backgroundAlignment: {
    actualHeight: number | null;
    actualWidth: number | null;
    expectedHeight: number;
    expectedWidth: number;
    status: RoomGeometryAlignmentStatus;
  };
  actorPlacement: {
    blocked: string[];
    outsideBounds: string[];
  };
  triggerPlacement: {
    blocked: string[];
    outsideBounds: string[];
  };
}

export interface RoomBackgroundFidelity {
  assetcStatus: string | null;
  maxFramebufferMismatchRatio: number | null;
  maxSourcePixelErrorRatio: number | null;
  optimizerEnabled: boolean;
  tileBudget: number | null;
}

export interface RoomsWorkspaceRoom {
  id: string;
  name: string;
  displayName?: string;
  campaign?: GBASceneCampaignDocument;
  width: number;
  height: number;
  gbaResolution: string;
  music: string | null;
  hudPresetId?: string | null;
  eventBindings?: Record<string, string>;
  cameraMode: string;
  cameraZoom: number;
  cameraBounds: RoomCameraBounds;
  cameraBoundsEditable: boolean;
  cameraZones?: RoomCameraZone[];
  parallax: RoomParallaxSettings;
  sceneType: string;
  runtime?: SceneRuntimeConfig;
  playerActorName: string | null;
  background: string | null;
  backgroundLayers?: RoomsWorkspaceBackgroundLayer[];
  backgroundSource: string | null;
  backgroundBundledDefaultAsset: string | null;
  backgroundPixelHeight?: number | null;
  backgroundPixelWidth?: number | null;
  backgroundFidelity?: RoomBackgroundFidelity | null;
  backgroundTileHeight: number;
  backgroundAtlasTileHeight?: number;
  backgroundAtlasRenderOffsetY?: number;
  backgroundAtlasColumns?: number;
  backgroundAtlasRows?: number;
  backgroundTileOffsetX: number;
  backgroundTileOffsetY: number;
  backgroundTileWidth: number;
  backgroundAtlasTileWidth?: number;
  backgroundRenderMode: string;
  tilemapContract?: SceneTilemapContract;
  paletteFamilyID?: string | null;
  paletteFamilyName?: string | null;
  paletteBankPolicy?: ScenePaletteBankPolicy;
  backgroundPalette?: number[];
  objectPalette?: number[];
  gbStudioUseBackgroundLayout: boolean;
  tileCount: number;
  tileCells: number[];
  activeLayerTileCells: number[];
  tileLayers?: RoomsWorkspaceTileLayer[];
  layerEditing?: RoomLayerEditingSettings;
  collisionCount: number;
  collisionCells: boolean[];
  collisionTypes?: RoomCollisionType[];
  heightLevels?: number[];
  foregroundTileCount?: number;
  referenceImageCount: number;
  layeredPaintingEnabled: boolean;
  activeTileLayerMapping: SceneTileLayerMapping;
  paintedTileCount: number;
  geometryDiagnostics?: RoomGeometryDiagnostics;
  isActive: boolean;
  isStart: boolean;
  warnings: string[];
}

export interface RoomsWorkspaceBackgroundLayer {
  assetName: string;
  bundledDefaultAsset: string | null;
  mapping: SceneTileLayerMapping;
  source: string | null;
}

interface ScenePaletteFamily {
  background: number[];
  id: string;
  name: string;
  objects: number[];
}

function scenePaletteFamilies(data: GBAProjectData): Map<string, ScenePaletteFamily> {
  const families = new Map<string, ScenePaletteFamily>();
  const records = Array.isArray(data.paletteFamilies) ? data.paletteFamilies.filter(isRecord) : [];
  for (const record of records) {
    const id = nullableString(record.id);
    if (!id || families.has(id)) continue;
    const palette = (value: unknown): number[] => (Array.isArray(value) ? value : [])
      .filter((entry): entry is number => Number.isInteger(entry) && entry >= 0 && entry <= 0x7fff)
      .slice(0, 16);
    families.set(id, {
      background: palette(record.background),
      id,
      name: stringField(record.name, id),
      objects: palette(record.objects)
    });
  }
  return families;
}

export interface RoomsWorkspaceTileLayer {
  mapping: SceneTileLayerMapping;
  label: string;
  tilemap: number[];
  paintedTileCount: number;
}

export interface RoomLayerEditingState {
  hidden: boolean;
  locked: boolean;
  opacity: number;
  solo: boolean;
  parallaxCurve: Array<{ input: number; output: number }>;
}

export type RoomLayerEditingSettings = Record<SceneTileLayerMapping, RoomLayerEditingState>;

function normalizeRoomLayerEditing(value: unknown): RoomLayerEditingSettings {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(sceneTileLayerOrderedMappings.map((mapping) => {
    const item = isRecord(source[mapping]) ? source[mapping] : {};
    const opacity = typeof item.opacity === "number" && Number.isFinite(item.opacity)
      ? Math.max(0, Math.min(1, item.opacity))
      : 1;
    const curve = (Array.isArray(item.parallaxCurve) ? item.parallaxCurve : [])
      .filter(isRecord)
      .map((point) => ({
        input: typeof point.input === "number" && Number.isFinite(point.input) ? point.input : 0,
        output: typeof point.output === "number" && Number.isFinite(point.output) ? point.output : 0
      }));
    return [mapping, {
      hidden: item.hidden === true,
      locked: item.locked === true,
      opacity,
      solo: item.solo === true,
      parallaxCurve: curve.length > 0 ? curve : [{ input: 0, output: 0 }, { input: 1, output: 1 }]
    }];
  })) as RoomLayerEditingSettings;
}

export interface IsometricRoomTilePlacement {
  depth: number;
  heightPercent: number;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
}

export interface IsometricRoomAreaPlacement {
  clipPath: string;
  heightPercent: number;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
}

export function isometricRoomTilePlacement(
  roomWidth: number,
  roomHeight: number,
  cartX: number,
  cartY: number,
  config: IsometricSceneConfig = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  atlasTileHeight?: number,
  surfaceSize?: IsometricWorldSize
): IsometricRoomTilePlacement {
  const width = Math.max(1, Math.floor(roomWidth));
  const height = Math.max(1, Math.floor(roomHeight));
  const projected = projectIsometricRoomPoint({ x: cartX, y: cartY, z: 0 }, height, config, surfaceSize);
  const halfWidth = config.tileWidth / 2;
  const worldSize = surfaceSize ?? deriveIsometricWorldSize({ atlasTileHeight, config, height, width });
  const canvasWidth = worldSize.width;
  const canvasHeight = worldSize.height;
  return {
    depth: cartX + cartY,
    heightPercent: (config.tileHeight / canvasHeight) * 100,
    leftPercent: ((projected.x - halfWidth) / canvasWidth) * 100,
    topPercent: (projected.y / canvasHeight) * 100,
    widthPercent: (config.tileWidth / canvasWidth) * 100
  };
}

export function isometricRoomAreaPlacement(
  roomWidth: number,
  roomHeight: number,
  area: RoomConnectionArea,
  config: IsometricSceneConfig = DEFAULT_ISOMETRIC_SCENE_CONFIG,
  atlasTileHeight?: number,
  surfaceSize?: IsometricWorldSize,
  heightLevels?: readonly number[]
): IsometricRoomAreaPlacement {
  const width = Math.max(1, Math.floor(roomWidth));
  const height = Math.max(1, Math.floor(roomHeight));
  const x = Math.min(width - 1, Math.max(0, Math.floor(area.x)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(area.y)));
  const areaWidth = Math.min(width - x, Math.max(1, Math.floor(area.width)));
  const areaHeight = Math.min(height - y, Math.max(1, Math.floor(area.height)));
  if (heightLevels?.length) {
    const worldSize = surfaceSize ?? deriveIsometricWorldSize({ atlasTileHeight, config, height, width });
    const levelAt = (cellX: number, cellY: number): number => Math.max(0, Math.min(15,
      Math.floor(heightLevels[cellY * width + cellX] ?? 0)));
    const levels = new Set<number>();
    for (let row = y; row < y + areaHeight; row += 1) {
      for (let column = x; column < x + areaWidth; column += 1) levels.add(levelAt(column, row));
    }
    if (levels.size === 1) {
      const plane = isometricRoomAreaPlacement(width, height, area, config, atlasTileHeight, surfaceSize);
      return { ...plane, topPercent: plane.topPercent - levelAt(x, y) * config.heightStep / worldSize.height * 100 };
    }
    // Union of clockwise floor polygons. Merge equal-height runs to keep large
    // camera zones compact, without drawing over gaps between raised floors.
    const polygons: Array<Array<{ x: number; y: number }>> = [];
    for (let row = y; row < y + areaHeight; row += 1) {
      for (let column = x; column < x + areaWidth;) {
        const z = levelAt(column, row);
        let end = column + 1;
        while (end < x + areaWidth && levelAt(end, row) === z) end += 1;
        const first = isometricRoomTilePlacement(width, height, column, row, config, atlasTileHeight, surfaceSize);
        const last = isometricRoomTilePlacement(width, height, end - 1, row, config, atlasTileHeight, surfaceSize);
        const elevation = z * config.heightStep / worldSize.height * 100;
        polygons.push([
          { x: first.leftPercent + first.widthPercent / 2, y: first.topPercent - elevation },
          { x: last.leftPercent + last.widthPercent, y: last.topPercent + last.heightPercent / 2 - elevation },
          { x: last.leftPercent + last.widthPercent / 2, y: last.topPercent + last.heightPercent - elevation },
          { x: first.leftPercent, y: first.topPercent + first.heightPercent / 2 - elevation }
        ]);
        column = end;
      }
    }
    const points = polygons.flat();
    const left = Math.min(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    const placementWidth = Math.max(0.0001, Math.max(...points.map(point => point.x)) - left);
    const placementHeight = Math.max(0.0001, Math.max(...points.map(point => point.y)) - top);
    const percent = (value: number): string => `${Math.round(value * 10000) / 10000}%`;
    const point = (p: { x: number; y: number }): string => `${percent((p.x - left) / placementWidth * 100)} ${percent((p.y - top) / placementHeight * 100)}`;
    const commands = polygons.flatMap((polygon, index) => [
      `${index === 0 ? "from" : "move to"} ${point(polygon[0]!)}`,
      ...polygon.slice(1).map(p => `line to ${point(p)}`), "close"
    ]);
    return { clipPath: `shape(nonzero ${commands.join(", ")})`, heightPercent: placementHeight,
      leftPercent: left, topPercent: top, widthPercent: placementWidth };
  }
  const topLeft = isometricRoomTilePlacement(width, height, x, y, config, atlasTileHeight, surfaceSize);
  const topRight = isometricRoomTilePlacement(width, height, x + areaWidth - 1, y, config, atlasTileHeight, surfaceSize);
  const bottomRight = isometricRoomTilePlacement(width, height, x + areaWidth - 1, y + areaHeight - 1, config, atlasTileHeight, surfaceSize);
  const bottomLeft = isometricRoomTilePlacement(width, height, x, y + areaHeight - 1, config, atlasTileHeight, surfaceSize);
  const left = bottomLeft.leftPercent;
  const top = topLeft.topPercent;
  const right = topRight.leftPercent + topRight.widthPercent;
  const bottom = bottomRight.topPercent + bottomRight.heightPercent;
  const placementWidth = Math.max(0.0001, right - left);
  const placementHeight = Math.max(0.0001, bottom - top);
  const percent = (value: number): string => `${Math.round(value * 10000) / 10000}%`;
  const point = (pointX: number, pointY: number): string => (
    `${percent(((pointX - left) / placementWidth) * 100)} ${percent(((pointY - top) / placementHeight) * 100)}`
  );
  const topVertex = {
    x: topLeft.leftPercent + topLeft.widthPercent / 2,
    y: topLeft.topPercent
  };
  const rightVertex = {
    x: topRight.leftPercent + topRight.widthPercent,
    y: topRight.topPercent + topRight.heightPercent / 2
  };
  const bottomVertex = {
    x: bottomRight.leftPercent + bottomRight.widthPercent / 2,
    y: bottomRight.topPercent + bottomRight.heightPercent
  };
  const leftVertex = {
    x: bottomLeft.leftPercent,
    y: bottomLeft.topPercent + bottomLeft.heightPercent / 2
  };
  return {
    clipPath: `polygon(${point(topVertex.x, topVertex.y)}, ${point(rightVertex.x, rightVertex.y)}, ${point(bottomVertex.x, bottomVertex.y)}, ${point(leftVertex.x, leftVertex.y)})`,
    heightPercent: placementHeight,
    leftPercent: left,
    topPercent: top,
    widthPercent: placementWidth
  };
}

export interface RoomsWorkspaceSceneTypeCount {
  sceneType: string;
  count: number;
}

export interface RoomsWorkspaceSummary {
  roomCount: number;
  activeRoomName: string | null;
  startRoomName: string | null;
  sceneTypes: RoomsWorkspaceSceneTypeCount[];
  totalTiles: number;
  warningCount: number;
}

export interface RoomsWorkspaceOption {
  label: string;
  value: string;
}

export interface RoomsWorkspaceActorAnimationVariant {
  animationName: string;
  spriteSheet: string;
  state: string;
  direction: string | null;
}

export interface RoomsWorkspaceActorAnimationStateOption extends RoomsWorkspaceOption {
  spriteSheet: string;
}

export interface RoomsWorkspaceOptions {
  actorAnimations: RoomsWorkspaceOption[];
  actorAnimationStates: RoomsWorkspaceActorAnimationStateOption[];
  actorAnimationVariants: RoomsWorkspaceActorAnimationVariant[];
  actorSpriteSheets: RoomsWorkspaceOption[];
  backgroundAssets: RoomsWorkspaceOption[];
  musicItems: RoomsWorkspaceOption[];
  paletteFamilies: RoomsWorkspaceOption[];
  playerActors: RoomsWorkspaceOption[];
}

export interface RoomConnectionArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomCameraZone {
  id: string;
  name: string;
  area: RoomConnectionArea;
  bounds: RoomCameraBounds;
  offset: { x: number; y: number };
  lockX: boolean;
  lockY: boolean;
}

export interface RoomsWorkspaceConnection {
  index: number;
  from: string;
  to: string;
  eventName: string | null;
  exit: RoomConnectionArea | null;
  entry: RoomConnectionArea | null;
  transition: SceneTransitionConfig;
  transitionSource: "project-default" | "custom";
  isFromActive: boolean;
  isToActive: boolean;
}

export interface RoomEventSceneLink {
  id: string;
  from: string;
  to: string;
  eventName: string;
  eventID: string | null;
  stepIndex: number | null;
  command: string | null;
  x: number | null;
  y: number | null;
  direction: "up" | "down" | "left" | "right" | null;
}

export type RoomsWorkspaceEntityKind = "actor" | "trigger";
export type RoomsWorkspaceBattleSide = "none" | "party" | "enemy";
export type RoomsWorkspaceBattleAbility = "attack" | "magic" | "heal" | "defend";

export interface RoomsWorkspaceActorBattle {
  side: RoomsWorkspaceBattleSide;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  abilities: RoomsWorkspaceBattleAbility[];
  spriteScale?: number;
}

export interface RoomsWorkspaceEntity {
  kind: RoomsWorkspaceEntityKind;
  id: string;
  name: string;
  roomName: string;
  /**
   * The controlled player is rendered in the scene for authoring feedback,
   * but it is not counted or presented as a regular actor in scene cards.
   */
  isPlayer?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  eventName: string | null;
  spriteSheet?: string | null;
  spriteSource?: string | null;
  spriteBundledDefaultAsset?: string | null;
  spriteFrame?: RoomsWorkspaceSpriteFrame | null;
  animationName?: string | null;
  animationStateID?: string | null;
  z?: number;
  hasCustomBounds?: boolean;
  collisionGroup?: number;
  collisionMask?: number;
  pushPriority?: number;
  pushable?: boolean;
  battle?: RoomsWorkspaceActorBattle;
  isInActiveRoom: boolean;
}

export interface RoomsWorkspaceSpriteFrame {
  frameHeight: number;
  frameWidth: number;
  heightTiles: number;
  layer: typeof gbaRenderLayers.obj;
  originX: number;
  originY: number;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
  widthTiles: number;
}

export interface RoomsWorkspacePresentation {
  rooms: RoomsWorkspaceRoom[];
  summary: RoomsWorkspaceSummary;
  options: RoomsWorkspaceOptions;
  connections: RoomsWorkspaceConnection[];
  entities: RoomsWorkspaceEntity[];
  sceneMapPositions: Record<string, SceneMapPosition>;
  sceneMapZoom: number;
  tilePalette: number[];
  videoModeId: number;
  videoModeLabel: string;
}

export type RoomsWorkspaceStatusFilter = "all" | "active" | "start" | "warning";

export interface RoomsWorkspaceFilterOptions {
  query?: string;
  sceneType?: string;
  status?: RoomsWorkspaceStatusFilter;
}

export interface RoomsWorkspaceFilterChip<TValue extends string> {
  id: string;
  label: string;
  value: TValue;
  count: number;
  isActive: boolean;
}

export interface RoomsWorkspaceFilterChips {
  sceneType: Array<RoomsWorkspaceFilterChip<string>>;
  status: Array<RoomsWorkspaceFilterChip<RoomsWorkspaceStatusFilter>>;
}

export interface RoomTileOverlayCell {
  actorCount: number;
  collision: boolean;
  collisionType: RoomCollisionType;
  elevated: boolean;
  foreground: boolean;
  heightLevel: number;
  ramp: boolean;
  triggerCount: number;
}

export interface RoomEntityAlignmentGuide {
  axis: "x" | "y";
  coordinate: number;
  count: number;
  percent: number;
}

export interface CreateRoomOptions {
  id: string;
  name: string;
  width: number;
  height: number;
  sceneType: string;
  anchorRoomID?: string;
  presetID?: RoomPresetID;
}

export type RoomPresetID = "interior" | "exterior" | "isometricAdventure" | "isometricTactical" | "battle" | "luta" | "dialogue" | "transition" | "logo" | "title" | "menu" | "startMenu";

export interface RoomPreset {
  id: RoomPresetID;
  label: string;
  description: string;
  width: number;
  height: number;
  sceneType: string;
  cameraMode: string;
  borderCollision: boolean;
  menuScreenType?: MenuScreenType;
  menuRole?: MenuSceneRole;
}

export const ROOM_PRESETS: RoomPreset[] = [
  { id: "isometricAdventure", label: "Isométrica · Aventura", description: "Exploração livre com composição, rampas e sprites aprovados do Mercado.", width: 36, height: 36, sceneType: "isometricAdventure", cameraMode: "follow_player", borderCollision: false },
  { id: "isometricTactical", label: "Isométrica · Batalha tática RPG", description: "Arena por turnos com uma unidade aliada e uma inimiga.", width: 6, height: 6, sceneType: "isometricTactical", cameraMode: "fixed_center", borderCollision: false },
  { id: "interior", label: "Interior", description: "Cena compacta com bordas sólidas.", width: 30, height: 20, sceneType: "topdown", cameraMode: "fixed_center", borderCollision: true },
  { id: "exterior", label: "Exterior", description: "Área ampla com câmera seguindo o jogador.", width: 30, height: 20, sceneType: "topdown", cameraMode: "follow_player", borderCollision: false },
  { id: "battle", label: "Batalha", description: "Arena pronta para o runtime de batalha RPG.", width: 30, height: 20, sceneType: "battleRpg", cameraMode: "fixed_center", borderCollision: false },
  { id: "luta", label: "Luta", description: "Arena pronta para o runtime de luta estilo Street Fighter.", width: 40, height: 20, sceneType: "luta", cameraMode: "fixed_center", borderCollision: true },
  { id: "dialogue", label: "Diálogo", description: "Cena focada em narrativa e escolhas.", width: 30, height: 20, sceneType: "visualNovel", cameraMode: "fixed_center", borderCollision: false },
  { id: "transition", label: "Transição", description: "Cena curta para ritmo e passagem entre cenas.", width: 30, height: 20, sceneType: "cutscene", cameraMode: "fixed_center", borderCollision: false },
  { id: "logo", label: "Logo", description: "Abertura temporizada com imagem, transição e opção de pular.", width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", borderCollision: false, menuScreenType: "logo" },
  { id: "title", label: "Title Screen", description: "Tela inicial com Press Start e atalhos configuráveis.", width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", borderCollision: false, menuScreenType: "title" },
  { id: "menu", label: "Menu", description: "Menu visual com páginas, click boxes e checkboxes.", width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", borderCollision: false, menuScreenType: "menu" },
  { id: "startMenu", label: "Start Menu", description: "Menu de pausa personalizável para recursos durante a partida.", width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", borderCollision: false, menuScreenType: "menu", menuRole: "start" }
];

export function composeVisibleRoomTileCells(
  room: Pick<RoomsWorkspaceRoom, "width" | "height" | "tileLayers">,
  visibleMappings: string[]
): number[] {
  const visible = new Set(visibleMappings.map(normalizeSceneTileLayerMapping));
  return composeSceneTilemap(
    (room.tileLayers ?? [])
      .filter((layer) => visible.has(layer.mapping))
      .map((layer) => ({ mapping: layer.mapping, tilemap: layer.tilemap, tileSourceAssetNames: [] })),
    room.width,
    room.height
  );
}

export interface DuplicateRoomOptions {
  sourceRoomID: string;
  newRoomID: string;
  newName: string;
}

export interface CreateRoomConnectionOptions {
  from: string;
  to: string;
  eventName?: string;
}

export interface CreateRoomWarpConnectionOptions extends CreateRoomConnectionOptions {
  area: RoomConnectionArea;
  side: "exit" | "entry";
}

export interface UpdateRoomConnectionFields {
  eventName?: string;
  exit?: RoomConnectionArea | null;
  entry?: RoomConnectionArea | null;
  transition?: Partial<SceneTransitionConfig> | null;
}

export interface UpdateRoomFields {
  width?: number;
  height?: number;
  collisionTypes?: RoomCollisionType[];
  sceneType?: string;
  runtime?: SceneRuntimeConfig;
  cameraMode?: string;
  cameraZoom?: number;
  cameraBounds?: Partial<RoomCameraBounds>;
  cameraZones?: RoomCameraZone[];
  centerCameraBounds?: boolean;
  resetCameraBoundsOrigin?: boolean;
  parallax?: Partial<RoomParallaxSettings>;
  layerEditing?: Partial<Record<SceneTileLayerMapping, Partial<RoomLayerEditingState>>>;
  music?: string;
  hudPresetId?: string | null;
  campaign?: Partial<GBASceneCampaignDocument> | null;
  backgroundAssetName?: string;
  backgroundRenderMode?: string;
  playerActorName?: string;
  paletteFamilyID?: string | null;
  paletteBankPolicy?: ScenePaletteBankPolicy;
  eventBindings?: Partial<Record<string, string | undefined>>;
}

export interface UpdateRoomEntityFields {
  roomName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  eventName?: string;
  eventBindings?: Partial<Record<string, string | undefined>>;
  spriteSheet?: string;
  animationName?: string;
  animationStateID?: string;
  collisionGroup?: number;
  collisionMask?: number;
  pushPriority?: number;
  pushable?: boolean;
  battle?: Partial<RoomsWorkspaceActorBattle>;
}

export interface UpdateRoomBackgroundTilesetGridFields {
  tileWidth?: number;
  tileHeight?: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
}

export interface PlaceRoomEntityInRoomOptions {
  roomID: string;
  x: number;
  y: number;
}

export interface CanvasPointToRoomTileOptions {
  roomWidth: number;
  roomHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  pointX: number;
  pointY: number;
  projection?: "isometric" | "orthogonal";
  isometricConfig?: IsometricSceneConfig;
  isometricSurfaceSize?: IsometricWorldSize;
  isometricAtlasTileHeight?: number;
  heightLevels?: readonly number[];
}

export interface CanvasPointToTilesetTileIDOptions {
  imageWidth: number;
  imageHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  pointX: number;
  pointY: number;
  tileWidth: number;
  tileHeight: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
}

export interface TilesetRegionForTileIDOptions {
  imageWidth: number;
  imageHeight: number;
  tileID: number;
  tileWidth: number;
  tileHeight: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
}

export interface TilesetTileRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResizeRoomTriggerToTileOptions {
  roomID: string;
  tileX: number;
  tileY: number;
}

export interface CreateTriggerInProjectOptions {
  roomID: string;
  x: number;
  y: number;
  width: number;
  height: number;
  eventName?: string;
  id?: string;
  name?: string;
}

export interface CreateActorInProjectOptions {
  roomID: string;
  x: number;
  y: number;
  animationName?: string;
  animationStateID?: string;
  id?: string;
  name?: string;
  spriteSheet?: string;
}

export interface SelectRoomEntityAtTileOptions {
  roomName: string;
  sceneType?: RoomsWorkspaceRoom["sceneType"];
  tileX: number;
  tileY: number;
  ignoredEntityKey?: string;
  visibleEntityKeys?: ReadonlySet<string>;
}

export interface DeriveRoomEntitySelectionOptions {
  additive?: boolean;
  currentKeys: string[];
  entities: RoomsWorkspaceEntity[];
  roomName: string;
  targetKey: string | null;
}

export interface NudgeRoomEntitiesOptions {
  deltaX: number;
  deltaY: number;
  roomID: string;
  selectedKeys: string[];
  stepSize?: number;
}

export interface RemoveRoomEntitiesOptions {
  roomID: string;
  selectedKeys: string[];
}

export interface DuplicateRoomEntitiesOptions {
  idForCopy: (kind: RoomsWorkspaceEntityKind, sourceID: string, copyIndex: number) => string;
  roomID: string;
  selectedKeys: string[];
}

export interface AlignRoomEntitiesOptions {
  axis: "x" | "y";
  roomID: string;
  selectedKeys: string[];
}

export interface DistributeRoomEntitiesOptions {
  axis: "x" | "y";
  roomID: string;
  selectedKeys: string[];
}

export type RoomTilePaintTool = "brush" | "eraser" | "fill";
export type RoomEditorToolPanelMode = "select" | "paint" | "collision" | "height" | "actor" | "trigger" | "camera" | "warp" | "hud" | "room";
export type RoomCanvasEditMode = "select" | "tiles" | "collision" | "height" | "entities";
export type RoomEntityCanvasTool = "move" | "resize";
export type RoomCollisionPlacementMode = "brush" | "rectangle" | "fill";
export type RoomCanvasLayerID = "background" | "grid" | "collision" | "actors" | "hitboxes" | "triggers" | "hud" | "composition" | "cameraBounds" | "worldBounds";

export interface RoomTileStamp {
  height: number;
  tileIDs: number[];
  width: number;
}

export interface RoomTileBrushOptions {
  tool: RoomTilePaintTool;
  cellIndex: number;
  tileID: number;
  layerMapping?: SceneTileLayerMapping;
  stamp?: RoomTileStamp;
}

export type RoomCanvasAction =
  | { type: "tile"; roomID: string; options: RoomTileBrushOptions }
  | { type: "collision"; roomID: string; cellIndex: number; collisionType: RoomCollisionType }
  | { type: "collision_fill"; roomID: string; cellIndex: number; collisionType: RoomCollisionType }
  | { type: "height"; roomID: string; cellIndex: number; heightLevel: number }
  | { type: "select_entity"; selectedKeys: string[] }
  | { type: "create_actor"; roomID: string; options: { x: number; y: number }; selectedKeys: string[] }
  | { type: "place_entity"; kind: RoomsWorkspaceEntityKind; entityID: string; selectedKeys: string[]; options: PlaceRoomEntityInRoomOptions }
  | { type: "resize_entity"; kind: RoomsWorkspaceEntityKind; entityID: string; selectedKeys: string[]; fields: UpdateRoomEntityFields }
  | { type: "resize_trigger"; triggerID: string; selectedKeys: string[]; options: ResizeRoomTriggerToTileOptions };

export interface DeriveRoomCanvasActionsOptions {
  additive?: boolean;
  cellIndex: number;
  collisionPaintType?: RoomCollisionType | null;
  entityGrabOffset?: { x: number; y: number } | null;
  entities: RoomsWorkspaceEntity[];
  previousCellIndex?: number | null;
  room: RoomsWorkspaceRoom;
  selectedEditMode: RoomCanvasEditMode;
  selectedHeightLevel?: number;
  selectedEntityKey?: string | null;
  selectedEntityKeys: string[];
  selectedEntityTool: RoomEntityCanvasTool;
  selectedTileID: number;
  selectedTileStamp?: RoomTileStamp;
  selectedTool: RoomTilePaintTool;
  selectedToolPanelMode?: RoomEditorToolPanelMode;
  visibleEntityKeys?: ReadonlySet<string>;
}

export interface RoomCanvasActionResult {
  actions: RoomCanvasAction[];
  collisionPaintType: RoomCollisionType | null;
  lastPaintCellIndex: number | null;
}

export interface RoomPaintInspectorTileSizeOption {
  isActive: boolean;
  label: string;
  value: number;
}

export interface RoomPaintInspectorLayerOption {
  available: boolean;
  description: string;
  disabledReason: string | null;
  isActive: boolean;
  label: string;
  layerKind: string;
  mapping: SceneTileLayerMapping;
}

export interface RoomPaintInspectorPresentation {
  activeTileLabel: string;
  backgroundName: string;
  compositeTileCount: number;
  layerDescription: string;
  layerLabel: string;
  layerOptions: RoomPaintInspectorLayerOption[];
  layeredPaintingEnabled: boolean;
  modeLabel: string;
  selectedTileSize: string;
  tileCountLabel: string;
  tileSizeOptions: RoomPaintInspectorTileSizeOption[];
  toolLabel: string;
  usesFreeSize: boolean;
  videoModeLabel: string;
}

export interface DeriveRoomPaintInspectorPresentationOptions {
  activeTileLayerMapping: SceneTileLayerMapping;
  imageSize?: { width: number; height: number } | null;
  layeredPaintingEnabled: boolean;
  paintedTileCount: number;
  selectedTileID: number;
  selectedTool: RoomTilePaintTool;
  videoModeId: number;
  videoModeLabel: string;
}

export function roomCellLineIndexes(width: number, startCellIndex: number, endCellIndex: number): number[] {
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(startCellIndex) ||
    !Number.isInteger(endCellIndex) ||
    startCellIndex < 0 ||
    endCellIndex < 0
  ) {
    return [];
  }

  let x = startCellIndex % width;
  let y = Math.floor(startCellIndex / width);
  const endX = endCellIndex % width;
  const endY = Math.floor(endCellIndex / width);
  const deltaX = Math.abs(endX - x);
  const deltaY = Math.abs(endY - y);
  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  let error = deltaX - deltaY;
  const indexes: number[] = [];

  while (true) {
    indexes.push(y * width + x);
    if (x === endX && y === endY) break;

    const doubledError = error * 2;
    if (doubledError > -deltaY) {
      error -= deltaY;
      x += stepX;
    }
    if (doubledError < deltaX) {
      error += deltaX;
      y += stepY;
    }
  }

  return indexes;
}

export function deriveRoomPaintInspectorPresentation(
  room: RoomsWorkspaceRoom,
  options: DeriveRoomPaintInspectorPresentationOptions
): RoomPaintInspectorPresentation {
  const tileWidth = positiveInteger(room.backgroundTileWidth, 8);
  const tileHeight = positiveInteger(room.backgroundTileHeight, 8);
  const standardSizes = [8, 16, 32, 64];
  const usesFreeSize = tileWidth !== tileHeight || !standardSizes.includes(tileWidth);
  const tileSizeOptions = standardSizes.map((size) => ({
    isActive: !usesFreeSize && tileWidth === size,
    label: `${size}x${size}`,
    value: size
  }));
  const imageWidth = options.imageSize?.width ?? 0;
  const imageHeight = options.imageSize?.height ?? 0;
  const tileColumns = imageWidth > 0 ? Math.max(1, Math.floor(Math.max(0, imageWidth - room.backgroundTileOffsetX) / tileWidth)) : 0;
  const tileRows = imageHeight > 0 ? Math.max(1, Math.floor(Math.max(0, imageHeight - room.backgroundTileOffsetY) / tileHeight)) : 0;
  const tileTotal = tileColumns * tileRows;
  const activeLayer = sceneTileLayerCatalog.find((entry) => entry.mapping === options.activeTileLayerMapping)
    ?? sceneTileLayerCatalog.find((entry) => entry.mapping === "BG2")
    ?? sceneTileLayerCatalog[1];
  const layerOptions = sceneTileLayerPaintOptions(options.videoModeId as 0 | 1 | 2 | 3 | 4).map((entry) => ({
    ...entry,
    isActive: entry.mapping === options.activeTileLayerMapping
  }));
  const videoModeLabel = options.videoModeLabel;

  return {
    activeTileLabel: `Tile ${Math.max(0, Math.floor(options.selectedTileID))}`,
    backgroundName: room.background ?? "Sem tileset",
    compositeTileCount: options.paintedTileCount,
    layerDescription: activeLayer.description,
    layerLabel: activeLayer.label,
    layerOptions,
    layeredPaintingEnabled: options.layeredPaintingEnabled,
    modeLabel: paintModeLabel(options.selectedTool),
    selectedTileSize: usesFreeSize ? "livre" : `${tileWidth}x${tileHeight}`,
    tileCountLabel: imageWidth > 0 && imageHeight > 0
      ? `${imageWidth}/${imageHeight} px - ${tileColumns}x${tileRows} - ${tileTotal} tiles ${tileWidth}x${tileHeight}`
      : `Tiles ${tileWidth}x${tileHeight}`,
    tileSizeOptions,
    toolLabel: paintToolLabel(options.selectedTool),
    usesFreeSize,
    videoModeLabel
  };
}

export function deriveRoomCanvasActions(options: DeriveRoomCanvasActionsOptions): RoomCanvasActionResult {
  const { room, cellIndex, selectedEditMode } = options;
  const previousCellIndex = options.previousCellIndex ?? null;
  const isDrag = previousCellIndex !== null && previousCellIndex !== cellIndex;
  const lineIndexes = isDrag && selectedEditMode !== "entities"
    ? roomCellLineIndexes(room.width, previousCellIndex, cellIndex)
    : [cellIndex];
  const lastPaintCellIndex = cellIndex;
  const tileX = cellIndex % room.width;
  const tileY = Math.floor(cellIndex / room.width);
  const selectedEntityKey = options.selectedEntityKey ?? null;
  const selectedEntity = options.entities.find((entity) => roomEntityKey(entity) === selectedEntityKey) ?? null;
  const contextualEntity = isDrag || (selectedEditMode !== "select" && selectedEditMode !== "entities")
    ? null
    : selectRoomEntityAtTile(options.entities, {
    roomName: room.name,
    sceneType: room.sceneType,
    tileX,
    tileY,
    visibleEntityKeys: options.visibleEntityKeys
  });

  if (contextualEntity) {
    return {
      actions: [{
        type: "select_entity",
        selectedKeys: deriveRoomEntitySelection({
          additive: options.additive,
          currentKeys: options.selectedEntityKeys,
          entities: options.entities,
          roomName: room.name,
          targetKey: roomEntityKey(contextualEntity)
        })
      }],
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  if (selectedEditMode === "tiles") {
    if (isDrag && options.selectedTool === "fill") {
      return { actions: [], collisionPaintType: options.collisionPaintType ?? null, lastPaintCellIndex };
    }

    return {
      actions: lineIndexes.map((lineCellIndex) => ({
        type: "tile" as const,
        roomID: room.id,
        options: {
          cellIndex: lineCellIndex,
          layerMapping: room.layeredPaintingEnabled ? room.activeTileLayerMapping : undefined,
          stamp: options.selectedTool === "brush" ? options.selectedTileStamp : undefined,
          tileID: options.selectedTileID,
          tool: options.selectedTool
        }
      })),
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  if (selectedEditMode === "collision") {
    const collisionType = options.collisionPaintType ?? "solid";
    if (options.selectedTool === "fill") {
      return {
        actions: isDrag ? [] : [{
          type: "collision_fill" as const,
          cellIndex,
          collisionType,
          roomID: room.id
        }],
        collisionPaintType: collisionType,
        lastPaintCellIndex
      };
    }
    return {
      actions: lineIndexes.map((lineCellIndex) => ({
        type: "collision" as const,
        collisionType,
        cellIndex: lineCellIndex,
        roomID: room.id
      })),
      collisionPaintType: collisionType,
      lastPaintCellIndex
    };
  }

  if (selectedEditMode === "height") {
    const heightLevel = clampInteger(options.selectedHeightLevel ?? 0, 0, 3);
    return {
      actions: lineIndexes.map((lineCellIndex) => ({
        type: "height" as const,
        cellIndex: lineCellIndex,
        heightLevel,
        roomID: room.id
      })),
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  if (selectedEditMode === "select") {
    if (!isDrag) {
      return { actions: [], collisionPaintType: options.collisionPaintType ?? null, lastPaintCellIndex };
    }
    if (selectedEntity && options.selectedEntityTool === "move") {
      const selectedKeys = [roomEntityKey(selectedEntity)];
      const nextPosition = roomEntityPositionForSelectionCell(
        selectedEntity,
        tileX - (options.entityGrabOffset?.x ?? 0),
        tileY - (options.entityGrabOffset?.y ?? 0),
        room.sceneType
      );
      return {
        actions: [{
          type: "place_entity",
          entityID: selectedEntity.id,
          kind: selectedEntity.kind,
          selectedKeys,
          options: {
            roomID: room.id,
            x: nextPosition.x,
            y: nextPosition.y
          }
        }],
        collisionPaintType: options.collisionPaintType ?? null,
        lastPaintCellIndex
      };
    }

    return { actions: [], collisionPaintType: options.collisionPaintType ?? null, lastPaintCellIndex };
  }

  if (options.selectedToolPanelMode === "actor" && !selectedEntity) {
    return {
      actions: [{
        type: "create_actor",
        roomID: room.id,
        options: { x: tileX, y: tileY },
        selectedKeys: []
      }],
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  if (selectedEntity && !isDrag) {
    return { actions: [], collisionPaintType: options.collisionPaintType ?? null, lastPaintCellIndex };
  }

  const entityAtTileForSelection = isDrag ? null : selectRoomEntityAtTile(options.entities, {
    roomName: room.name,
    sceneType: room.sceneType,
    tileX,
    tileY,
    visibleEntityKeys: options.visibleEntityKeys
  });

  if (!selectedEntity) {
    if (entityAtTileForSelection) {
      return {
        actions: [{
          type: "select_entity",
          selectedKeys: deriveRoomEntitySelection({
            additive: options.additive,
            currentKeys: options.selectedEntityKeys,
            entities: options.entities,
            roomName: room.name,
            targetKey: roomEntityKey(entityAtTileForSelection)
          })
        }],
        collisionPaintType: options.collisionPaintType ?? null,
        lastPaintCellIndex
      };
    }

    return { actions: [], collisionPaintType: options.collisionPaintType ?? null, lastPaintCellIndex };
  }

  const entityAtTile = isDrag ? null : selectRoomEntityAtTile(options.entities, {
    ignoredEntityKey: selectedEntityKey ?? undefined,
    roomName: room.name,
    sceneType: room.sceneType,
    tileX,
    tileY,
    visibleEntityKeys: options.visibleEntityKeys
  });

  if (entityAtTile) {
    return {
      actions: [{
        type: "select_entity",
        selectedKeys: deriveRoomEntitySelection({
          additive: options.additive,
          currentKeys: options.selectedEntityKeys,
          entities: options.entities,
          roomName: room.name,
          targetKey: roomEntityKey(entityAtTile)
        })
      }],
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  const selectedKeys = [roomEntityKey(selectedEntity)];
  if (options.selectedEntityTool === "resize" && selectedEntity.kind === "trigger") {
    return {
      actions: [{
        type: "resize_trigger",
        triggerID: selectedEntity.id,
        selectedKeys,
        options: {
          roomID: room.id,
          tileX,
          tileY
        }
      }],
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  if (options.selectedEntityTool === "resize") {
    const footprint = roomEntitySelectionFootprint(selectedEntity, room.sceneType);
    return {
      actions: [{
        type: "resize_entity",
        entityID: selectedEntity.id,
        fields: {
          height: Math.max(1, tileY - footprint.y + 1),
          width: Math.max(1, tileX - footprint.x + 1)
        },
        kind: selectedEntity.kind,
        selectedKeys
      }],
      collisionPaintType: options.collisionPaintType ?? null,
      lastPaintCellIndex
    };
  }

  const nextPosition = roomEntityPositionForSelectionCell(
    selectedEntity,
    tileX - (options.entityGrabOffset?.x ?? 0),
    tileY - (options.entityGrabOffset?.y ?? 0),
    room.sceneType
  );
  return {
    actions: [{
      type: "place_entity",
      entityID: selectedEntity.id,
      kind: selectedEntity.kind,
      selectedKeys,
      options: {
        roomID: room.id,
        x: nextPosition.x,
        y: nextPosition.y
      }
    }],
    collisionPaintType: options.collisionPaintType ?? null,
    lastPaintCellIndex
  };
}

export interface RoomEditorToolPanelMetric {
  label: string;
  value: string;
}

export interface RoomEditorToolPanelOptions {
  mode: RoomEditorToolPanelMode;
  selectedEntityKey?: string | null;
  selectedPaintTool?: RoomTilePaintTool;
  selectedTileID?: number;
}

export interface RoomEditorToolPanelSummary {
  mode: RoomEditorToolPanelMode;
  title: string;
  subtitle: string;
  badge: string;
  metrics: RoomEditorToolPanelMetric[];
  notices: string[];
  selectedEntityKey: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function integerField(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function roomEditorEntityKey(entity: Pick<RoomsWorkspaceEntity, "kind" | "id">): string {
  return `${entity.kind}:${entity.id}`;
}

function paintToolLabel(tool: RoomTilePaintTool | undefined): string {
  if (tool === "eraser") return "Borracha";
  if (tool === "fill") return "Preencher";
  return "Pincel";
}

function paintModeLabel(tool: RoomTilePaintTool | undefined): string {
  if (tool === "eraser") return "Borracha";
  if (tool === "fill") return "Preencher";
  return "Normal";
}

function activeTileLayerShortLabel(mapping: SceneTileLayerMapping): string {
  return sceneTileLayerCatalog.find((entry) => entry.mapping === mapping)?.mapping ?? mapping;
}

function firstRoomEntityByKind(
  room: RoomsWorkspaceRoom,
  entities: RoomsWorkspaceEntity[],
  kind: RoomsWorkspaceEntityKind,
  selectedEntityKey: string | null | undefined
): RoomsWorkspaceEntity | null {
  const roomEntities = entities.filter((entity) => entity.roomName === room.name && entity.kind === kind);
  return roomEntities.find((entity) => roomEditorEntityKey(entity) === selectedEntityKey) ?? roomEntities[0] ?? null;
}

export function deriveRoomEditorToolPanel(
  room: RoomsWorkspaceRoom,
  entities: RoomsWorkspaceEntity[],
  options: RoomEditorToolPanelOptions
): RoomEditorToolPanelSummary {
  if (options.mode === "select") {
    return {
      mode: "select",
      title: "Selecionar",
      subtitle: room.name,
      badge: `${entities.length} itens`,
      metrics: [
        { label: "Cena", value: room.name },
        { label: "Entidades", value: String(entities.length) },
        { label: "Atores", value: String(entities.filter((entity) => entity.kind === "actor").length) },
        { label: "Triggers", value: String(entities.filter((entity) => entity.kind === "trigger").length) }
      ],
      notices: ["Clique em cards, atores ou triggers para selecionar."],
      selectedEntityKey: null
    };
  }

  if (options.mode === "paint") {
    const tileID = Math.max(0, Math.floor(options.selectedTileID ?? 0));
    const layerLabel = room.layeredPaintingEnabled
      ? activeTileLayerShortLabel(room.activeTileLayerMapping)
      : "Mapa principal";
    return {
      mode: "paint",
      title: "Pintura de tiles",
      subtitle: room.background ? room.background : "Nenhum tileset selecionado",
      badge: `Tile ${tileID}`,
      metrics: [
        { label: "Camada", value: layerLabel },
        { label: "Modo", value: paintToolLabel(options.selectedPaintTool) },
        { label: "Tile", value: String(tileID) },
        { label: "Grade", value: `${room.backgroundTileWidth}x${room.backgroundTileHeight}` }
      ],
      notices: room.background
        ? ["Selecione um tile e pinte no canvas."]
        : ["Selecione um tileset para pintar a cena."],
      selectedEntityKey: null
    };
  }

  if (options.mode === "collision") {
    const freeCount = Math.max(0, room.tileCount - room.collisionCount);
    return {
      mode: "collision",
      title: "Colisao",
      subtitle: "Mascara solida do mapa",
      badge: `${room.collisionCount} solidos`,
      metrics: [
        { label: "Tipo ativo", value: "Solido" },
        { label: "Mapa", value: `${room.width}x${room.height}` },
        { label: "Solidos", value: String(room.collisionCount) },
        { label: "Livres", value: String(freeCount) }
      ],
      notices: ["Arraste no canvas para pintar ou limpar colisao."],
      selectedEntityKey: null
    };
  }

  if (options.mode === "height") {
    const elevatedCount = (room.heightLevels ?? []).filter((level) => level > 0).length;
    return {
      mode: "height",
      title: "Altura isométrica",
      subtitle: "Elevação e rampas",
      badge: `${elevatedCount} elevados`,
      metrics: [
        { label: "Faixa", value: "0–3" },
        { label: "Elevados", value: String(elevatedCount) },
        { label: "Foreground", value: String(room.foregroundTileCount ?? 0) },
        { label: "Mapa", value: `${room.width}x${room.height}` }
      ],
      notices: ["Pinte níveis e use rampas no inspetor de colisão para conectar elevações."],
      selectedEntityKey: null
    };
  }

  if (options.mode === "actor") {
    const actor = firstRoomEntityByKind(room, entities, "actor", options.selectedEntityKey);
    return {
      mode: "actor",
      title: actor?.name ?? "Ator",
      subtitle: actor ? "Ator" : "Nenhum ator nesta cena",
      badge: actor ? `${actor.x},${actor.y}` : "Sem ator",
      metrics: [
        { label: "X", value: actor ? String(actor.x) : "-" },
        { label: "Y", value: actor ? String(actor.y) : "-" },
        { label: "Evento", value: actor?.eventName ?? "-" },
        { label: "Tamanho", value: actor ? `${actor.width}x${actor.height}` : "-" }
      ],
      notices: actor ? ["Use mover para reposicionar no grid."] : ["Vincule um ator a esta cena para editar no canvas."],
      selectedEntityKey: actor ? roomEditorEntityKey(actor) : null
    };
  }

  if (options.mode === "trigger") {
    const trigger = firstRoomEntityByKind(room, entities, "trigger", options.selectedEntityKey);
    return {
      mode: "trigger",
      title: trigger?.name ?? "Trigger",
      subtitle: trigger ? "Trigger" : "Nenhum trigger nesta cena",
      badge: trigger ? `${trigger.width}x${trigger.height}` : "Sem trigger",
      metrics: [
        { label: "X", value: trigger ? String(trigger.x) : "-" },
        { label: "Y", value: trigger ? String(trigger.y) : "-" },
        { label: "Evento", value: trigger?.eventName ?? "-" },
        { label: "Area", value: trigger ? `${trigger.width}x${trigger.height}` : "-" }
      ],
      notices: trigger ? ["Arraste no grid para redimensionar a area."] : ["Arraste no grid para criar um trigger ou use Criar trigger no inspector."],
      selectedEntityKey: trigger ? roomEditorEntityKey(trigger) : null
    };
  }

  return {
    mode: "room",
    title: room.name,
    subtitle: `${sceneTypeLabel(room.sceneType)} - ${room.gbaResolution}`,
    badge: room.isStart ? "Início" : room.isActive ? "Ativa" : "Cena",
    metrics: [
      { label: "Tipo de cena", value: sceneTypeLabel(room.sceneType) },
      { label: "Camera", value: cameraModeLabel(room.cameraMode) },
      { label: "Resolucao", value: room.gbaResolution },
      { label: "Tiles", value: String(room.tileCount) }
    ],
    notices: room.warnings.length > 0 ? room.warnings : ["Configuracao pronta para preview e export."],
    selectedEntityKey: null
  };
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = data.scenas;
  if (Array.isArray(scenas)) {
    return scenas.filter(isRecord);
  }

  const rooms = data.rooms;
  if (Array.isArray(rooms)) {
    return rooms.filter(isRecord);
  }

  return [];
}

function setProjectRooms(data: GBAProjectData, rooms: Record<string, unknown>[]): void {
  data.scenas = rooms;
  if (Array.isArray(data.rooms)) {
    data.rooms = rooms;
  }
  delete data.room;
}

function projectRecords(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const records = data[key];
  return Array.isArray(records) ? records.filter(isRecord) : [];
}

function projectEditorState(data: GBAProjectData): Record<string, unknown> | undefined {
  return isRecord(data.editorState) ? data.editorState : undefined;
}

function sceneConnections(data: GBAProjectData): Record<string, unknown>[] {
  const connections = projectEditorState(data)?.scenaConnections;
  return Array.isArray(connections) ? connections.filter(isRecord) : [];
}

function sceneLinkIDPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "scene";
}

function sceneTransitionDirection(value: unknown, fallback: RoomEventSceneLink["direction"] = "down"): RoomEventSceneLink["direction"] {
  const direction = nullableString(value)?.toLowerCase();
  return direction === "up" || direction === "down" || direction === "left" || direction === "right"
    ? direction
    : fallback;
}

function recordReferencesEvent(record: Record<string, unknown>, targetEventName: string): boolean {
  const directReferences = ["eventName", "onEnterEventName", "onLeaveEventName", "onInitEventName", "onUpdateEventName", "onInteractEventName"];
  if (directReferences.some((key) => nullableString(record[key]) === targetEventName)) return true;
  const bindings = isRecord(record.eventBindings) ? record.eventBindings : null;
  return Boolean(bindings && Object.values(bindings).some((value) => nullableString(value) === targetEventName));
}

function roomArrivalForEventLink(
  data: GBAProjectData,
  room: Record<string, unknown>,
  commandParts: string[]
): { x: number; y: number; direction: RoomEventSceneLink["direction"] } {
  const width = Math.max(1, positiveInteger(room.width, 1));
  const height = Math.max(1, positiveInteger(room.height, 1));
  const roomNameValue = nullableString(room.name);
  const actors = projectRecords(data, "actors");
  const playerName = nullableString(room.playerActorName) ?? "Player";
  const player = actors.find((actor) => (
    nullableString(actor.roomName) === roomNameValue
    && nullableString(actor.name) === playerName
  )) ?? actors.find((actor) => (
    nullableString(actor.roomName) === roomNameValue
    && nullableString(actor.name)?.toLowerCase() === "player"
  ));
  const animationDirection = nullableString(player?.animationName)?.match(/(?:^|[_-])(up|down|left|right)$/i)?.[1];
  const fallbackX = clampInteger(integerField(player?.x, Math.floor(width / 2)), 0, width - 1);
  const fallbackY = clampInteger(integerField(player?.y, Math.floor(height / 2)), 0, height - 1);
  const commandInteger = (value: string | undefined, fallback: number): number => {
    const parsed = value === undefined ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  };
  const x = clampInteger(commandInteger(commandParts[2], fallbackX), 0, width - 1);
  const y = clampInteger(commandInteger(commandParts[3], fallbackY), 0, height - 1);
  const direction = sceneTransitionDirection(commandParts[4], sceneTransitionDirection(player?.direction, sceneTransitionDirection(animationDirection)));
  return { x, y, direction };
}

export function updateRoomEventSceneLinkCommand(
  command: string,
  fields: { x?: number; y?: number; direction?: RoomEventSceneLink["direction"] }
): string {
  const parts = command.split(/\s+/).filter(Boolean);
  if ((parts[0] ?? "").toLowerCase() !== "change_scene" || !parts[1]) return command;
  const x = Number.isFinite(fields.x) ? Math.max(0, Math.floor(fields.x as number)) : integerField(parts[2], 0);
  const y = Number.isFinite(fields.y) ? Math.max(0, Math.floor(fields.y as number)) : integerField(parts[3], 0);
  const direction = sceneTransitionDirection(fields.direction, sceneTransitionDirection(parts[4])) ?? "down";
  parts[2] = String(x);
  parts[3] = String(y);
  parts[4] = direction;
  return parts.slice(0, 5).join(" ");
}

export function deriveRoomEventSceneLinks(data: GBAProjectData): RoomEventSceneLink[] {
  const rooms = projectRooms(data);
  const knownRooms = new Set(rooms.map((room, index) => roomName(room, index)));
  const seen = new Set<string>();
  const links: RoomEventSceneLink[] = [];

  for (const [eventIndex, event] of projectRecords(data, "events").entries()) {
    const eventName = nullableString(event.name) ?? "event-" + (eventIndex + 1);
    const eventID = nullableString(event.id) ?? "event-" + (eventIndex + 1);
    const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
    const explicitFrom = nullableString(event.roomName) ?? nullableString(event.sceneName);
    const sourceRooms = explicitFrom && knownRooms.has(explicitFrom)
      ? [explicitFrom]
      : rooms.flatMap((room, roomIndex) => {
        const source = roomName(room, roomIndex);
        if (recordReferencesEvent(room, eventName)) return [source];
        return projectRecords(data, "triggers").some((trigger) => nullableString(trigger.roomName) === source && recordReferencesEvent(trigger, eventName))
          || projectRecords(data, "actors").some((actor) => nullableString(actor.roomName) === source && recordReferencesEvent(actor, eventName))
          ? [source]
          : [];
      });
    if (sourceRooms.length === 0) continue;

    for (const [stepIndex, step] of steps.entries()) {
      const command = nullableString(step.command);
      const parts = command?.split(/\s+/).filter(Boolean) ?? [];
      if ((parts[0] ?? "").toLowerCase() !== "change_scene") continue;
      const to = parts[1] ?? null;
      if (!to || !knownRooms.has(to)) continue;
      const targetRoom = rooms.find((room, roomIndex) => roomName(room, roomIndex) === to) ?? {};
      const arrival = roomArrivalForEventLink(data, targetRoom, parts);
      for (const from of sourceRooms) {
        if (to === from) continue;
        const key = from + "\u0000" + to + "\u0000" + eventName;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({
          id: "event-scene-link-" + eventID + "-" + stepIndex,
          from,
          to,
          eventName,
          eventID,
          stepIndex,
          command,
          x: arrival.x,
          y: arrival.y,
          direction: arrival.direction
        });
      }
    }
  }

  for (const [roomIndex, room] of rooms.entries()) {
    const from = roomName(room, roomIndex);
    const runtime = isRecord(room.runtime) ? room.runtime : undefined;
    const config = runtime && isRecord(runtime.config)
      ? runtime.config
      : isRecord(room.config)
        ? room.config
        : undefined;
    if (!config) continue;

    const menuItems = [
      ...(Array.isArray(config.items) ? config.items : []),
      ...(Array.isArray(config.screens)
        ? config.screens.flatMap((screen) => isRecord(screen) && Array.isArray(screen.items) ? screen.items : [])
        : [])
    ].filter(isRecord);

    for (const [itemIndex, item] of menuItems.entries()) {
      const action = nullableString(item.action)?.toLowerCase();
      if (action !== "push_screen" && action !== "open_screen") continue;
      const to = nullableString(item.targetScreenID) ?? nullableString(item.targetSceneID);
      if (!to || to === from || !knownRooms.has(to)) continue;

      const eventName = nullableString(item.eventName)
        ?? `menu:${nullableString(item.label) ?? to}`;
      const key = `${from}\u0000${to}\u0000${eventName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const linkBase = `menu-scene-link-${sceneLinkIDPart(from)}-${sceneLinkIDPart(to)}`;
      const id = links.some((link) => link.id === linkBase)
        ? `${linkBase}-${sceneLinkIDPart(nullableString(item.id) ?? String(itemIndex))}`
        : linkBase;
      links.push({
        id,
        from,
        to,
        eventName,
        eventID: null,
        stepIndex: null,
        command: null,
        x: null,
        y: null,
        direction: null
      });
    }
  }

  return links;
}

function roomID(room: Record<string, unknown>, index: number): string {
  return stringField(room.id, `room-${index + 1}`);
}

function roomName(room: Record<string, unknown>, index: number): string {
  return stringField(room.name, `Cena ${index + 1}`);
}

function activeRoomName(data: GBAProjectData, rooms: Record<string, unknown>[]): string | null {
  const activeRoomIndex = rooms.findIndex((room, index) => roomMatchesKnownRoom(data.scena, room, index));
  if (activeRoomIndex >= 0) {
    return roomName(rooms[activeRoomIndex], activeRoomIndex);
  }

  return rooms.length > 0 ? stringField(rooms[0].name, "Cena sem nome") : null;
}

function startRoomName(data: GBAProjectData, rooms: Record<string, unknown>[]): string | null {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const general = settings && isRecord(settings.general) ? settings.general : undefined;
  return nullableString(general?.startScene) ?? activeRoomName(data, rooms);
}

function normalizedBackgroundRenderMode(value: unknown): string {
  const mode = stringField(value, "tilemap").toLowerCase();
  return ["hybrid", "image", "tilemap"].includes(mode) ? mode : "tilemap";
}

function roomTileCount(width: number, height: number): number {
  return width * height;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

export function canvasPointToRoomTile(options: CanvasPointToRoomTileOptions): { x: number; y: number } {
  const roomWidth = positiveInteger(options.roomWidth, 1);
  const roomHeight = positiveInteger(options.roomHeight, 1);
  // DOM bounds can be fractional at fitted zoom; rounding shifts tile edges.
  const canvasWidth = Number.isFinite(options.canvasWidth) && options.canvasWidth > 0 ? options.canvasWidth : 1;
  const canvasHeight = Number.isFinite(options.canvasHeight) && options.canvasHeight > 0 ? options.canvasHeight : 1;
  if (options.projection === "isometric") {
    const config = options.isometricConfig ?? DEFAULT_ISOMETRIC_SCENE_CONFIG;
    const surfaceSize = options.isometricSurfaceSize ?? deriveIsometricWorldSize({
      atlasTileHeight: options.isometricAtlasTileHeight,
      config,
      height: roomHeight,
      width: roomWidth
    });
    return canvasPointToIsometricRoomTile({
      canvasHeight,
      canvasWidth,
      config,
      heightLevels: options.heightLevels,
      pointX: options.pointX,
      pointY: options.pointY,
      roomHeight,
      roomWidth,
      surfaceSize,
      useWorldCoordinates: Boolean(options.isometricSurfaceSize)
    });
  }
  return {
    x: clampInteger((options.pointX / canvasWidth) * roomWidth, 0, roomWidth - 1),
    y: clampInteger((options.pointY / canvasHeight) * roomHeight, 0, roomHeight - 1)
  };
}

export function canvasPointToTilesetTileID(options: CanvasPointToTilesetTileIDOptions): number {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const renderedWidth = positiveInteger(options.renderedWidth, 1);
  const renderedHeight = positiveInteger(options.renderedHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 8);
  const tileHeight = positiveInteger(options.tileHeight, 8);
  const tileOffsetX = Math.min(nonNegativeInteger(options.tileOffsetX, 0), imageWidth - 1);
  const tileOffsetY = Math.min(nonNegativeInteger(options.tileOffsetY, 0), imageHeight - 1);
  const columns = Math.max(1, Math.floor((imageWidth - tileOffsetX) / tileWidth));
  const rows = Math.max(1, Math.floor((imageHeight - tileOffsetY) / tileHeight));
  const imageX = clampInteger((options.pointX / renderedWidth) * imageWidth, 0, imageWidth - 1);
  const imageY = clampInteger((options.pointY / renderedHeight) * imageHeight, 0, imageHeight - 1);
  const column = clampInteger((imageX - tileOffsetX) / tileWidth, 0, columns - 1);
  const row = clampInteger((imageY - tileOffsetY) / tileHeight, 0, rows - 1);
  return row * columns + column + 1;
}

export interface DeriveTilesetTileStampOptions {
  endTileID: number;
  imageHeight: number;
  imageWidth: number;
  startTileID: number;
  tileHeight: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
  tileWidth: number;
}

export interface DeriveMetatileTilesetStampOptions {
  anchorTileID: number;
  blockHeight: number;
  blockWidth: number;
  imageHeight: number;
  imageWidth: number;
  tileHeight: number;
  tileOffsetX?: number;
  tileOffsetY?: number;
  tileWidth: number;
}

export function deriveTilesetTileStamp(options: DeriveTilesetTileStampOptions): RoomTileStamp {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 8);
  const tileHeight = positiveInteger(options.tileHeight, 8);
  const tileOffsetX = Math.min(nonNegativeInteger(options.tileOffsetX, 0), imageWidth - 1);
  const tileOffsetY = Math.min(nonNegativeInteger(options.tileOffsetY, 0), imageHeight - 1);
  const columns = Math.max(1, Math.floor((imageWidth - tileOffsetX) / tileWidth));
  const rows = Math.max(1, Math.floor((imageHeight - tileOffsetY) / tileHeight));
  const tileCount = columns * rows;
  const startIndex = clampInteger(options.startTileID - 1, 0, tileCount - 1);
  const endIndex = clampInteger(options.endTileID - 1, 0, tileCount - 1);
  const startColumn = startIndex % columns;
  const endColumn = endIndex % columns;
  const startRow = Math.floor(startIndex / columns);
  const endRow = Math.floor(endIndex / columns);
  const left = Math.min(startColumn, endColumn);
  const right = Math.max(startColumn, endColumn);
  const top = Math.min(startRow, endRow);
  const bottom = Math.max(startRow, endRow);
  const tileIDs: number[] = [];

  for (let row = top; row <= bottom; row += 1) {
    for (let column = left; column <= right; column += 1) {
      tileIDs.push(row * columns + column + 1);
    }
  }

  return {
    height: bottom - top + 1,
    tileIDs,
    width: right - left + 1
  };
}

export function deriveMetatileTilesetStamp(options: DeriveMetatileTilesetStampOptions): RoomTileStamp {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 8);
  const tileHeight = positiveInteger(options.tileHeight, 8);
  const blockWidth = positiveInteger(options.blockWidth, 2);
  const blockHeight = positiveInteger(options.blockHeight, 2);
  const tileOffsetX = Math.min(nonNegativeInteger(options.tileOffsetX, 0), imageWidth - 1);
  const tileOffsetY = Math.min(nonNegativeInteger(options.tileOffsetY, 0), imageHeight - 1);
  const columns = Math.max(1, Math.floor((imageWidth - tileOffsetX) / tileWidth));
  const rows = Math.max(1, Math.floor((imageHeight - tileOffsetY) / tileHeight));
  const tileCount = columns * rows;
  const anchorIndex = clampInteger(options.anchorTileID - 1, 0, tileCount - 1);
  const anchorColumn = anchorIndex % columns;
  const anchorRow = Math.floor(anchorIndex / columns);
  const maxLeft = Math.max(0, columns - blockWidth);
  const maxTop = Math.max(0, rows - blockHeight);
  const left = Math.min(maxLeft, Math.floor(anchorColumn / blockWidth) * blockWidth);
  const top = Math.min(maxTop, Math.floor(anchorRow / blockHeight) * blockHeight);
  const width = Math.min(blockWidth, columns);
  const height = Math.min(blockHeight, rows);
  const tileIDs: number[] = [];

  for (let row = top; row < top + height; row += 1) {
    for (let column = left; column < left + width; column += 1) {
      tileIDs.push(row * columns + column + 1);
    }
  }

  return { height, tileIDs, width };
}

export function tilesetRegionForTileID(options: TilesetRegionForTileIDOptions): TilesetTileRegion {
  const imageWidth = positiveInteger(options.imageWidth, 1);
  const imageHeight = positiveInteger(options.imageHeight, 1);
  const tileWidth = positiveInteger(options.tileWidth, 8);
  const tileHeight = positiveInteger(options.tileHeight, 8);
  const tileOffsetX = Math.min(nonNegativeInteger(options.tileOffsetX, 0), imageWidth - 1);
  const tileOffsetY = Math.min(nonNegativeInteger(options.tileOffsetY, 0), imageHeight - 1);
  const columns = Math.max(1, Math.floor((imageWidth - tileOffsetX) / tileWidth));
  const rows = Math.max(1, Math.floor((imageHeight - tileOffsetY) / tileHeight));
  const tileCount = columns * rows;
  const tileIndex = Number.isFinite(options.tileID) ? clampInteger(options.tileID - 1, 0, tileCount - 1) : 0;
  return {
    height: tileHeight,
    width: tileWidth,
    x: tileOffsetX + (tileIndex % columns) * tileWidth,
    y: tileOffsetY + Math.floor(tileIndex / columns) * tileHeight
  };
}

export function deriveRoomTileOverlayCells(room: RoomsWorkspaceRoom, entities: RoomsWorkspaceEntity[]): RoomTileOverlayCell[] {
  const totalTiles = room.width * room.height;
  const foreground = room.tileLayers?.find((layer) => layer.mapping === "BG1")?.tilemap ?? [];
  const overlays = Array.from({ length: totalTiles }, (_, index) => {
    const collisionType = room.collisionTypes?.[index]
      ?? (room.collisionCells[index] ? "solid" : "free");
    const normalizedType = normalizeRoomCollisionType(collisionType, "free");
    const rawHeightLevel = room.heightLevels?.[index] ?? 0;
    const heightLevel = Number.isFinite(rawHeightLevel) ? clampInteger(rawHeightLevel, 0, 3) : 0;
    return {
      actorCount: 0,
      collision: isBlockedCollisionType(normalizedType),
      collisionType: normalizedType,
      elevated: heightLevel > 0,
      foreground: Number.isFinite(foreground[index]) && (foreground[index] ?? -1) >= 0,
      heightLevel,
      ramp: normalizedType === "slope_up_right" || normalizedType === "slope_up_left",
      triggerCount: 0
    };
  });

  for (const entity of entities) {
    if (entity.roomName !== room.name) continue;
    const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
    const startX = clampInteger(footprint.x, 0, room.width - 1);
    const startY = clampInteger(footprint.y, 0, room.height - 1);
    const width = footprint.width;
    const height = footprint.height;
    const endX = clampInteger(footprint.x + width - 1, 0, room.width - 1);
    const endY = clampInteger(footprint.y + height - 1, 0, room.height - 1);

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const overlay = overlays[y * room.width + x];
        if (!overlay) continue;
        if (entity.kind === "actor") {
          overlay.actorCount += 1;
        } else {
          overlay.triggerCount += 1;
        }
      }
    }
  }

  return overlays;
}

function roomEntityKey(entity: Pick<RoomsWorkspaceEntity, "kind" | "id">): string {
  return `${entity.kind}:${entity.id}`;
}

function roomEntityRecordKey(kind: RoomsWorkspaceEntityKind, entity: Record<string, unknown>, index: number): string {
  return `${kind}:${nullableString(entity.id) ?? `${kind}-${index + 1}`}`;
}

export function deriveRoomSelectedEntityCells(
  room: RoomsWorkspaceRoom,
  entities: RoomsWorkspaceEntity[],
  selectedKeys: string[]
): boolean[] {
  const selectedKeySet = new Set(selectedKeys);
  const totalTiles = room.width * room.height;
  const cells = Array.from({ length: totalTiles }, () => false);

  for (const entity of entities) {
    if (entity.roomName !== room.name || !selectedKeySet.has(roomEntityKey(entity))) continue;
    const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
    const startX = clampInteger(footprint.x, 0, room.width - 1);
    const startY = clampInteger(footprint.y, 0, room.height - 1);
    const width = footprint.width;
    const height = footprint.height;
    const endX = clampInteger(footprint.x + width - 1, 0, room.width - 1);
    const endY = clampInteger(footprint.y + height - 1, 0, room.height - 1);

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        cells[y * room.width + x] = true;
      }
    }
  }

  return cells;
}

export function deriveRoomEntityAlignmentGuides(
  room: RoomsWorkspaceRoom,
  entities: RoomsWorkspaceEntity[],
  selectedKeys: string[]
): RoomEntityAlignmentGuide[] {
  const selectedKeySet = new Set(selectedKeys);
  if (selectedKeySet.size < 2) return [];

  const selectedEntities = entities.filter((entity) => selectedKeySet.has(roomEntityKey(entity)) && entity.roomName === room.name);
  if (selectedEntities.length < 2) return [];

  const countByX = new Map<number, number>();
  const countByY = new Map<number, number>();
  selectedEntities.forEach((entity) => {
    countByX.set(entity.x, (countByX.get(entity.x) ?? 0) + 1);
    countByY.set(entity.y, (countByY.get(entity.y) ?? 0) + 1);
  });

  const guides: RoomEntityAlignmentGuide[] = [];
  [...countByX.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([left], [right]) => left - right)
    .forEach(([coordinate, count]) => {
      guides.push({
        axis: "x",
        coordinate,
        count,
        percent: (clampInteger(coordinate, 0, Math.max(0, room.width)) / positiveInteger(room.width, 1)) * 100
      });
    });
  [...countByY.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([left], [right]) => left - right)
    .forEach(([coordinate, count]) => {
      guides.push({
        axis: "y",
        coordinate,
        count,
        percent: (clampInteger(coordinate, 0, Math.max(0, room.height)) / positiveInteger(room.height, 1)) * 100
      });
    });

  return guides;
}

export function deriveRoomEntitySelection(options: DeriveRoomEntitySelectionOptions): string[] {
  const selectableKeys = new Set(
    options.entities
      .filter((entity) => entity.roomName === options.roomName)
      .map((entity) => roomEntityKey(entity))
  );
  const currentKeys = options.currentKeys.filter((key, index, keys) => {
    return selectableKeys.has(key) && keys.indexOf(key) === index;
  });

  if (!options.targetKey || !selectableKeys.has(options.targetKey)) {
    return [];
  }

  if (!options.additive) {
    return [options.targetKey];
  }

  if (currentKeys.includes(options.targetKey)) {
    return currentKeys.filter((key) => key !== options.targetKey);
  }

  return [...currentKeys, options.targetKey];
}

export interface RoomEntitySelectionFootprint {
  height: number;
  width: number;
  x: number;
  y: number;
}

export function roomEntitySelectionFootprint(
  entity: RoomsWorkspaceEntity,
  sceneType?: RoomsWorkspaceRoom["sceneType"]
): RoomEntitySelectionFootprint {
  if (entity.kind === "trigger") {
    return {
      height: positiveInteger(entity.height, 1),
      width: positiveInteger(entity.width, 1),
      x: Math.floor(entity.x),
      y: Math.floor(entity.y)
    };
  }

  if (entity.hasCustomBounds) {
    return {
      height: positiveInteger(entity.height, 1),
      width: positiveInteger(entity.width, 1),
      x: Math.floor(entity.x),
      y: Math.floor(entity.y)
    };
  }

  const frame = entity.spriteFrame;
  if (!frame) {
    return { height: 1, width: 1, x: Math.floor(entity.x), y: Math.floor(entity.y) };
  }

  if (sceneType === "isometric") {
    return { height: 1, width: 1, x: Math.floor(entity.x), y: Math.floor(entity.y) };
  }

  const widthTiles = positiveInteger(frame.widthTiles, Math.ceil(positiveInteger(frame.frameWidth, 8) / 8));
  const heightTiles = positiveInteger(frame.heightTiles, Math.ceil(positiveInteger(frame.frameHeight, 8) / 8));
  const originX = typeof frame.originX === "number" && Number.isFinite(frame.originX) ? Math.floor(frame.originX) : 0;
  const originY = typeof frame.originY === "number" && Number.isFinite(frame.originY) ? Math.floor(frame.originY) : 0;
  const leftTiles = entity.x - originX / 8;
  const topTiles = entity.y - originY / 8;
  const startX = Math.floor(leftTiles);
  const endX = Math.ceil(leftTiles + widthTiles) - 1;

  return {
    height: 1,
    width: Math.max(1, endX - startX + 1),
    x: startX,
    y: Math.ceil(topTiles + heightTiles) - 1
  };
}

function roomGeometryEntityLabel(entity: RoomsWorkspaceEntity): string {
  return entity.name.trim() || entity.id;
}

function footprintOutsideRoom(
  footprint: RoomEntitySelectionFootprint,
  room: RoomsWorkspaceRoom
): boolean {
  return footprint.x < 0
    || footprint.y < 0
    || footprint.x + footprint.width > room.width
    || footprint.y + footprint.height > room.height;
}

function footprintHasBlockedCollision(
  footprint: RoomEntitySelectionFootprint,
  room: RoomsWorkspaceRoom
): boolean {
  const collisionTypes = room.collisionTypes ?? [];
  for (let y = footprint.y; y < footprint.y + footprint.height; y += 1) {
    for (let x = footprint.x; x < footprint.x + footprint.width; x += 1) {
      if (x < 0 || y < 0 || x >= room.width || y >= room.height) continue;
      if (isBlockedCollisionType(collisionTypes[y * room.width + x] ?? "free")) return true;
    }
  }
  return false;
}

function cutsceneActorUsesOffscreenStaging(
  room: RoomsWorkspaceRoom,
  actor: RoomsWorkspaceEntity,
  actorIndex: number
): boolean {
  if (actorIndex < 0 || room.sceneType !== "cutscene" && room.runtime?.type !== "cutscene") return false;
  if (room.runtime?.type !== "cutscene") return false;

  const cutsceneConfig = room.runtime.config as Partial<CutsceneSceneConfig>;
  const steps = cutsceneConfig.steps ?? [];
  const sceneWidth = positiveInteger(room.width, 1) * positiveInteger(room.backgroundTileWidth, 8);
  const sceneHeight = positiveInteger(room.height, 1) * positiveInteger(room.backgroundTileHeight, 8);
  const frameWidth = positiveInteger(actor.spriteFrame?.frameWidth, positiveInteger(actor.width, 1) * positiveInteger(room.backgroundTileWidth, 8));
  const frameHeight = positiveInteger(actor.spriteFrame?.frameHeight, positiveInteger(actor.height, 1) * positiveInteger(room.backgroundTileHeight, 8));
  const positionIsOutside = (position: { x: number; y: number }): boolean => {
    return position.x < 0
      || position.y < 0
      || position.x + frameWidth > sceneWidth
      || position.y + frameHeight > sceneHeight;
  };

  return steps.some((step) => step.actorMotions?.some((motion) => {
    return motion.actorIndex === actorIndex
      && (positionIsOutside(motion.fromPosition) || positionIsOutside(motion.toPosition));
  }) ?? false);
}

function roomBackgroundExpectedDimensions(room: RoomsWorkspaceRoom): { width: number; height: number } {
  const gridDimensions = {
    width: room.width * room.backgroundTileWidth,
    height: room.height * room.backgroundTileHeight
  };

  if (room.sceneType === "shmup" && room.runtime?.type === "shmup") {
    const composition = resolveShmupSceneComposition(room.runtime.config, {
      widthTiles: room.width,
      heightTiles: room.height
    });
    if (composition.config.video.affine) {
      return {
        width: composition.config.video.affine.physicalMapWidthTiles * 8,
        height: composition.config.video.affine.physicalMapHeightTiles * 8
      };
    }
  }

  if (room.sceneType === "isometric" && room.runtime?.type === "isometric") {
    const config = room.runtime.config;
    const surface = isometricSceneConfigFromRuntime(room.runtime)?.pagedSurface;
    if (surface) return { width: surface.width, height: surface.height };
    const pages = config.tacticalPresentation?.surfacePages ?? [];
    const bounds = pages.reduce((current, page) => ({
      width: Math.max(current.width, page.world.x + page.world.width),
      height: Math.max(current.height, page.world.y + page.world.height)
    }), { width: 0, height: 0 });
    if (bounds.width > 0 && bounds.height > 0) return bounds;
  }

  return gridDimensions;
}

export function deriveRoomGeometryDiagnostics(
  room: RoomsWorkspaceRoom,
  entities: RoomsWorkspaceEntity[]
): RoomGeometryDiagnostics {
  const expectedDimensions = roomBackgroundExpectedDimensions(room);
  const expectedWidth = expectedDimensions.width;
  const expectedHeight = expectedDimensions.height;
  const actualWidth = Number.isFinite(room.backgroundPixelWidth) && (room.backgroundPixelWidth ?? 0) > 0
    ? Math.floor(room.backgroundPixelWidth ?? 0)
    : null;
  const actualHeight = Number.isFinite(room.backgroundPixelHeight) && (room.backgroundPixelHeight ?? 0) > 0
    ? Math.floor(room.backgroundPixelHeight ?? 0)
    : null;
  const backgroundAlignmentStatus: RoomGeometryAlignmentStatus = !room.gbStudioUseBackgroundLayout || !room.background
    ? "not_applicable"
    : actualWidth === null || actualHeight === null
      ? "unknown"
      : actualWidth === expectedWidth && actualHeight === expectedHeight
        ? "aligned"
        : "mismatch";
  const actorPlacement = { blocked: [] as string[], outsideBounds: [] as string[] };
  const triggerPlacement = { blocked: [] as string[], outsideBounds: [] as string[] };
  const collisionEditingEnabled = sceneTypeProfile(room.sceneType).editorTools.includes("collision");
  const collisionChecksEnabled = collisionEditingEnabled && room.sceneType !== "worldMap";
  const roomActors = entities.filter((entity) => entity.roomName === room.name && entity.kind === "actor");

  for (const entity of entities) {
    if (entity.roomName !== room.name) continue;
    const footprint = roomEntitySelectionFootprint(entity, room.sceneType);
    const outsideBounds = footprintOutsideRoom(footprint, room);
    const blocked = collisionChecksEnabled && !outsideBounds && footprintHasBlockedCollision(footprint, room);
    const target = entity.kind === "actor" ? actorPlacement : triggerPlacement;
    const actorIndex = entity.kind === "actor"
      ? roomActors.findIndex((actor) => actor.id === entity.id)
      : -1;
    const isIntentionalCutsceneStaging = outsideBounds
      && entity.kind === "actor"
      && cutsceneActorUsesOffscreenStaging(room, entity, actorIndex);
    if (outsideBounds && !isIntentionalCutsceneStaging) target.outsideBounds.push(roomGeometryEntityLabel(entity));
    if (blocked) target.blocked.push(roomGeometryEntityLabel(entity));
  }

  return {
    backgroundAlignment: {
      actualHeight,
      actualWidth,
      expectedHeight,
      expectedWidth,
      status: backgroundAlignmentStatus
    },
    actorPlacement,
    triggerPlacement
  };
}

export function roomGeometryDiagnosticWarnings(
  room: RoomsWorkspaceRoom,
  diagnostics: RoomGeometryDiagnostics
): string[] {
  const warnings: string[] = [];
  if (diagnostics.backgroundAlignment.status === "mismatch") {
    warnings.push(
      `Fundo desalinhado: ${diagnostics.backgroundAlignment.actualWidth}x${diagnostics.backgroundAlignment.actualHeight}px; esperado ${diagnostics.backgroundAlignment.expectedWidth}x${diagnostics.backgroundAlignment.expectedHeight}px para a grade ${room.width}x${room.height}.`
    );
  }
  diagnostics.actorPlacement.outsideBounds.forEach((name) => {
    warnings.push(`Ator fora da grade da cena: ${name}.`);
  });
  diagnostics.actorPlacement.blocked.forEach((name) => {
    warnings.push(`Ator inicia sobre colisão bloqueante: ${name}.`);
  });
  diagnostics.triggerPlacement.outsideBounds.forEach((name) => {
    warnings.push(`Trigger fora da grade da cena: ${name}.`);
  });
  diagnostics.triggerPlacement.blocked.forEach((name) => {
    warnings.push(`Trigger atravessa colisão bloqueante: ${name}.`);
  });
  return warnings;
}

function roomEntityPositionForSelectionCell(
  entity: RoomsWorkspaceEntity,
  selectionX: number,
  selectionY: number,
  sceneType?: RoomsWorkspaceRoom["sceneType"]
): { x: number; y: number } {
  const current = roomEntitySelectionFootprint(entity, sceneType);
  return {
    x: Math.floor(entity.x + selectionX - current.x),
    y: Math.floor(entity.y + selectionY - current.y)
  };
}

function entityContainsTile(
  entity: RoomsWorkspaceEntity,
  tileX: number,
  tileY: number,
  sceneType?: RoomsWorkspaceRoom["sceneType"]
): boolean {
  const footprint = roomEntitySelectionFootprint(entity, sceneType);
  return tileX >= footprint.x
    && tileX < footprint.x + footprint.width
    && tileY >= footprint.y
    && tileY < footprint.y + footprint.height;
}

export function selectRoomEntityAtTile(
  entities: RoomsWorkspaceEntity[],
  options: SelectRoomEntityAtTileOptions
): RoomsWorkspaceEntity | null {
  if (!Number.isFinite(options.tileX) || !Number.isFinite(options.tileY)) {
    return null;
  }

  const tileX = Math.floor(options.tileX);
  const tileY = Math.floor(options.tileY);
  for (const entity of [...entities].reverse()) {
    if (entity.roomName !== options.roomName) continue;
    if (options.ignoredEntityKey && roomEntityKey(entity) === options.ignoredEntityKey) continue;
    if (options.visibleEntityKeys && !options.visibleEntityKeys.has(roomEntityKey(entity))) continue;
    if (entityContainsTile(entity, tileX, tileY, options.sceneType)) {
      return entity;
    }
  }

  return null;
}

function collisionCount(room: Record<string, unknown>, width: number, height: number): number {
  return collisionTypeCellsFromRoom(room, width, height).filter(isBlockedCollisionType).length;
}

function collisionCells(room: Record<string, unknown>, width: number, height: number): boolean[] {
  return blockedCollisionCellsFromRoom(room, width, height);
}

function collisionTypes(room: Record<string, unknown>, width: number, height: number): RoomCollisionType[] {
  const sceneDocument = normalizeGBASceneDocument(room);
  return collisionTypeCellsFromRoom({ ...room, collisionTypes: sceneDocument.collisionTypes }, width, height);
}

function roomHeightLevels(room: Record<string, unknown>, width: number, height: number): number[] {
  const levels = Array.isArray(room.heightLevels) ? room.heightLevels : [];
  return Array.from({ length: roomTileCount(width, height) }, (_value, index) => {
    const level = levels[index];
    return typeof level === "number" && Number.isFinite(level) ? clampInteger(level, 0, 3) : 0;
  });
}

function tileCells(room: Record<string, unknown>, width: number, height: number): number[] {
  const totalTiles = roomTileCount(width, height);
  const tilemap = Array.isArray(room.tilemap) ? room.tilemap : [];
  return Array.from({ length: totalTiles }, (_, index) => {
    const value = tilemap[index];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  });
}

function explicitTileIDs(room: Record<string, unknown>): number[] {
  const tilemap = Array.isArray(room.tilemap) ? room.tilemap : [];
  return tilemap.flatMap((value) => {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? [Math.floor(value)] : [];
  });
}

function deriveTilePalette(rooms: Record<string, unknown>[]): number[] {
  return Array.from(new Set([0, ...rooms.flatMap(explicitTileIDs)])).sort((lhs, rhs) => lhs - rhs);
}

function filledTileCells(cells: number[], width: number, startIndex: number, nextTileID: number): number[] {
  const targetTileID = cells[startIndex];
  if (targetTileID === nextTileID) {
    return cells;
  }

  const nextCells = [...cells];
  const pending = [startIndex];
  const visited = new Set<number>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current) || cells[current] !== targetTileID) {
      continue;
    }

    visited.add(current);
    nextCells[current] = nextTileID;

    const currentColumn = current % width;
    const left = current - 1;
    const right = current + 1;
    const up = current - width;
    const down = current + width;

    if (currentColumn > 0) pending.push(left);
    if (currentColumn < width - 1) pending.push(right);
    if (up >= 0) pending.push(up);
    if (down < cells.length) pending.push(down);
  }

  return nextCells;
}

function referenceImageCount(room: Record<string, unknown>): number {
  const references = room.referenceImages;
  return Array.isArray(references) ? references.filter(isRecord).length : 0;
}

function optionForName(record: Record<string, unknown>): RoomsWorkspaceOption | null {
  const name = nullableString(record.name);
  return name ? { label: name, value: name } : null;
}

function uniqueOptions(options: Array<RoomsWorkspaceOption | null>): RoomsWorkspaceOption[] {
  const seen = new Set<string>();
  const unique: RoomsWorkspaceOption[] = [];

  for (const option of options) {
    if (!option || seen.has(option.value)) continue;
    seen.add(option.value);
    unique.push(option);
  }

  return unique;
}

const actorAnimationDirections = new Set(["down", "left", "right", "up"]);

function actorAnimationVariant(record: Record<string, unknown>): RoomsWorkspaceActorAnimationVariant | null {
  const animationName = nullableString(record.name);
  const spriteSheet = nullableString(record.spriteSheet);
  if (!animationName || !spriteSheet) return null;

  const nameParts = animationName.split("_");
  const inferredDirection = nameParts.length > 1 && actorAnimationDirections.has(nameParts.at(-1) ?? "")
    ? nameParts.at(-1) ?? null
    : null;
  const direction = nullableString(record.direction) ?? inferredDirection;
  const state = nullableString(record.state)
    ?? (inferredDirection ? nameParts.slice(0, -1).join("_") : animationName);

  return { animationName, spriteSheet, state, direction };
}

export function resolveActorAnimationName(
  variants: RoomsWorkspaceActorAnimationVariant[],
  selection: { spriteSheet: string; state: string; direction: string | null }
): string | null {
  const matchingState = variants.filter((variant) => (
    variant.spriteSheet === selection.spriteSheet && variant.state === selection.state
  ));
  return matchingState.find((variant) => variant.direction === selection.direction)?.animationName
    ?? matchingState[0]?.animationName
    ?? null;
}

function isBackgroundAssetKind(kind: string | null): boolean {
  if (!kind) return false;
  return ["background", "image", "imagem", "tileset", "tilemap"].includes(kind.toLowerCase());
}

function deriveRoomsWorkspaceOptions(data: GBAProjectData): RoomsWorkspaceOptions {
  const paletteFamilies: RoomsWorkspaceOption[] = (Array.isArray(data.paletteFamilies) ? data.paletteFamilies : [])
    .filter(isRecord)
    .map((record) => {
      const id = nullableString(record.id);
      if (!id) return null;
      return { label: nullableString(record.name) ?? id, value: id };
    })
    .filter((option): option is RoomsWorkspaceOption => option !== null);

  return {
    actorAnimations: uniqueOptions(projectRecords(data, "animations").map(optionForName)),
    actorAnimationStates: projectRecords(data, "animationStates").flatMap((state) => {
      const value = nullableString(state.id);
      const spriteSheet = nullableString(state.spriteSheet);
      if (!value || !spriteSheet) return [];
      return [{ label: nullableString(state.name) ?? value, value, spriteSheet }];
    }),
    actorAnimationVariants: projectRecords(data, "animations")
      .map(actorAnimationVariant)
      .filter((variant): variant is RoomsWorkspaceActorAnimationVariant => Boolean(variant)),
    actorSpriteSheets: uniqueOptions(
      projectRecords(data, "assets")
        .filter((asset) => nullableString(asset.kind)?.toLowerCase() === "sprite")
        .map(optionForName)
    ),
    backgroundAssets: uniqueOptions(
      projectRecords(data, "assets")
        .filter((asset) => isBackgroundAssetKind(nullableString(asset.kind)))
        .map(optionForName)
    ),
    musicItems: uniqueOptions(projectRecords(data, "audioItems").map(optionForName)),
    paletteFamilies,
    playerActors: uniqueOptions(projectRecords(data, "actors").map(optionForName))
  };
}

function assetMetadataByName(data: GBAProjectData, filterKind?: (kind: string | null) => boolean): Map<string, Record<string, unknown>> {
  const metadataByName = new Map<string, Record<string, unknown>>();
  for (const asset of projectRecords(data, "assets")) {
    const name = nullableString(asset.name);
    if (!name || (filterKind && !filterKind(nullableString(asset.kind)))) continue;

    metadataByName.set(name, {
      ...asset,
      ...(isRecord(asset.metadata) ? asset.metadata : {})
    });
  }

  return metadataByName;
}

function spriteFrameForEntity(
  data: GBAProjectData,
  entity: Record<string, unknown>
): RoomsWorkspaceSpriteFrame | null {
  const spriteSheet = nullableString(entity.spriteSheet);
  if (!spriteSheet) return null;
  const resolved = resolveGbaActorSprite(data, entity);
  if (!resolved?.frame) return null;
  return resolved.frame;
}

function roomBackgroundAssetName(room: Record<string, unknown>): string | null {
  return nullableString(room.backgroundAssetName);
}

function backgroundSourceForAsset(asset: Record<string, unknown>): string | null {
  const document = normalizeGBAAssetDocument(asset);
  if (document.source) return document.source;

  const kind = document.kind.toLowerCase();
  const name = document.name;
  if (!name) return null;
  if (kind === "tileset") return `Assets/tilesets/${name}`;
  if (["background", "image", "imagem", "tilemap"].includes(kind)) return `Assets/${name}`;
  return null;
}

function backgroundSourceForAssetName(data: GBAProjectData, assetName: string | null): string | null {
  if (!assetName) return null;
  const asset = projectRecords(data, "assets").find((item) => stringField(item.name, "") === assetName);
  return asset ? backgroundSourceForAsset(asset) : null;
}

function roomBackgroundLayers(
  layers: ReturnType<typeof readSceneTileLayersFromRoom>,
  fallbackAssetName: string | null,
  backgroundMetadata: Map<string, Record<string, unknown>>
): RoomsWorkspaceBackgroundLayer[] {
  return layers.flatMap((layer) => {
    const authoredAssetName = layer.tileSourceAssetNames.find((value) => value.trim().length > 0)?.trim() ?? null;
    const assetName = authoredAssetName ?? (layer.mapping === "BG2" ? fallbackAssetName : null);
    if (!assetName) return [];
    const metadata = backgroundMetadata.get(assetName);
    return [{
      assetName,
      bundledDefaultAsset: nullableString(metadata?.bundledDefaultAsset),
      mapping: layer.mapping,
      source: metadata ? backgroundSourceForAsset(metadata) : null
    }];
  });
}

function roomReferenceWarnings(
  room: {
    background: string | null;
    music: string | null;
    playerActorName: string | null;
  },
  options: RoomsWorkspaceOptions
): string[] {
  const warnings: string[] = [];
  if (room.music && !options.musicItems.some((item) => item.value === room.music)) {
    warnings.push(`Musica nao encontrada: ${room.music}.`);
  }
  if (room.background && !options.backgroundAssets.some((item) => item.value === room.background)) {
    warnings.push(`Fundo nao encontrado: ${room.background}.`);
  }
  if (room.playerActorName && !options.playerActors.some((item) => item.value === room.playerActorName)) {
    warnings.push(`Jogador não encontrado: ${room.playerActorName}.`);
  }
  return warnings;
}

function deriveRoomsWorkspaceConnections(data: GBAProjectData, active: string | null): RoomsWorkspaceConnection[] {
  return sceneConnections(data).flatMap((connection, index) => {
    const from = nullableString(connection.from);
    const to = nullableString(connection.to);
    if (!from || !to) return [];
    const hasExplicitTransition = Object.hasOwn(connection, "transition");

    return [{
      index,
      from,
      to,
      eventName: nullableString(connection.eventName),
      exit: parseRoomConnectionArea(connection.exit),
      entry: parseRoomConnectionArea(connection.entry),
      transition: hasExplicitTransition
        ? normalizeSceneTransition(connection.transition)
        : sceneTransitionFromProjectSettings(isRecord(data.settings) ? data.settings.transitions : undefined),
      transitionSource: hasExplicitTransition ? "custom" : "project-default",
      isFromActive: active === from,
      isToActive: active === to
    }];
  });
}

function parseRoomConnectionArea(value: unknown): RoomConnectionArea | null {
  if (!isRecord(value)) return null;
  const x = integerField(value.x, NaN);
  const y = integerField(value.y, NaN);
  const width = integerField(value.width, NaN);
  const height = integerField(value.height, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return { x, y, width, height };
}

function roomConnectionAreaRecord(area: RoomConnectionArea): Record<string, number> {
  return {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height
  };
}

export function defaultRoomConnectionExitArea(roomWidth: number, roomHeight: number): RoomConnectionArea {
  const width = positiveInteger(roomWidth, 1);
  const height = positiveInteger(roomHeight, 1);
  return {
    x: width - 1,
    y: Math.floor(height / 2),
    width: 1,
    height: 1
  };
}

export function defaultRoomConnectionEntryArea(roomWidth: number, roomHeight: number): RoomConnectionArea {
  const height = positiveInteger(roomHeight, 1);
  return {
    x: 0,
    y: Math.floor(height / 2),
    width: 1,
    height: 1
  };
}

export function normalizeRoomConnectionArea(
  area: RoomConnectionArea,
  roomWidth: number,
  roomHeight: number
): RoomConnectionArea {
  const width = positiveInteger(roomWidth, 1);
  const height = positiveInteger(roomHeight, 1);
  let normalizedWidth = Math.max(1, Math.min(Math.floor(area.width), width));
  let normalizedHeight = Math.max(1, Math.min(Math.floor(area.height), height));
  const x = clampInteger(Math.floor(area.x), 0, width - normalizedWidth);
  const y = clampInteger(Math.floor(area.y), 0, height - normalizedHeight);
  if (x + normalizedWidth > width) normalizedWidth = width - x;
  if (y + normalizedHeight > height) normalizedHeight = height - y;
  return { x, y, width: normalizedWidth, height: normalizedHeight };
}

export function moveRoomConnectionAreaToCell(
  area: RoomConnectionArea,
  roomWidth: number,
  roomHeight: number,
  cellIndex: number
): RoomConnectionArea {
  const width = positiveInteger(roomWidth, 1);
  const tileX = Number.isInteger(cellIndex) && cellIndex >= 0 ? cellIndex % width : 0;
  const tileY = Number.isInteger(cellIndex) && cellIndex >= 0 ? Math.floor(cellIndex / width) : 0;
  return normalizeRoomConnectionArea({
    ...area,
    x: tileX,
    y: tileY
  }, roomWidth, roomHeight);
}

export function deriveRoomConnectionAreasForRoom(
  roomName: string,
  connections: RoomsWorkspaceConnection[]
): Array<{ connectionIndex: number; side: "exit" | "entry"; area: RoomConnectionArea }> {
  const areas: Array<{ connectionIndex: number; side: "exit" | "entry"; area: RoomConnectionArea }> = [];
  for (const connection of connections) {
    if (connection.from === roomName && connection.exit) {
      areas.push({ connectionIndex: connection.index, side: "exit", area: connection.exit });
    }
    if (connection.to === roomName && connection.entry) {
      areas.push({ connectionIndex: connection.index, side: "entry", area: connection.entry });
    }
  }
  return areas;
}

export function roomConnectionAreaCenter(area: RoomConnectionArea): { x: number; y: number } {
  return {
    x: Math.floor(area.x + area.width / 2),
    y: Math.floor(area.y + area.height / 2)
  };
}

export type RoomConnectionArrivalDirection = "up" | "down" | "left" | "right";

export interface RoomConnectionArrival {
  x: number;
  y: number;
  direction: RoomConnectionArrivalDirection;
}

export function roomConnectionArrival(
  area: RoomConnectionArea,
  roomWidth: number,
  roomHeight: number,
  collisionTypes: readonly unknown[] = []
): RoomConnectionArrival {
  const width = positiveInteger(roomWidth, 1);
  const height = positiveInteger(roomHeight, 1);
  const normalized = normalizeRoomConnectionArea(area, width, height);
  const center = roomConnectionAreaCenter(normalized);
  const sideDistances = [
    { side: "left" as const, distance: normalized.x },
    { side: "right" as const, distance: width - (normalized.x + normalized.width) },
    { side: "up" as const, distance: normalized.y },
    { side: "down" as const, distance: height - (normalized.y + normalized.height) }
  ];
  const closestSide = sideDistances.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest
  );
  const inward = closestSide.side === "left"
    ? { x: 1, y: 0, direction: "right" as const }
    : closestSide.side === "right"
      ? { x: -1, y: 0, direction: "left" as const }
      : closestSide.side === "up"
        ? { x: 0, y: 1, direction: "down" as const }
        : { x: 0, y: -1, direction: "up" as const };
  const start = {
    x: clampInteger(center.x + inward.x, 0, width - 1),
    y: clampInteger(center.y + inward.y, 0, height - 1)
  };
  const isWalkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const collision = collisionTypes[y * width + x];
    return collision === undefined || !isBlockedCollisionType(normalizeRoomCollisionType(collision));
  };

  if (isWalkable(start.x, start.y)) {
    return { ...start, direction: inward.direction };
  }

  const perpendicular = inward.x === 0
    ? [{ x: -1, y: 0 }, { x: 1, y: 0 }]
    : [{ x: 0, y: -1 }, { x: 0, y: 1 }];
  const maximumDistance = Math.max(width, height);
  for (let distance = 1; distance <= maximumDistance; distance += 1) {
    const candidates = [
      { x: start.x + inward.x * distance, y: start.y + inward.y * distance },
      ...perpendicular.map((delta) => ({
        x: start.x + delta.x * distance,
        y: start.y + delta.y * distance
      })),
      { x: start.x - inward.x * distance, y: start.y - inward.y * distance }
    ];
    const walkable = candidates.find((candidate) => isWalkable(candidate.x, candidate.y));
    if (walkable) return { ...walkable, direction: inward.direction };
  }

  return { ...start, direction: inward.direction };
}

function entityRoomName(entity: Record<string, unknown>, rooms: Record<string, unknown>[]): string {
  const firstRoom = rooms[0];
  return normalizeGBAEntityDocument(
    entity,
    "actor",
    0,
    firstRoom ? roomName(firstRoom, 0) : ""
  ).sceneName;
}

const battleAbilityValues: RoomsWorkspaceBattleAbility[] = ["attack", "magic", "heal", "defend"];

function actorBattlePresentation(entity: Record<string, unknown>): RoomsWorkspaceActorBattle {
  const battle = isRecord(entity.battle) ? entity.battle : {};
  const side = battle.side === "party" || battle.side === "enemy" ? battle.side : "none";
  const abilities = Array.isArray(battle.abilities)
    ? battle.abilities.filter((ability): ability is RoomsWorkspaceBattleAbility => battleAbilityValues.includes(ability as RoomsWorkspaceBattleAbility))
    : [];
  return {
    side,
    maxHp: clampInteger(integerField(battle.maxHp, 24), 1, 999),
    attack: clampInteger(integerField(battle.attack, 7), 1, 255),
    defense: clampInteger(integerField(battle.defense, 2), 0, 255),
    speed: clampInteger(integerField(battle.speed, 5), 1, 255),
    abilities: Array.from(new Set(abilities.length > 0 ? abilities : ["attack"])),
    ...(integerField(battle.spriteScale, 1) > 1 ? { spriteScale: 2 } : {})
  };
}

function entityPresentation(
  kind: RoomsWorkspaceEntityKind,
  entity: Record<string, unknown>,
  index: number,
  rooms: Record<string, unknown>[],
  active: string | null,
  spriteMetadata: Map<string, Record<string, unknown>>,
  data: GBAProjectData
): RoomsWorkspaceEntity {
  const entityDocument = normalizeGBAEntityDocument(
    entity,
    kind,
    index,
    rooms[0] ? roomName(rooms[0], 0) : ""
  );
  const resolvedRoomName = entityDocument.sceneName;
  const spriteSheet = entityDocument.spriteSheet;
  const spriteMetadataForSheet = spriteSheet ? spriteMetadata.get(spriteSheet) : undefined;
  const spriteSource = spriteSheet ? nullableString(spriteMetadataForSheet?.source) : null;
  const spriteBundledDefaultAsset = spriteSheet ? nullableString(spriteMetadataForSheet?.bundledDefaultAsset) : null;
  const animationName = entityDocument.animationName;
  const animationStateID = entityDocument.animationStateID;
  const isPlayer = kind === "actor" && rooms.some((room) => (
    roomName(room, rooms.indexOf(room)) === resolvedRoomName
    && nullableString(room.playerActorName) === entityDocument.name
  ));
  const ownerRoom = rooms.find((room, roomIndex) => roomName(room, roomIndex) === resolvedRoomName);
  const menuPixels = kind === "actor" && ownerRoom && normalizeGBASceneDocument(ownerRoom, 0).sceneType === "menu"
    && isRecord(entity.menuPositionPixels) && Number.isFinite(entity.menuPositionPixels.x) && Number.isFinite(entity.menuPositionPixels.y)
    ? entity.menuPositionPixels : null;
  const resolvedSpriteFrame = kind === "actor" ? spriteFrameForEntity(data, entity) : null;
  // Authored menu pixels locate the source frame's top-left, unlike a gameplay foot pivot.
  // Metasprite export already subtracts the pivot; applying it here shifts the preview again.
  const spriteFrame = menuPixels && resolvedSpriteFrame
    ? { ...resolvedSpriteFrame, originX: 0, originY: 0 }
    : resolvedSpriteFrame;
  const hasCustomBounds = kind === "actor" && (
    (typeof entity.width === "number" && Number.isFinite(entity.width))
    || (typeof entity.height === "number" && Number.isFinite(entity.height))
    || isRecord(entity.size)
  );
  return {
    kind,
    id: entityDocument.id,
    name: entityDocument.name,
    roomName: resolvedRoomName,
    ...(isPlayer ? { isPlayer: true } : {}),
    x: menuPixels ? (menuPixels.x as number) / 8 : entityDocument.position.x,
    y: menuPixels ? (menuPixels.y as number) / 8 : entityDocument.position.y,
    width: entityDocument.bounds.width,
    height: entityDocument.bounds.height,
    eventName: entityDocument.eventName,
    spriteSheet,
    spriteSource,
    spriteBundledDefaultAsset,
    spriteFrame,
    animationName,
    ...(kind === "actor" && typeof entity.z === "number" && Number.isFinite(entity.z)
      ? { z: Math.floor(entity.z) }
      : {}),
    ...(hasCustomBounds ? { hasCustomBounds: true } : {}),
    ...(kind === "actor" ? {
      ...(animationStateID ? { animationStateID } : {}),
      collisionGroup: clampInteger(integerField(entity.collisionGroup, 0), 0, 15),
      collisionMask: clampInteger(integerField(entity.collisionMask, 0xFFFF), 0, 0xFFFF),
      pushPriority: clampInteger(integerField(entity.pushPriority, 0), 0, 255),
      pushable: entity.pushable === true,
      battle: actorBattlePresentation(entity)
    } : {}),
    isInActiveRoom: active === resolvedRoomName
  };
}

function deriveRoomsWorkspaceEntities(data: GBAProjectData, rooms: Record<string, unknown>[], active: string | null): RoomsWorkspaceEntity[] {
  const spriteMetadata = assetMetadataByName(data, (kind) => kind?.toLowerCase() === "sprite");
  return [
    ...projectRecords(data, "actors").map((actor, index) => entityPresentation("actor", actor, index, rooms, active, spriteMetadata, data)),
    ...projectRecords(data, "triggers").map((trigger, index) => entityPresentation("trigger", trigger, index, rooms, active, spriteMetadata, data))
  ];
}

function ensureSettingsGeneral(data: GBAProjectData): Record<string, unknown> {
  const settings = isRecord(data.settings) ? data.settings : {};
  data.settings = settings;
  if (!isRecord(settings.general)) {
    settings.general = {};
  }

  return settings.general as Record<string, unknown>;
}

function ensureEditorState(data: GBAProjectData): Record<string, unknown> {
  const state = isRecord(data.editorState) ? data.editorState : {};
  data.editorState = state;
  return state;
}

function sceneMapPosition(value: unknown): SceneMapPosition | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== "number" || typeof value.y !== "number") {
    return null;
  }

  return {
    x: Math.max(0, Math.round(value.x)),
    y: Math.max(0, Math.round(value.y))
  };
}

export function sceneMapPositions(data: GBAProjectData): Record<string, SceneMapPosition> {
  const editorState = projectEditorState(data);
  const positions = editorState?.sceneMapPositions;
  if (!isRecord(positions)) return {};

  return Object.fromEntries(Object.entries(positions).flatMap(([name, value]) => {
    const position = sceneMapPosition(value);
    return name.trim() && position ? [[name, position]] : [];
  }));
}

export function sceneMapZoom(data: GBAProjectData): number {
  const editorState = projectEditorState(data);
  return clampSceneMapZoom(typeof editorState?.sceneMapZoom === "number" ? editorState.sceneMapZoom : 1);
}

function setSceneMapPosition(data: GBAProjectData, sceneName: string, position: SceneMapPosition): void {
  const name = sceneName.trim();
  if (!name) return;

  const editorState = ensureEditorState(data);
  const positions = isRecord(editorState.sceneMapPositions) ? editorState.sceneMapPositions : {};
  editorState.sceneMapPositions = positions;
  delete editorState.roomEditorCards;
  positions[name] = {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y))
  };
}

function sceneMapRoomLike(room: Record<string, unknown>): { height: number; sceneType?: string; width: number; runtime?: unknown; backgroundAtlasTileHeight?: number } {
  return {
    height: positiveInteger(room.height, 1),
    sceneType: typeof room.sceneType === "string" ? room.sceneType : undefined,
    width: positiveInteger(room.width, 1),
    runtime: room.runtime,
    backgroundAtlasTileHeight: typeof room.backgroundAtlasTileHeight === "number" ? room.backgroundAtlasTileHeight : undefined
  };
}

function sceneMapPositionForRoom(
  positions: Record<string, SceneMapPosition>,
  rooms: Record<string, unknown>[],
  room: Record<string, unknown>,
  index: number
): SceneMapPosition {
  return positions[roomName(room, index)] ?? defaultSceneMapPosition(index, rooms.map(sceneMapRoomLike));
}

function nextFreeSceneMapPosition(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  targetRoom: Record<string, unknown>,
  options?: { anchorRoomID?: string }
): SceneMapPosition {
  const positions = sceneMapPositions(data);
  const roomLikes = rooms.map(sceneMapRoomLike);
  const existingRects = rooms.slice(0, -1).map((room, index) => {
    const position = sceneMapPositionForRoom(positions, rooms, room, index);
    const size = sceneMapCardSize(roomLikes[index] ?? { width: 1, height: 1 });
    return { x: position.x, y: position.y, width: size.width, height: size.height };
  });
  const targetSize = sceneMapCardSize(sceneMapRoomLike(targetRoom));
  const anchorRoomID = options?.anchorRoomID?.trim();
  let preferred = defaultSceneMapPosition(Math.max(0, rooms.length - 1), roomLikes);
  if (anchorRoomID) {
    const anchorIndex = rooms.findIndex((room, index) => roomID(room, index) === anchorRoomID);
    if (anchorIndex >= 0) {
      const anchorRoom = rooms[anchorIndex];
      const anchorPosition = sceneMapPositionForRoom(positions, rooms, anchorRoom, anchorIndex);
      preferred = preferredSceneMapPositionBeside(
        roomLikes[anchorIndex] ?? { width: 1, height: 1 },
        anchorPosition
      );
    }
  }
  return findNextFreeCanvasPosition({
    existingRects,
    gap: SCENE_MAP_HORIZONTAL_GAP,
    preferred,
    size: targetSize,
    worldWidth: 4800
  });
}

function renameSceneMapPosition(data: GBAProjectData, oldName: string, nextName: string): void {
  const editorState = projectEditorState(data);
  if (!editorState || !isRecord(editorState.sceneMapPositions)) return;
  const position = sceneMapPosition(editorState.sceneMapPositions[oldName]);
  delete editorState.sceneMapPositions[oldName];
  if (position) {
    editorState.sceneMapPositions[nextName] = position;
  }
}

function pruneSceneMapPosition(data: GBAProjectData, removedName: string): void {
  const editorState = projectEditorState(data);
  if (!editorState || !isRecord(editorState.sceneMapPositions)) return;
  delete editorState.sceneMapPositions[removedName];
}

export function updateSceneMapPositionInProject(data: GBAProjectData, sceneName: string, position: SceneMapPosition): GBAProjectData {
  const next = cloneProjectData(data);
  setSceneMapPosition(next, sceneName, position);
  return next;
}

export function organizeSceneMapPositionsInProject(data: GBAProjectData): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const editorState = ensureEditorState(next);
  editorState.sceneMapPositions = organizedSceneMapPositions(rooms.map((room, index) => ({
    ...sceneMapRoomLike(room),
    name: roomName(room, index)
  })));
  delete editorState.roomEditorCards;
  return next;
}

export function updateSceneMapZoomInProject(data: GBAProjectData, zoom: number): GBAProjectData {
  const next = cloneProjectData(data);
  const editorState = ensureEditorState(next);
  delete editorState.roomEditorCards;
  editorState.sceneMapZoom = clampSceneMapZoom(zoom);
  return next;
}

export function setStartRoomInProject(data: GBAProjectData, roomIDToStart: string): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToStart);
  if (roomIndex < 0) return data;

  setStartScene(next, roomName(rooms[roomIndex], roomIndex));
  return next;
}

function setStartScene(data: GBAProjectData, nextName: string): void {
  ensureSettingsGeneral(data).startScene = nextName;
}

function renameStartScene(data: GBAProjectData, oldName: string, nextName: string): void {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const general = settings && isRecord(settings.general) ? settings.general : undefined;
  if (general?.startScene === oldName) {
    general.startScene = nextName;
  }
}

function renameCampaignReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const room of projectRooms(data)) {
    if (!isRecord(room.campaign) || room.campaign.nextScene !== oldName) continue;
    room.campaign = { ...room.campaign, nextScene: nextName };
  }
}

function retargetStartSceneAfterRemoval(data: GBAProjectData, removedName: string, nextName: string | null): void {
  const settings = isRecord(data.settings) ? data.settings : undefined;
  const general = settings && isRecord(settings.general) ? settings.general : undefined;
  if (!general || general.startScene !== removedName) return;

  if (nextName) {
    general.startScene = nextName;
  } else {
    delete general.startScene;
  }
}

function roomMatches(room: unknown, roomIDToMatch: string, roomNameToMatch: string): room is Record<string, unknown> {
  return isRecord(room) && (room.id === roomIDToMatch || room.name === roomNameToMatch);
}

function roomMatchesKnownRoom(room: unknown, knownRoom: Record<string, unknown>, knownRoomIndex: number): room is Record<string, unknown> {
  return roomMatches(room, roomID(knownRoom, knownRoomIndex), roomName(knownRoom, knownRoomIndex));
}

function renameActiveRoom(data: GBAProjectData, roomIDToRename: string, oldName: string, nextName: string): void {
  if (roomMatches(data.scena, roomIDToRename, oldName)) {
    data.scena.name = nextName;
  }
  delete data.room;
}

function applyRoomFields(room: Record<string, unknown>, fields: UpdateRoomFields, neutralPlayers = false): void {
  const oldWidth = positiveInteger(room.width, 30);
  const oldHeight = positiveInteger(room.height, 20);

  if (fields.width !== undefined) {
    room.width = Math.max(
      normalizeSceneTypeId(fields.sceneType ?? stringField(room.sceneType, "topdown")) === "isometric" ? 1 : GBA_MIN_SCENE_WIDTH_TILES,
      positiveInteger(fields.width, positiveInteger(room.width, GBA_MIN_SCENE_WIDTH_TILES))
    );
  }

  if (fields.height !== undefined) {
    room.height = Math.max(
      normalizeSceneTypeId(fields.sceneType ?? stringField(room.sceneType, "topdown")) === "isometric" ? 1 : GBA_MIN_SCENE_HEIGHT_TILES,
      positiveInteger(fields.height, positiveInteger(room.height, GBA_MIN_SCENE_HEIGHT_TILES))
    );
  }

  const newWidth = positiveInteger(room.width, oldWidth);
  const newHeight = positiveInteger(room.height, oldHeight);
  if ((fields.width !== undefined || fields.height !== undefined) && (newWidth !== oldWidth || newHeight !== oldHeight)) {
    const types = collisionTypes(room, oldWidth, oldHeight);
    room.collisionTypes = resizeCollisionTypeCells(types, oldWidth, oldHeight, newWidth, newHeight, "free");
    delete room.collisions;
    if (["isometric", "racing"].includes(normalizeSceneTypeId(fields.sceneType ?? stringField(room.sceneType, "topdown")))) {
      const resizeGrid = (value: unknown, fill: number): number[] => {
        const cells = Array.isArray(value) ? value : [];
        return Array.from({length: newWidth * newHeight}, (_, index) => {
          const x = index % newWidth;
          const y = Math.floor(index / newWidth);
          return x < oldWidth && y < oldHeight ? integerField(cells[y * oldWidth + x], fill) : fill;
        });
      };
      if (Array.isArray(room.heightLevels)) room.heightLevels = resizeGrid(room.heightLevels, 0);
      if (Array.isArray(room.tilemap)) room.tilemap = resizeGrid(room.tilemap, room.backgroundAssetName === DEFAULT_ISOMETRIC_TILESET_NAME ? 1 : 0);
      if (Array.isArray(room.tileLayers)) room.tileLayers = room.tileLayers.map(layer => isRecord(layer)
        ? {...layer, tilemap: resizeGrid(layer.tilemap, layer.mapping === "BG2" && room.backgroundAssetName === DEFAULT_ISOMETRIC_TILESET_NAME ? 1 : -1)}
        : layer);
    }
  }

  if (fields.collisionTypes !== undefined) {
    room.collisionTypes = resizeCollisionTypeCells(fields.collisionTypes, newWidth, newHeight, newWidth, newHeight, "free");
    delete room.collisions;
  }

  if (fields.sceneType !== undefined) {
    room.sceneType = normalizeSceneTypeId(fields.sceneType, "topdown");
    room.runtime = normalizeSceneRuntime(room.sceneType as string, room.runtime);
    const mode = isometricGameplayModeForSceneTypeChoice(fields.sceneType);
    if (mode) room.runtime = isometricRuntimeForMode(mode, room.runtime);
  }

  if (fields.runtime !== undefined) {
    room.runtime = normalizeSceneRuntime(stringField(room.sceneType, "topdown"), fields.runtime);
  }

  if (fields.eventBindings !== undefined) {
    const eventBindings = isRecord(room.eventBindings) ? { ...room.eventBindings } : {};
    for (const [key, value] of Object.entries(fields.eventBindings)) {
      if (typeof value === "string" && value.trim()) eventBindings[key] = value.trim();
      else delete eventBindings[key];
    }
    room.eventBindings = eventBindings;
  }

  if (fields.cameraMode !== undefined) {
    room.cameraMode = normalizeCameraModeId(fields.cameraMode, "fixed_center");
  }
  room.cameraZoom = normalizeRoomCameraZoom(fields.cameraZoom ?? room.cameraZoom);

  const currentCameraBounds = isRecord(room.cameraBounds) ? room.cameraBounds as Partial<RoomCameraBounds> : null;
  if (fields.centerCameraBounds) {
    room.cameraBounds = centerRoomCameraBounds(newWidth, newHeight, fields.cameraBounds ?? currentCameraBounds);
  } else if (fields.resetCameraBoundsOrigin) {
    const nextBounds = normalizeRoomCameraBounds(fields.cameraBounds ?? currentCameraBounds, newWidth, newHeight);
    room.cameraBounds = { ...nextBounds, x: 0, y: 0 };
  } else if (
    fields.cameraBounds !== undefined
    || fields.width !== undefined
    || fields.height !== undefined
    || !isRecord(room.cameraBounds)
  ) {
    room.cameraBounds = normalizeRoomCameraBounds(
      fields.cameraBounds ?? currentCameraBounds,
      newWidth,
      newHeight
    );
  }

  if (fields.parallax !== undefined) {
    const currentParallax = isRecord(room.parallax) ? room.parallax as Partial<RoomParallaxSettings> : null;
    room.parallax = normalizeRoomParallaxSettings({
      ...currentParallax,
      ...fields.parallax
    });
  } else if (!isRecord(room.parallax)) {
    room.parallax = normalizeRoomParallaxSettings(null);
  }

  if (fields.layerEditing !== undefined) {
    room.layerEditing = normalizeRoomLayerEditing({
      ...normalizeRoomLayerEditing(room.layerEditing),
      ...fields.layerEditing
    });
  }

  if (fields.cameraZones !== undefined) {
    room.cameraZones = cloneProjectData(fields.cameraZones);
  }

  if (fields.music !== undefined) {
    room.music = fields.music.trim();
  }

  if (fields.hudPresetId !== undefined) {
    const value = fields.hudPresetId?.trim() ?? "";
    if (value) room.hudPresetId = value;
    else delete room.hudPresetId;
  }

  if (fields.campaign !== undefined) {
    if (fields.campaign === null) {
      delete room.campaign;
    } else {
      const currentCampaign = isRecord(room.campaign) ? room.campaign : {};
      const normalizedCampaign = normalizeGBASceneDocument({
        ...room,
        campaign: { ...currentCampaign, ...fields.campaign }
      }).campaign;
      if (normalizedCampaign) room.campaign = normalizedCampaign;
      else delete room.campaign;
    }
  }

  if (fields.backgroundAssetName !== undefined) {
    const value = fields.backgroundAssetName.trim();
    if (value) room.backgroundAssetName = value;
    else delete room.backgroundAssetName;
    delete room.background;
  }

  if (!neutralPlayers && fields.sceneType !== undefined && room.sceneType === "isometric") {
    applyDefaultIsometricRoomVisuals(room, newWidth, newHeight);
  }

  if (fields.backgroundRenderMode !== undefined) {
    room.backgroundRenderMode = normalizedBackgroundRenderMode(fields.backgroundRenderMode);
  }

  if (fields.playerActorName !== undefined) {
    room.playerActorName = fields.playerActorName.trim();
  }

  if (fields.paletteFamilyID !== undefined) {
    const value = fields.paletteFamilyID;
    if (value === null || value === "") {
      delete room.paletteFamilyID;
    } else {
      room.paletteFamilyID = value;
    }
  }

  if (fields.paletteBankPolicy !== undefined) {
    room.paletteBankPolicy = normalizeScenePaletteBankPolicy(fields.paletteBankPolicy);
  }
}

function syncActiveRoomFields(data: GBAProjectData, sourceRoom: Record<string, unknown>, sourceIndex: number, fields: UpdateRoomFields): void {
  if (roomMatchesKnownRoom(data.scena, sourceRoom, sourceIndex)) {
    applyRoomFields(data.scena, fields);
  }
  delete data.room;
}

function syncActiveRoomCollision(data: GBAProjectData, sourceRoom: Record<string, unknown>, sourceIndex: number): void {
  if (roomMatchesKnownRoom(data.scena, sourceRoom, sourceIndex)) {
    data.scena.collisionTypes = cloneProjectData(sourceRoom.collisionTypes);
  }
  delete data.room;
}

function syncActiveRoomTilemap(data: GBAProjectData, sourceRoom: Record<string, unknown>, sourceIndex: number): void {
  if (roomMatchesKnownRoom(data.scena, sourceRoom, sourceIndex)) {
    data.scena.tilemap = cloneProjectData(sourceRoom.tilemap);
    if (Array.isArray(sourceRoom.tileLayers)) {
      data.scena.tileLayers = cloneProjectData(sourceRoom.tileLayers);
    }
  }
  delete data.room;
}

function applyLayeredTileEdit(
  data: GBAProjectData,
  room: Record<string, unknown>,
  options: RoomTileBrushOptions
): boolean {
  const sceneType = stringField(room.sceneType, "topdown");
  const videoMode = gbaVideoModeFromProject(data).id;
  if (!sceneTileLayerSupportsLayers(sceneType, videoMode)) return false;

  const mapping = normalizeActiveTileLayerForVideoMode(
    normalizeSceneTileLayerMapping(options.layerMapping ?? activeTileLayerMappingFromProject(data)),
    videoMode
  );
  if (!sceneTileLayerAvailableForVideoMode(mapping, videoMode)) return false;

  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const layers = ensureRoomSceneTileLayers(room, sceneType);
  const result = setSceneTileLayerCell({
    backgroundAssetName: roomBackgroundAssetName(room),
    cellIndex: options.cellIndex,
    height,
    layers,
    mapping,
    sceneType,
    tileID: options.tileID,
    tool: options.tool,
    width
  });
  room.tileLayers = result.layers;
  room.tilemap = result.exportTilemap;
  return true;
}

function retargetActiveRoomAfterRemoval(data: GBAProjectData, roomIDToRemove: string, oldName: string, remainingRooms: Record<string, unknown>[]): void {
  const activeWasRemoved = roomMatches(data.scena, roomIDToRemove, oldName);
  if (!activeWasRemoved) return;

  const nextActive = remainingRooms[0];
  if (nextActive) {
    data.scena = cloneProjectData(nextActive);
  } else {
    delete data.scena;
  }
}

function renameSceneConnections(data: GBAProjectData, oldName: string, nextName: string): void {
  const editorState = isRecord(data.editorState) ? data.editorState : undefined;
  if (!editorState || !Array.isArray(editorState.scenaConnections)) return;

  editorState.scenaConnections = editorState.scenaConnections.map((connection) => {
    if (!isRecord(connection)) return connection;
    return {
      ...connection,
      from: connection.from === oldName ? nextName : connection.from,
      to: connection.to === oldName ? nextName : connection.to
    };
  });
}

function pruneSceneConnections(data: GBAProjectData, removedName: string): void {
  const editorState = projectEditorState(data);
  if (!editorState || !Array.isArray(editorState.scenaConnections)) return;

  editorState.scenaConnections = editorState.scenaConnections.filter((connection) => {
    return !isRecord(connection) || (connection.from !== removedName && connection.to !== removedName);
  });
}

function roomNameSet(data: GBAProjectData): Set<string> {
  return new Set(projectRooms(data).map((room, index) => roomName(room, index)));
}

function renameChangeSceneCommand(command: unknown, oldName: string, nextName: string): unknown {
  if (typeof command !== "string") return command;
  if (command === `change_scene ${oldName}`) {
    return `change_scene ${nextName}`;
  }

  if (command.startsWith(`change_scene ${oldName} `)) {
    return `change_scene ${nextName}${command.slice(`change_scene ${oldName}`.length)}`;
  }

  if (command === `if_scene ${oldName}`) {
    return `if_scene ${nextName}`;
  }

  if (command.startsWith(`if_scene ${oldName} `)) {
    return `if_scene ${nextName}${command.slice(`if_scene ${oldName}`.length)}`;
  }

  return command;
}

function renameChangeSceneCommands(data: GBAProjectData, oldName: string, nextName: string): void {
  const events = data.events;
  if (!Array.isArray(events)) return;

  for (const event of events) {
    if (!isRecord(event)) continue;
    if (typeof event.command === "string") {
      event.command = renameChangeSceneCommand(event.command, oldName, nextName);
    }
    if (!Array.isArray(event.steps)) continue;

    event.steps = event.steps.map((step) => {
      if (!isRecord(step)) return step;
      return {
        ...step,
        command: renameChangeSceneCommand(step.command, oldName, nextName)
      };
    });
  }
}

function renameSceneScopedRecords(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const key of ["actors", "triggers", "events"]) {
    for (const record of projectRecords(data, key)) {
      if (record.roomName === oldName) {
        record.roomName = nextName;
      }
    }
  }

  for (const audio of projectRecords(data, "audioItems")) {
    if (audio.assignedScene === oldName) {
      audio.assignedScene = nextName;
    }
  }
}

function isometricRuntimeForMode(mode: "adventure" | "tactical", runtime?: unknown): SceneRuntimeConfig {
  const config = isometricSceneConfigFromRuntime(runtime) ?? DEFAULT_ISOMETRIC_SCENE_CONFIG;
  return normalizeSceneRuntime("isometric", {type: "isometric", config: {
    ...config, gameplayMode: mode, movement: mode === "adventure" ? "free" : "tile",
    ...(mode === "tactical" ? {tactical: config.tactical ?? {
      enabled: true, activeTeam: "player", activeUnitIndex: 0,
      units: [
        {actorIndex: 0, team: "player", moveRange: 2, attackRange: 1, maxHp: 5, attackPower: 2},
        {actorIndex: 1, team: "enemy", moveRange: 2, attackRange: 1, maxHp: 4, attackPower: 1}
      ]
    }} : {})
  }});
}

function snapIsometricActorToSupportHeight(room: Record<string, unknown>, actor: Record<string, unknown>): void {
  if (normalizeSceneTypeId(stringField(room.sceneType, "topdown")) !== "isometric") return;
  const width = positiveInteger(room.width, 1);
  const x = integerField(actor.x, integerField(isRecord(actor.position) ? actor.position.x : undefined, 0));
  const y = integerField(actor.y, integerField(isRecord(actor.position) ? actor.position.y : undefined, 0));
  if (x < 0 || y < 0 || x >= width || y >= positiveInteger(room.height, 1)) return;
  const levels = Array.isArray(room.heightLevels) ? room.heightLevels : [];
  actor.z = clampInteger(integerField(levels[y * width + x], 0), 0, 3);
}

function ensureIsometricTacticalPair(data: GBAProjectData, room: Record<string, unknown>): void {
  if (room.sceneType !== "isometric" || isometricSceneConfigFromRuntime(room.runtime)?.gameplayMode !== "tactical") return;
  const name = stringField(room.name, "");
  const actors = projectRecords(data, "actors");
  const roomActors = actors.filter(actor => actor.roomName === name);
  if (!roomActors.some(actor => actor.name === room.playerActorName) && roomActors[0]?.name) room.playerActorName = roomActors[0].name;
  if (roomActors.length !== 1) return;
  const source = roomActors[0]!;
  let id = `actor-enemy-${stringField(room.id, "scene")}`;
  while (actors.some(actor => actor.id === id)) id += "-2";
  const enemy: Record<string, unknown> = {
    id, name: "Enemy", roomName: name, spriteSheet: source.spriteSheet,
    animationName: source.animationName, ...(source.animationStateID ? {animationStateID: source.animationStateID} : {}),
    x: Math.max(0, positiveInteger(room.width, 1) - 2), y: Math.min(1, positiveInteger(room.height, 1) - 1), eventBindings: {}
  };
  Object.assign(enemy, defaultBackgroundActorPosition(data, room, true));
  snapIsometricActorToSupportHeight(room, enemy);
  data.actors = [...actors, enemy];
}

function makeRoom(options: CreateRoomOptions, neutralPlayers = false): Record<string, unknown> | null {
  const id = options.id.trim();
  const name = options.name.trim();
  if (!id || !name) return null;

  const preset = options.presetID ? ROOM_PRESETS.find((item) => item.id === options.presetID) : undefined;
  const choice = preset?.sceneType ?? stringField(options.sceneType, "topdown");
  const sceneType = normalizeSceneTypeId(choice, "topdown");
  const width = Math.max(
    sceneType === "isometric" ? 1 : GBA_MIN_SCENE_WIDTH_TILES,
    positiveInteger(preset?.width ?? options.width, GBA_MIN_SCENE_WIDTH_TILES)
  );
  const height = Math.max(
    sceneType === "isometric" ? 1 : GBA_MIN_SCENE_HEIGHT_TILES,
    positiveInteger(preset?.height ?? options.height, GBA_MIN_SCENE_HEIGHT_TILES)
  );
  const collisionTypes = preset?.borderCollision
    ? Array.from({ length: width * height }, (_value, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return x === 0 || y === 0 || x === width - 1 || y === height - 1 ? "solid" : "free";
    })
    : [];
  const room: Record<string, unknown> = {
    id,
    name,
    width,
    height,
    sceneType,
    runtime: defaultSceneRuntime(sceneType),
    cameraMode: preset?.cameraMode ?? "fixed_center",
    cameraZoom: 100,
    cameraBounds: normalizeRoomCameraBounds(null, width, height),
    parallax: normalizeRoomParallaxSettings(null),
    backgroundRenderMode: "tilemap",
    collisionTypes,
    referenceImages: []
  };
  if (preset?.menuScreenType) {
    room.runtime = { type: "menu", config: defaultMenuSceneConfig(preset.menuScreenType, preset.menuRole) };
  }
  if (sceneType === "isometric") {
    room.runtime = isometricRuntimeForMode(isometricGameplayModeForSceneTypeChoice(choice) ?? "adventure");
    if (neutralPlayers) {
      room.backgroundAssetName = "";
      room.tilemap = Array(width * height).fill(0);
      room.heightLevels = Array(width * height).fill(0);
    } else {
      applyDefaultIsometricRoomVisuals(room, width, height);
    }
  }
  room.tileLayers = defaultSceneTileLayers({
    fallbackTilemap: Array.isArray(room.tilemap) ? room.tilemap : [],
    height,
    sceneType,
    width
  });
  return room;
}

function defaultPlayerSpriteForScene(data: GBAProjectData, sceneType: string, room?: Record<string, unknown>): string {
  const settings = isRecord(data.settings) ? data.settings : {};
  const sceneTypes = isRecord(settings.sceneTypes) ? settings.sceneTypes : {};
  const defaults = isRecord(sceneTypes.defaultPlayerSprites) ? sceneTypes.defaultPlayerSprites : {};
  const runtimeConfig = isRecord(room?.runtime) && isRecord(room.runtime.config) ? room.runtime.config : {};
  const key = sceneType === "racing" && usesBlankPlayerDefaults(data) && runtimeConfig.presentation === "pseudo3d" ? "racingPerspective"
    : sceneType === "isometric" && isometricSceneConfigFromRuntime(room?.runtime)?.gameplayMode === "tactical"
    ? "isometricTactical" : sceneType;
  const spriteSheet = defaults[key];
  return typeof spriteSheet === "string" && spriteSheet.trim().length > 0
    ? spriteSheet.trim()
    : usesBlankPlayerDefaults(data) ? blankPlayerSpriteForRoom(room ?? { sceneType }) : defaultPlayerSpriteForSceneType(sceneType);
}

function ensureDefaultControlledEntityContent(data: GBAProjectData, spriteSheet: string): void {
  if (projectRecords(data, "assets").some(asset => asset.name === spriteSheet)) return;
  const starter = createBlankProjectData({name: "Scene defaults"});
  if (!projectRecords(starter, "assets").some(asset => asset.name === spriteSheet)) return;
  for (const key of ["assets", "animations", "animationStates"] as const) {
    const current = projectRecords(data, key);
    const defaults = projectRecords(starter, key).filter(record => (
      key === "assets" ? record.name === spriteSheet : record.spriteSheet === spriteSheet
    ));
    data[key] = [...current, ...defaults.filter(record => !current.some(existing => existing.id === record.id))];
  }
}

function defaultPlayerAnimation(data: GBAProjectData, spriteSheet: string): {
  animationName: string;
  animationStateID?: string;
} {
  const animations = projectRecords(data, "animations");
  const states = projectRecords(data, "animationStates");
  const state = states.find((candidate) => candidate.spriteSheet === spriteSheet);
  const animationIDs = state && Array.isArray(state.animationIDs)
    ? state.animationIDs.filter((value): value is string => typeof value === "string")
    : [];
  const animation = animationIDs
    .map((id) => animations.find((candidate) => candidate.id === id))
    .find(Boolean)
    ?? animations.find((candidate) => candidate.spriteSheet === spriteSheet);
  return {
    animationName: animation && typeof animation.name === "string" ? animation.name : "",
    ...(state && typeof state.id === "string" ? { animationStateID: state.id } : {})
  };
}

function addDefaultControlledEntityToRoom(
  data: GBAProjectData,
  room: Record<string, unknown>,
  options: { refreshExistingDefault?: boolean; preservePosition?: boolean } = {}
): void {
  const sceneType = stringField(room.sceneType, "topdown");
  const contract = resolveSceneControlledEntityContract(sceneType, room.runtime, data.settings);
  if (!contract.required) return;
  const isWorldMapMarker = contract.role === "marker";
  const configuredPlayerName = stringField(room.playerActorName, "");
  const actorName = isWorldMapMarker
    ? "World Map Marker"
    : configuredPlayerName || "Player";

  const roomNameValue = stringField(room.name, "");
  const actors = projectRecords(data, "actors");
  const existingControlledEntity = actors.find((actor) => (
    actor.roomName === roomNameValue && (
      isWorldMapMarker
        ? stringField(actor.worldMapRole, "") === "marker"
        : actor.name === actorName
    )
  ));
  if (existingControlledEntity) {
    if (!isWorldMapMarker) {
      if (!configuredPlayerName) room.playerActorName = actorName;
      if (options.refreshExistingDefault) {
        const settings = isRecord(data.settings) ? data.settings : {};
        const sceneTypes = isRecord(settings.sceneTypes) ? settings.sceneTypes : {};
        const configuredDefaults = isRecord(sceneTypes.defaultPlayerSprites)
          ? Object.values(sceneTypes.defaultPlayerSprites).filter((value): value is string => typeof value === "string")
          : [];
        const currentSprite = stringField(existingControlledEntity.spriteSheet, "");
        if (!currentSprite || configuredDefaults.includes(currentSprite)) {
          const spriteSheet = defaultPlayerSpriteForScene(data, sceneType, room);
          if (spriteSheet) {
            if (usesBlankPlayerDefaults(data)) ensureDefaultControlledEntityContent(data, spriteSheet);
            const animation = defaultPlayerAnimation(data, spriteSheet);
            const width = positiveInteger(room.width, GBA_MIN_SCENE_WIDTH_TILES);
            const height = positiveInteger(room.height, GBA_MIN_SCENE_HEIGHT_TILES);
            const position = defaultSceneActorPosition(sceneType, width, height);
            existingControlledEntity.spriteSheet = spriteSheet;
            if (!options.preservePosition) {
              existingControlledEntity.x = usesBlankPlayerDefaults(data) ? Math.floor(width / 2) : position.x;
              existingControlledEntity.y = usesBlankPlayerDefaults(data) ? Math.floor(height / 2) : position.y;
            }
            if (sceneType === "isometric" && !options.preservePosition) {
              existingControlledEntity.x = clampInteger(position.x, 0, width - 1);
              existingControlledEntity.y = clampInteger(position.y, 0, height - 1);
              snapIsometricActorToSupportHeight(room, existingControlledEntity);
            }
            if (animation.animationStateID) existingControlledEntity.animationStateID = animation.animationStateID;
            if (animation.animationName) existingControlledEntity.animationName = animation.animationName;
            if (usesBlankPlayerDefaults(data) && sceneType === "luta") {
              existingControlledEntity.battle = { ...(isRecord(existingControlledEntity.battle) ? existingControlledEntity.battle : {}), side: "player1" };
              if (!existingControlledEntity.lutaAnimations) existingControlledEntity.lutaAnimations = defaultLutaPlayerAnimations(data, spriteSheet);
            }
          }
        }
      }
    }
    return;
  }

  const spriteSheet = defaultPlayerSpriteForScene(data, sceneType, room);
  if (!spriteSheet) return;
  if (usesBlankPlayerDefaults(data) || sceneType === "isometric" && spriteSheet === defaultPlayerSpriteForSceneType("isometric")) {
    ensureDefaultControlledEntityContent(data, spriteSheet);
  }

  const width = positiveInteger(room.width, GBA_MIN_SCENE_WIDTH_TILES);
  const height = positiveInteger(room.height, GBA_MIN_SCENE_HEIGHT_TILES);
  const backgroundPosition = defaultBackgroundActorPosition(data, room);
  const position = backgroundPosition ?? defaultSceneActorPosition(sceneType, width, height);
  const animation = defaultPlayerAnimation(data, spriteSheet);
  const roomIDValue = stringField(room.id, roomNameValue)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const actor: Record<string, unknown> = {
    id: `actor-${isWorldMapMarker ? "world-map-marker" : "player"}-${roomIDValue || "scene"}`,
    name: actorName,
    roomName: roomNameValue,
    spriteSheet,
    x: backgroundPosition?.x ?? (usesBlankPlayerDefaults(data) ? Math.floor(width / 2) : sceneType === "isometric" ? clampInteger(position.x, 0, width - 1) : position.x),
    y: backgroundPosition?.y ?? (usesBlankPlayerDefaults(data) ? Math.floor(height / 2) : sceneType === "isometric" ? clampInteger(position.y, 0, height - 1) : position.y),
    eventBindings: {},
    ...(isWorldMapMarker ? { worldMapRole: "marker" } : {}),
    ...(animation.animationStateID ? { animationStateID: animation.animationStateID } : {}),
    ...(animation.animationName ? { animationName: animation.animationName } : {}),
    ...(usesBlankPlayerDefaults(data) && sceneType === "luta" ? {
      battle: { side: "player1" }, lutaAnimations: defaultLutaPlayerAnimations(data, spriteSheet)
    } : {})
  };
  snapIsometricActorToSupportHeight(room, actor);
  data.actors = [...(Array.isArray(data.actors) ? data.actors : []), actor];
  if (!isWorldMapMarker) room.playerActorName = actorName;
}

function defaultLutaPlayerAnimations(data: GBAProjectData, spriteSheet: string): Record<string, string> {
  const bindings: Record<string, string> = { fallback: "idle_animation" };
  for (const state of ["idle", "attack", "hurt"]) {
    const animation = projectRecords(data, "animations").find(animation => (
      animation.spriteSheet === spriteSheet && animation.state === state && animation.direction === "right"
    ));
    if (typeof animation?.name === "string") bindings[state] = animation.name;
  }
  return bindings;
}

function applyApprovedIsometricPreset(data: GBAProjectData, room: Record<string, unknown>, presetID?: RoomPresetID): void {
  if (presetID !== "isometricAdventure" && presetID !== "isometricTactical") return;
  const template = buildProjectFromTemplate("exemplo-gba", {name: "Isometric preset"});
  const sourceName = presetID === "isometricAdventure" ? "mercado_suspenso" : "arena_tatica";
  const source = projectRooms(template).find(candidate => candidate.name === sourceName);
  if (!source) return;
  // Reuse approved pixels together with their authored geometry. Story events
  // and campaign state belong to the example, rather than the new scene.
  for (const key of ["width", "height", "backgroundAssetName", "tilesetAssetName", "gbStudioUseBackgroundLayout",
    "backgroundRenderMode", "cameraMode", "cameraZoom", "cameraBounds", "parallax", "tilemap", "tileLayers",
    "heightLevels", "collisionTypes", "rampFlags", "runtime", "paletteFamilyID", "paletteBankPolicy"]) {
    if (source[key] !== undefined) room[key] = cloneProjectData(source[key]);
  }
  const sourceActors = projectRecords(template, "actors").filter(actor => actor.roomName === sourceName)
    .slice(0, presetID === "isometricAdventure" ? 1 : 2);
  const currentActors = projectRecords(data, "actors");
  const actorIDs = new Map<unknown, string>();
  const actors = sourceActors.map((sourceActor, index) => {
    let id = `actor-${index === 0 ? "player" : "enemy"}-${String(room.id)}`;
    while (currentActors.some(actor => actor.id === id)) id += "-2";
    actorIDs.set(sourceActor.id, id);
    const actor = cloneProjectData(sourceActor);
    actor.id = id;
    actor.name = index === 0 ? "Player" : "Enemy";
    actor.roomName = room.name;
    actor.eventBindings = {};
    delete actor.eventName;
    delete actor.interactionEvent;
    delete actor.initEvent;
    delete actor.onStart;
    delete actor.onUpdate;
    return actor;
  });
  room.playerActorName = "Player";
  const runtime = isRecord(room.runtime) ? room.runtime : {};
  const config = isRecord(runtime.config) ? runtime.config : {};
  const presentation = isRecord(config.tacticalPresentation) ? config.tacticalPresentation : {};
  if (Array.isArray(presentation.units)) presentation.units = presentation.units.map(unit => (
    isRecord(unit) ? {...unit, actorId: actorIDs.get(unit.actorId) ?? unit.actorId} : unit
  ));
  const sprites = new Set(actors.map(actor => actor.spriteSheet));
  const animations = projectRecords(template, "animations").filter(animation => sprites.has(animation.spriteSheet));
  const states = projectRecords(template, "animationStates").filter(state => sprites.has(state.spriteSheet));
  const references = JSON.stringify({room, actors, animations});
  const assets = projectRecords(template, "assets").filter(asset => typeof asset.name === "string" && references.includes(JSON.stringify(asset.name)));
  const audio = projectRecords(template, "audioItems").filter(item => typeof item.name === "string" && references.includes(JSON.stringify(item.name)));
  for (const [key, records] of [["assets", assets], ["animations", animations], ["animationStates", states], ["audioItems", audio]] as const) {
    const current = projectRecords(data, key);
    data[key] = [...current, ...records.filter(record => !current.some(existing => (
      existing.id === record.id || key === "assets" && existing.name === record.name
    )))];
  }
  data.actors = [...currentActors, ...actors];
}

export function createRoomInProject(data: GBAProjectData, options: CreateRoomOptions): GBAProjectData {
  const neutralPlayers = usesBlankPlayerDefaults(data);
  const room = makeRoom(options, neutralPlayers);
  if (!room) return data;

  const next = cloneProjectData(data);
  if (neutralPlayers && room.sceneType === "battleRpg") {
    const runtime = isRecord(room.runtime) ? room.runtime : {};
    room.runtime = {...runtime, type:"battleRpg", config:{...(isRecord(runtime.config)?runtime.config:{}),maxPartySize:4}};
  }
  if (!neutralPlayers) applyApprovedIsometricPreset(next, room, options.presetID);
  const hudSceneKey = room.sceneType === "isometric" && isometricSceneConfigFromRuntime(room.runtime)?.gameplayMode === "tactical"
    ? "isometricTactical" : String(room.sceneType);
  const defaultHud = neutralPlayers ? BLANK_SCENE_HUD_IDS[hudSceneKey] : undefined;
  if (defaultHud && projectRecords(next.settings as GBAProjectData, "hudPresets").some(p => p.id === defaultHud)) {
    room.hudPresetId = defaultHud;
    if (room.sceneType === "menu") {
      const runtime = isRecord(room.runtime) ? room.runtime : {};
      room.runtime = {...runtime,config:{...defaultMenuSceneConfig("menu"),...(isRecord(runtime.config)?runtime.config:{}),hudListRows:3,presentationMode:"hud"}};
    }
    if (room.sceneType === "shmup") {
      const runtime = isRecord(room.runtime) ? room.runtime : {};
      const config = isRecord(runtime.config) ? runtime.config : {};
      room.runtime = { ...runtime, type: "shmup", config: { ...config, modules: [
        { id: "score", enabled: true, settings: { initialScore: 0, initialLives: 3, pointsPerEnemy: 100, persistHighScore: false } }
      ] } };
    }
  }
  if (room.sceneType === "isometric" && room.backgroundAssetName === DEFAULT_ISOMETRIC_TILESET_NAME) {
    ensureDefaultIsometricTilesetAsset(next);
  }
  const rooms = projectRooms(next);
  const nextName = roomName(room, rooms.length);
  if (rooms.some((item, index) => roomID(item, index) === room.id)) {
    return data;
  }
  if (rooms.some((item, index) => roomName(item, index) === nextName)) {
    return data;
  }

  if (defaultBackgroundForRoom(next, room)) applyDefaultRoomBackground(next, room);
  addDefaultControlledEntityToRoom(next, room);
  ensureIsometricTacticalPair(next, room);
  setProjectRooms(next, [...rooms, room]);
  const nextRooms = projectRooms(next);
  setSceneMapPosition(
    next,
    roomName(room, rooms.length),
    nextFreeSceneMapPosition(next, nextRooms, room, options.anchorRoomID ? { anchorRoomID: options.anchorRoomID } : undefined)
  );
  if (rooms.length === 0) {
    next.scena = cloneProjectData(room);
    setStartScene(next, stringField(room.name, "Room 1"));
  }

  return next;
}

export function duplicateRoomInProject(data: GBAProjectData, options: DuplicateRoomOptions): GBAProjectData {
  const newRoomID = options.newRoomID.trim();
  const newName = options.newName.trim();
  if (!newRoomID || !newName || newRoomID === options.sourceRoomID) {
    return data;
  }

  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const source = rooms.find((room, index) => roomID(room, index) === options.sourceRoomID);
  if (!source || rooms.some((room, index) => roomID(room, index) === newRoomID)) {
    return data;
  }

  const duplicatedRoom = {
    ...cloneProjectData(source),
    id: newRoomID,
    name: newName
  };
  setProjectRooms(next, [
    ...rooms,
    duplicatedRoom
  ]);
  setSceneMapPosition(next, newName, nextFreeSceneMapPosition(next, projectRooms(next), duplicatedRoom, {
    anchorRoomID: options.sourceRoomID
  }));
  return next;
}

export function setActiveRoomInProject(data: GBAProjectData, roomIDToOpen: string): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const room = rooms.find((item, index) => roomID(item, index) === roomIDToOpen);
  if (!room) return data;

  const activeRoom = cloneProjectData(room);
  next.scena = activeRoom;
  delete next.room;

  return next;
}

export function updateRoomFieldsInProject(data: GBAProjectData, roomIDToUpdate: string, fields: UpdateRoomFields): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  const config = room.sceneType === "isometric" ? isometricSceneConfigFromRuntime(room.runtime) : null;
  const compositionMode = config?.pagedSurface ? "adventure" : config?.tacticalPresentation?.surfacePages?.length ? "tactical" : null;
  const requestedMode = fields.sceneType ? isometricGameplayModeForSceneTypeChoice(fields.sceneType)
    : fields.runtime?.type === "isometric" ? isometricSceneConfigFromRuntime(fields.runtime)?.gameplayMode : undefined;
  if (compositionMode && requestedMode && compositionMode !== requestedMode) return data;
  const previousSceneType = room.sceneType;
  const previousDefaultBackground = defaultBackgroundForRoom(next, room);
  const followsDefaultBackground = previousDefaultBackground !== "" && room.backgroundAssetName === previousDefaultBackground;
  const previousRacingPresentation = isRecord(room.runtime) && isRecord(room.runtime.config) ? room.runtime.config.presentation : undefined;
  applyRoomFields(room, fields, usesBlankPlayerDefaults(next));
  const changesDefaultBackground = followsDefaultBackground && fields.backgroundAssetName === undefined
    && (fields.runtime !== undefined || fields.sceneType !== undefined)
    && previousDefaultBackground !== defaultBackgroundForRoom(next, room);
  if (changesDefaultBackground) applyDefaultRoomBackground(next, room);
  if (fields.runtime !== undefined || fields.sceneType !== undefined) {
    const keepsIsometricActors = previousSceneType === "isometric" && room.sceneType === "isometric"
      && projectRecords(next, "actors").some(actor => actor.roomName === room.name);
    const neutralModeChange = usesBlankPlayerDefaults(next) && previousSceneType === "isometric" && room.sceneType === "isometric"
      && config?.gameplayMode !== isometricSceneConfigFromRuntime(room.runtime)?.gameplayMode;
    const racingModeChange = usesBlankPlayerDefaults(next) && previousSceneType === "racing" && room.sceneType === "racing"
      && previousRacingPresentation !== (isRecord(room.runtime) && isRecord(room.runtime.config) ? room.runtime.config.presentation : undefined);
    if (!keepsIsometricActors || neutralModeChange) addDefaultControlledEntityToRoom(next, room, {
      refreshExistingDefault: previousSceneType !== room.sceneType || neutralModeChange || racingModeChange,
      preservePosition: neutralModeChange || racingModeChange
    });
    ensureIsometricTacticalPair(next, room);
  }
  if (room.sceneType === "isometric" && room.backgroundAssetName === DEFAULT_ISOMETRIC_TILESET_NAME) {
    ensureDefaultIsometricTilesetAsset(next);
  }
  setProjectRooms(next, rooms);
  syncActiveRoomFields(next, room, roomIndex, fields);
  if (changesDefaultBackground && roomMatchesKnownRoom(next.scena, room, roomIndex)) {
    next.scena = cloneProjectData(room);
  }
  if ((fields.runtime !== undefined || fields.sceneType !== undefined) && roomMatchesKnownRoom(next.scena, room, roomIndex)) {
    next.scena.runtime = cloneProjectData(room.runtime);
    if (room.playerActorName !== undefined) next.scena.playerActorName = room.playerActorName;
  }
  return next;
}

export function updateRoomBackgroundTilesetGridInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  fields: UpdateRoomBackgroundTilesetGridFields
): GBAProjectData {
  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const background = roomBackgroundAssetName(rooms[roomIndex]);
  if (!background) return data;

  const assets = projectRecords(data, "assets");
  const assetIndex = assets.findIndex((asset) => nullableString(asset.name) === background && isBackgroundAssetKind(nullableString(asset.kind)));
  if (assetIndex < 0) return data;

  const next = cloneProjectData(data);
  const nextAssets = projectRecords(next, "assets");
  const asset = nextAssets[assetIndex];
  if (!asset) return data;

  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  asset.metadata = metadata;
  if (fields.tileWidth !== undefined) metadata.tileWidth = positiveInteger(fields.tileWidth, positiveInteger(metadata.tileWidth, 8));
  if (fields.tileHeight !== undefined) metadata.tileHeight = positiveInteger(fields.tileHeight, positiveInteger(metadata.tileHeight, 8));
  if (fields.tileOffsetX !== undefined) metadata.tileOffsetX = nonNegativeInteger(fields.tileOffsetX, nonNegativeInteger(metadata.tileOffsetX, 0));
  if (fields.tileOffsetY !== undefined) metadata.tileOffsetY = nonNegativeInteger(fields.tileOffsetY, nonNegativeInteger(metadata.tileOffsetY, 0));
  next.assets = nextAssets;
  return next;
}

export function toggleRoomCollisionCellInProject(data: GBAProjectData, roomIDToUpdate: string, cellIndex: number): GBAProjectData {
  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const totalTiles = roomTileCount(width, height);
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalTiles) {
    return data;
  }

  const types = collisionTypes(room, width, height);
  const currentType = types[cellIndex];
  const nextType: RoomCollisionType = isBlockedCollisionType(currentType) ? "free" : "solid";
  return setRoomCollisionTypeInProject(data, roomIDToUpdate, cellIndex, nextType);
}

function roomCollisionFillAnchors(
  width: number,
  height: number,
  startCellIndex: number,
  types: readonly RoomCollisionType[],
  contract: SceneTilemapContract | null
): number[] {
  const blockWidth = contract?.metatileWidth ?? 1;
  const blockHeight = contract?.metatileHeight ?? 1;
  const logicalWidth = Math.ceil(width / blockWidth);
  const logicalHeight = Math.ceil(height / blockHeight);
  const startX = startCellIndex % width;
  const startY = Math.floor(startCellIndex / width);
  const startBlockX = Math.floor(startX / blockWidth);
  const startBlockY = Math.floor(startY / blockHeight);
  const startAnchor = startBlockY * blockHeight * width + startBlockX * blockWidth;
  const startIndexes = sceneTilemapCellIndexesForCell(width, height, startAnchor, contract);
  const targetType = normalizeRoomCollisionType(types[startIndexes[0]], "free");
  const pending = [[startBlockX, startBlockY] as const];
  const visited = new Set<string>();
  const anchors: number[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const [blockX, blockY] = current;
    if (blockX < 0 || blockY < 0 || blockX >= logicalWidth || blockY >= logicalHeight) continue;
    const key = `${blockX}:${blockY}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const anchor = blockY * blockHeight * width + blockX * blockWidth;
    const cellIndexes = sceneTilemapCellIndexesForCell(width, height, anchor, contract);
    const cellType = normalizeRoomCollisionType(types[cellIndexes[0]], "free");
    if (cellType !== targetType) continue;
    anchors.push(anchor);
    pending.push(
      [blockX - 1, blockY],
      [blockX + 1, blockY],
      [blockX, blockY - 1],
      [blockX, blockY + 1]
    );
  }

  return anchors;
}

export function applyRoomCollisionFillInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  startCellIndex: number,
  collisionType: RoomCollisionType
): GBAProjectData {
  if (!isRoomCollisionType(collisionType)) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const totalTiles = roomTileCount(width, height);
  if (!Number.isInteger(startCellIndex) || startCellIndex < 0 || startCellIndex >= totalTiles) {
    return data;
  }

  const types = collisionTypes(room, width, height);
  const contract = resolveSceneTilemapContract(stringField(room.sceneType, "topdown"), width, height);
  const targetIndexes = new Set<number>();
  for (const anchor of roomCollisionFillAnchors(width, height, startCellIndex, types, contract)) {
    sceneTilemapCellIndexesForCell(width, height, anchor, contract).forEach((index) => targetIndexes.add(index));
  }
  if (targetIndexes.size === 0 || [...targetIndexes].every((index) => types[index] === collisionType)) {
    return data;
  }

  const next = cloneProjectData(data);
  const nextRooms = projectRooms(next);
  const nextRoom = nextRooms[roomIndex];
  if (!nextRoom) return data;
  const nextTypes = collisionTypes(nextRoom, width, height);
  targetIndexes.forEach((index) => {
    nextTypes[index] = collisionType;
  });
  nextRoom.collisionTypes = nextTypes;
  setProjectRooms(next, nextRooms);
  syncActiveRoomCollision(next, nextRoom, roomIndex);
  return next;
}

export function setRoomCollisionTypeInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  cellIndex: number,
  collisionType: RoomCollisionType
): GBAProjectData {
  if (!isRoomCollisionType(collisionType)) return data;

  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const totalTiles = roomTileCount(width, height);
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalTiles) {
    return data;
  }

  const types = collisionTypes(room, width, height);
  const tilemapContract = resolveSceneTilemapContract(
    typeof room.sceneType === "string" ? room.sceneType : null,
    width,
    height
  );
  const targetIndexes = sceneTilemapCellIndexesForCell(width, height, cellIndex, tilemapContract);
  if (targetIndexes.every((index) => types[index] === collisionType)) return data;

  targetIndexes.forEach((index) => {
    types[index] = collisionType;
  });
  room.collisionTypes = types;
  setProjectRooms(next, rooms);
  syncActiveRoomCollision(next, room, roomIndex);
  return next;
}

export function setRoomCollisionCellInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  cellIndex: number,
  blocked: boolean
): GBAProjectData {
  if (typeof blocked !== "boolean") return data;
  return setRoomCollisionTypeInProject(data, roomIDToUpdate, cellIndex, blocked ? "solid" : "free");
}

export function setRoomHeightLevelInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  cellIndex: number,
  heightLevel: number
): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  if (stringField(room.sceneType, "topdown") !== "isometric") return data;
  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const totalTiles = roomTileCount(width, height);
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalTiles || !Number.isFinite(heightLevel)) {
    return data;
  }

  const levels = roomHeightLevels(room, width, height);
  const nextLevel = clampInteger(heightLevel, 0, 3);
  if (levels[cellIndex] === nextLevel && Array.isArray(room.heightLevels)) return data;
  levels[cellIndex] = nextLevel;
  room.heightLevels = levels;
  const name = roomName(room, roomIndex);
  for (const actor of projectRecords(next, "actors")) {
    const x = integerField(actor.x, integerField(isRecord(actor.position) ? actor.position.x : undefined, 0));
    const y = integerField(actor.y, integerField(isRecord(actor.position) ? actor.position.y : undefined, 0));
    if (entityRoomName(actor, rooms) === name && x >= 0 && x < width && y >= 0 && y < height && y * width + x === cellIndex) {
      snapIsometricActorToSupportHeight(room, actor);
    }
  }
  setProjectRooms(next, rooms);
  if (roomMatchesKnownRoom(next.scena, room, roomIndex)) {
    next.scena.heightLevels = cloneProjectData(levels);
  }
  delete next.room;
  return next;
}

export function setRoomTileCellInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  cellIndex: number,
  tileID: number
): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const totalTiles = roomTileCount(width, height);
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalTiles || !Number.isFinite(tileID)) {
    return data;
  }

  if (applyLayeredTileEdit(next, room, {
    cellIndex,
    layerMapping: activeTileLayerMappingFromProject(next),
    tileID,
    tool: "brush"
  })) {
    setProjectRooms(next, rooms);
    syncActiveRoomTilemap(next, room, roomIndex);
    return next;
  }

  const cells = tileCells(room, width, height);
  cells[cellIndex] = Math.max(0, Math.floor(tileID));
  room.tilemap = cells;
  setProjectRooms(next, rooms);
  syncActiveRoomTilemap(next, room, roomIndex);
  return next;
}

export function applyRoomTileBrushInProject(
  data: GBAProjectData,
  roomIDToUpdate: string,
  options: RoomTileBrushOptions
): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToUpdate);
  if (roomIndex < 0) return data;

  const room = rooms[roomIndex];
  const width = positiveInteger(room.width, 1);
  const height = positiveInteger(room.height, 1);
  const totalTiles = roomTileCount(width, height);
  const { cellIndex, tool } = options;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalTiles) {
    return data;
  }

  if (tool !== "eraser" && !Number.isFinite(options.tileID)) {
    return data;
  }

  const nextTileID = tool === "eraser" ? 0 : Math.max(0, Math.floor(options.tileID));
  const stampWidth = positiveInteger(options.stamp?.width, 1);
  const stampHeight = positiveInteger(options.stamp?.height, 1);
  const stampTileIDs = options.stamp?.tileIDs.slice(0, stampWidth * stampHeight)
    .map((tileID) => Math.max(0, Math.floor(tileID))) ?? [nextTileID];
  const hasValidStamp = tool === "brush"
    && stampTileIDs.length === stampWidth * stampHeight
    && stampTileIDs.every(Number.isFinite);
  const layeredOptions: RoomTileBrushOptions = {
    ...options,
    layerMapping: options.layerMapping ?? activeTileLayerMappingFromProject(next),
    tileID: tool === "eraser" ? 0 : options.tileID
  };
  if (hasValidStamp) {
    const anchorX = cellIndex % width;
    const anchorY = Math.floor(cellIndex / width);
    let appliedToLayer = false;

    for (let stampY = 0; stampY < stampHeight; stampY += 1) {
      for (let stampX = 0; stampX < stampWidth; stampX += 1) {
        const targetX = anchorX + stampX;
        const targetY = anchorY + stampY;
        if (targetX >= width || targetY >= height) continue;
        appliedToLayer = applyLayeredTileEdit(next, room, {
          ...layeredOptions,
          cellIndex: targetY * width + targetX,
          stamp: undefined,
          tileID: stampTileIDs[stampY * stampWidth + stampX] ?? nextTileID,
          tool: "brush"
        }) || appliedToLayer;
      }
    }

    if (appliedToLayer) {
      setProjectRooms(next, rooms);
      syncActiveRoomTilemap(next, room, roomIndex);
      return next;
    }

    const cells = tileCells(room, width, height);
    for (let stampY = 0; stampY < stampHeight; stampY += 1) {
      for (let stampX = 0; stampX < stampWidth; stampX += 1) {
        const targetX = anchorX + stampX;
        const targetY = anchorY + stampY;
        if (targetX >= width || targetY >= height) continue;
        cells[targetY * width + targetX] = stampTileIDs[stampY * stampWidth + stampX] ?? nextTileID;
      }
    }
    room.tilemap = cells;
    setProjectRooms(next, rooms);
    syncActiveRoomTilemap(next, room, roomIndex);
    return next;
  }
  if (applyLayeredTileEdit(next, room, {
    ...layeredOptions,
    tileID: tool === "eraser" ? 0 : layeredOptions.tileID,
    tool
  })) {
    setProjectRooms(next, rooms);
    syncActiveRoomTilemap(next, room, roomIndex);
    return next;
  }

  const cells = tileCells(room, width, height);
  room.tilemap = tool === "fill"
    ? filledTileCells(cells, width, cellIndex, nextTileID)
    : cells.map((tileID, index) => (index === cellIndex ? nextTileID : tileID));
  setProjectRooms(next, rooms);
  syncActiveRoomTilemap(next, room, roomIndex);
  return next;
}

export function renameRoomInProject(data: GBAProjectData, roomIDToRename: string, nextName: string): GBAProjectData {
  const trimmedName = nextName.trim();
  if (!trimmedName) return data;

  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToRename);
  if (roomIndex < 0) return data;

  const oldName = roomName(rooms[roomIndex], roomIndex);
  if (oldName === trimmedName) return data;

  rooms[roomIndex].name = trimmedName;
  setProjectRooms(next, rooms);
  renameActiveRoom(next, roomIDToRename, oldName, trimmedName);
  renameStartScene(next, oldName, trimmedName);
  renameCampaignReferences(next, oldName, trimmedName);
  renameSceneConnections(next, oldName, trimmedName);
  renameSceneMapPosition(next, oldName, trimmedName);
  renameChangeSceneCommands(next, oldName, trimmedName);
  renameSceneRouteTableReferences(next, oldName, trimmedName);
  renameSceneScopedRecords(next, oldName, trimmedName);
  return next;
}

export function removeRoomFromProject(data: GBAProjectData, roomIDToRemove: string): GBAProjectData {
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === roomIDToRemove);
  if (roomIndex < 0) return data;

  const removedName = roomName(rooms[roomIndex], roomIndex);
  const remainingRooms = rooms.filter((_, index) => index !== roomIndex);
  setProjectRooms(next, remainingRooms);
  retargetActiveRoomAfterRemoval(next, roomIDToRemove, removedName, remainingRooms);
  retargetStartSceneAfterRemoval(next, removedName, remainingRooms[0] ? roomName(remainingRooms[0], 0) : null);
  pruneSceneConnections(next, removedName);
  pruneSceneMapPosition(next, removedName);
  return next;
}

export function createRoomConnectionInProject(data: GBAProjectData, options: CreateRoomConnectionOptions): GBAProjectData {
  const from = options.from.trim();
  const to = options.to.trim();
  const eventName = options.eventName?.trim() ?? "";
  if (!from || !to || from === to) return data;

  const rooms = projectRooms(data);
  const names = roomNameSet(data);
  if (!names.has(from) || !names.has(to)) return data;

  const fromRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === from);
  const toRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === to);
  if (fromRoomIndex < 0 || toRoomIndex < 0) return data;

  const fromRoom = rooms[fromRoomIndex];
  const toRoom = rooms[toRoomIndex];
  const fromWidth = positiveInteger(fromRoom.width, 1);
  const fromHeight = positiveInteger(fromRoom.height, 1);
  const toWidth = positiveInteger(toRoom.width, 1);
  const toHeight = positiveInteger(toRoom.height, 1);

  const existingConnections = sceneConnections(data);
  const duplicate = existingConnections.some((connection) => {
    return connection.from === from &&
      connection.to === to &&
      (nullableString(connection.eventName) ?? "") === eventName;
  });
  if (duplicate) return data;

  const next = cloneProjectData(data);
  const state = ensureEditorState(next);
  const currentConnections = sceneConnections(next);
  const connectionRecord: Record<string, unknown> = {
    from,
    to,
    exit: roomConnectionAreaRecord(defaultRoomConnectionExitArea(fromWidth, fromHeight)),
    entry: roomConnectionAreaRecord(defaultRoomConnectionEntryArea(toWidth, toHeight))
  };
  if (eventName) connectionRecord.eventName = eventName;
  state.scenaConnections = [
    ...currentConnections,
    connectionRecord
  ];
  return next;
}

export function createRoomWarpConnectionInProject(
  data: GBAProjectData,
  options: CreateRoomWarpConnectionOptions
): GBAProjectData {
  const from = options.from.trim();
  const to = options.to.trim();
  const eventName = options.eventName?.trim() ?? "";
  if (!from || !to || from === to || (options.side !== "exit" && options.side !== "entry")) return data;

  const rooms = projectRooms(data);
  const names = roomNameSet(data);
  if (!names.has(from) || !names.has(to)) return data;

  const fromRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === from);
  const toRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === to);
  if (fromRoomIndex < 0 || toRoomIndex < 0) return data;

  const fromRoom = rooms[fromRoomIndex];
  const toRoom = rooms[toRoomIndex];
  const fromWidth = positiveInteger(fromRoom.width, 1);
  const fromHeight = positiveInteger(fromRoom.height, 1);
  const toWidth = positiveInteger(toRoom.width, 1);
  const toHeight = positiveInteger(toRoom.height, 1);
  const next = cloneProjectData(data);
  const state = ensureEditorState(next);
  const currentConnections = sceneConnections(next);
  const connectionRecord: Record<string, unknown> = {
    from,
    to,
    exit: roomConnectionAreaRecord(defaultRoomConnectionExitArea(fromWidth, fromHeight)),
    entry: roomConnectionAreaRecord(defaultRoomConnectionEntryArea(toWidth, toHeight))
  };
  if (eventName) connectionRecord.eventName = eventName;
  connectionRecord[options.side] = roomConnectionAreaRecord(
    normalizeRoomConnectionArea(
      options.area,
      options.side === "exit" ? fromWidth : toWidth,
      options.side === "exit" ? fromHeight : toHeight
    )
  );
  state.scenaConnections = [...currentConnections, connectionRecord];
  return next;
}

export function updateRoomConnectionInProject(
  data: GBAProjectData,
  connectionIndex: number,
  fields: UpdateRoomConnectionFields
): GBAProjectData {
  if (!Number.isInteger(connectionIndex) || connectionIndex < 0) return data;

  const connections = sceneConnections(data);
  if (connectionIndex >= connections.length) return data;

  const connection = connections[connectionIndex];
  const from = nullableString(connection.from);
  const to = nullableString(connection.to);
  if (!from || !to) return data;

  const rooms = projectRooms(data);
  const fromRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === from);
  const toRoomIndex = rooms.findIndex((room, index) => roomName(room, index) === to);
  if (fromRoomIndex < 0 || toRoomIndex < 0) return data;

  const fromRoom = rooms[fromRoomIndex];
  const toRoom = rooms[toRoomIndex];
  const fromWidth = positiveInteger(fromRoom.width, 1);
  const fromHeight = positiveInteger(fromRoom.height, 1);
  const toWidth = positiveInteger(toRoom.width, 1);
  const toHeight = positiveInteger(toRoom.height, 1);

  const next = cloneProjectData(data);
  const state = projectEditorState(next);
  if (!state || !Array.isArray(state.scenaConnections)) return data;

  const nextConnection = state.scenaConnections[connectionIndex];
  if (!isRecord(nextConnection)) return data;

  if (fields.eventName !== undefined) {
    const trimmed = fields.eventName.trim();
    if (trimmed) nextConnection.eventName = trimmed;
    else delete nextConnection.eventName;
  }

  if (fields.exit !== undefined) {
    if (fields.exit === null) delete nextConnection.exit;
    else {
      nextConnection.exit = roomConnectionAreaRecord(
        normalizeRoomConnectionArea(fields.exit, fromWidth, fromHeight)
      );
    }
  }

  if (fields.entry !== undefined) {
    if (fields.entry === null) delete nextConnection.entry;
    else {
      nextConnection.entry = roomConnectionAreaRecord(
        normalizeRoomConnectionArea(fields.entry, toWidth, toHeight)
      );
    }
  }

  if (fields.transition !== undefined) {
    if (fields.transition === null) delete nextConnection.transition;
    else nextConnection.transition = normalizeSceneTransition({
      ...normalizeSceneTransition(nextConnection.transition),
      ...fields.transition
    });
  }

  return next;
}

export function removeRoomConnectionFromProject(data: GBAProjectData, connectionIndex: number): GBAProjectData {
  if (!Number.isInteger(connectionIndex) || connectionIndex < 0) return data;

  const connections = sceneConnections(data);
  if (connectionIndex >= connections.length) return data;

  const next = cloneProjectData(data);
  const state = projectEditorState(next);
  if (!state || !Array.isArray(state.scenaConnections)) return data;

  state.scenaConnections = state.scenaConnections.filter((connection, index) => {
    return !isRecord(connection) || index !== connectionIndex;
  });
  return next;
}

export function updateRoomEntityInProject(
  data: GBAProjectData,
  kind: RoomsWorkspaceEntityKind,
  entityID: string,
  fields: UpdateRoomEntityFields
): GBAProjectData {
  const collectionKey = kind === "actor" ? "actors" : "triggers";
  const entities = projectRecords(data, collectionKey);
  const entityIndex = entities.findIndex((entity, index) => (nullableString(entity.id) ?? `${kind}-${index + 1}`) === entityID);
  if (entityIndex < 0) return data;

  if (fields.roomName !== undefined) {
    const roomNames = roomNameSet(data);
    if (!roomNames.has(fields.roomName.trim())) return data;
  }

  const next = cloneProjectData(data);
  const nextEntities = projectRecords(next, collectionKey);
  const entity = nextEntities[entityIndex];
  if (!entity) return data;

  if (fields.roomName !== undefined) entity.roomName = fields.roomName.trim();
  if (fields.x !== undefined && Number.isFinite(fields.x)) entity.x = Math.floor(fields.x);
  if (fields.y !== undefined && Number.isFinite(fields.y)) entity.y = Math.floor(fields.y);
  if (fields.eventName !== undefined) entity.eventName = fields.eventName.trim();
  if (fields.eventBindings !== undefined) {
    const eventBindings = isRecord(entity.eventBindings) ? { ...entity.eventBindings } : {};
    for (const [key, value] of Object.entries(fields.eventBindings)) {
      if (typeof value === "string" && value.trim()) eventBindings[key] = value.trim();
      else delete eventBindings[key];
    }
    entity.eventBindings = eventBindings;
  }
  if (kind === "actor") {
    if (fields.x !== undefined || fields.y !== undefined || fields.roomName !== undefined) {
      const rooms = projectRooms(next);
      const name = entityRoomName(entity, rooms);
      const room = rooms.find((candidate, index) => roomName(candidate, index) === name);
      if (room) snapIsometricActorToSupportHeight(room, entity);
    }
    if (fields.width !== undefined) entity.width = positiveInteger(fields.width, positiveInteger(entity.width, 1));
    if (fields.height !== undefined) entity.height = positiveInteger(fields.height, positiveInteger(entity.height, 1));
    if (fields.spriteSheet !== undefined) entity.spriteSheet = fields.spriteSheet.trim();
    if (fields.animationName !== undefined) entity.animationName = fields.animationName.trim();
    if (fields.animationStateID !== undefined) entity.animationStateID = fields.animationStateID.trim();
    if (fields.collisionGroup !== undefined) entity.collisionGroup = clampInteger(fields.collisionGroup, 0, 15);
    if (fields.collisionMask !== undefined) entity.collisionMask = clampInteger(fields.collisionMask, 0, 0xFFFF);
    if (fields.pushPriority !== undefined) entity.pushPriority = clampInteger(fields.pushPriority, 0, 255);
    if (fields.pushable !== undefined) entity.pushable = fields.pushable;
    if (fields.battle !== undefined) {
      const current = actorBattlePresentation(entity);
      const requestedAbilities = fields.battle.abilities ?? current.abilities;
      const abilities = Array.from(new Set(requestedAbilities.filter((ability) => battleAbilityValues.includes(ability)))).slice(0, 4);
      if (abilities.length === 0) abilities.push("attack");
      entity.battle = {
        side: fields.battle.side === "party" || fields.battle.side === "enemy" ? fields.battle.side : fields.battle.side === "none" ? "none" : current.side,
        maxHp: clampInteger(fields.battle.maxHp ?? current.maxHp, 1, 999),
        attack: clampInteger(fields.battle.attack ?? current.attack, 1, 255),
        defense: clampInteger(fields.battle.defense ?? current.defense, 0, 255),
        speed: clampInteger(fields.battle.speed ?? current.speed, 1, 255),
        abilities,
        ...(Math.max(1, Math.min(2, integerField(fields.battle.spriteScale ?? current.spriteScale, 1))) > 1 ? { spriteScale: 2 } : {})
      };
    }
  } else if (fields.spriteSheet !== undefined || fields.animationName !== undefined) {
    return data;
  }
  if (kind === "trigger") {
    if (fields.width !== undefined) entity.width = positiveInteger(fields.width, positiveInteger(entity.width, 1));
    if (fields.height !== undefined) entity.height = positiveInteger(fields.height, positiveInteger(entity.height, 1));
  }

  next[collectionKey] = nextEntities;
  return next;
}

export function nudgeRoomEntitiesInProject(data: GBAProjectData, options: NudgeRoomEntitiesOptions): GBAProjectData {
  if (!Number.isFinite(options.deltaX) || !Number.isFinite(options.deltaY)) return data;

  const selectedKeys = new Set(options.selectedKeys);
  if (selectedKeys.size === 0) return data;
  const stepSize = options.stepSize === undefined ? 1 : positiveInteger(options.stepSize, 0);
  if (stepSize < 1) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetRoomName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const deltaX = Math.floor(options.deltaX) * stepSize;
  const deltaY = Math.floor(options.deltaY) * stepSize;
  let changed = false;

  const next = cloneProjectData(data);
  const nudgeCollection = (kind: RoomsWorkspaceEntityKind): void => {
    const collectionKey = kind === "actor" ? "actors" : "triggers";
    const entities = projectRecords(next, collectionKey);

    entities.forEach((entity, index) => {
      if (!selectedKeys.has(roomEntityRecordKey(kind, entity, index))) return;
      if (entityRoomName(entity, rooms) !== targetRoomName) return;

      const entityWidth = kind === "trigger" ? positiveInteger(entity.width, positiveInteger(isRecord(entity.size) ? entity.size.width : undefined, 1)) : 1;
      const entityHeight = kind === "trigger" ? positiveInteger(entity.height, positiveInteger(isRecord(entity.size) ? entity.size.height : undefined, 1)) : 1;
      const maxX = Math.max(0, roomWidth - entityWidth);
      const maxY = Math.max(0, roomHeight - entityHeight);
      const currentX = integerField(entity.x, integerField(isRecord(entity.position) ? entity.position.x : undefined, 0));
      const currentY = integerField(entity.y, integerField(isRecord(entity.position) ? entity.position.y : undefined, 0));
      const nextX = clampInteger(currentX + deltaX, 0, maxX);
      const nextY = clampInteger(currentY + deltaY, 0, maxY);

      if (nextX === currentX && nextY === currentY) return;
      entity.x = nextX;
      entity.y = nextY;
      if (kind === "actor") snapIsometricActorToSupportHeight(targetRoom, entity);
      changed = true;
    });

    next[collectionKey] = entities;
  };

  nudgeCollection("actor");
  nudgeCollection("trigger");

  return changed ? next : data;
}

export function removeRoomEntitiesInProject(data: GBAProjectData, options: RemoveRoomEntitiesOptions): GBAProjectData {
  const selectedKeys = new Set(options.selectedKeys);
  if (selectedKeys.size === 0) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoomName = roomName(rooms[roomIndex], roomIndex);
  const next = cloneProjectData(data);
  const nextRooms = projectRooms(next);
  let changed = false;

  const removeFromCollection = (kind: RoomsWorkspaceEntityKind): void => {
    const collectionKey = kind === "actor" ? "actors" : "triggers";
    const entities = projectRecords(next, collectionKey);
    const keptEntities = entities.filter((entity, index) => {
      if (!selectedKeys.has(roomEntityRecordKey(kind, entity, index))) return true;
      if (entityRoomName(entity, nextRooms) !== targetRoomName) return true;
      changed = true;
      return false;
    });

    next[collectionKey] = keptEntities;
  };

  removeFromCollection("actor");
  removeFromCollection("trigger");

  return changed ? next : data;
}

export function duplicateRoomEntitiesInProject(data: GBAProjectData, options: DuplicateRoomEntitiesOptions): GBAProjectData {
  const selectedKeys = new Set(options.selectedKeys);
  if (selectedKeys.size === 0) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetRoomName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const next = cloneProjectData(data);
  const nextRooms = projectRooms(next);
  let changed = false;

  const duplicateCollection = (kind: RoomsWorkspaceEntityKind): void => {
    const collectionKey = kind === "actor" ? "actors" : "triggers";
    const entities = projectRecords(next, collectionKey);
    const copies: Record<string, unknown>[] = [];
    let copyIndex = 0;

    entities.forEach((entity, index) => {
      const sourceID = nullableString(entity.id) ?? `${kind}-${index + 1}`;
      if (!selectedKeys.has(roomEntityRecordKey(kind, entity, index))) return;
      if (entityRoomName(entity, nextRooms) !== targetRoomName) return;

      copyIndex += 1;
      const entityWidth = kind === "trigger" ? positiveInteger(entity.width, positiveInteger(isRecord(entity.size) ? entity.size.width : undefined, 1)) : 1;
      const entityHeight = kind === "trigger" ? positiveInteger(entity.height, positiveInteger(isRecord(entity.size) ? entity.size.height : undefined, 1)) : 1;
      const maxX = Math.max(0, roomWidth - entityWidth);
      const maxY = Math.max(0, roomHeight - entityHeight);
      const currentX = integerField(entity.x, integerField(isRecord(entity.position) ? entity.position.x : undefined, 0));
      const currentY = integerField(entity.y, integerField(isRecord(entity.position) ? entity.position.y : undefined, 0));
      const copy = cloneProjectData(entity);
      copy.id = options.idForCopy(kind, sourceID, copyIndex);
      copy.name = `${stringField(copy.name, kind === "actor" ? "Actor" : "Trigger")} copy`;
      copy.roomName = targetRoomName;
      copy.x = clampInteger(currentX + 1, 0, maxX);
      copy.y = clampInteger(currentY + 1, 0, maxY);
      copies.push(copy);
      changed = true;
    });

    next[collectionKey] = [...entities, ...copies];
  };

  duplicateCollection("actor");
  duplicateCollection("trigger");

  return changed ? next : data;
}

interface SelectedRoomEntityRecord {
  entity: Record<string, unknown>;
  index: number;
  key: string;
  kind: RoomsWorkspaceEntityKind;
}

function selectedRoomEntitiesForRoom(
  data: GBAProjectData,
  rooms: Record<string, unknown>[],
  roomNameToMatch: string,
  selectedKeys: string[]
): SelectedRoomEntityRecord[] {
  const selectedKeySet = new Set(selectedKeys);
  const selectedOrder = new Map(selectedKeys.map((key, index) => [key, index]));
  const selectedEntities: SelectedRoomEntityRecord[] = [];

  (["actor", "trigger"] as RoomsWorkspaceEntityKind[]).forEach((kind) => {
    const collectionKey = kind === "actor" ? "actors" : "triggers";
    projectRecords(data, collectionKey).forEach((entity, index) => {
      const key = roomEntityRecordKey(kind, entity, index);
      if (!selectedKeySet.has(key)) return;
      if (entityRoomName(entity, rooms) !== roomNameToMatch) return;
      selectedEntities.push({ entity, index, key, kind });
    });
  });

  selectedEntities.sort((left, right) => (selectedOrder.get(left.key) ?? 0) - (selectedOrder.get(right.key) ?? 0));
  return selectedEntities;
}

export function alignRoomEntitiesInProject(data: GBAProjectData, options: AlignRoomEntitiesOptions): GBAProjectData {
  if (options.axis !== "x" && options.axis !== "y") return data;

  if (new Set(options.selectedKeys).size < 2) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetRoomName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const selectedEntities = selectedRoomEntitiesForRoom(data, rooms, targetRoomName, options.selectedKeys);

  if (selectedEntities.length < 2) return data;
  const referenceEntity = selectedEntities[0]?.entity;
  if (!referenceEntity) return data;

  const targetCoordinate = options.axis === "x"
    ? integerField(referenceEntity.x, integerField(isRecord(referenceEntity.position) ? referenceEntity.position.x : undefined, 0))
    : integerField(referenceEntity.y, integerField(isRecord(referenceEntity.position) ? referenceEntity.position.y : undefined, 0));
  const next = cloneProjectData(data);
  let changed = false;

  selectedEntities.slice(1).forEach((selectedEntity) => {
    const collectionKey = selectedEntity.kind === "actor" ? "actors" : "triggers";
    const nextEntity = projectRecords(next, collectionKey)[selectedEntity.index];
    if (!nextEntity) return;

    const entityWidth = selectedEntity.kind === "trigger" ? positiveInteger(nextEntity.width, positiveInteger(isRecord(nextEntity.size) ? nextEntity.size.width : undefined, 1)) : 1;
    const entityHeight = selectedEntity.kind === "trigger" ? positiveInteger(nextEntity.height, positiveInteger(isRecord(nextEntity.size) ? nextEntity.size.height : undefined, 1)) : 1;
    const maxCoordinate = options.axis === "x" ? Math.max(0, roomWidth - entityWidth) : Math.max(0, roomHeight - entityHeight);
    const nextCoordinate = clampInteger(targetCoordinate, 0, maxCoordinate);
    const currentCoordinate = options.axis === "x"
      ? integerField(nextEntity.x, integerField(isRecord(nextEntity.position) ? nextEntity.position.x : undefined, 0))
      : integerField(nextEntity.y, integerField(isRecord(nextEntity.position) ? nextEntity.position.y : undefined, 0));
    if (nextCoordinate === currentCoordinate) return;

    if (options.axis === "x") {
      nextEntity.x = nextCoordinate;
    } else {
      nextEntity.y = nextCoordinate;
    }
    if (selectedEntity.kind === "actor") snapIsometricActorToSupportHeight(targetRoom, nextEntity);
    changed = true;
  });

  return changed ? next : data;
}

export function distributeRoomEntitiesInProject(data: GBAProjectData, options: DistributeRoomEntitiesOptions): GBAProjectData {
  if (options.axis !== "x" && options.axis !== "y") return data;

  if (new Set(options.selectedKeys).size < 3) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetRoomName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const selectedEntities = selectedRoomEntitiesForRoom(data, rooms, targetRoomName, options.selectedKeys);
  if (selectedEntities.length < 3) return data;

  const firstEntity = selectedEntities[0]?.entity;
  const lastEntity = selectedEntities[selectedEntities.length - 1]?.entity;
  if (!firstEntity || !lastEntity) return data;

  const firstCoordinate = options.axis === "x"
    ? integerField(firstEntity.x, integerField(isRecord(firstEntity.position) ? firstEntity.position.x : undefined, 0))
    : integerField(firstEntity.y, integerField(isRecord(firstEntity.position) ? firstEntity.position.y : undefined, 0));
  const lastCoordinate = options.axis === "x"
    ? integerField(lastEntity.x, integerField(isRecord(lastEntity.position) ? lastEntity.position.x : undefined, 0))
    : integerField(lastEntity.y, integerField(isRecord(lastEntity.position) ? lastEntity.position.y : undefined, 0));
  const step = (lastCoordinate - firstCoordinate) / (selectedEntities.length - 1);
  const next = cloneProjectData(data);
  let changed = false;

  selectedEntities.slice(1, -1).forEach((selectedEntity, relativeIndex) => {
    const collectionKey = selectedEntity.kind === "actor" ? "actors" : "triggers";
    const nextEntity = projectRecords(next, collectionKey)[selectedEntity.index];
    if (!nextEntity) return;

    const entityWidth = selectedEntity.kind === "trigger" ? positiveInteger(nextEntity.width, positiveInteger(isRecord(nextEntity.size) ? nextEntity.size.width : undefined, 1)) : 1;
    const entityHeight = selectedEntity.kind === "trigger" ? positiveInteger(nextEntity.height, positiveInteger(isRecord(nextEntity.size) ? nextEntity.size.height : undefined, 1)) : 1;
    const maxCoordinate = options.axis === "x" ? Math.max(0, roomWidth - entityWidth) : Math.max(0, roomHeight - entityHeight);
    const distributedCoordinate = Math.round(firstCoordinate + step * (relativeIndex + 1));
    const nextCoordinate = clampInteger(distributedCoordinate, 0, maxCoordinate);
    const currentCoordinate = options.axis === "x"
      ? integerField(nextEntity.x, integerField(isRecord(nextEntity.position) ? nextEntity.position.x : undefined, 0))
      : integerField(nextEntity.y, integerField(isRecord(nextEntity.position) ? nextEntity.position.y : undefined, 0));
    if (nextCoordinate === currentCoordinate) return;

    if (options.axis === "x") {
      nextEntity.x = nextCoordinate;
    } else {
      nextEntity.y = nextCoordinate;
    }
    if (selectedEntity.kind === "actor") snapIsometricActorToSupportHeight(targetRoom, nextEntity);
    changed = true;
  });

  return changed ? next : data;
}

export function placeRoomEntityInRoomInProject(
  data: GBAProjectData,
  kind: RoomsWorkspaceEntityKind,
  entityID: string,
  options: PlaceRoomEntityInRoomOptions
): GBAProjectData {
  if (!Number.isFinite(options.x) || !Number.isFinite(options.y)) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const collectionKey = kind === "actor" ? "actors" : "triggers";
  const entities = projectRecords(data, collectionKey);
  const entityIndex = entities.findIndex((entity, index) => (nullableString(entity.id) ?? `${kind}-${index + 1}`) === entityID);
  if (entityIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const entity = entities[entityIndex];
  const entityWidth = kind === "trigger" ? positiveInteger(entity.width, positiveInteger(isRecord(entity.size) ? entity.size.width : undefined, 1)) : 1;
  const entityHeight = kind === "trigger" ? positiveInteger(entity.height, positiveInteger(isRecord(entity.size) ? entity.size.height : undefined, 1)) : 1;
  const maxX = Math.max(0, roomWidth - entityWidth);
  const maxY = Math.max(0, roomHeight - entityHeight);

  return updateRoomEntityInProject(data, kind, entityID, {
    roomName: targetName,
    x: clampInteger(options.x, 0, maxX),
    y: clampInteger(options.y, 0, maxY)
  });
}

export function deriveTriggerPlacementFromCells(
  roomWidth: number,
  startCellIndex: number,
  endCellIndex: number
): { x: number; y: number; width: number; height: number } {
  const startX = startCellIndex % roomWidth;
  const startY = Math.floor(startCellIndex / roomWidth);
  const endX = endCellIndex % roomWidth;
  const endY = Math.floor(endCellIndex / roomWidth);
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX) + 1,
    height: Math.abs(endY - startY) + 1
  };
}

const DEFAULT_ACTOR_SPRITE_SHEET = "player_topdown_4dir.png";
const DEFAULT_ACTOR_ANIMATION = "idle_down";

function suggestActorIdentity(data: GBAProjectData): { id: string; name: string } {
  const actors = projectRecords(data, "actors");
  const existingIDs = new Set(actors.map((actor, index) => (nullableString(actor.id) ?? `actor-${index + 1}`).toLowerCase()));
  const existingNames = new Set(actors.map((actor, index) => stringField(actor.name, `Actor ${index + 1}`).toLowerCase()));

  let index = actors.length + 1;
  let id = `actor_${index}`;
  let name = `Actor ${index}`;
  while (existingIDs.has(id.toLowerCase()) || existingNames.has(name.toLowerCase())) {
    index += 1;
    id = `actor_${index}`;
    name = `Actor ${index}`;
  }

  return { id, name };
}

export function createActorInProject(data: GBAProjectData, options: CreateActorInProjectOptions): GBAProjectData {
  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetRoomName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const x = clampInteger(options.x, 0, roomWidth - 1);
  const y = clampInteger(options.y, 0, roomHeight - 1);
  const identity = suggestActorIdentity(data);
  const id = options.id?.trim() || identity.id;
  const name = options.name?.trim() || identity.name;
  const spriteSheet = options.spriteSheet ?? DEFAULT_ACTOR_SPRITE_SHEET;
  const animationStateID = options.animationStateID?.trim()
    || projectRecords(data, "animationStates")
      .find((state) => nullableString(state.spriteSheet) === spriteSheet)
      ?.id;

  const next = cloneProjectData(data);
  const actors = projectRecords(next, "actors");
  if (actors.some((actor, index) => (nullableString(actor.id) ?? `actor-${index + 1}`) === id)) {
    return data;
  }

  next.actors = [
    ...actors,
    {
      animationName: options.animationName ?? DEFAULT_ACTOR_ANIMATION,
      ...(typeof animationStateID === "string" && animationStateID.trim() ? { animationStateID: animationStateID.trim() } : {}),
      eventBindings: {},
      id,
      name,
      roomName: targetRoomName,
      spriteSheet,
      x,
      y,
      ...(targetRoom.sceneType === "isometric" ? {z: clampInteger(integerField(Array.isArray(targetRoom.heightLevels) ? targetRoom.heightLevels[y * roomWidth + x] : 0, 0), 0, 3)} : {})
    }
  ];
  return next;
}

function suggestTriggerIdentity(data: GBAProjectData): { id: string; name: string } {
  const triggers = projectRecords(data, "triggers");
  const existingIDs = new Set(triggers.map((trigger, index) => (nullableString(trigger.id) ?? `trigger-${index + 1}`).toLowerCase()));
  const existingNames = new Set(triggers.map((trigger, index) => stringField(trigger.name, `Trigger ${index + 1}`).toLowerCase()));

  let index = triggers.length + 1;
  let id = `trigger_${index}`;
  let name = `Trigger ${index}`;
  while (existingIDs.has(id.toLowerCase()) || existingNames.has(name.toLowerCase())) {
    index += 1;
    id = `trigger_${index}`;
    name = `Trigger ${index}`;
  }

  return { id, name };
}

export function createTriggerInProject(data: GBAProjectData, options: CreateTriggerInProjectOptions): GBAProjectData {
  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const targetRoom = rooms[roomIndex];
  const targetRoomName = roomName(targetRoom, roomIndex);
  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const x = clampInteger(options.x, 0, roomWidth - 1);
  const y = clampInteger(options.y, 0, roomHeight - 1);
  const width = clampInteger(options.width, 1, roomWidth - x);
  const height = clampInteger(options.height, 1, roomHeight - y);
  const identity = suggestTriggerIdentity(data);
  const id = options.id?.trim() || identity.id;
  const name = options.name?.trim() || identity.name;

  const next = cloneProjectData(data);
  const triggers = projectRecords(next, "triggers");
  if (triggers.some((trigger, index) => (nullableString(trigger.id) ?? `trigger-${index + 1}`) === id)) {
    return data;
  }

  next.triggers = [
    ...triggers,
    {
      eventName: options.eventName ?? "",
      height,
      id,
      name,
      roomName: targetRoomName,
      width,
      x,
      y
    }
  ];
  return next;
}

export function resizeRoomTriggerToTileInProject(
  data: GBAProjectData,
  triggerID: string,
  options: ResizeRoomTriggerToTileOptions
): GBAProjectData {
  if (!Number.isFinite(options.tileX) || !Number.isFinite(options.tileY)) return data;

  const rooms = projectRooms(data);
  const roomIndex = rooms.findIndex((room, index) => roomID(room, index) === options.roomID);
  if (roomIndex < 0) return data;

  const triggers = projectRecords(data, "triggers");
  const triggerIndex = triggers.findIndex((trigger, index) => (nullableString(trigger.id) ?? `trigger-${index + 1}`) === triggerID);
  if (triggerIndex < 0) return data;

  const trigger = triggers[triggerIndex];
  const targetRoom = rooms[roomIndex];
  const targetName = roomName(targetRoom, roomIndex);
  const triggerRoomName = entityRoomName(trigger, rooms);
  if (triggerRoomName !== targetName) return data;

  const roomWidth = positiveInteger(targetRoom.width, 1);
  const roomHeight = positiveInteger(targetRoom.height, 1);
  const triggerX = integerField(trigger.x, integerField(isRecord(trigger.position) ? trigger.position.x : undefined, 0));
  const triggerY = integerField(trigger.y, integerField(isRecord(trigger.position) ? trigger.position.y : undefined, 0));
  const clampedTileX = clampInteger(options.tileX, triggerX, roomWidth - 1);
  const clampedTileY = clampInteger(options.tileY, triggerY, roomHeight - 1);

  return updateRoomEntityInProject(data, "trigger", triggerID, {
    height: clampedTileY - triggerY + 1,
    width: clampedTileX - triggerX + 1
  });
}

export function setActiveTileLayerMappingInProject(data: GBAProjectData, mapping: string): GBAProjectData {
  const next = cloneProjectData(data);
  const editorState = isRecord(next.editorState) ? { ...(next.editorState as Record<string, unknown>) } : {};
  const videoMode = gbaVideoModeFromProject(next).id;
  editorState.activeTileLayerMapping = normalizeActiveTileLayerForVideoMode(
    normalizeSceneTileLayerMapping(mapping),
    videoMode
  );
  next.editorState = editorState;
  return next;
}

export function deriveRoomsWorkspacePresentation(data: GBAProjectData): RoomsWorkspacePresentation {
  const rooms = projectRooms(data);
  const active = activeRoomName(data, rooms);
  const start = startRoomName(data, rooms);
  const backgroundMetadata = assetMetadataByName(data, isBackgroundAssetKind);
  const options = deriveRoomsWorkspaceOptions(data);
  const projectActiveLayerMapping = activeTileLayerMappingFromProject(data);
  const videoMode = gbaVideoModeFromProject(data);
  const paletteFamilies = scenePaletteFamilies(data);
  const workspaceEntities = deriveRoomsWorkspaceEntities(data, rooms, active);

  const presentedRooms = rooms.map((room, index) => {
    const sceneDocument = normalizeGBASceneDocument(room, index);
    // Keep the editor's compact fallback for malformed authoring data while
    // valid dimensions come from the shared scene document.
    const width = typeof room.width === "number" && Number.isInteger(room.width) && room.width > 0
      ? sceneDocument.sizeTiles.width
      : 1;
    const height = typeof room.height === "number" && Number.isInteger(room.height) && room.height > 0
      ? sceneDocument.sizeTiles.height
      : 1;
    const sceneType = normalizeSceneTypeId(sceneDocument.sceneType, "topdown");
    const sceneProjection: Record<string, unknown> = {
      ...room,
      width,
      height,
      backgroundAssetName: sceneDocument.background.assetName,
      background: sceneDocument.background.assetName,
      backgroundRenderMode: sceneDocument.background.renderMode,
      tilemap: sceneDocument.tilemap.base,
      collisionTypes: sceneDocument.collisionTypes
    };
    const tilemapContract = resolveSceneTilemapContract(sceneType, width, height);
    const activeLayerMapping = tilemapContract
      && !tilemapContract.logicalLayers.some((layer) => layer.hardwareMapping === projectActiveLayerMapping)
      ? "BG2"
      : projectActiveLayerMapping;
    const layeredPaintingEnabled = sceneTileLayerSupportsLayers(sceneType, videoMode.id);
    const fallbackTilemap = tileCells(sceneProjection, width, height);
    const tileLayers = layeredPaintingEnabled
      ? (readSceneTileLayersFromRoom(sceneProjection).length > 0
        ? normalizeSceneTileLayers({
          fallbackTilemap,
          height,
          layers: readSceneTileLayersFromRoom(sceneProjection),
          sceneType,
          width
        })
        : defaultSceneTileLayers({ fallbackTilemap, height, sceneType, width }))
      : [];
    const composedTilemap = layeredPaintingEnabled
      ? composeSceneTilemap(tileLayers, width, height)
      : tileCells(room, width, height);
    const heightLevels = roomHeightLevels(room, width, height);
    const foregroundTileCount = tileLayers
      .find((layer) => layer.mapping === "BG1")
      ?.tilemap.filter((value) => Number.isFinite(value) && value >= 0).length ?? 0;
    const name = stringField(room.name, "Cena sem nome");
    const background = sceneDocument.background.assetName;
    const music = sceneDocument.music;
    const playerActorName = nullableString(room.playerActorName);
    const metadata = background ? backgroundMetadata.get(background) : undefined;
    const cameraMode = normalizeCameraModeId(stringField(room.cameraMode, "fixed_center"), "fixed_center");
    const cameraZoom = normalizeRoomCameraZoom(room.cameraZoom);
    const cameraBounds = normalizeRoomCameraBounds(
      isRecord(room.cameraBounds) ? room.cameraBounds as Partial<RoomCameraBounds> : null,
      width,
      height
    );
    const parallax = normalizeRoomParallaxSettings(
      isRecord(room.parallax) ? room.parallax as Partial<RoomParallaxSettings> : null
    );
    const paletteFamilyID = nullableString(room.paletteFamilyID);
    const paletteFamily = paletteFamilyID ? paletteFamilies.get(paletteFamilyID) : undefined;
    const cameraZones = (Array.isArray(room.cameraZones) ? room.cameraZones : [])
      .filter(isRecord)
      .map((zone, zoneIndex): RoomCameraZone => {
        const rawArea = isRecord(zone.area) ? zone.area : {};
        const rawBounds = isRecord(zone.bounds) ? zone.bounds : {};
        const rawOffset = isRecord(zone.offset) ? zone.offset : {};
        return {
          id: stringField(zone.id, `camera-zone-${zoneIndex + 1}`),
          name: stringField(zone.name, `Zona ${zoneIndex + 1}`),
          area: normalizeRoomConnectionArea({
            x: integerField(rawArea.x, 0),
            y: integerField(rawArea.y, 0),
            width: positiveInteger(rawArea.width, 1),
            height: positiveInteger(rawArea.height, 1)
          }, width, height),
          bounds: {
            x: integerField(rawBounds.x, 0),
            y: integerField(rawBounds.y, 0),
            width: positiveInteger(rawBounds.width, width * 8),
            height: positiveInteger(rawBounds.height, height * 8)
          },
          offset: {
            x: integerField(rawOffset.x, 0),
            y: integerField(rawOffset.y, 0)
          },
          lockX: zone.lockX === true,
          lockY: zone.lockY === true
        };
      });
    return {
      id: nullableString(room.id) ?? `room-${index + 1}`,
      name,
      displayName: sceneDocument.displayName ?? name,
      ...(sceneDocument.campaign ? { campaign: sceneDocument.campaign } : {}),
      width,
      height,
      gbaResolution: `${width * 8} x ${height * 8}`,
      music,
      hudPresetId: sceneDocument.hudPresetId,
      cameraMode,
      cameraZoom,
      cameraBounds,
      cameraBoundsEditable: roomExceedsGbaViewport(width, height),
      cameraZones,
      parallax,
      sceneType,
      runtime: normalizeSceneRuntime(sceneType, room.runtime),
      playerActorName,
      background,
      backgroundLayers: roomBackgroundLayers(tileLayers, background, backgroundMetadata),
      backgroundSource: backgroundSourceForAssetName(data, background),
      backgroundBundledDefaultAsset: nullableString(metadata?.bundledDefaultAsset),
      backgroundPixelHeight: positiveInteger(metadata?.height, 0) || null,
      backgroundPixelWidth: positiveInteger(metadata?.width, 0) || null,
      ...(isRecord(metadata?.backgroundTileOptimizer) ? {
        backgroundFidelity: {
          assetcStatus: nullableString(metadata?.assetcStatus),
          maxFramebufferMismatchRatio: typeof metadata.backgroundTileOptimizer.maxFramebufferMismatchRatio === "number"
            ? metadata.backgroundTileOptimizer.maxFramebufferMismatchRatio
            : null,
          maxSourcePixelErrorRatio: typeof metadata.backgroundTileOptimizer.maxSourcePixelErrorRatio === "number"
            ? metadata.backgroundTileOptimizer.maxSourcePixelErrorRatio
            : null,
          optimizerEnabled: metadata.backgroundTileOptimizer.enabled === true,
          tileBudget: positiveInteger(metadata.backgroundTileOptimizer.tileBudget, 0) || null
        }
      } : {}),
      backgroundTileHeight: positiveInteger(metadata?.tileHeight, 8),
      backgroundAtlasRenderOffsetY: typeof metadata?.atlasRenderOffsetY === "number" ? Math.trunc(metadata.atlasRenderOffsetY) : 0,
      backgroundAtlasTileHeight: positiveInteger(
        metadata?.atlasTileHeight,
        positiveInteger(metadata?.tileHeight, 8)
      ),
      backgroundAtlasColumns: positiveInteger(metadata?.atlasColumns, 1),
      backgroundAtlasRows: positiveInteger(metadata?.atlasRows, 1),
      backgroundTileOffsetX: nonNegativeInteger(metadata?.tileOffsetX, 0),
      backgroundTileOffsetY: nonNegativeInteger(metadata?.tileOffsetY, 0),
      backgroundTileWidth: positiveInteger(metadata?.tileWidth, 8),
      backgroundAtlasTileWidth: positiveInteger(
        metadata?.atlasTileWidth,
        positiveInteger(metadata?.tileWidth, 8)
      ),
      backgroundRenderMode: normalizedBackgroundRenderMode(room.backgroundRenderMode),
      ...(tilemapContract ? { tilemapContract } : {}),
      paletteFamilyID: paletteFamily?.id ?? null,
      paletteFamilyName: paletteFamily?.name ?? null,
      paletteBankPolicy: normalizeScenePaletteBankPolicy(room.paletteBankPolicy),
      backgroundPalette: paletteFamily?.background ?? [],
      objectPalette: paletteFamily?.objects ?? [],
      gbStudioUseBackgroundLayout: room.gbStudioUseBackgroundLayout === true,
      tileCount: roomTileCount(width, height),
      tileCells: composedTilemap,
      activeLayerTileCells: layeredPaintingEnabled
        ? readActiveLayerTileCells(tileLayers, activeLayerMapping, width, height)
        : composedTilemap,
      tileLayers: tileLayers.map((layer) => ({
        mapping: layer.mapping,
        label: sceneTileLayerCatalog.find((entry) => entry.mapping === layer.mapping)?.label ?? layer.mapping,
        tilemap: layer.tilemap,
        paintedTileCount: layer.tilemap.filter((value) => value >= 0).length
      })),
      ...(isRecord(room.layerEditing) ? { layerEditing: normalizeRoomLayerEditing(room.layerEditing) } : {}),
      collisionCount: collisionCount(sceneProjection, width, height),
      collisionCells: collisionCells(sceneProjection, width, height),
      collisionTypes: collisionTypes(sceneProjection, width, height),
      eventBindings: sceneDocument.eventBindings,
      heightLevels,
      foregroundTileCount,
      referenceImageCount: referenceImageCount(room),
      layeredPaintingEnabled,
      activeTileLayerMapping: activeLayerMapping,
      paintedTileCount: layeredPaintingEnabled ? paintedTileCount(tileLayers, width, height) : composedTilemap.filter((value) => value > 0).length,
      isActive: active ? name === active : index === 0,
      isStart: start ? name === start : index === 0,
      warnings: roomReferenceWarnings({ background, music, playerActorName }, options)
    };
  });

  const presentedRoomsWithDiagnostics = presentedRooms.map((room) => {
    const geometryDiagnostics = deriveRoomGeometryDiagnostics(
      room,
      workspaceEntities.filter((entity) => entity.roomName === room.name)
    );
    return {
      ...room,
      geometryDiagnostics,
      warnings: [
        ...room.warnings,
        ...roomGeometryDiagnosticWarnings(room, geometryDiagnostics)
      ]
    };
  });

  const sceneTypeCounts = new Map<string, number>();
  for (const room of presentedRoomsWithDiagnostics) {
    sceneTypeCounts.set(room.sceneType, (sceneTypeCounts.get(room.sceneType) ?? 0) + 1);
  }

  return {
    rooms: presentedRoomsWithDiagnostics,
    options,
    connections: deriveRoomsWorkspaceConnections(data, active),
    entities: workspaceEntities,
    sceneMapPositions: sceneMapPositions(data),
    sceneMapZoom: sceneMapZoom(data),
    tilePalette: deriveTilePalette(rooms),
    videoModeId: videoMode.id,
    videoModeLabel: videoMode.label,
    summary: {
      roomCount: presentedRoomsWithDiagnostics.length,
      activeRoomName: active,
      startRoomName: start,
      sceneTypes: Array.from(sceneTypeCounts.entries())
        .map(([sceneType, count]) => ({ sceneType, count }))
        .sort((lhs, rhs) => lhs.sceneType.localeCompare(rhs.sceneType, "pt-BR")),
      totalTiles: presentedRoomsWithDiagnostics.reduce((sum, room) => sum + room.width * room.height, 0),
      warningCount: presentedRoomsWithDiagnostics.reduce((sum, room) => sum + room.warnings.length, 0)
    }
  };
}

export function filterRoomsWorkspaceRooms(
  rooms: RoomsWorkspaceRoom[],
  options: RoomsWorkspaceFilterOptions
): RoomsWorkspaceRoom[] {
  const query = options.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const sceneType = options.sceneType?.trim() ?? "";
  const status = options.status ?? "all";

  return rooms.filter((room) => {
    if (sceneType && room.sceneType !== sceneType) return false;
    if (status === "active" && !room.isActive) return false;
    if (status === "start" && !room.isStart) return false;
    if (status === "warning" && room.warnings.length === 0) return false;
    if (!query) return true;

    return [
      room.name,
      room.sceneType,
      room.cameraMode,
      room.music ?? "",
      room.background ?? "",
      room.playerActorName ?? "",
      room.warnings.join(" ")
    ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
  });
}

export function deriveRoomsWorkspaceFilterChips(
  presentation: RoomsWorkspacePresentation,
  active: Pick<RoomsWorkspaceFilterOptions, "sceneType" | "status"> = {}
): RoomsWorkspaceFilterChips {
  const activeSceneType = active.sceneType?.trim() ?? "";
  const activeStatus = active.status ?? "all";
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "room";

  return {
    sceneType: [
      {
        id: "scene-type-all",
        label: "Todas",
        value: "",
        count: presentation.rooms.length,
        isActive: activeSceneType === ""
      },
      ...presentation.summary.sceneTypes.map((item) => ({
        id: `scene-type-${slug(item.sceneType)}`,
        label: sceneTypeLabel(item.sceneType),
        value: item.sceneType,
        count: item.count,
        isActive: activeSceneType === item.sceneType
      }))
    ],
    status: [
      {
        id: "status-all",
        label: "Todas",
        value: "all",
        count: presentation.rooms.length,
        isActive: activeStatus === "all"
      },
      {
        id: "status-active",
        label: "Ativa",
        value: "active",
        count: presentation.rooms.filter((room) => room.isActive).length,
        isActive: activeStatus === "active"
      },
      {
        id: "status-start",
        label: "Inicial",
        value: "start",
        count: presentation.rooms.filter((room) => room.isStart).length,
        isActive: activeStatus === "start"
      },
      {
        id: "status-warning",
        label: "Alertas",
        value: "warning",
        count: presentation.rooms.filter((room) => room.warnings.length > 0).length,
        isActive: activeStatus === "warning"
      }
    ]
  };
}

export interface RoomsWorkspaceValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  roomName?: string;
}

export interface RoomsWorkspaceSummaryCard {
  id: "rooms" | "tiles" | "warnings" | "connections";
  label: string;
  value: number;
  tone: "primary" | "neutral" | "warning";
}

export interface RoomsEditorContext {
  roomName: string;
  sceneType: string;
  dimensions: string;
  music: string | null;
  background: string | null;
  warningCount: number;
}

export function deriveRoomsEditorContext(room: RoomsWorkspaceRoom | null): RoomsEditorContext | null {
  if (!room) return null;
  return {
    roomName: room.name,
    sceneType: room.sceneType,
    dimensions: `${room.width} x ${room.height}`,
    music: room.music,
    background: room.background,
    warningCount: room.warnings.length
  };
}

export function deriveRoomsWorkspaceValidationIssues(
  presentation: RoomsWorkspacePresentation
): RoomsWorkspaceValidationIssue[] {
  const issues: RoomsWorkspaceValidationIssue[] = [];

  for (const room of presentation.rooms) {
    for (const warning of room.warnings) {
      issues.push({
        id: `room-warning-${room.id}-${warning}`,
        severity: "warning",
        message: `${room.name}: ${warning}`,
        roomName: room.name
      });
    }
  }

  for (const connection of presentation.connections) {
    const roomNames = new Set(presentation.rooms.map((room) => room.name));
    if (!roomNames.has(connection.to)) {
      issues.push({
        id: `connection-${connection.index}`,
        severity: "error",
        message: `Conexão ${connection.from} -> ${connection.to} aponta para cena inexistente.`,
        roomName: connection.from
      });
    }
  }

  if (!presentation.summary.startRoomName) {
    issues.push({
      id: "missing-start-room",
      severity: "error",
      message: "Cena inicial nao configurada em settings.general.startScene."
    });
  }

  if (issues.length === 0 && presentation.rooms.length > 0) {
    issues.push({
      id: "rooms-ok",
      severity: "info",
      message: "Todas as cenas estão prontas para edição e export."
    });
  }

  return issues;
}

export function deriveRoomsWorkspaceSummaryCards(
  presentation: RoomsWorkspacePresentation
): RoomsWorkspaceSummaryCard[] {
  const paintedTiles = presentation.rooms.reduce((sum, room) => sum + room.paintedTileCount, 0);

  return [
    { id: "rooms", label: "Rooms", value: presentation.summary.roomCount, tone: "primary" },
    { id: "tiles", label: "Tiles pintados", value: paintedTiles, tone: "neutral" },
    { id: "connections", label: "Conexoes", value: presentation.connections.length, tone: "neutral" },
    { id: "warnings", label: "Alertas", value: presentation.summary.warningCount, tone: presentation.summary.warningCount > 0 ? "warning" : "neutral" }
  ];
}
