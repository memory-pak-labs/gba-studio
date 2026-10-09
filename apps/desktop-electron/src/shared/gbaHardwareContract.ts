import { hasPagedWorldMap } from './pagedWorldMap.js';
import { gbaMetaspriteFramePartCount } from "./gbaMetaspriteLayout.js";
import type { GBAProjectData } from "./projectFile.js";
import {
  gbaMetaspritePartLimit,
  gbaSpriteOamEntriesForPixels,
  gbaSpriteTilesForPixels,
  isGbaObjNativeDimension
} from "./gbaRendering.js";
import {
  gbaBackgroundMapSizeDefinition,
  gbaBackgroundMapSizeDefinitions,
  gbaBackgroundMapSizeFits,
  gbaBackgroundMapSizeForDimensions,
  gbaBackgroundMapSizeFromProject,
  gbaObjNativeDimension,
  gbaSceneViewportHeightPx,
  gbaSceneViewportHeightTiles,
  gbaSceneViewportWidthPx,
  gbaSceneViewportWidthTiles,
  gbaTileSizePx,
  gbaVideoModeFromProject,
  gbaVramTotalBytes,
  type GbaBackgroundMapSizeDefinition
} from "./gbaVideoModes.js";

export type GbaHardwareIssueSeverity = "warning" | "error";

export interface GbaHardwareIssue {
  code: string;
  field?: string;
  message: string;
  resolution?: string;
  sceneName?: string;
  severity: GbaHardwareIssueSeverity;
}

export interface GbaHardwareSceneContract {
  configuredMapSize: GbaBackgroundMapSizeDefinition;
  effectiveMapSize: GbaBackgroundMapSizeDefinition;
  heightPixels: number;
  heightTiles: number;
  issues: GbaHardwareIssue[];
  mapSizeExpandedAutomatically: boolean;
  name: string;
  requiredMapSize: GbaBackgroundMapSizeDefinition;
  screenblocks: number;
  sceneType: string;
  videoMode: { id: number; label: string };
  viewport: { heightPixels: number; heightTiles: number; widthPixels: number; widthTiles: number };
  widthPixels: number;
  widthTiles: number;
}

export interface GbaHardwareAssetContract {
  colorMode: string | null;
  heightPixels: number | null;
  issues: GbaHardwareIssue[];
  name: string;
  nativeObjDimension: string | null;
  oamEntries: number | null;
  role: "background" | "sprite" | "unknown";
  tileAligned: boolean | null;
  widthPixels: number | null;
}

export interface GbaHardwareContract {
  assets: GbaHardwareAssetContract[];
  backgroundMapSizes: GbaBackgroundMapSizeDefinition[];
  configuredBackgroundMapSize: GbaBackgroundMapSizeDefinition;
  issues: GbaHardwareIssue[];
  obj: {
    maxEntries: 128;
    maxSingleDimensionPixels: 64;
    nativeDimensions: string[];
    tileSizePixels: 8;
    vramBytes: number;
  };
  palette: {
    background4bppColorsPerBank: 16;
    backgroundPaletteBanks: 16;
    object4bppColorsPerBank: 16;
    objectPaletteBanks: 16;
    transparentObjectIndex: 0;
  };
  schema: 1;
  scenes: GbaHardwareSceneContract[];
  tileSizePixels: 8;
  videoMode: { id: number; label: string };
  viewport: { heightPixels: number; heightTiles: number; widthPixels: number; widthTiles: number };
}

interface RecordValue {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function assetRole(asset: RecordValue): GbaHardwareAssetContract["role"] {
  const kind = stringValue(asset.kind)?.toLowerCase() ?? "";
  if (kind.includes("sprite") || kind.includes("obj")) return "sprite";
  if (kind.includes("background") || kind === "bg" || kind.includes("tileset") || kind.includes("affine")) return "background";
  return "unknown";
}

function assetMetadata(asset: RecordValue): RecordValue {
  return isRecord(asset.metadata) ? asset.metadata : asset;
}

function assetName(asset: RecordValue, fallback: string): string {
  return stringValue(asset.name) ?? stringValue(asset.id) ?? fallback;
}

function sceneName(scene: RecordValue, index: number): string {
  return stringValue(scene.name) ?? stringValue(scene.id) ?? `Cena ${index + 1}`;
}

function sceneType(scene: RecordValue): string {
  return stringValue(scene.sceneType) ?? stringValue(scene.type) ?? "topdown";
}

function sceneDimensions(scene: RecordValue): { heightTiles: number; widthTiles: number } {
  const width = integerValue(scene.width) ?? gbaSceneViewportWidthTiles;
  const height = integerValue(scene.height) ?? gbaSceneViewportHeightTiles;
  return { widthTiles: Math.max(1, width), heightTiles: Math.max(1, height) };
}

function issue(
  code: string,
  severity: GbaHardwareIssueSeverity,
  message: string,
  field: string,
  resolution: string,
  sceneNameValue?: string
): GbaHardwareIssue {
  return {
    code,
    severity,
    message,
    field,
    resolution,
    ...(sceneNameValue ? { sceneName: sceneNameValue } : {})
  };
}

function configuredMapSizeIsExplicit(data: GBAProjectData): boolean {
  const settings = isRecord(data.settings) ? data.settings : {};
  const backgrounds = isRecord(settings.backgrounds) ? settings.backgrounds : {};
  const hardware = isRecord(settings.hardware) ? settings.hardware : {};
  return stringValue(backgrounds.defaultMapSize) !== null || stringValue(hardware.backgroundMapSize) !== null;
}

function sceneHardwareContract(
  scene: RecordValue,
  index: number,
  configuredMapSize: GbaBackgroundMapSizeDefinition,
  videoMode: { id: number; label: string },
  pagedWorldMap = false
): GbaHardwareSceneContract {
  const name = sceneName(scene, index);
  const { widthTiles, heightTiles } = sceneDimensions(scene);
  // platformer_basic and exported_shmup:stream_background draw a camera-relative 32x32 window through
  // gbs_hw.c:stage_room_tilemap16. Its logical room is not a resident BG map.
  // Keep other runtimes/modes on their existing resident-map contract.
  const streamedPlatformer = (["platformer", "shmup"].includes(sceneType(scene)) || pagedWorldMap) && videoMode.id === 0;
  const residentWidth = streamedPlatformer ? 32 : widthTiles;
  const residentHeight = streamedPlatformer ? 32 : heightTiles;
  const requiredMapSize = gbaBackgroundMapSizeForDimensions(residentWidth, residentHeight);
  const fits = gbaBackgroundMapSizeFits(configuredMapSize.id, residentWidth, residentHeight);
  const effectiveMapSize = streamedPlatformer ? requiredMapSize : (fits ? configuredMapSize : requiredMapSize);
  const issues: GbaHardwareIssue[] = [];

  if (sceneType(scene) !== "isometric" && (widthTiles < gbaSceneViewportWidthTiles || heightTiles < gbaSceneViewportHeightTiles)) {
    issues.push(issue(
      "SCENE_BELOW_GBA_VIEWPORT",
      "warning",
      `A cena ${name} tem ${widthTiles}×${heightTiles} tiles, menor que o viewport físico de ${gbaSceneViewportWidthTiles}×${gbaSceneViewportHeightTiles}.`,
      "scene.sizeTiles",
      "Mantenha pelo menos 30×20 tiles para uma cena que ocupa a tela inteira; cenas menores serão centralizadas/padronizadas pelo runtime.",
      name
    ));
  }
  if (!streamedPlatformer && (widthTiles > 64 || heightTiles > 64)) {
    issues.push(issue(
      "SCENE_EXCEEDS_GBA_BACKGROUND_MAP",
      "error",
      `A cena ${name} excede o maior mapa BG do GBA (${widthTiles}×${heightTiles} tiles; limite 64×64).`,
      "scene.sizeTiles",
      "Divida a cena em salas conectadas ou reduza sua área para caber em mapas de 32×32, 64×32, 32×64 ou 64×64 tiles.",
      name
    ));
  }
  if (!fits) {
    issues.push(issue(
      "BACKGROUND_MAP_SIZE_EXPANDED",
      "warning",
      `O mapa configurado ${configuredMapSize.id} não comporta ${name}; o contrato selecionará ${requiredMapSize.id}.`,
      "settings.backgrounds.defaultMapSize",
      `Use ${requiredMapSize.label} ou deixe o modo automático selecionar o menor mapa oficial que comporte a cena.`,
      name
    ));
  }
  const hasTilemapData = Array.isArray(scene.tilemap) || Array.isArray(scene.tileLayers);
  if ([3, 4, 5].includes(videoMode.id) && hasTilemapData) {
    issues.push(issue(
      "BITMAP_MODE_IGNORES_TILEMAP_DATA",
      "warning",
      `A cena ${name} usa ${videoMode.label}, mas ainda declara dados de tilemap que não serão desenhados nesse modo.`,
      "settings.backgrounds.graphicsMode",
      "Use Modo 0/1/2 para pintar BGs ou remova o tilemap quando a cena for um framebuffer bitmap.",
      name
    ));
  }

  return {
    name,
    sceneType: sceneType(scene),
    widthTiles,
    heightTiles,
    widthPixels: widthTiles * gbaTileSizePx,
    heightPixels: heightTiles * gbaTileSizePx,
    viewport: {
      widthPixels: gbaSceneViewportWidthPx,
      heightPixels: gbaSceneViewportHeightPx,
      widthTiles: gbaSceneViewportWidthTiles,
      heightTiles: gbaSceneViewportHeightTiles
    },
    configuredMapSize,
    requiredMapSize,
    effectiveMapSize,
    mapSizeExpandedAutomatically: !fits,
    screenblocks: effectiveMapSize.screenblocks,
    videoMode,
    issues
  };
}

function colorModeFor(asset: RecordValue, metadata: RecordValue): string | null {
  return stringValue(metadata.colorMode)
    ?? stringValue(metadata.color_mode)
    ?? stringValue(asset.colorMode)
    ?? null;
}

function assetContract(asset: RecordValue, index: number, frame?: {width: number; height: number}): GbaHardwareAssetContract {
  const name = assetName(asset, `Asset ${index + 1}`);
  const role = assetRole(asset);
  const metadata = assetMetadata(asset);
  const colorMode = colorModeFor(asset, metadata);
  const widthPixels = integerValue(metadata.width) ?? integerValue(metadata.spriteWidth) ?? integerValue(metadata.sprite_width);
  const heightPixels = integerValue(metadata.height) ?? integerValue(metadata.spriteHeight) ?? integerValue(metadata.sprite_height);
  const tileAligned = widthPixels === null || heightPixels === null ? null : widthPixels % gbaTileSizePx === 0 && heightPixels % gbaTileSizePx === 0;
  const objWidth = frame?.width ?? widthPixels;
  const objHeight = frame?.height ?? heightPixels;
  const nativeObjDimension = role === "sprite" && objWidth !== null && objHeight !== null
    ? gbaObjNativeDimension(objWidth, objHeight)
    : null;
  const oamEntries = role === "sprite" && objWidth !== null && objHeight !== null
    ? gbaSpriteOamEntriesForPixels(objWidth, objHeight)
    : null;
  const issues: GbaHardwareIssue[] = [];

  if (role === "sprite") {
    if (tileAligned === false) {
      issues.push(issue(
        "SPRITE_ASSET_NOT_TILE_ALIGNED",
        "error",
        `O sprite ${name} tem ${widthPixels}×${heightPixels} px e não respeita a grade física de 8×8 px.`,
        `assets.${name}.metadata`,
        "Ajuste a folha para dimensões múltiplas de 8 px antes de importar para OBJ."
      ));
    }
    if (nativeObjDimension === null && objWidth !== null && objHeight !== null) {
      issues.push(issue(
        "SPRITE_ASSET_REQUIRES_METASPRITE",
        "warning",
        `O ${frame ? "quadro do sprite" : "sprite"} ${name} não cabe em um único OBJ nativo (${objWidth}×${objHeight} px); será decomposto em ${oamEntries} OBJs.`,
        `assets.${name}.metadata`,
        "Mantenha a dimensão alinhada a 8 px e revise o custo de OAM; use uma dimensão nativa quando a arte puder ser simplificada."
      ));
    }
    if (colorMode !== null && !["4bpp", "8bpp"].includes(colorMode.toLowerCase())) {
      issues.push(issue(
        "SPRITE_ASSET_COLOR_MODE_UNSUPPORTED",
        "error",
        `O sprite ${name} está em ${colorMode}; OBJ suporta 4bpp ou 8bpp.`,
        `assets.${name}.metadata.colorMode`,
        "Escolha 4bpp ou 8bpp para a folha no workspace Sprites, com transparência no índice 0."
      ));
    }
    const visibleColors = integerValue(metadata.maxVisibleColors);
    if (colorMode?.toLowerCase() === "8bpp" && visibleColors !== null && visibleColors > 194) {
      issues.push(issue(
        "OBJ_SHARED_PALETTE_LIMIT_EXCEEDED",
        "error",
        `${name} declara ${visibleColors} cores visíveis em OBJ 8bpp; o GBA Studio permite até 194 cores visíveis compartilhadas, conforme o orçamento dos sprites 4bpp.`,
        `assets.${name}.metadata.maxVisibleColors`,
        "Revise a paleta ou divida as cenas. O banco 12 conserva três cores do motor e os bancos 13–15 atendem texto/UI; o assetc verifica a união real de cores na exportação."
      ));
    }
  }

  if (colorMode !== null && colorMode.toLowerCase().includes("4bpp")) {
    const visibleColors = integerValue(metadata.maxVisibleColors) ?? integerValue(metadata.colorCount) ?? integerValue(metadata.colors);
    const paletteBanks = integerValue(metadata.paletteBankCount);
    if (visibleColors !== null && visibleColors > 16 && (paletteBanks === null || paletteBanks <= 1)) {
      issues.push(issue(
        "FOUR_BPP_PALETTE_BANK_REQUIRED",
        paletteBanks === 1 ? "error" : "warning",
        `${name} declara ${visibleColors} cores para 4bpp sem bancos de paleta suficientes.`,
        `assets.${name}.metadata`,
        "Use até 16 cores por banco e declare bancos separados quando o asset precisar de mais cores."
      ));
    }
    if (paletteBanks !== null && paletteBanks > 16) {
      issues.push(issue(
        "PALETTE_BANK_LIMIT_EXCEEDED",
        "error",
        `${name} declara ${paletteBanks} bancos 4bpp; o GBA oferece no máximo 16 bancos por consumidor.`,
        `assets.${name}.metadata.paletteBankCount`,
        "Reduza os bancos ou divida o asset entre consumidores/cenas."
      ));
    }
  }

  return { name, role, colorMode, widthPixels, heightPixels, tileAligned, nativeObjDimension, oamEntries, issues };
}

function metaspriteFrameIssues(
  animationName: string,
  frameIndex: number,
  frame: RecordValue,
  frameWidth: number,
  frameHeight: number
): GbaHardwareIssue[] {
  const tiles = records(frame.tiles);
  if (tiles.length === 0) return [];

  const issues: GbaHardwareIssue[] = [];
  const decomposedSizes = new Set<string>();
  const estimatedParts = gbaMetaspriteFramePartCount(frameWidth, frameHeight, tiles.map(tile => ({
    tileWidth: integerValue(tile.tileWidth) ?? 8, tileHeight: integerValue(tile.tileHeight) ?? 8,
    sliceX: integerValue(tile.sliceX) ?? 0, sliceY: integerValue(tile.sliceY) ?? 0
  })));

  for (const [tileIndex, tile] of tiles.entries()) {
    const widthPixels = integerValue(tile.tileWidth) ?? 8;
    const heightPixels = integerValue(tile.tileHeight) ?? 8;
    const sliceX = integerValue(tile.sliceX) ?? 0;
    const sliceY = integerValue(tile.sliceY) ?? 0;
    const aligned = widthPixels >= gbaTileSizePx
      && heightPixels >= gbaTileSizePx
      && widthPixels % gbaTileSizePx === 0
      && heightPixels % gbaTileSizePx === 0
      && sliceX >= 0
      && sliceY >= 0
      && sliceX % gbaTileSizePx === 0
      && sliceY % gbaTileSizePx === 0;

    if (!aligned) {
      issues.push(issue(
        "SPRITE_METASPRITE_PART_NOT_TILE_ALIGNED",
        "error",
        `A peça ${tileIndex + 1} do frame ${frameIndex + 1} de ${animationName} usa ${widthPixels}×${heightPixels} px em slice ${sliceX},${sliceY}; OBJ exige dimensões e slices alinhados em 8×8 px.`,
        `animations.${animationName}.frames[${frameIndex}].tiles[${tileIndex}]`,
        "Use larguras, alturas, sliceX e sliceY múltiplos de 8; a posição x/y pode continuar sendo livre em pixels."
      ));
      continue;
    }

    if (!isGbaObjNativeDimension(widthPixels, heightPixels)) {
      decomposedSizes.add(`${widthPixels}×${heightPixels}`);
    }
  }

  if (decomposedSizes.size > 0) {
    issues.push(issue(
      "SPRITE_METASPRITE_PART_REQUIRES_DECOMPOSITION",
      "warning",
      `O frame ${frameIndex + 1} de ${animationName} contém peças ${[...decomposedSizes].join(", ")} que não são um único OBJ nativo; a exportação as fatiará automaticamente.`,
      `animations.${animationName}.frames[${frameIndex}].tiles`,
      "Mantenha as peças alinhadas em 8×8 e revise o custo de OBJ exibido no workspace."
    ));
  }

  if (estimatedParts > gbaMetaspritePartLimit) {
    issues.push(issue(
      "SPRITE_METASPRITE_PART_LIMIT_EXCEEDED",
      "error",
      `O frame ${frameIndex + 1} de ${animationName} precisa de aproximadamente ${estimatedParts} partes OBJ, acima do limite de ${gbaMetaspritePartLimit} partes por MetaSprite.`,
      `animations.${animationName}.frames[${frameIndex}].tiles`,
      "Reduza a quantidade de peças ou divida a composição visual; mantenha um único ator lógico somente quando o frame couber no limite do engine."
    ));
  }

  return issues;
}

function animationIssues(data: GBAProjectData): GbaHardwareIssue[] {
  const issues: GbaHardwareIssue[] = [];
  for (const [index, animation] of records(data.animations).entries()) {
    const name = stringValue(animation.name) ?? `animação ${index + 1}`;
    const widthPixels = integerValue(animation.frameWidth);
    const heightPixels = integerValue(animation.frameHeight);
    if (widthPixels === null || heightPixels === null) continue;
    if (widthPixels % gbaTileSizePx !== 0 || heightPixels % gbaTileSizePx !== 0) {
      issues.push(issue(
        "SPRITE_FRAME_NOT_TILE_ALIGNED",
        "error",
        `A animação ${name} usa frames de ${widthPixels}×${heightPixels} px; OBJ exige alinhamento em 8×8 px.`,
        `animations.${name}.frameWidth`,
        "Altere frameWidth/frameHeight para múltiplos de 8 antes de exportar."
      ));
    }
    const nativeDimension = gbaObjNativeDimension(widthPixels, heightPixels);
    if (nativeDimension === null) {
      issues.push(issue(
        "SPRITE_FRAME_REQUIRES_METASPRITE",
        "warning",
        `A animação ${name} (${widthPixels}×${heightPixels} px) será montada como metasprite com ${gbaSpriteOamEntriesForPixels(widthPixels, heightPixels)} OBJs.`,
        `animations.${name}.frameWidth`,
        "Revise OAM e mantenha a dimensão múltipla de 8; não é necessário deformar a arte para caber em um único OBJ."
      ));
    }
    const colorMode = stringValue(animation.colorMode);
    if (colorMode !== null && !["4bpp", "8bpp"].includes(colorMode.toLowerCase())) {
      issues.push(issue(
        "SPRITE_FRAME_COLOR_MODE_UNSUPPORTED",
        "error",
        `A animação ${name} está em ${colorMode}; OBJ suporta 4bpp ou 8bpp.`,
        `animations.${name}.colorMode`,
        "Escolha 4bpp ou 8bpp para a folha no workspace Sprites."
      ));
    }
    for (const [frameIndex, frame] of records(animation.frames).entries()) {
      issues.push(...metaspriteFrameIssues(name, frameIndex, frame, widthPixels, heightPixels));
    }
  }
  return issues;
}

export function buildGbaHardwareContract(data: GBAProjectData): GbaHardwareContract {
  const videoModeDefinition = gbaVideoModeFromProject(data);
  const configuredMapSize = gbaBackgroundMapSizeDefinition(gbaBackgroundMapSizeFromProject(data));
  const explicitMapSize = configuredMapSizeIsExplicit(data);
  const rawScenes = records(data.scenas);
  const scenes = rawScenes.length > 0 ? rawScenes : records(data.rooms);
  const sceneContracts = scenes.map((scene, index) => sceneHardwareContract(
    scene,
    index,
    configuredMapSize,
    { id: videoModeDefinition.id, label: videoModeDefinition.label },
    hasPagedWorldMap(data, scene)
  ));
  const framesBySheet = new Map<string, {width: number; height: number}>();
  for (const animation of records(data.animations)) {
    const sheet = stringValue(animation.spriteSheet);
    const width = integerValue(animation.frameWidth);
    const height = integerValue(animation.frameHeight);
    if (!sheet || !width || !height || width < 1 || height < 1) continue;
    const previous = framesBySheet.get(sheet);
    if (!previous || gbaSpriteOamEntriesForPixels(width, height) > gbaSpriteOamEntriesForPixels(previous.width, previous.height)) {
      framesBySheet.set(sheet, {width, height});
    }
  }
  const assets = records(data.assets).map((asset, index) => assetContract(asset, index, framesBySheet.get(assetName(asset, `Asset ${index + 1}`))));
  const issues = [
    ...sceneContracts.flatMap((scene) => scene.issues),
    ...assets.flatMap((asset) => asset.issues),
    ...animationIssues(data)
  ];
  if (!explicitMapSize && sceneContracts.some((scene) => scene.mapSizeExpandedAutomatically)) {
    issues.push({
      code: "BACKGROUND_MAP_SIZE_AUTO_SELECTED",
      severity: "warning",
      field: "settings.backgrounds.defaultMapSize",
      message: "O projeto não fixa um mapa BG; o exportador selecionará o menor tamanho oficial por cena.",
      resolution: "Defina o mapa padrão nas configurações se o projeto precisar de uma política explícita."
    });
  }

  return {
    schema: 1,
    viewport: {
      widthPixels: gbaSceneViewportWidthPx,
      heightPixels: gbaSceneViewportHeightPx,
      widthTiles: gbaSceneViewportWidthTiles,
      heightTiles: gbaSceneViewportHeightTiles
    },
    tileSizePixels: gbaTileSizePx,
    videoMode: { id: videoModeDefinition.id, label: videoModeDefinition.label },
    configuredBackgroundMapSize: configuredMapSize,
    backgroundMapSizes: gbaBackgroundMapSizeDefinitions.map((definition) => ({ ...definition })),
    obj: {
      maxEntries: 128,
      maxSingleDimensionPixels: 64,
      nativeDimensions: ["8x8", "16x16", "32x32", "64x64", "16x8", "32x8", "32x16", "64x32", "8x16", "8x32", "16x32", "32x64"],
      tileSizePixels: 8,
      vramBytes: gbaVramTotalBytes
    },
    palette: {
      background4bppColorsPerBank: 16,
      backgroundPaletteBanks: 16,
      object4bppColorsPerBank: 16,
      objectPaletteBanks: 16,
      transparentObjectIndex: 0
    },
    scenes: sceneContracts,
    assets,
    issues
  };
}

export function auditGbaHardwareBlockingErrors(data: GBAProjectData): string[] {
  return buildGbaHardwareContract(data).issues
    .filter((item) => item.severity === "error")
    .map((item) => `GBA hardware ${item.code}: ${item.message}`);
}

export function auditGbaHardwareWarnings(data: GBAProjectData): string[] {
  return buildGbaHardwareContract(data).issues
    .filter((item) => item.severity === "warning")
    .map((item) => `GBA hardware: ${item.message}`);
}
