import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent, type MouseEvent, type PointerEvent, type SetStateAction } from "react";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Eraser, Grid3X3, Layers, MousePointer2, Pause, Play, Plus, Scan, Search, SkipBack, SkipForward, Stamp, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

import { isDesktopAssetURL, resolveSpriteAssetURL } from "../shared/spriteAssetURL";
import type { SpriteStateContract } from "../shared/spriteAnimationState";
import { spriteVramRecommendationLabels } from "../shared/spriteVramAnalysis";
import {
  canvasPointToSpriteSheetTileSlice,
  deriveDefaultMetaspriteTilePosition,
  deriveSpriteAnimatedPreviewFrameIndex,
  deriveMetaspriteCanvasSize,
  deriveSpriteCanvasFitScale,
  deriveSpriteHitboxBounds,
  deriveSpriteOriginMarkerPosition,
  deriveSpriteMetaspriteCanvasAction,
  deriveSpriteMetaspriteTileKeyboardAction,
  deriveSpritePaintBrush,
  deriveSpriteFramePreviewRegions,
  deriveSpritePaintTilePanelMetrics,
  deriveSpriteStateDirectionPreviewRegions,
  deriveSpriteSheetFrameGridRegions,
  deriveSpritesWorkspaceSummaryCards,
  deriveSpritesWorkspaceValidationIssues,
  findMetaspriteTileAtCanvasPoint,
  filterSpritesWorkspaceSheets,
  listSpritePaletteReferencesForSheet,
  resolveActiveSpriteAnimation,
  resolveSpritePaletteSource,
  resolveSpriteWorkspaceCanvasFrame,
  spriteCanvasDefaultOriginX,
  stepSpritePlaybackFrameIndex
} from "../shared/spritesWorkspace";
import { WorkspaceInspectorRail } from "./WorkspaceInspectorRail";
import { InspectorAction, InspectorNumber, InspectorRange, InspectorSelect, InspectorSection, InspectorToggle, InspectorVector2 } from "./InspectorControls";
import { ProjectReferencePicker, StudioChip, WorkspaceContextToolbar, WorkspaceEmptyState } from "./studioUi";
import { StudioContextMenu, type StudioContextMenuState } from "./StudioContextMenu";
import { SpritesEditorCenter } from "./SpritesEditorCenter";
import type {
  SpritePaletteSourceKind,
  SpritesWorkspaceAnimation,
  SpritesWorkspaceSheet,
  SpritesWorkspacePresentation,
  SpriteMetaspriteFramePresentation,
  SpriteMetaspriteTilePresentation,
  SpriteStateDirectionPreview,
  SpriteStateDirectionOptions,
  SpritePaintBrushState,
  AddSpriteMetaspriteTileOptions,
  RemoveSpriteMetaspriteTileOptions,
  SpriteMetaspriteCanvasAction,
  MoveSpriteMetaspriteTilesOptions,
  ReorderSpriteMetaspriteTilesOptions,
  ToggleSpriteMetaspriteTilesFlipOptions,
  UpdateSpriteAnimationFields,
  UpdateSpriteAnimationStateFields,
  UpdateSpriteMetaspriteTileOptions,
  UpdateSpriteMetaspriteFrameOptions
} from "../shared/spritesWorkspace";

interface SpritesWorkspaceProps {
  presentation: SpritesWorkspacePresentation | null;
  projectPath?: string;
  focusedAssetName?: string | null;
  focusRequestID?: number | null;
  onCreateAnimation(spriteSheet: string): void;
  onImportSpriteSheets(): Promise<void>;
  onUpdateAnimationFields(animationID: string, fields: UpdateSpriteAnimationFields): void;
  onUpdateAnimationState(animationStateID: string, fields: UpdateSpriteAnimationStateFields): void;
  onUpdateMetaspriteFrame(animationID: string, options: UpdateSpriteMetaspriteFrameOptions): void;
  onAddMetaspriteTile(animationID: string, options: AddSpriteMetaspriteTileOptions): void;
  onRemoveMetaspriteTile(animationID: string, options: RemoveSpriteMetaspriteTileOptions): void;
  onUpdateMetaspriteTile(animationID: string, options: UpdateSpriteMetaspriteTileOptions): void;
  onMoveMetaspriteTiles(animationID: string, options: MoveSpriteMetaspriteTilesOptions): void;
  onToggleMetaspriteTilesFlip(animationID: string, options: ToggleSpriteMetaspriteTilesFlipOptions): void;
  onReorderMetaspriteTiles(animationID: string, options: ReorderSpriteMetaspriteTilesOptions): void;
  onRemoveMetaspriteTiles(animationID: string, frameIndex: number, tileIndexes: number[]): void;
  onFitAnimationHitbox(animationID: string, frameIndex: number): void;
  onCopyAnimationGeometry(animationID: string): void;
  onGenerateSpriteFromReference(referenceID: string, title: string, assetName: string | null, generatedSpriteAssetName: string | null): void;
  onRenameAnimation(animationID: string, currentName: string): void;
  onDuplicateAnimation(animationID: string, currentName: string): void;
  onRemoveAnimation(animationID: string, currentName: string): void;
  onRenameSpriteSheet(assetID: string, currentName: string): void;
  onDuplicateSpriteSheet(assetID: string, currentName: string): void;
  onRemoveSpriteSheet(assetID: string, currentName: string): void;
}

interface SpriteContextMenuState extends StudioContextMenuState {
  assetID: string;
  kind: "animation" | "sheet";
}

type SpriteSheetInteractionMode = "frames" | "slice";
type SpriteAnimatorMode = "select" | "paint" | "erase" | "geometry";
type SpriteInspectorTab = "animation" | "frame" | "geometry";

const spriteInspectorTabs: Array<{ id: SpriteInspectorTab; label: string }> = [
  { id: "animation", label: "Animação" },
  { id: "geometry", label: "Quadro" },
  { id: "frame", label: "Tile" }
];

const spriteStateLabels: Record<string, string> = {
  idle: "Parado", walk: "Caminhar", run: "Correr", attack: "Atacar", interact: "Interagir",
  jump: "Pular", fall: "Cair", climb: "Escalar", hit: "Dano", death: "Derrota", dash: "Dash"
};
const spriteDirectionLabels: Record<string, string> = {
  up: "Cima", down: "Baixo", left: "Esquerda", right: "Direita", none: "Fixa"
};
function spriteStateLabel(state: string): string {
  return spriteStateLabels[state] ?? state.replace(/[_-]+/g, " ");
}
function spriteSheetLabel(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}
function SpriteLibraryThumbnail({ sheet, animation, projectPath }: {
  sheet: SpritesWorkspaceSheet; animation?: SpritesWorkspaceAnimation; projectPath?: string;
}): React.ReactElement {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const sourceURL = resolveSpriteAssetURL(projectPath, sheet.source, sheet.bundledDefaultAsset);
  const frame = animation?.metaspriteFrames[0];
  const tile = frame?.tiles[0];
  const width = tile?.tileWidth ?? animation?.frameWidth ?? size?.width ?? 32;
  const height = tile?.tileHeight ?? animation?.frameHeight ?? size?.height ?? 32;
  const scale = Math.min(40 / width, 44 / height);
  return <span className="sprite-library-thumbnail" aria-hidden="true">
    {sourceURL ? <span className="sprite-library-thumbnail-crop" style={{ width: width * scale, height: height * scale }}><img alt="" loading="lazy" src={sourceURL} style={{
      width: size ? size.width * scale : 40, height: size ? size.height * scale : 44,
      left: -(tile?.sliceX ?? 0) * scale, top: -(tile?.sliceY ?? 0) * scale,
      transform: tile ? `scale(${tile.flipX ? -1 : 1}, ${tile.flipY ? -1 : 1})` : undefined,
      transformOrigin: `${(tile?.sliceX ?? 0) * scale + width * scale / 2}px ${(tile?.sliceY ?? 0) * scale + height * scale / 2}px`
    }} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /></span> : <Scan size={20} />}
  </span>;
}

function pauseSpritePlayback(setIsSpritePlaybackRunning: (running: boolean) => void): void {
  setIsSpritePlaybackRunning(false);
}

function selectSpriteFrameIndex(
  frameIndex: number,
  setIsSpritePlaybackRunning: (running: boolean) => void,
  setSelectedMetaspriteFrameIndex: (frameIndex: number) => void,
  setSelectedMetaspriteTileIndex: (tileIndex: number) => void,
  setSelectedMetaspriteTileIndexes: (tileIndexes: number[]) => void
): void {
  pauseSpritePlayback(setIsSpritePlaybackRunning);
  setSelectedMetaspriteFrameIndex(frameIndex);
  setSelectedMetaspriteTileIndex(0);
  setSelectedMetaspriteTileIndexes([]);
}

interface SpriteCanvasDisplayOptions {
  showGrid: boolean;
  showHitbox: boolean;
  showOnionSkin: boolean;
  showOrigin: boolean;
  zoom: number;
}

function normalizeMetaspriteTileSelection(frame: SpriteMetaspriteFramePresentation | null | undefined, tileIndexes: number[]): number[] {
  if (!frame || frame.tileCount <= 0) return [];
  const selected = new Set<number>();
  for (const tileIndex of tileIndexes) {
    if (Number.isInteger(tileIndex) && tileIndex >= 0 && tileIndex < frame.tileCount) {
      selected.add(tileIndex);
    }
  }
  return [...selected].sort((left, right) => left - right);
}

function deriveTileSelectionFromClick(
  currentSelection: number[],
  clickedTileIndex: number,
  anchorTileIndex: number,
  tileCount: number,
  event: Pick<MouseEvent<HTMLButtonElement>, "metaKey" | "ctrlKey" | "shiftKey">
): number[] {
  if (event.shiftKey) {
    const start = Math.max(0, Math.min(anchorTileIndex, clickedTileIndex));
    const end = Math.min(tileCount - 1, Math.max(anchorTileIndex, clickedTileIndex));
    return Array.from({ length: end - start + 1 }, (_item, index) => start + index);
  }

  if (event.metaKey || event.ctrlKey) {
    const selected = new Set(currentSelection);
    if (selected.has(clickedTileIndex)) {
      selected.delete(clickedTileIndex);
    } else {
      selected.add(clickedTileIndex);
    }
    return [...selected].sort((left, right) => left - right);
  }

  return [clickedTileIndex];
}

function deriveTileSelectionFromCanvasRect(
  currentSelection: number[],
  frame: SpriteMetaspriteFramePresentation,
  rect: { left: number; right: number; top: number; bottom: number },
  canvasSize: { width: number; height: number },
  additive: boolean
): number[] {
  const left = (Math.min(rect.left, rect.right) / canvasSize.width) * frame.width;
  const right = (Math.max(rect.left, rect.right) / canvasSize.width) * frame.width;
  const top = (Math.min(rect.top, rect.bottom) / canvasSize.height) * frame.height;
  const bottom = (Math.max(rect.top, rect.bottom) / canvasSize.height) * frame.height;
  const selected = additive ? new Set(currentSelection) : new Set<number>();
  const canvasOriginX = spriteCanvasDefaultOriginX(frame.width);

  for (const tile of frame.tiles) {
    const tileLeft = canvasOriginX + tile.x;
    const tileTop = frame.height - tile.y - tile.tileHeight;
    const tileRight = tileLeft + tile.tileWidth;
    const tileBottom = tileTop + tile.tileHeight;
    const intersects = tileRight >= left && tileLeft <= right && tileBottom >= top && tileTop <= bottom;
    if (intersects) {
      selected.add(tile.tileIndex);
    }
  }

  return [...selected].sort((leftIndex, rightIndex) => leftIndex - rightIndex);
}

const spriteAnimatorModes: Array<{
  id: SpriteAnimatorMode;
  label: string;
  shortLabel: string;
  title: string;
  summary: string;
  chips: string[];
}> = [
  {
    id: "select",
    label: "Selecionar",
    shortLabel: "Sel",
    title: "Modo Selecionar",
    summary: "Escolha frames, tiles e animações sem alterar a arte.",
    chips: ["Tiles", "Frame ativo", "Inspector"]
  },
  {
    id: "paint",
    label: "Pintar",
    shortLabel: "Pint",
    title: "Modo Pintar",
    summary: "Prepara pintura de tiles e preview visual sobre o sprite sheet.",
    chips: ["Pincel", "Preview", "Paleta OBJ"]
  },
  {
    id: "erase",
    label: "Apagar",
    shortLabel: "Apag",
    title: "Modo Apagar",
    summary: "Remove tiles do metasprite mantendo frame, origem e recorte visíveis.",
    chips: ["Remover tile", "Recorte", "Sem perda"]
  },
  {
    id: "geometry",
    label: "Geometria",
    shortLabel: "Geom",
    title: "Modo Geometria",
    summary: "Ajusta origem, tamanho do tile, flip e prioridade do objeto.",
    chips: ["Origem", "Flip", "Tamanho"]
  },
];

function spriteSheetPreview(
  sheet: SpritesWorkspaceSheet,
  previewAnimation: SpritesWorkspaceAnimation | null,
  activeMetaspriteFrame: SpriteMetaspriteFramePresentation | null,
  activeMetaspriteTile: SpriteMetaspriteTilePresentation | null,
  paintBrush: SpriteMetaspriteTilePresentation | null,
  interactionMode: SpriteSheetInteractionMode,
  setInteractionMode: (mode: SpriteSheetInteractionMode) => void,
  onUpdatePaintBrush: (animationID: string, fields: SpritePaintBrushState) => void,
  projectPath: string | undefined,
  imageSizes: Record<string, { width: number; height: number }>,
  setImageSizes: Dispatch<SetStateAction<Record<string, { width: number; height: number }>>>,
  onUpdateAnimationFields: SpritesWorkspaceProps["onUpdateAnimationFields"],
  onUpdateMetaspriteTile: SpritesWorkspaceProps["onUpdateMetaspriteTile"],
  compactPalette?: boolean,
  activeSpriteMode: SpriteAnimatorMode = "select",
  paletteSourceKind: SpritePaletteSourceKind = "sheet",
  onPaletteSourceKindChange?: (kind: SpritePaletteSourceKind) => void,
  paletteReferenceId: string | null = null,
  onPaletteReferenceIdChange?: (referenceId: string) => void,
  paletteReferences: Array<{ assetName: string | null; id: string; title: string }> = [],
  paletteSourcePath: string | null = sheet.source,
  paletteBundledDefaultAsset: string | null | undefined = sheet.bundledDefaultAsset,
  paletteImageKey: string = sheet.name
): React.ReactElement {
  const sourceURL = resolveSpriteAssetURL(projectPath, paletteSourcePath, paletteBundledDefaultAsset ?? null);
  const imageSize = imageSizes[paletteImageKey] ?? null;
  const frameRegions = previewAnimation && imageSize
    ? deriveSpriteFramePreviewRegions({
      frameCount: previewAnimation.frameCount,
      frameHeight: previewAnimation.frameHeight,
      frameWidth: previewAnimation.frameWidth,
      imageHeight: imageSize.height,
      imageWidth: imageSize.width,
      maxPreviewFrames: 12
    })
    : [];
  const frameGridRegions = previewAnimation && imageSize
    ? deriveSpriteSheetFrameGridRegions({
      frameHeight: previewAnimation.frameHeight,
      frameWidth: previewAnimation.frameWidth,
      imageHeight: imageSize.height,
      imageWidth: imageSize.width,
      maxPreviewFrames: 64
    })
    : [];
  const usePaintBrushSlice = activeSpriteMode === "paint";
  const activeSliceTarget = usePaintBrushSlice
    ? paintBrush
    : (activeMetaspriteTile ?? paintBrush);
  const canPickTileSlice = Boolean(previewAnimation && activeMetaspriteFrame && activeSliceTarget && imageSize);
  const isSliceMode = canPickTileSlice && (interactionMode === "slice" || activeSpriteMode === "paint");
  const paintTileMetrics = imageSize
    ? deriveSpritePaintTilePanelMetrics({
      imageHeight: imageSize.height,
      imageWidth: imageSize.width,
      sliceX: activeSliceTarget?.sliceX ?? 0,
      sliceY: activeSliceTarget?.sliceY ?? 0,
      tileHeight: activeSliceTarget?.tileHeight ?? Math.min(previewAnimation?.frameHeight ?? 8, 16),
      tileWidth: activeSliceTarget?.tileWidth ?? Math.min(previewAnimation?.frameWidth ?? 8, 16)
    })
    : null;
  const frameSizePresets = [
    { height: 16, label: "16x16", width: 16 },
    { height: 32, label: "16x32", width: 16 },
    { height: 32, label: "32x32", width: 32 }
  ];
  const isCustomFrameSize = previewAnimation
    ? !frameSizePresets.some((preset) => preset.width === previewAnimation.frameWidth && preset.height === previewAnimation.frameHeight)
    : false;
  const sliceMarkerStyle = activeSliceTarget && imageSize
    ? {
      height: `${(activeSliceTarget.tileHeight / imageSize.height) * 100}%`,
      left: `${(activeSliceTarget.sliceX / imageSize.width) * 100}%`,
      top: `${(activeSliceTarget.sliceY / imageSize.height) * 100}%`,
      width: `${(activeSliceTarget.tileWidth / imageSize.width) * 100}%`
    }
    : null;

  function updateTileSliceFromPointer(event: PointerEvent<HTMLButtonElement>): void {
    if (!previewAnimation || !activeMetaspriteFrame || !activeSliceTarget || !imageSize) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextSlice = canvasPointToSpriteSheetTileSlice({
      canvasHeight: bounds.height,
      canvasWidth: bounds.width,
      imageHeight: imageSize.height,
      imageWidth: imageSize.width,
      pointX: event.clientX - bounds.left,
      pointY: event.clientY - bounds.top,
      tileHeight: activeSliceTarget.tileHeight,
      tileWidth: activeSliceTarget.tileWidth
    });

    if (usePaintBrushSlice || !activeMetaspriteTile) {
      onUpdatePaintBrush(previewAnimation.id, {
        ...nextSlice,
        sourceSheet: activeSliceTarget.sourceSheet,
        tileHeight: activeSliceTarget.tileHeight,
        tileWidth: activeSliceTarget.tileWidth
      });
      return;
    }

    onUpdateMetaspriteTile(previewAnimation.id, {
      fields: nextSlice,
      frameIndex: activeMetaspriteFrame.frameIndex,
      tileIndex: activeMetaspriteTile.tileIndex
    });
  }

  function beginSliceDrag(event: PointerEvent<HTMLButtonElement>): void {
    updateTileSliceFromPointer(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueSliceDrag(event: PointerEvent<HTMLButtonElement>): void {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateTileSliceFromPointer(event);
  }

  function endSliceDrag(event: PointerEvent<HTMLButtonElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function adjustBrushSize(deltaWidth: number, deltaHeight: number): void {
    if (!previewAnimation || !paintBrush) return;
    onUpdatePaintBrush(previewAnimation.id, {
      tileHeight: Math.max(8, Math.min(previewAnimation.frameHeight, paintBrush.tileHeight + deltaHeight)),
      tileWidth: Math.max(8, Math.min(previewAnimation.frameWidth, paintBrush.tileWidth + deltaWidth))
    });
  }

  return (
    <div
      className={[
        "sprite-sheet-preview",
        isSliceMode ? "slice-mode" : "",
        activeMetaspriteTile ? "has-active-tile" : "",
        compactPalette ? "palette-mode" : "",
        paletteSourceKind === "reference" ? "palette-reference-mode" : ""
      ].filter(Boolean).join(" ")}
      aria-label={`Preview visual de ${sheet.name}`}
    >
      {compactPalette ? (
        <div className="sprite-sheet-palette-toolbar" aria-label="Paleta de pintura">
          <div className="sprite-sheet-source-toggle" role="group" aria-label="Fonte da paleta">
            <button
              aria-pressed={paletteSourceKind === "sheet"}
              className={paletteSourceKind === "sheet" ? "active" : ""}
              onClick={() => onPaletteSourceKindChange?.("sheet")}
              type="button"
            >
              Sheet
            </button>
            <button
              aria-pressed={paletteSourceKind === "reference"}
              className={paletteSourceKind === "reference" ? "active" : ""}
              disabled={paletteReferences.length === 0}
              onClick={() => onPaletteSourceKindChange?.("reference")}
              type="button"
            >
              Referência
            </button>
          </div>
          {paletteSourceKind === "reference" && paletteReferences.length > 1 ? (
            <select
              aria-label="Referência ativa"
              onChange={(event) => onPaletteReferenceIdChange?.(event.currentTarget.value)}
              value={paletteReferenceId ?? paletteReferences[0]?.id ?? ""}
            >
              {paletteReferences.map((reference) => (
                <option key={reference.id} value={reference.id}>{reference.title}</option>
              ))}
            </select>
          ) : null}
          <span className="sprite-sheet-palette-brush">{paintTileMetrics?.brushLabel ?? "Selecione um recorte"}</span>
          {previewAnimation && paintBrush ? (
            <div className="sprite-sheet-brush-size-controls" aria-label="Tamanho do brush">
              <button onClick={() => adjustBrushSize(-8, 0)} type="button">W-</button>
              <button onClick={() => adjustBrushSize(8, 0)} type="button">W+</button>
              <button onClick={() => adjustBrushSize(0, -8)} type="button">H-</button>
              <button onClick={() => adjustBrushSize(0, 8)} type="button">H+</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="sprite-sheet-preview-header">
          <div className="sprite-sheet-preview-title">
            <strong>Tiles</strong>
            <span>{paintTileMetrics ? `${paintTileMetrics.tileCount.toLocaleString("pt-BR")} Tiles` : "Aguardando imagem"}</span>
          </div>
          <span>{paintTileMetrics?.brushLabel ?? "Brush aguardando frame"}</span>
        </div>
      )}
      {compactPalette ? null : (
        <div className="sprite-sheet-context-row">
          <span>Ativa</span>
          <strong>{previewAnimation?.name ?? "Sem animação"}</strong>
          <span>Referência</span>
          <strong>{sheet.name}</strong>
        </div>
      )}
      {previewAnimation && !compactPalette ? (
        <div className="sprite-sheet-size-bar" aria-label="Tamanho do frame ativo">
          <div className="sprite-sheet-size-presets" role="group" aria-label="Presets de frame">
            {frameSizePresets.map((preset) => (
              <button
                aria-pressed={previewAnimation.frameWidth === preset.width && previewAnimation.frameHeight === preset.height}
                className={previewAnimation.frameWidth === preset.width && previewAnimation.frameHeight === preset.height ? "active" : ""}
                key={preset.label}
                onClick={() => onUpdateAnimationFields(previewAnimation.id, {
                  frameHeight: preset.height,
                  frameWidth: preset.width
                })}
                type="button"
              >
                {preset.label}
              </button>
            ))}
            <span aria-pressed={isCustomFrameSize} className={isCustomFrameSize ? "active" : ""} role="status">
              Livre
            </span>
          </div>
          <InspectorNumber
            className="sprite-sheet-frame-size-field"
            description="Largura do recorte."
            label="W"
            max={imageSize?.width}
            min={1}
            onChange={(frameWidth) => onUpdateAnimationFields(previewAnimation.id, { frameWidth })}
            unit="px"
            value={previewAnimation.frameWidth}
          />
          <InspectorNumber
            className="sprite-sheet-frame-size-field"
            description="Altura do recorte."
            label="H"
            max={imageSize?.height}
            min={1}
            onChange={(frameHeight) => onUpdateAnimationFields(previewAnimation.id, { frameHeight })}
            unit="px"
            value={previewAnimation.frameHeight}
          />
        </div>
      ) : null}
      {previewAnimation && canPickTileSlice && activeSpriteMode !== "paint" ? (
        <div className="sprite-sheet-interaction-toggle" role="group" aria-label="Interacao do sprite sheet">
          <button
            aria-pressed={interactionMode === "frames"}
            className={interactionMode === "frames" ? "active" : ""}
            onClick={() => setInteractionMode("frames")}
            type="button"
          >
            Frames
          </button>
          <button
            aria-pressed={interactionMode === "slice"}
            className={interactionMode === "slice" ? "active" : ""}
            onClick={() => setInteractionMode("slice")}
            type="button"
          >
            Recorte
          </button>
        </div>
      ) : null}
      {sourceURL ? (
        <div className="sprite-sheet-image-stage">
          <div className="sprite-sheet-image-stack">
            <img
              alt={`Sprite sheet ${sheet.name}`}
              crossOrigin={isDesktopAssetURL(sourceURL) ? "anonymous" : undefined}
              onLoad={(event) => {
                const nextSize = {
                  height: event.currentTarget.naturalHeight,
                  width: event.currentTarget.naturalWidth
                };
                setImageSizes((current) => ({
                  ...current,
                  [paletteImageKey]: nextSize
                }));
              }}
              src={sourceURL}
            />
            {imageSize ? frameRegions.map((region) => (
              <span
                className="sprite-frame-region"
                key={`${sheet.name}-frame-${region.frameIndex}`}
                style={{
                  height: `${(region.height / imageSize.height) * 100}%`,
                  left: `${(region.x / imageSize.width) * 100}%`,
                  top: `${(region.y / imageSize.height) * 100}%`,
                  width: `${(region.width / imageSize.width) * 100}%`
                }}
              >
                {region.frameIndex + 1}
              </span>
            )) : null}
            {imageSize && previewAnimation ? frameGridRegions.map((region) => {
              const isDeclaredFrame = region.frameIndex < previewAnimation.frameCount;
              return (
                <button
                  aria-label={`Definir frames ate ${region.frameIndex + 1}`}
                  className={isDeclaredFrame ? "sprite-frame-grid-region declared" : "sprite-frame-grid-region"}
                  key={`${sheet.name}-grid-frame-${region.frameIndex}`}
                  onClick={() => onUpdateAnimationFields(previewAnimation.id, { frameCount: region.frameIndex + 1 })}
                  style={{
                    height: `${(region.height / imageSize.height) * 100}%`,
                    left: `${(region.x / imageSize.width) * 100}%`,
                    top: `${(region.y / imageSize.height) * 100}%`,
                    width: `${(region.width / imageSize.width) * 100}%`
                  }}
                  type="button"
                />
              );
            }) : null}
            {isSliceMode && activeSliceTarget ? (
              <button
                aria-label={activeMetaspriteTile
                  ? `Escolher recorte do tile ${activeMetaspriteTile.tileIndex + 1}`
                  : "Escolher recorte do brush de pintura"}
                className="sprite-sheet-slice-picker"
                onPointerCancel={endSliceDrag}
                onPointerDown={beginSliceDrag}
                onPointerMove={continueSliceDrag}
                onPointerUp={endSliceDrag}
                type="button"
              >
                {sliceMarkerStyle ? (
                  <span className="sprite-sheet-slice-marker" style={sliceMarkerStyle}>
                    {activeMetaspriteTile ? activeMetaspriteTile.tileIndex + 1 : "Brush"}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="sprite-sheet-preview-empty">
          <span>{sheet.hasAsset ? "Sem source" : "Asset ausente"}</span>
        </div>
      )}
      {paintTileMetrics && activeSliceTarget && !compactPalette ? (
        <div className="sprite-sheet-brush-readout" aria-label="Brush atual de pintura">
          <span>Brush</span>
          <strong>{paintTileMetrics.brushLabel}</strong>
          <small>{activeMetaspriteTile ? `Tile ${activeMetaspriteTile.tileIndex + 1}` : "Pronto para pintar primeiro tile"}</small>
        </div>
      ) : null}
    </div>
  );
}

function stateDirectionPreviewGrid(
  previews: SpriteStateDirectionPreview[],
  activeAnimationID: string | null,
  selectedMetaspriteFrameIndex: number,
  animationElapsedMs: number,
  sourceURL: string | null,
  imageSize: { width: number; height: number } | null,
  setSelectedAnimationID: (animationID: string) => void,
  setIsSpritePlaybackRunning: (running: boolean) => void,
  setSelectedMetaspriteFrameIndex: (frameIndex: number) => void
): React.ReactElement | null {
  if (previews.length === 0) return null;

  return (
    <div className="sprite-state-direction-preview-grid" aria-label="Previews por estado e direcao">
      {previews.map((preview) => {
        const regions = sourceURL && imageSize
          ? deriveSpriteStateDirectionPreviewRegions({
            imageHeight: imageSize.height,
            imageWidth: imageSize.width,
            maxPreviewFrames: 4,
            preview
          })
          : [];
        return (
          <div
            className={preview.animationID === activeAnimationID ? "sprite-state-direction-preview-card active" : "sprite-state-direction-preview-card"}
            key={`${preview.state}-${preview.direction}-${preview.animationID}`}
          >
            <div className="sprite-state-direction-strip">
              {regions.length > 0 && imageSize && sourceURL ? regions.map((region) => {
                const backgroundSize = `${(imageSize.width / region.width) * 100}% ${(imageSize.height / region.height) * 100}%`;
                const backgroundPosition = `${imageSize.width === region.width ? 0 : (region.x / (imageSize.width - region.width)) * 100}% ${imageSize.height === region.height ? 0 : (region.y / (imageSize.height - region.height)) * 100}%`;
                const isActiveFrame = preview.animationID === activeAnimationID && region.frameIndex === selectedMetaspriteFrameIndex;
                const isAnimatedFrame = region.frameIndex === deriveSpriteAnimatedPreviewFrameIndex({ elapsedMs: animationElapsedMs, preview });
                return (
                  <button
                    aria-label={`Selecionar ${preview.state} ${preview.direction}, frame ${region.frameIndex + 1}`}
                    className={[
                      "sprite-state-direction-thumbnail",
                      isActiveFrame ? "active" : "",
                      isAnimatedFrame ? "playing" : ""
                    ].filter(Boolean).join(" ")}
                    key={`${preview.animationID}-frame-${region.frameIndex}`}
                    onClick={() => {
                      pauseSpritePlayback(setIsSpritePlaybackRunning);
                      setSelectedAnimationID(preview.animationID);
                      setSelectedMetaspriteFrameIndex(region.frameIndex);
                    }}
                    style={{
                      aspectRatio: `${region.width} / ${region.height}`,
                      backgroundImage: `url("${sourceURL}")`,
                      backgroundPosition,
                      backgroundSize
                    }}
                    type="button"
                  />
                );
              }) : (
                <span className="sprite-state-direction-thumbnail empty">
                  {preview.state.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <button
              aria-pressed={preview.animationID === activeAnimationID}
              className="sprite-state-direction-select"
              onClick={() => setSelectedAnimationID(preview.animationID)}
              type="button"
            >
              <span>{preview.state}</span>
              <strong>{preview.direction}</strong>
              <small>{preview.frameCount}f · {preview.fps}fps · {preview.frameSize}</small>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function spriteSheetRegionStyle(
  sourceURL: string | null | undefined,
  imageSize: { width: number; height: number } | null | undefined,
  region: { x: number; y: number; width: number; height: number }
): CSSProperties {
  if (!sourceURL || !imageSize || region.width <= 0 || region.height <= 0) {
    return {};
  }

  const maxX = Math.max(0, imageSize.width - region.width);
  const maxY = Math.max(0, imageSize.height - region.height);
  const sourceX = Math.max(0, Math.min(region.x, maxX));
  const sourceY = Math.max(0, Math.min(region.y, maxY));

  return {
    backgroundImage: `url("${sourceURL}")`,
    backgroundPosition: `${maxX === 0 ? 0 : (sourceX / maxX) * 100}% ${maxY === 0 ? 0 : (sourceY / maxY) * 100}%`,
    backgroundSize: `${(imageSize.width / region.width) * 100}% ${(imageSize.height / region.height) * 100}%`
  };
}

function metaspriteReferenceFrameStyle(
  frame: SpriteMetaspriteFramePresentation,
  frameIndex: number,
  sourceURL?: string | null,
  imageSize?: { width: number; height: number } | null
): CSSProperties {
  if (!imageSize || frame.width <= 0 || frame.height <= 0) {
    return {};
  }

  const frameColumns = Math.max(1, Math.floor(imageSize.width / frame.width));
  return spriteSheetRegionStyle(sourceURL, imageSize, {
    height: frame.height,
    width: frame.width,
    x: (frameIndex % frameColumns) * frame.width,
    y: Math.floor(frameIndex / frameColumns) * frame.height
  });
}

function SpriteFrameThumbnail({ frame, sourceURL, imageSize }: {
  frame: SpriteMetaspriteFramePresentation; sourceURL: string | null; imageSize: { width: number; height: number } | null;
}): React.ReactElement {
  return <span aria-hidden="true" className="sprite-composer-frame-thumbnail" style={{ aspectRatio: `${frame.width} / ${frame.height}` }}>
    {sourceURL && imageSize ? frame.tiles.map((tile) => <span key={tile.tileIndex} className="sprite-frame-thumbnail-tile" style={{
      left: `${(spriteCanvasDefaultOriginX(frame.width) + tile.x) / frame.width * 100}%`,
      top: `${(frame.height - tile.y - tile.tileHeight) / frame.height * 100}%`,
      width: `${tile.tileWidth / frame.width * 100}%`, height: `${tile.tileHeight / frame.height * 100}%`,
      ...spriteSheetRegionStyle(sourceURL, imageSize, { x: tile.sliceX, y: tile.sliceY, width: tile.tileWidth, height: tile.tileHeight }),
      transform: `scale(${tile.flipX ? -1 : 1}, ${tile.flipY ? -1 : 1})`
    }} />) : null}
  </span>;
}

function metaspriteCanvas(
  animation: SpritesWorkspaceAnimation,
  frame: SpriteMetaspriteFramePresentation,
  frameIndex: number,
  selectedTile: SpriteMetaspriteTilePresentation,
  selectedTileIndexes: number[],
  activeSpriteMode: SpriteAnimatorMode,
  displayOptions: SpriteCanvasDisplayOptions,
  onAddMetaspriteTile: SpritesWorkspaceProps["onAddMetaspriteTile"],
  onRemoveMetaspriteTile: SpritesWorkspaceProps["onRemoveMetaspriteTile"],
  onUpdateMetaspriteTile: SpritesWorkspaceProps["onUpdateMetaspriteTile"],
  onSelectMetaspriteTiles: (tileIndexes: number[]) => void,
  sourceURL?: string | null,
  imageSize?: { width: number; height: number } | null,
  previousFrame?: SpriteMetaspriteFramePresentation | null,
  containerSize?: { width: number; height: number } | null
): React.ReactElement {
  const hasSelectedTile = selectedTile.tileIndex >= 0;
  const selectedTileIndexSet = new Set(normalizeMetaspriteTileSelection(frame, selectedTileIndexes));
  const referenceFrameStyle = metaspriteReferenceFrameStyle(frame, frameIndex, sourceURL, imageSize);
  const hasReferenceFrame = Object.keys(referenceFrameStyle).length > 0;
  const shouldShowReferenceFrame = hasReferenceFrame && activeSpriteMode === "paint" && frame.tileCount === 0;
  const stagePadding = 24;
  const boundedMaxWidth = containerSize
    ? Math.max(64, containerSize.width - stagePadding)
    : Math.max(160, frame.width * displayOptions.zoom);
  const boundedMaxHeight = containerSize
    ? Math.max(64, containerSize.height - stagePadding)
    : Math.max(160, frame.height * displayOptions.zoom);
  const canvasSize = deriveMetaspriteCanvasSize({
    frameHeight: frame.height,
    frameWidth: frame.width,
    maxHeight: boundedMaxHeight,
    maxWidth: boundedMaxWidth,
    preferredScale: displayOptions.zoom
  });
  const canvasStyle = {
    "--sprite-canvas-grid-step": `${canvasSize.scale * 8}px`,
    "--sprite-canvas-height": `${canvasSize.height}px`,
    "--sprite-canvas-width": `${canvasSize.width}px`,
    aspectRatio: `${frame.width} / ${frame.height}`
  } as CSSProperties;
  const hitboxBounds = deriveSpriteHitboxBounds({
    ...animation.geometry,
    frameHeight: frame.height,
    frameWidth: frame.width,
    originX: frame.originX,
    originY: frame.originY
  });

  function executeCanvasAction(action: SpriteMetaspriteCanvasAction | null): void {
    if (!action) return;
    if (action.type === "add_tile") {
      onAddMetaspriteTile(action.animationID, action.options);
      return;
    }

    if (action.type === "remove_tile") {
      onRemoveMetaspriteTile(action.animationID, action.options);
      return;
    }

    onUpdateMetaspriteTile(action.animationID, action.options);
  }

  function updateTileFromPointer(event: PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (activeSpriteMode === "select") {
      const tileIndex = findMetaspriteTileAtCanvasPoint({
        canvasHeight: bounds.height,
        canvasWidth: bounds.width,
        frameHeight: frame.height,
        frameWidth: frame.width,
        originX: frame.originX,
        originY: frame.originY,
        pointX: event.clientX - bounds.left,
        pointY: event.clientY - bounds.top,
        tiles: frame.tiles
      });
      if (tileIndex !== null) {
        onSelectMetaspriteTiles(deriveTileSelectionFromClick(
          selectedTileIndexes,
          tileIndex,
          selectedTile.tileIndex >= 0 ? selectedTile.tileIndex : tileIndex,
          frame.tileCount,
          event
        ));
        return;
      }
    }

    executeCanvasAction(deriveSpriteMetaspriteCanvasAction({
      animationID: animation.id,
      canvasHeight: bounds.height,
      canvasWidth: bounds.width,
      frame,
      frameIndex,
      mode: activeSpriteMode,
      pointX: event.clientX - bounds.left,
      pointY: event.clientY - bounds.top,
      selectedTile: activeSpriteMode === "paint" || hasSelectedTile ? selectedTile : null
    }));
  }

  function updateTileSelectionFromPointerGesture(event: PointerEvent<HTMLButtonElement>): void {
    const startX = Number(event.currentTarget.dataset.spriteSelectStartX);
    const startY = Number(event.currentTarget.dataset.spriteSelectStartY);
    delete event.currentTarget.dataset.spriteSelectStartX;
    delete event.currentTarget.dataset.spriteSelectStartY;
    if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const endX = event.clientX - bounds.left;
    const endY = event.clientY - bounds.top;
    const deltaX = Math.abs(endX - startX);
    const deltaY = Math.abs(endY - startY);
    if (deltaX < 4 && deltaY < 4) {
      const tileIndex = findMetaspriteTileAtCanvasPoint({
        canvasHeight: bounds.height,
        canvasWidth: bounds.width,
        frameHeight: frame.height,
        frameWidth: frame.width,
        originX: frame.originX,
        originY: frame.originY,
        pointX: endX,
        pointY: endY,
        tiles: frame.tiles
      });
      if (tileIndex === null) {
        if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
          onSelectMetaspriteTiles([]);
        }
        return;
      }
      onSelectMetaspriteTiles(deriveTileSelectionFromClick(
        selectedTileIndexes,
        tileIndex,
        selectedTile.tileIndex >= 0 ? selectedTile.tileIndex : tileIndex,
        frame.tileCount,
        event
      ));
      return;
    }

    onSelectMetaspriteTiles(deriveTileSelectionFromCanvasRect(
      selectedTileIndexes,
      frame,
      { bottom: endY, left: startX, right: endX, top: startY },
      { height: bounds.height, width: bounds.width },
      event.shiftKey || event.metaKey || event.ctrlKey
    ));
  }

  function beginTilePointerInteraction(event: PointerEvent<HTMLButtonElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    if (activeSpriteMode === "select") {
      const bounds = event.currentTarget.getBoundingClientRect();
      event.currentTarget.dataset.spriteSelectStartX = String(event.clientX - bounds.left);
      event.currentTarget.dataset.spriteSelectStartY = String(event.clientY - bounds.top);
      return;
    }
    updateTileFromPointer(event);
  }

  function dragTilePointerInteraction(event: PointerEvent<HTMLButtonElement>): void {
    if ((event.buttons & 1) !== 1) return;
    if (activeSpriteMode === "select") return;
    updateTileFromPointer(event);
  }

  function endTilePointerInteraction(event: PointerEvent<HTMLButtonElement>): void {
    if (activeSpriteMode === "select") {
      updateTileSelectionFromPointerGesture(event);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function updateTileFromKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    const action = deriveSpriteMetaspriteTileKeyboardAction({
      animationID: animation.id,
      frameIndex,
      key: event.key,
      selectedTile: hasSelectedTile ? selectedTile : null,
      shiftKey: event.shiftKey
    });
    if (!action) return;
    event.preventDefault();
    executeCanvasAction(action);
  }

  return (
    <div
      className={[
        "sprite-metasprite-canvas",
        displayOptions.showGrid ? "show-grid" : "",
        displayOptions.showHitbox ? "show-hitbox" : "",
        displayOptions.showOrigin ? "show-origin" : "",
        displayOptions.showOnionSkin ? "show-onion" : ""
      ].filter(Boolean).join(" ")}
      style={canvasStyle}
    >
      {displayOptions.showOnionSkin && previousFrame ? previousFrame.tiles.map((tile) => {
        const screenX = spriteCanvasDefaultOriginX(previousFrame.width) + tile.x;
        const screenY = previousFrame.height - tile.y - tile.tileHeight;
    const tileArtStyle = spriteSheetRegionStyle(sourceURL, imageSize, {
          height: tile.tileHeight,
          width: tile.tileWidth,
          x: tile.sliceX,
          y: tile.sliceY
        });
        return (
          <span
            aria-hidden="true"
            className="sprite-metasprite-onion-tile"
            key={`${frameIndex}-onion-${tile.tileIndex}`}
            style={{
              height: `${(tile.tileHeight / previousFrame.height) * 100}%`,
              left: `${(screenX / previousFrame.width) * 100}%`,
              top: `${(screenY / previousFrame.height) * 100}%`,
              width: `${(tile.tileWidth / previousFrame.width) * 100}%`,
              transform: `scale(${tile.flipX ? -1 : 1}, ${tile.flipY ? -1 : 1})`,
              ...tileArtStyle
            }}
          />
        );
      }) : null}
      {shouldShowReferenceFrame ? (
        <span
          aria-hidden="true"
          className="sprite-metasprite-reference-frame"
          style={referenceFrameStyle}
        />
      ) : null}
      <button
        aria-label={activeSpriteMode === "paint"
          ? `Pintar tile no frame ${frameIndex + 1}`
          : activeSpriteMode === "erase"
            ? `Apagar tile no frame ${frameIndex + 1}`
            : `Reposicionar tile ${selectedTile.tileIndex + 1} no frame ${frameIndex + 1}`}
        className="sprite-metasprite-canvas-hit-area"
        onPointerCancel={endTilePointerInteraction}
        onPointerDown={beginTilePointerInteraction}
        onPointerMove={dragTilePointerInteraction}
        onPointerUp={endTilePointerInteraction}
        onKeyDown={updateTileFromKeyboard}
        type="button"
      />
      <span className="sprite-metasprite-origin" style={deriveSpriteOriginMarkerPosition({
        frameHeight: frame.height,
        frameWidth: frame.width,
        originX: frame.originX,
        originY: frame.originY
      })} />
      {displayOptions.showHitbox ? (
        <span
          aria-hidden="true"
          className="sprite-metasprite-hitbox"
          style={{
            height: `${(hitboxBounds.height / frame.height) * 100}%`,
            left: `${(hitboxBounds.left / frame.width) * 100}%`,
            top: `${(hitboxBounds.top / frame.height) * 100}%`,
            width: `${(hitboxBounds.width / frame.width) * 100}%`
          }}
        />
      ) : null}
      {frame.tileCount === 0 && activeSpriteMode === "paint" ? (
        <span aria-hidden="true" className="sprite-metasprite-empty-hint">
          Clique para pintar
        </span>
      ) : null}
      {frame.tiles.map((tile) => {
        const screenX = spriteCanvasDefaultOriginX(frame.width) + tile.x;
        const screenY = frame.height - tile.y - tile.tileHeight;
        const tileArtStyle = spriteSheetRegionStyle(sourceURL, imageSize, {
          height: tile.tileHeight,
          width: tile.tileWidth,
          x: tile.sliceX,
          y: tile.sliceY
        });
        return (
          <span
            className={[
              "sprite-metasprite-tile-marker",
              sourceURL && imageSize ? "has-art" : "",
              selectedTileIndexSet.has(tile.tileIndex) ? "active" : ""
            ].filter(Boolean).join(" ")}
            key={`${frameIndex}-tile-marker-${tile.tileIndex}`}
            style={{
              height: `${(tile.tileHeight / frame.height) * 100}%`,
              left: `${(screenX / frame.width) * 100}%`,
              top: `${(screenY / frame.height) * 100}%`,
              width: `${(tile.tileWidth / frame.width) * 100}%`,
            }}
          >
            <span aria-hidden="true" className="sprite-metasprite-tile-art" style={{
              ...tileArtStyle,
              position: "absolute", inset: 0,
              transform: `scale(${tile.flipX ? -1 : 1}, ${tile.flipY ? -1 : 1})`,
              pointerEvents: "none"
            }} />
            {tile.tileIndex + 1}
          </span>
        );
      })}
    </div>
  );
}

function SpriteComposerPanel({
  animation,
  activeFrame,
  selectedMetaspriteFrameIndex,
  setSelectedMetaspriteFrameIndex,
  selectedMetaspriteTileIndex,
  setSelectedMetaspriteTileIndex,
  selectedMetaspriteTileIndexes,
  setSelectedMetaspriteTileIndexes,
  activeSpriteMode,
  displayOptions,
  onAddMetaspriteTile,
  onRemoveMetaspriteTile,
  onUpdateMetaspriteTile,
  activeBrush,
  sourceURL,
  imageSize,
  onStageResize,
  layout = "viewport"
}: {
  animation: SpritesWorkspaceAnimation | null;
  activeFrame: SpriteMetaspriteFramePresentation | null;
  selectedMetaspriteFrameIndex: number;
  setSelectedMetaspriteFrameIndex: (frameIndex: number) => void;
  selectedMetaspriteTileIndex: number;
  setSelectedMetaspriteTileIndex: (tileIndex: number) => void;
  selectedMetaspriteTileIndexes: number[];
  setSelectedMetaspriteTileIndexes: (tileIndexes: number[]) => void;
  activeSpriteMode: SpriteAnimatorMode;
  displayOptions: SpriteCanvasDisplayOptions;
  onAddMetaspriteTile: SpritesWorkspaceProps["onAddMetaspriteTile"];
  onRemoveMetaspriteTile: SpritesWorkspaceProps["onRemoveMetaspriteTile"];
  onUpdateMetaspriteTile: SpritesWorkspaceProps["onUpdateMetaspriteTile"];
  activeBrush: SpriteMetaspriteTilePresentation | null;
  sourceURL: string | null;
  imageSize: { width: number; height: number } | null;
  onStageResize?: (size: { width: number; height: number }) => void;
  layout?: "viewport" | "panel";
}): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const selectedTileIndex = activeFrame
    ? Math.min(selectedMetaspriteTileIndex, Math.max(0, activeFrame.tileCount - 1))
    : 0;
  const selectedTile = activeFrame
    ? activeFrame.tiles[selectedTileIndex] ?? activeFrame.lastTile ?? null
    : null;
  const normalizedSelection = normalizeMetaspriteTileSelection(activeFrame, selectedMetaspriteTileIndexes);
  const interactionBrush = activeBrush ?? (activeSpriteMode === "paint" ? null : selectedTile) ?? (animation && activeFrame
    ? deriveSpritePaintBrush({
      animation,
      brushState: null,
      frame: activeFrame,
      selectedTile: null
    })
    : null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextSize = {
        height: Math.floor(entry.contentRect.height),
        width: Math.floor(entry.contentRect.width)
      };
      setStageSize(nextSize);
      onStageResize?.(nextSize);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [onStageResize]);

  function selectTiles(tileIndexes: number[]): void {
    const normalized = normalizeMetaspriteTileSelection(activeFrame, tileIndexes);
    setSelectedMetaspriteTileIndexes(normalized);
    if (normalized.length > 0) {
      setSelectedMetaspriteTileIndex(normalized[normalized.length - 1]);
    }
  }

  return (
    <section
      className={[
        "sprite-composer-panel",
        layout === "viewport" ? "is-viewport" : ""
      ].filter(Boolean).join(" ")}
      aria-label="Canvas de montagem de sprites"
    >
      {layout === "panel" ? (
        <header className="sprite-composer-header">
          <div>
            <strong>Canvas de montagem</strong>
            <span>
              {animation ? `${animation.name} - ${animation.frameSize}` : "Selecione uma animação"}
            </span>
          </div>
          <div className="sprite-composer-badges" aria-label="Resumo do frame ativo">
            <span>{activeFrame ? `Frame ${selectedMetaspriteFrameIndex + 1}` : "Sem frame"}</span>
            <span>{activeFrame ? `${activeFrame.tileCount} tile(s)` : "0 tile"}</span>
            <span>{activeSpriteMode === "paint" ? "Pintura ativa" : "Montagem"}</span>
          </div>
        </header>
      ) : null}
      <div className="sprite-composer-stage" ref={stageRef}>
        {animation && activeFrame && interactionBrush ? (
          metaspriteCanvas(
            animation,
            activeFrame,
            activeFrame.frameIndex,
            interactionBrush,
            normalizedSelection.length > 0 ? normalizedSelection : [selectedTileIndex],
            activeSpriteMode,
            displayOptions,
            onAddMetaspriteTile,
            onRemoveMetaspriteTile,
            onUpdateMetaspriteTile,
            selectTiles,
            sourceURL,
            imageSize,
            animation.metaspriteFrames[activeFrame.frameIndex - 1] ?? null,
            stageSize
          )
        ) : (
          <div className="sprite-composer-empty">
            <strong>{animation ? "Nenhum frame ativo" : "Selecione uma animação"}</strong>
            <span>
              {animation
                ? "Escolha um frame na faixa abaixo para montar o sprite."
                : "Selecione um ator e uma animação na biblioteca lateral."}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function SpriteFrameTileStrip({
  animation,
  activeFrame,
  selectedMetaspriteFrameIndex,
  setIsSpritePlaybackRunning,
  setSelectedMetaspriteFrameIndex,
  selectedMetaspriteTileIndex,
  setSelectedMetaspriteTileIndex,
  selectedMetaspriteTileIndexes,
  setSelectedMetaspriteTileIndexes,
  onAddMetaspriteTile,
  onRemoveMetaspriteTile,
  onUpdateAnimationFields,
  activeBrush,
  sourceURL,
  imageSize
}: {
  animation: SpritesWorkspaceAnimation | null;
  activeFrame: SpriteMetaspriteFramePresentation | null;
  selectedMetaspriteFrameIndex: number;
  setIsSpritePlaybackRunning: (running: boolean) => void;
  setSelectedMetaspriteFrameIndex: (frameIndex: number) => void;
  selectedMetaspriteTileIndex: number;
  setSelectedMetaspriteTileIndex: (tileIndex: number) => void;
  selectedMetaspriteTileIndexes: number[];
  setSelectedMetaspriteTileIndexes: (tileIndexes: number[]) => void;
  onAddMetaspriteTile: SpritesWorkspaceProps["onAddMetaspriteTile"];
  onRemoveMetaspriteTile: SpritesWorkspaceProps["onRemoveMetaspriteTile"];
  onUpdateAnimationFields: SpritesWorkspaceProps["onUpdateAnimationFields"];
  activeBrush: SpriteMetaspriteTilePresentation | null;
  sourceURL: string | null;
  imageSize: { width: number; height: number } | null;
}): React.ReactElement {
  const selectedTileIndex = activeFrame
    ? Math.min(selectedMetaspriteTileIndex, Math.max(0, activeFrame.tileCount - 1))
    : 0;
  const selectedTile = activeFrame
    ? activeFrame.tiles[selectedTileIndex] ?? activeFrame.lastTile ?? null
    : null;
  const normalizedSelection = normalizeMetaspriteTileSelection(activeFrame, selectedMetaspriteTileIndexes);
  const canEdit = Boolean(animation && activeFrame);

  function selectTiles(tileIndexes: number[]): void {
    const normalized = normalizeMetaspriteTileSelection(activeFrame, tileIndexes);
    setSelectedMetaspriteTileIndexes(normalized);
    if (normalized.length > 0) {
      setSelectedMetaspriteTileIndex(normalized[normalized.length - 1]);
    }
  }

  function addTile(): void {
    if (!animation || !activeFrame) return;
    const brush = activeBrush ?? selectedTile;
    const tileHeight = brush?.tileHeight ?? Math.min(animation.frameHeight, 16);
    const tileWidth = brush?.tileWidth ?? Math.min(animation.frameWidth, 16);
    const defaultPosition = brush
      ? { x: brush.x, y: brush.y }
      : deriveDefaultMetaspriteTilePosition(activeFrame, tileWidth, tileHeight);

    onAddMetaspriteTile(animation.id, {
      frameIndex: activeFrame.frameIndex,
      sourceSheet: brush?.sourceSheet ?? animation.spriteSheet,
      sliceX: brush?.sliceX ?? 0,
      sliceY: brush?.sliceY ?? 0,
      tileHeight,
      tileWidth,
      x: defaultPosition.x,
      y: defaultPosition.y
    });
    setSelectedMetaspriteTileIndex(activeFrame.tileCount);
    setSelectedMetaspriteTileIndexes([activeFrame.tileCount]);
  }

  function removeTile(): void {
    if (!animation || !activeFrame || activeFrame.tileCount === 0) return;

    onRemoveMetaspriteTile(animation.id, {
      frameIndex: activeFrame.frameIndex,
      tileIndex: selectedTileIndex
    });
    const nextTileIndex = Math.max(0, selectedTileIndex - 1);
    setSelectedMetaspriteTileIndex(nextTileIndex);
    setSelectedMetaspriteTileIndexes(activeFrame.tileCount > 1 ? [nextTileIndex] : []);
  }

  function addFrame(): void {
    if (!animation) return;
    const nextCount = animation.frameCount + 1;
    onUpdateAnimationFields(animation.id, { frameCount: nextCount });
    selectSpriteFrameIndex(
      nextCount - 1,
      setIsSpritePlaybackRunning,
      setSelectedMetaspriteFrameIndex,
      setSelectedMetaspriteTileIndex,
      setSelectedMetaspriteTileIndexes
    );
  }

  function removeFrame(): void {
    if (!animation || animation.frameCount <= 1) return;
    const nextCount = animation.frameCount - 1;
    onUpdateAnimationFields(animation.id, { frameCount: nextCount });
    selectSpriteFrameIndex(
      Math.min(selectedMetaspriteFrameIndex, nextCount - 1),
      setIsSpritePlaybackRunning,
      setSelectedMetaspriteFrameIndex,
      setSelectedMetaspriteTileIndex,
      setSelectedMetaspriteTileIndexes
    );
  }

  return (
    <div className="sprites-editor-timeline" aria-label="Timeline de frames e tiles">
      <div className="sprites-editor-timeline-row">
        <div className="sprite-composer-frame-strip" role="group" aria-label="Frames da animação">
          {animation?.metaspriteFrames.map((frame) => (
            <button
              aria-pressed={frame.frameIndex === selectedMetaspriteFrameIndex}
              className={[
                "sprite-composer-frame-card",
                frame.frameIndex === selectedMetaspriteFrameIndex ? "active" : ""
              ].filter(Boolean).join(" ")}
              key={`${animation.id}-timeline-frame-${frame.frameIndex}`}
              onClick={() => selectSpriteFrameIndex(
                frame.frameIndex,
                setIsSpritePlaybackRunning,
                setSelectedMetaspriteFrameIndex,
                setSelectedMetaspriteTileIndex,
                setSelectedMetaspriteTileIndexes
              )}
              type="button"
            >
              <SpriteFrameThumbnail frame={frame} sourceURL={sourceURL} imageSize={imageSize} />
              <span className="sprite-composer-frame-card-copy">
                <strong>Quadro {frame.frameIndex + 1}</strong>
                <small>{frame.tileCount} {frame.tileCount === 1 ? "tile" : "tiles"}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="sprite-composer-actions">
          <button
            aria-label="Adicionar quadro"
            disabled={!animation}
            onClick={addFrame}
            type="button"
          >
            +
          </button>
          <button
            aria-label="Remover ultimo quadro"
            disabled={!animation || animation.frameCount <= 1}
            onClick={removeFrame}
            type="button"
          >
            −
          </button>
        </div>
      </div>
      <div className="sprites-editor-timeline-row">
        <div className="sprite-composer-tile-strip" role="group" aria-label="Tiles do frame ativo">
          {activeFrame?.tiles.map((tile) => (
            <button
              aria-pressed={tile.tileIndex === selectedTile?.tileIndex}
              className={normalizedSelection.includes(tile.tileIndex) ? "active" : ""}
              key={`${animation?.id ?? "sprite"}-timeline-tile-${activeFrame.frameIndex}-${tile.tileIndex}`}
              onClick={(event) => selectTiles(deriveTileSelectionFromClick(
                normalizedSelection,
                tile.tileIndex,
                selectedTile?.tileIndex ?? tile.tileIndex,
                activeFrame.tileCount,
                event
              ))}
              type="button"
            >
              Tile {tile.tileIndex + 1}
              <small>{tile.x},{tile.y}</small>
            </button>
          ))}
        </div>
        <div className="sprite-composer-actions">
          <button disabled={!canEdit} onClick={addTile} type="button">+ Tile</button>
          <button disabled={!activeFrame || activeFrame.tileCount === 0} onClick={removeTile} type="button">− Tile</button>
        </div>
      </div>
    </div>
  );
}

function formatVramBytes(bytes: number): string {
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function spriteVramBudgetPanel(animation: SpritesWorkspaceAnimation): React.ReactElement {
  const analysis = animation.vramAnalysis;
  return (
    <section aria-label="Orçamento GBA da animação" className="sprite-gba-budget-panel">
      <div className="sprite-gba-budget-header">
        <h4>Orçamento GBA</h4>
        <span>{animation.colorMode} OBJ</span>
      </div>
      <dl className="sprite-gba-budget-metrics">
        <div><dt>Tiles por frame</dt><dd>{analysis.tilesWide} x {analysis.tilesHigh} ({analysis.tilesPerFrame})</dd></div>
        <div><dt>Frames únicos</dt><dd>{analysis.uniqueFrameCount} / {analysis.frameCount}</dd></div>
        <div><dt>Tiles da animação</dt><dd>{formatVramBytes(analysis.totalTileBytes)}</dd></div>
        <div><dt>VRAM residente estimada</dt><dd>{formatVramBytes(analysis.residentTileBytes)}</dd></div>
        <div><dt>VRAM única</dt><dd>{formatVramBytes(analysis.uniqueTileBytes)}</dd></div>
        <div><dt>OBJ por frame</dt><dd>{analysis.nativeObjDimension ?? `Metasprite · ${analysis.oamEntriesPerFrame} OBJs`}</dd></div>
        <div><dt>Grade</dt><dd>{analysis.tileAligned ? "8×8 alinhado" : "Revisar: não alinhado"}</dd></div>
        {analysis.repeatedFrameSavingsBytes > 0 ? (
          <div><dt>Economia repetida</dt><dd>{formatVramBytes(analysis.repeatedFrameSavingsBytes)}</dd></div>
        ) : null}
      </dl>
      {analysis.warnings.length > 0 ? (
        <ul className="sprite-gba-budget-warnings">
          {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : (
        <p className="muted">Sem avisos de hardware para esta animação.</p>
      )}
      {analysis.recommendations.length > 0 ? (
        <ul className="sprite-gba-budget-recommendations">
          {analysis.recommendations.map((recommendation) => (
            <li key={recommendation}>{spriteVramRecommendationLabels[recommendation]}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SpriteTileNumberField({ label, value, min, step, onCommit }: {
  label: string; value: number; min?: number; step: number; onCommit: (value: number) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (): void => {
    const next = draft.trim() ? Number(draft) : NaN;
    if (Number.isFinite(next) && (min === undefined || next >= min)) {
      if (next !== value) onCommit(next);
      setDraft(String(Math.floor(next)));
    } else setDraft(String(value));
  };
  return <label><span>{label}</span><input aria-label={label} inputMode="numeric" role="spinbutton" aria-valuemin={min} aria-valuenow={draft.trim() && Number.isFinite(Number(draft)) ? Number(draft) : undefined} type="text" value={draft}
    onChange={event => setDraft(event.currentTarget.value)} onBlur={commit}
    onKeyDown={event => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const next = Number(draft || value) + (event.key === "ArrowUp" ? step : -step); setDraft(String(min === undefined ? next : Math.max(min, next))); }
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(String(value)); }
    }} /></label>;
}

function metaspriteTileInputMin(field: "x" | "y" | "sliceX" | "sliceY" | "tileWidth" | "tileHeight" | "paletteIndex"): number | undefined {
  if (field === "x" || field === "y") return undefined;
  if (field === "tileWidth" || field === "tileHeight") return 8;
  return 0;
}

function metaspriteTileInputStep(field: "x" | "y" | "sliceX" | "sliceY" | "tileWidth" | "tileHeight" | "paletteIndex"): number {
  return field === "sliceX" || field === "sliceY" || field === "tileWidth" || field === "tileHeight" ? 8 : 1;
}

function spriteMetricField(
  key: string,
  prefix: string,
  value: number,
  onChange: (nextValue: number) => void,
  min = 0,
  max?: number
): React.ReactElement {
  return <InspectorNumber key={key} className="sprite-metric-field" label={prefix} max={max} min={min} onChange={onChange} value={value} />;
}

function spriteMetricGroup(
  label: string,
  fields: Array<{ prefix: string; value: number; min?: number; max?: number; onChange: (value: number) => void }>,
  layout: "pair" | "quad" = "pair"
): React.ReactElement {
  return (
    <div className={`sprite-metric-group${layout === "quad" ? " is-quad" : ""}`}>
      <span className="sprite-metric-group-label">{label}</span>
      <div className="sprite-metric-row">
        {fields.map((field) => spriteMetricField(field.prefix, field.prefix, field.value, field.onChange, field.min ?? 0, field.max))}
      </div>
    </div>
  );
}

function animationEditor(
  animation: SpritesWorkspaceAnimation,
  animationState: SpriteStateContract | null,
  stateDirectionOptions: SpriteStateDirectionOptions,
  spriteSheetOptions: SpritesWorkspacePresentation["spriteSheets"],
  selectedMetaspriteFrameIndex: number,
  selectedMetaspriteTileIndex: number,
  setSelectedMetaspriteTileIndex: (tileIndex: number) => void,
  selectedMetaspriteTileIndexes: number[],
  setSelectedMetaspriteTileIndexes: (tileIndexes: number[]) => void,
  onUpdateMetaspriteFrame: SpritesWorkspaceProps["onUpdateMetaspriteFrame"],
  onUpdateMetaspriteTile: SpritesWorkspaceProps["onUpdateMetaspriteTile"],
  onMoveMetaspriteTiles: SpritesWorkspaceProps["onMoveMetaspriteTiles"],
  onToggleMetaspriteTilesFlip: SpritesWorkspaceProps["onToggleMetaspriteTilesFlip"],
  onReorderMetaspriteTiles: SpritesWorkspaceProps["onReorderMetaspriteTiles"],
  onRemoveMetaspriteTiles: SpritesWorkspaceProps["onRemoveMetaspriteTiles"],
  onFitAnimationHitbox: SpritesWorkspaceProps["onFitAnimationHitbox"],
  onCopyAnimationGeometry: SpritesWorkspaceProps["onCopyAnimationGeometry"],
  onImportSpriteSheets: SpritesWorkspaceProps["onImportSpriteSheets"],
  onUpdateAnimationFields: SpritesWorkspaceProps["onUpdateAnimationFields"],
  onUpdateAnimationState: SpritesWorkspaceProps["onUpdateAnimationState"],
  activeTab: SpriteInspectorTab
): React.ReactElement {
  const activeMetaspriteFrameIndex = Math.min(selectedMetaspriteFrameIndex, Math.max(0, animation.frameCount - 1));
  const geometry = animation.geometry;
  const activeMetaspriteFrame = animation.metaspriteFrames[activeMetaspriteFrameIndex] ?? animation.metaspriteFrames[0];
  const activeTileIndex = activeMetaspriteFrame
    ? Math.min(selectedMetaspriteTileIndex, Math.max(0, activeMetaspriteFrame.tileCount - 1))
    : 0;
  const activeMetaspriteTile = activeMetaspriteFrame?.tiles[activeTileIndex] ?? activeMetaspriteFrame?.lastTile ?? null;
  const normalizedSelection = normalizeMetaspriteTileSelection(activeMetaspriteFrame, selectedMetaspriteTileIndexes);
  const activeTileIndexes = normalizedSelection.length > 0
    ? normalizedSelection
    : activeMetaspriteTile ? [activeMetaspriteTile.tileIndex] : [];
  const activeFrameOrigin = activeMetaspriteFrame
    ? { x: activeMetaspriteFrame.originX, y: activeMetaspriteFrame.originY }
    : { x: geometry.originX, y: geometry.originY };
  const updateActiveMetaspriteTile = (fields: UpdateSpriteMetaspriteTileOptions["fields"]): void => {
    if (!activeMetaspriteTile) return;
    onUpdateMetaspriteTile(animation.id, {
      fields,
      frameIndex: activeMetaspriteFrameIndex,
      tileIndex: activeMetaspriteTile.tileIndex
    });
  };
  const syncFrameOrigin = (originX: number, originY: number): void => {
    if (!activeMetaspriteFrame) return;
    onUpdateMetaspriteFrame(animation.id, {
      frameIndex: activeMetaspriteFrameIndex,
      originX,
      originY
    });
  };

  return (
    <div className="sprite-animation-editor sprite-animation-editor-compact" aria-label={`Editar ${animation.name}`}>
      {activeTab === "animation" ? (
        <section className="sprite-animation-settings" aria-label="Configurações de animação">
        <InspectorRange label="Velocidade" ariaLabel="FPS" unit="FPS" max={60} min={1} onChange={(value) => onUpdateAnimationFields(animation.id, { fps: value })} value={animation.fps} />
        <InspectorToggle checked={animation.loops} label="Repetir" onChange={(checked) => onUpdateAnimationFields(animation.id, { loops: checked })} />
        <InspectorToggle checked={animation.pingPong} label="Ping-pong" onChange={(checked) => onUpdateAnimationFields(animation.id, { pingPong: checked })} />
        {animationState ? (
          <div className="sprite-animation-type-settings">
            <InspectorSelect
              label="Tipo de animação"
              onChange={(value) => onUpdateAnimationState(animationState.id, {
                animationType: value as SpriteStateContract["animationType"]
              })}
              options={[
                { label: "Direção fixa", value: "fixed" },
                { label: "Direção fixa + Movimentação", value: "fixed_movement" },
                { label: "Direções horizontais", value: "horizontal" },
                { label: "Direções horizontais + Movimentação", value: "horizontal_movement" },
                { label: "Quatro direções", value: "four_direction" },
                { label: "Quatro direções + Movimentação", value: "four_direction_movement" },
                { label: "Visão direcional", value: "directional_view" },
                { label: "Jogador de plataforma", value: "platform_player" },
                { label: "Cursor", value: "cursor" }
              ]}
              value={animationState.animationType}
            />
            <InspectorToggle
              checked={animationState.mirrorLeftFromRight}
              label="Espelhar esquerda a partir da direita"
              onChange={(checked) => onUpdateAnimationState(animationState.id, { mirrorLeftFromRight: checked })}
            />
          </div>
        ) : null}
        <InspectorSection title="Folha de origem" defaultOpen={false} className="sprite-source-details">
        <div className="sprite-inspector-grid-2 sprite-animation-source-row">
          <div className="sprite-reference-field">
            <span>Sheet</span>
            <ProjectReferencePicker
              actions={[{ label: "Importar sprite sheet", run: onImportSpriteSheets }]}
              ariaLabel="Sheet"
              invalidLabel="Sprite sheet não encontrado"
              onChange={(spriteSheet) => onUpdateAnimationFields(animation.id, { spriteSheet })}
              options={spriteSheetOptions.map((sheet) => ({
                value: sheet.name,
                label: sheet.name,
                detail: sheet.hasAsset ? `${sheet.animationCount} animação(ões)` : "Asset ausente"
              }))}
              value={animation.spriteSheet}
            />
          </div>
          <InspectorSelect
            ariaLabel="Formato de cores da folha"
            label="Cores da folha"
            onChange={(colorMode) => onUpdateAnimationFields(animation.id, { colorMode })}
            options={[{ label: "4bpp · padrão", value: "4bpp" }, { label: "8bpp · avançado", value: "8bpp" }]}
            value={animation.colorMode}
          />
        </div>
        <p className="muted">Aplica-se a todas as animações da folha e preserva a imagem original. 4bpp usa até 15 cores visíveis. 8bpp dobra o espaço dos tiles e compartilha até 194 cores visíveis com os sprites da cena, conforme o orçamento. Os bancos do texto e dos elementos internos do motor ficam reservados.</p>
        <div className="sprite-state-direction-panel sprite-state-direction-panel-compact" aria-label="Estado e direção da animação">
          <div>
            <span>Estado</span>
            <div className="sprite-option-segment" role="group" aria-label="Estados">
              {stateDirectionOptions.states.map((state) => (
                <button
                  aria-pressed={animation.state === state}
                  className={animation.state === state ? "active" : ""}
                  key={state}
                  onClick={() => onUpdateAnimationFields(animation.id, { state })}
                  type="button"
                >
                  {state}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span>Direção</span>
            <div className="sprite-option-segment" role="group" aria-label="Direções">
              {stateDirectionOptions.directions.map((direction) => (
                <button
                  aria-pressed={animation.direction === direction}
                  className={animation.direction === direction ? "active" : ""}
                  key={direction}
                  onClick={() => onUpdateAnimationFields(animation.id, { direction })}
                  type="button"
                >
                  {direction}
                </button>
              ))}
            </div>
          </div>
        </div>
          <InspectorNumber label="Quadros" min={1} onChange={(value) => onUpdateAnimationFields(animation.id, { frameCount: value })} value={animation.frameCount} />
        </InspectorSection>
        </section>
      ) : null}

      {activeTab === "frame" ? activeMetaspriteFrame ? (
        <section className="sprite-inspector-section sprite-inspector-frame-section" aria-label="Tile selecionado">
          <h5 className="sprite-inspector-section-title">Tile selecionado</h5>
          <p className="sprite-inspector-section-description">Ajustes aplicados ao tile selecionado no frame ativo.</p>
          <div className="sprite-inspector-icon-bar" aria-label="Transformar tile selecionado">
            <button disabled={activeTileIndexes.length === 0} onClick={() => onMoveMetaspriteTiles(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, deltaX: -1, deltaY: 0 })} title="Mover esquerda" type="button">←</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onMoveMetaspriteTiles(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, deltaX: 1, deltaY: 0 })} title="Mover direita" type="button">→</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onMoveMetaspriteTiles(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, deltaX: 0, deltaY: 1 })} title="Mover cima" type="button">↑</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onMoveMetaspriteTiles(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, deltaX: 0, deltaY: -1 })} title="Mover baixo" type="button">↓</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onToggleMetaspriteTilesFlip(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, horizontal: true })} title="Flip horizontal" type="button">FX</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onToggleMetaspriteTilesFlip(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, horizontal: false })} title="Flip vertical" type="button">FY</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onReorderMetaspriteTiles(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, placement: "front" })} title="Trazer para frente" type="button">Frente</button>
            <button disabled={activeTileIndexes.length === 0} onClick={() => onReorderMetaspriteTiles(animation.id, { frameIndex: activeMetaspriteFrameIndex, tileIndexes: activeTileIndexes, placement: "back" })} title="Enviar para trás" type="button">Trás</button>
            <button
              disabled={activeTileIndexes.length === 0}
              onClick={() => {
                onRemoveMetaspriteTiles(animation.id, activeMetaspriteFrameIndex, activeTileIndexes);
                const firstRemovedTileIndex = activeTileIndexes[0] ?? 0;
                const nextTileIndex = Math.max(0, firstRemovedTileIndex - 1);
                setSelectedMetaspriteTileIndex(nextTileIndex);
                setSelectedMetaspriteTileIndexes(activeMetaspriteFrame.tileCount > activeTileIndexes.length ? [nextTileIndex] : []);
              }}
              title="Remover tiles selecionados"
              type="button"
            >
              Rem
            </button>
          </div>
          {activeMetaspriteTile ? (
            <div className="sprite-metasprite-tile-editor sprite-inspector-grid-2" aria-label="Editar tile do metasprite">
              {([
                ["X", "x", activeMetaspriteTile.x],
                ["Y", "y", activeMetaspriteTile.y],
                ["Slice X", "sliceX", activeMetaspriteTile.sliceX],
                ["Slice Y", "sliceY", activeMetaspriteTile.sliceY],
                ["Tile W", "tileWidth", activeMetaspriteTile.tileWidth],
                ["Tile H", "tileHeight", activeMetaspriteTile.tileHeight],
                ["Paleta", "paletteIndex", activeMetaspriteTile.paletteIndex]
              ] as const).map(([label, field, value]) => (
                <SpriteTileNumberField
                  key={`${animation.id}-${activeMetaspriteFrame.frameIndex}-${activeMetaspriteTile.tileIndex}-${field}`}
                  label={label} value={value} min={metaspriteTileInputMin(field)} step={metaspriteTileInputStep(field)}
                  onCommit={nextValue => updateActiveMetaspriteTile({ [field]: nextValue })}
                />
              ))}
              <div className="sprite-reference-field">
                <span>Source</span>
                <ProjectReferencePicker
                  actions={[{ label: "Importar sprite sheet", run: onImportSpriteSheets }]}
                  ariaLabel="Source"
                  invalidLabel="Sprite sheet não encontrado"
                  onChange={(sourceSheet) => updateActiveMetaspriteTile({ sourceSheet })}
                  options={spriteSheetOptions.map((sheet) => ({
                    value: sheet.name,
                    label: sheet.name,
                    detail: sheet.hasAsset ? `${sheet.animationCount} animação(ões)` : "Asset ausente"
                  }))}
                  value={activeMetaspriteTile.sourceSheet}
                />
              </div>
              <label>
                <span>Obj pal</span>
                <select
                  onChange={(event) => updateActiveMetaspriteTile({ objPalette: event.currentTarget.value })}
                  value={activeMetaspriteTile.objPalette}
                >
                  <option value="OBP0">OBP0</option>
                  <option value="OBP1">OBP1</option>
                </select>
              </label>
              <label className="sprite-tile-toggle">
                <span>Flip X</span>
                <input
                  checked={activeMetaspriteTile.flipX}
                  onChange={(event) => updateActiveMetaspriteTile({ flipX: event.currentTarget.checked })}
                  type="checkbox"
                />
              </label>
              <label className="sprite-tile-toggle">
                <span>Flip Y</span>
                <input
                  checked={activeMetaspriteTile.flipY}
                  onChange={(event) => updateActiveMetaspriteTile({ flipY: event.currentTarget.checked })}
                  type="checkbox"
                />
              </label>
              <label className="sprite-tile-toggle">
                <span>Prioridade</span>
                <input
                  checked={activeMetaspriteTile.priority}
                  onChange={(event) => updateActiveMetaspriteTile({ priority: event.currentTarget.checked })}
                  type="checkbox"
                />
              </label>
            </div>
          ) : (
            <p className="muted">Selecione um tile no canvas para editar.</p>
          )}
        </section>
      ) : <p className="muted">Selecione um frame para editar seus tiles.</p> : null}

      {activeTab === "geometry" ? (
        <section className="sprite-inspector-section sprite-inspector-geometry-section" aria-label="Frame e colisão">
          <h5 className="sprite-inspector-section-title">Frame e colisão</h5>
          <p className="sprite-inspector-section-description">Dimensões do frame, origem do frame ativo e caixa de colisão do sprite.</p>
          <div className="sprite-inspector-geometry-grid">
            {spriteMetricGroup("Tamanho do frame", [
              {
                prefix: "W",
                value: animation.frameWidth,
                min: 1,
                onChange: (value) => onUpdateAnimationFields(animation.id, { frameWidth: value })
              },
              {
                prefix: "H",
                value: animation.frameHeight,
                min: 1,
                onChange: (value) => onUpdateAnimationFields(animation.id, { frameHeight: value })
              }
            ])}
            <InspectorVector2
              legend="Origem do frame ativo"
              onChange={(axis, value) => syncFrameOrigin(axis === "x" ? value : activeFrameOrigin.x, axis === "y" ? value : activeFrameOrigin.y)}
              values={activeFrameOrigin}
            />
          </div>
          {spriteMetricGroup("Caixa de colisão", [
            {
              prefix: "X",
              value: geometry.hitboxX,
              min: -96,
              max: 96,
              onChange: (value) => onUpdateAnimationFields(animation.id, { hitboxX: value })
            },
            {
              prefix: "Y",
              value: geometry.hitboxY,
              min: -96,
              max: 96,
              onChange: (value) => onUpdateAnimationFields(animation.id, { hitboxY: value })
            },
            {
              prefix: "W",
              value: geometry.hitboxWidth,
              min: 1,
              onChange: (value) => onUpdateAnimationFields(animation.id, { hitboxWidth: value })
            },
            {
              prefix: "H",
              value: geometry.hitboxHeight,
              min: 1,
              onChange: (value) => onUpdateAnimationFields(animation.id, { hitboxHeight: value })
            }
          ], "quad")}
          <div className="sprite-inspector-actions-row sprite-inspector-actions-row-compact">
            <InspectorAction disabled={!activeMetaspriteFrame || activeMetaspriteFrame.tileCount === 0} onClick={() => onFitAnimationHitbox(animation.id, activeMetaspriteFrameIndex)}>
              Ajustar hitbox
            </InspectorAction>
            <InspectorAction onClick={() => onCopyAnimationGeometry(animation.id)}>Copiar geometria</InspectorAction>
          </div>
        </section>
      ) : null}

    </div>
  );
}

export function SpritesWorkspace({
  presentation,
  projectPath,
  focusedAssetName,
  focusRequestID,
  onCreateAnimation,
  onImportSpriteSheets,
  onUpdateAnimationFields,
  onUpdateAnimationState,
  onUpdateMetaspriteFrame,
  onAddMetaspriteTile,
  onRemoveMetaspriteTile,
  onUpdateMetaspriteTile,
  onMoveMetaspriteTiles,
  onToggleMetaspriteTilesFlip,
  onReorderMetaspriteTiles,
  onRemoveMetaspriteTiles,
  onFitAnimationHitbox,
  onCopyAnimationGeometry,
  onGenerateSpriteFromReference,
  onRenameAnimation,
  onDuplicateAnimation,
  onRemoveAnimation,
  onRenameSpriteSheet,
  onDuplicateSpriteSheet,
  onRemoveSpriteSheet
}: SpritesWorkspaceProps): React.ReactElement {
  const [sheetImageSizes, setSheetImageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [selectedAnimationID, setSelectedAnimationID] = useState<string | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<SpriteContextMenuState | null>(null);
  const [selectedMetaspriteFrameIndex, setSelectedMetaspriteFrameIndex] = useState(0);
  const [selectedMetaspriteTileIndex, setSelectedMetaspriteTileIndex] = useState(0);
  const [selectedMetaspriteTileIndexes, setSelectedMetaspriteTileIndexes] = useState<number[]>([]);
  const [spriteSheetInteractionMode, setSpriteSheetInteractionMode] = useState<SpriteSheetInteractionMode>("frames");
  const [activeSpriteMode, setActiveSpriteMode] = useState<SpriteAnimatorMode>("select");
  const [activeInspectorTab, setActiveInspectorTab] = useState<SpriteInspectorTab>("animation");
  const [spriteCanvasZoom, setSpriteCanvasZoom] = useState(8);
  const [composerStageSize, setComposerStageSize] = useState<{ width: number; height: number } | null>(null);
  const pendingSpriteCanvasAutoFitRef = useRef(true);
  const activeSheetButtonRef = useRef<HTMLButtonElement>(null);
  const [showSpriteGrid, setShowSpriteGrid] = useState(true);
  const [showSpriteOrigin, setShowSpriteOrigin] = useState(true);
  const [showSpriteHitbox, setShowSpriteHitbox] = useState(true);
  const [showSpriteOnionSkin, setShowSpriteOnionSkin] = useState(false);
  const [isSpritePlaybackRunning, setIsSpritePlaybackRunning] = useState(false);
  const [animationElapsedMs, setAnimationElapsedMs] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [validationOpen, setValidationOpen] = useState(false);
  const [paintBrushByAnimation, setPaintBrushByAnimation] = useState<Record<string, SpritePaintBrushState>>({});
  const [paletteSourceKind, setPaletteSourceKind] = useState<SpritePaletteSourceKind>("sheet");
  const [paletteReferenceId, setPaletteReferenceId] = useState<string | null>(null);
  const playbackDirectionRef = useRef<1 | -1>(1);
  const activeSelection = useMemo(
    () => presentation ? resolveActiveSpriteAnimation(presentation, selectedAnimationID) : null,
    [presentation, selectedAnimationID]
  );
  const playbackAnimation = activeSelection?.animation ?? null;
  const playbackFrameCount = playbackAnimation?.frameCount ?? 0;
  const visibleSpriteSheets = useMemo(
    () => presentation ? filterSpritesWorkspaceSheets(presentation, { query: searchQuery, searchScope: "rail", status: "" }) : [],
    [presentation, searchQuery]
  );
  const validationIssues = useMemo(
    () => (presentation ? deriveSpritesWorkspaceValidationIssues(presentation) : []),
    [presentation]
  );
  const summaryCards = useMemo(
    () => (presentation ? deriveSpritesWorkspaceSummaryCards(presentation) : []),
    [presentation]
  );
  const autoFitPreviewAnimation = useMemo(() => {
    if (!presentation) return null;
    const selectedSheet = selectedSheetName
      ? presentation.spriteSheets.find((candidate) => candidate.name === selectedSheetName) ?? null
      : null;
    const visibleSheets = filterSpritesWorkspaceSheets(presentation, { query: searchQuery, searchScope: "rail", status: "" });
    const activeSheet = activeSelection?.sheet ?? selectedSheet ?? visibleSheets[0] ?? presentation.spriteSheets[0] ?? null;
    if (!activeSheet) return null;
    const sheetAnimations = presentation.animationsBySheet[activeSheet.name] ?? [];
    return activeSelection && activeSelection.sheet.name === activeSheet.name
      ? activeSelection.animation
      : sheetAnimations[0] ?? null;
  }, [presentation, activeSelection, selectedSheetName, searchQuery]);
  const autoFitPreviewFrame = useMemo(() => {
    if (!autoFitPreviewAnimation || autoFitPreviewAnimation.frameCount <= 0) return null;
    const frameIndex = Math.min(selectedMetaspriteFrameIndex, autoFitPreviewAnimation.frameCount - 1);
    return resolveSpriteWorkspaceCanvasFrame(autoFitPreviewAnimation, frameIndex);
  }, [autoFitPreviewAnimation, selectedMetaspriteFrameIndex]);

  useEffect(() => {
    if (!presentation || !focusedAssetName) return;
    const sheet = presentation.spriteSheets.find((candidate) => candidate.name === focusedAssetName);
    const reference = presentation.references.find((candidate) => (
      candidate.assetName === focusedAssetName ||
      candidate.generatedSpriteAssetName === focusedAssetName ||
      candidate.id === focusedAssetName
    ));
    const sheetName = sheet?.name ?? reference?.generatedSpriteAssetName ?? reference?.assetName ?? null;
    if (!sheetName) return;

    const animation = presentation.animationsBySheet[sheetName]?.[0] ?? null;
    setSearchQuery("");
    setSelectedSheetName(sheetName);
    setSelectedAnimationID(animation?.id ?? null);
    setSelectedMetaspriteFrameIndex(0);
    setSelectedMetaspriteTileIndex(0);
    setSelectedMetaspriteTileIndexes([]);
  }, [focusedAssetName, focusRequestID, presentation]);

  useEffect(() => {
    const startedAt = globalThis.performance.now();
    const timerID = globalThis.setInterval(() => {
      setAnimationElapsedMs(globalThis.performance.now() - startedAt);
    }, 100);

    return () => globalThis.clearInterval(timerID);
  }, []);

  useEffect(() => {
    if (activeSpriteMode === "paint" && spriteSheetInteractionMode !== "slice") {
      setSpriteSheetInteractionMode("slice");
    }
  }, [activeSpriteMode, spriteSheetInteractionMode]);

  useEffect(() => {
    pendingSpriteCanvasAutoFitRef.current = true;
  }, [autoFitPreviewAnimation?.id, autoFitPreviewFrame?.width, autoFitPreviewFrame?.height, selectedSheetName]);

  useEffect(() => {
    if (!pendingSpriteCanvasAutoFitRef.current || !autoFitPreviewFrame || !composerStageSize) {
      return;
    }
    pendingSpriteCanvasAutoFitRef.current = false;
    setSpriteCanvasZoom(deriveSpriteCanvasFitScale({
      containerHeight: composerStageSize.height * 0.82,
      containerWidth: composerStageSize.width * 0.82,
      frameHeight: autoFitPreviewFrame.height,
      frameWidth: autoFitPreviewFrame.width,
      maxScale: 32,
      padding: 16
    }));
  }, [autoFitPreviewFrame, composerStageSize, autoFitPreviewAnimation?.id, selectedMetaspriteFrameIndex]);

  useEffect(() => {
    if (playbackFrameCount <= 0) {
      return;
    }
    const lastFrameIndex = playbackFrameCount - 1;
    if (selectedMetaspriteFrameIndex > lastFrameIndex) {
      setSelectedMetaspriteFrameIndex(lastFrameIndex);
      setSelectedMetaspriteTileIndex(0);
      setSelectedMetaspriteTileIndexes([]);
    }
    // New frames are requested before the parent finishes its project update.
    // Clamp only when the confirmed count changes, so the new frame stays selected.
  }, [playbackFrameCount]);

  useEffect(() => {
    if (!isSpritePlaybackRunning || !playbackAnimation || playbackAnimation.frameCount <= 1) {
      return;
    }

    playbackDirectionRef.current = 1;
    const frameCount = playbackAnimation.frameCount;
    const intervalMs = Math.max(1, Math.round(1000 / Math.min(60, Math.max(1, playbackAnimation.fps))));
    const timerID = globalThis.setInterval(() => {
      setSelectedMetaspriteFrameIndex((currentFrameIndex) => {
        const result = stepSpritePlaybackFrameIndex({
          currentIndex: currentFrameIndex,
          direction: playbackDirectionRef.current,
          frameCount,
          loops: playbackAnimation.loops,
          pingPong: playbackAnimation.pingPong
        });
        playbackDirectionRef.current = result.direction;
        if (result.shouldStop) {
          globalThis.setTimeout(() => setIsSpritePlaybackRunning(false), 0);
        }
        if (result.frameIndex !== currentFrameIndex) {
          globalThis.setTimeout(() => {
            setSelectedMetaspriteTileIndex(0);
            setSelectedMetaspriteTileIndexes([]);
          }, 0);
        }
        return result.frameIndex;
      });
    }, intervalMs);

    return () => globalThis.clearInterval(timerID);
  }, [
    isSpritePlaybackRunning,
    playbackAnimation?.fps,
    playbackAnimation?.frameCount,
    playbackAnimation?.id,
    playbackAnimation?.loops,
    playbackAnimation?.pingPong
  ]);

  const resolvedActiveSheet = useMemo(() => {
    if (!presentation) return null;
    const selectedSheet = selectedSheetName
      ? presentation.spriteSheets.find((candidate) => candidate.name === selectedSheetName) ?? null
      : null;
    return activeSelection?.sheet ?? selectedSheet ?? visibleSpriteSheets[0] ?? presentation.spriteSheets[0] ?? null;
  }, [presentation, activeSelection, selectedSheetName, visibleSpriteSheets]);

  useEffect(() => {
    activeSheetButtonRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [resolvedActiveSheet?.name]);

  const paletteReferences = useMemo(
    () => (presentation && resolvedActiveSheet
      ? listSpritePaletteReferencesForSheet(presentation, resolvedActiveSheet.name)
      : []
    ).map((reference) => ({
      assetName: reference.assetName,
      id: reference.id,
      title: reference.title
    })),
    [presentation, resolvedActiveSheet?.name]
  );

  const paletteSource = useMemo(
    () => presentation && resolvedActiveSheet
      ? resolveSpritePaletteSource({
        kind: paletteSourceKind,
        presentation,
        referenceId: paletteReferenceId,
        sheet: resolvedActiveSheet
      })
      : null,
    [paletteReferenceId, paletteSourceKind, presentation, resolvedActiveSheet]
  );

  const paletteImageKey = paletteSource?.kind === "reference" && paletteSource.referenceId
    ? `ref:${paletteSource.referenceId}`
    : resolvedActiveSheet?.name ?? "sheet";

  useEffect(() => {
    setPaletteSourceKind("sheet");
    setPaletteReferenceId(null);
  }, [resolvedActiveSheet?.name]);

  useEffect(() => {
    if (paletteSourceKind === "reference" && paletteReferences.length === 0) {
      setPaletteSourceKind("sheet");
    }
  }, [paletteReferences.length, paletteSourceKind]);

  if (!presentation) {
    return (
      <WorkspaceEmptyState
        title="Sprites"
        description="Abra um projeto para visualizar sprite sheets, animações e imagens de referência."
      />
    );
  }

  const activeAnimationID = activeSelection?.animation.id ?? null;
  const activeAnimationState = activeSelection
    ? (presentation.animationStatesBySheet[activeSelection.sheet.name] ?? []).find((state) => (
      state.animationIDs.includes(activeSelection.animation.id)
    )) ?? presentation.animationStatesBySheet[activeSelection.sheet.name]?.[0] ?? null
    : null;
  const activeSheet = resolvedActiveSheet;
  const activeSheetAnimations = activeSheet ? presentation.animationsBySheet[activeSheet.name] ?? [] : [];
  const animationGroups = Array.from(activeSheetAnimations.reduce((groups, animation) => {
    const key = animation.state ?? animation.id;
    const rows = groups.get(key) ?? [];
    rows.push(animation);
    groups.set(key, rows);
    return groups;
  }, new Map<string, SpritesWorkspaceAnimation[]>())).map(([id, animations]) => ({
    id, label: spriteStateLabel(animations[0].state ?? animations[0].name), animations
  }));
  const activePreviewAnimation = activeSelection && activeSelection.sheet.name === activeSheet?.name
    ? activeSelection.animation
    : activeSheetAnimations[0] ?? null;

  const activeGroup = animationGroups.find((group) => group.animations.some((animation) => animation.id === activePreviewAnimation?.id)) ?? animationGroups[0];
  function selectAnimationGroup(groupID: string): void {
    const group = animationGroups.find((candidate) => candidate.id === groupID);
    const animation = group?.animations.find((candidate) => candidate.direction === activePreviewAnimation?.direction) ?? group?.animations[0];
    if (animation) selectAnimation(animation.id);
  }

  function selectAnimation(animationID: string, sheetName: string | null = activeSheet?.name ?? null): void {
    setSelectedAnimationID(animationID);
    setSelectedSheetName(sheetName);
    setSelectedMetaspriteFrameIndex(0);
    setSelectedMetaspriteTileIndex(0);
    setSelectedMetaspriteTileIndexes([]);
    setIsSpritePlaybackRunning(false);
  }

  function openSheetContextMenu(event: MouseEvent<HTMLElement>, sheet: SpritesWorkspaceSheet): void {
    event.preventDefault();
    event.stopPropagation();
    selectSpriteSheet(sheet);
    setContextMenu({ assetID: sheet.id, kind: "sheet", label: sheet.name, x: event.clientX, y: event.clientY });
  }

  function openAnimationContextMenu(event: MouseEvent<HTMLElement>, animation: Pick<SpritesWorkspaceAnimation, "id" | "name">): void {
    event.preventDefault();
    event.stopPropagation();
    selectAnimation(animation.id);
    setContextMenu({ assetID: animation.id, kind: "animation", label: animation.name, x: event.clientX, y: event.clientY });
  }
  const activePlaybackFrameCount = activePreviewAnimation?.frameCount ?? 0;
  const activePlaybackFrameIndex = activePlaybackFrameCount > 0
    ? Math.min(selectedMetaspriteFrameIndex, activePlaybackFrameCount - 1)
    : 0;
  const activePreviewMetaspriteFrame = resolveSpriteWorkspaceCanvasFrame(activePreviewAnimation, activePlaybackFrameIndex);
  const activePreviewMetaspriteTile = activePreviewMetaspriteFrame
    ? activePreviewMetaspriteFrame.tiles[Math.min(selectedMetaspriteTileIndex, Math.max(0, activePreviewMetaspriteFrame.tileCount - 1))] ?? null
    : null;
  const activePaintBrush = activePreviewAnimation && activePreviewMetaspriteFrame
    ? deriveSpritePaintBrush({
      animation: activePreviewAnimation,
      brushState: paintBrushByAnimation[activePreviewAnimation.id] ?? null,
      frame: activePreviewMetaspriteFrame,
      preferBrushState: activeSpriteMode === "paint",
      selectedTile: activePreviewMetaspriteTile
    })
    : null;
  const activeSourceURL = activeSheet ? resolveSpriteAssetURL(projectPath, activeSheet.source, activeSheet.bundledDefaultAsset) : null;
  const activeImageSize = activeSheet ? sheetImageSizes[activeSheet.name] ?? null : null;
  const canvasDisplayOptions: SpriteCanvasDisplayOptions = {
    showGrid: showSpriteGrid,
    showHitbox: showSpriteHitbox,
    showOnionSkin: showSpriteOnionSkin,
    showOrigin: showSpriteOrigin,
    zoom: spriteCanvasZoom
  };
  function selectSpritePlaybackFrame(frameIndex: number): void {
    pauseSpritePlayback(setIsSpritePlaybackRunning);
    const lastFrameIndex = Math.max(0, activePlaybackFrameCount - 1);
    const nextFrameIndex = Math.min(Math.max(0, frameIndex), lastFrameIndex);
    setSelectedMetaspriteFrameIndex(nextFrameIndex);
    setSelectedMetaspriteTileIndex(0);
    setSelectedMetaspriteTileIndexes([]);
  }
  function stepSpritePlaybackFrame(delta: number): void {
    if (!activePreviewAnimation || activePlaybackFrameCount <= 0) {
      return;
    }

    pauseSpritePlayback(setIsSpritePlaybackRunning);
    const lastFrameIndex = activePlaybackFrameCount - 1;
    const proposedFrameIndex = activePlaybackFrameIndex + delta;
    const nextFrameIndex = activePreviewAnimation.loops
      ? (proposedFrameIndex + activePlaybackFrameCount) % activePlaybackFrameCount
      : Math.min(Math.max(0, proposedFrameIndex), lastFrameIndex);
    selectSpritePlaybackFrame(nextFrameIndex);
  }
  function updatePaintBrush(animationID: string, fields: SpritePaintBrushState): void {
    setPaintBrushByAnimation((current) => ({
      ...current,
      [animationID]: {
        ...current[animationID],
        ...fields
      }
    }));
  }
  function selectSpriteSheet(sheet: SpritesWorkspaceSheet): void {
    if (!presentation) return;
    const animation = presentation.animationsBySheet[sheet.name]?.[0] ?? null;
    setSelectedSheetName(sheet.name);
    setSelectedAnimationID(animation?.id ?? null);
    setSelectedMetaspriteFrameIndex(0);
    setSelectedMetaspriteTileIndex(0);
    setSelectedMetaspriteTileIndexes([]);
    setIsSpritePlaybackRunning(false);
  }

  return (
    <section className="sprites-workspace" aria-label="Workspace Sprites">
      {contextMenu ? (
        <StudioContextMenu
          actions={contextMenu.kind === "sheet" ? [
            { label: "Renomear", onSelect: () => onRenameSpriteSheet(contextMenu.assetID, contextMenu.label) },
            { label: "Duplicar", onSelect: () => onDuplicateSpriteSheet(contextMenu.assetID, contextMenu.label) },
            { danger: true, label: "Excluir", onSelect: () => onRemoveSpriteSheet(contextMenu.assetID, contextMenu.label) }
          ] : [
            { label: "Renomear", onSelect: () => onRenameAnimation(contextMenu.assetID, contextMenu.label) },
            { label: "Duplicar", onSelect: () => onDuplicateAnimation(contextMenu.assetID, contextMenu.label) },
            { danger: true, label: "Excluir", onSelect: () => onRemoveAnimation(contextMenu.assetID, contextMenu.label) }
          ]}
          onClose={() => setContextMenu(null)}
          state={contextMenu}
        />
      ) : null}
      <h3 className="studio-visually-hidden">Sprites</h3>

      {validationOpen ? (
        <div className="sprites-validation-panel" aria-label="Diagnostico de sprites">
          {validationIssues.map((issue) => (
            <button
              className={issue.severity === "error" ? "danger-chip" : issue.severity === "warning" ? "warning-chip" : ""}
              key={issue.id}
              onClick={() => {
                if (!issue.spriteSheet) return;
                const animation = presentation.animationsBySheet[issue.spriteSheet]?.[0] ?? null;
                setSearchQuery("");
                setSelectedSheetName(issue.spriteSheet);
                setSelectedAnimationID(animation?.id ?? null);
              }}
              type="button"
            >
              {issue.message}
            </button>
          ))}
        </div>
      ) : null}

      {activeSelection ? null : (
        <div className="sprites-summary-strip" aria-label="Resumo de sprites">
          {summaryCards.map((card) => (
            <div className={`sprites-summary-card ${card.tone}`} key={card.id}>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sprites-layout">
        <aside className="sprites-rail" aria-label="Biblioteca de sprites">
          <div className="sprite-library-title sprites-library-heading">
            <strong>Sprites</strong><span>{presentation.spriteSheets.length}</span>
            <button aria-label="Adicionar ator por PNG" className="sprite-library-add-button" onClick={() => void onImportSpriteSheets()} title="Importar sprite por PNG" type="button"><Plus size={16} /></button>
          </div>
          <div className="sprites-filter-bar" aria-label="Filtros de sprites">
            <label>
              <Search aria-hidden="true" size={15} />
              <input
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                aria-label="Buscar sprite"
                placeholder="Buscar sprite..."
                type="search"
                value={searchQuery}
              />
            </label>
          </div>

          <div className="sprite-library-group">
            <div className="sprite-sheet-list" role="list" aria-label="Sprite sheets do projeto">
              {presentation.spriteSheets.length === 0 ? (
                <p className="muted">Nenhum sprite sheet encontrado no projeto aberto.</p>
              ) : visibleSpriteSheets.length === 0 ? (
                <p className="muted">Nenhum sprite sheet corresponde aos filtros atuais.</p>
              ) : (
                visibleSpriteSheets.map((sheet) => {
                  const isActiveSheet = sheet.name === activeSheet?.name;
                  return (
                    <button
                      ref={isActiveSheet ? activeSheetButtonRef : null}
                      aria-label={sheet.name}
                      aria-pressed={isActiveSheet}
                      className={[
                        "sprite-sheet-rail-row",
                        isActiveSheet ? "active" : "",
                        sheet.hasAsset ? "" : "missing"
                      ].filter(Boolean).join(" ")}
                      key={sheet.id}
                      onClick={() => selectSpriteSheet(sheet)}
                      onContextMenu={(event) => openSheetContextMenu(event, sheet)}
                      type="button"
                    >
                      <SpriteLibraryThumbnail sheet={sheet} animation={presentation.animationsBySheet[sheet.name]?.[0]} projectPath={projectPath} />
                      <span className="sprite-library-sheet-copy"><strong>{spriteSheetLabel(sheet.name)}</strong><small>{sheet.hasAsset ? sheet.name : "Asset ausente"}</small></span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="sprite-library-group sprite-animation-library" aria-label="Animações do ator selecionado">
            <div className="sprite-library-title">
              <strong>Animações</strong>
              <span>{animationGroups.length}</span>
              <button
                aria-label="Adicionar pacote de animação"
                className="sprite-library-package-button"
                disabled={!activeSheet}
                onClick={() => activeSheet && onCreateAnimation(activeSheet.name)}
                title="Cria uma nova animação no ator selecionado"
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>
            {animationGroups.length === 0 ? <p className="muted">Nenhuma animação para o sprite selecionado.</p> : (
              <div className="sprite-animation-list">
                {animationGroups.map((group) => {
                  const selected = group.id === activeGroup?.id;
                  const animation = group.animations.find((row) => row.direction === activePreviewAnimation?.direction) ?? group.animations[0];
                  const directionCount = new Set(group.animations.map((row) => row.direction).filter(Boolean)).size;
                  return <button key={group.id} aria-label={`Selecionar animação ${group.label}`} aria-pressed={selected}
                    className={selected ? "sprite-animation-rail-row active" : "sprite-animation-rail-row"}
                    onClick={() => selectAnimationGroup(group.id)} onContextMenu={(event) => openAnimationContextMenu(event, animation)} type="button">
                    <Play aria-hidden="true" size={14} /><span><strong>{group.label}</strong><small>{directionCount > 1 ? `${directionCount} direções` : `${animation.frameCount} quadro(s)`}</small></span>
                  </button>;
                })}
              </div>
            )}
          </div>
        </aside>

        <section
          className={activeSpriteMode === "paint" ? "sprites-canvas-stage paint-mode" : "sprites-canvas-stage"}
          aria-label="Canvas de sprites"
        >
          <header className="sprites-document-heading"><h2>{activeSheet ? spriteSheetLabel(activeSheet.name) : "Sprites"}</h2><p>{activeSheet?.name ?? "Selecione um sprite"}{activePreviewAnimation ? ` · ${activePreviewAnimation.frameWidth} × ${activePreviewAnimation.frameHeight} px` : ""}</p></header>
          <WorkspaceContextToolbar
            className="sprites-tool-strip is-compact"
            aria-label="Ferramentas do animador"
            onFocus={(event) => {
              const toolbar = event.currentTarget;
              const control = event.target;
              if (!(control instanceof HTMLElement) || toolbar.scrollWidth <= toolbar.clientWidth) return;
              requestAnimationFrame(() => {
                const bounds = toolbar.getBoundingClientRect();
                const focused = control.getBoundingClientRect();
                if (focused.left < bounds.left + 4) toolbar.scrollLeft += focused.left - bounds.left - 4;
                else if (focused.right > bounds.right - 4) toolbar.scrollLeft += focused.right - bounds.right + 4;
              });
            }}
          >
            <div className="sprite-direction-navigation" role="group" aria-label="Direção ativa">
              {[...(activeGroup?.animations ?? [])].sort((left, right) => {
                const order = ["up", "down", "left", "right"];
                return order.indexOf(left.direction ?? "none") - order.indexOf(right.direction ?? "none");
              }).map((animation) => {
                const direction = animation.direction ?? "none";
                const label = spriteDirectionLabels[direction] ?? direction;
                return <button key={animation.id} aria-label={`Direção ${label}`} title={label} aria-pressed={animation.id === activePreviewAnimation?.id} className={animation.id === activePreviewAnimation?.id ? "active" : ""} onClick={() => selectAnimation(animation.id)} type="button">
                  {direction === "up" ? <ArrowUp size={16} /> : direction === "down" ? <ArrowDown size={16} /> : direction === "left" ? <ArrowLeft size={16} /> : direction === "right" ? <ArrowRight size={16} /> : label}
                </button>;
              })}
            </div>
            <div className="sprite-playback-strip is-compact" aria-label="Playback">
              <button
                aria-label="Primeiro frame"
                disabled={activePlaybackFrameCount <= 0}
                onClick={() => selectSpritePlaybackFrame(0)}
                type="button"
              >
                <SkipBack size={16} />
              </button>
              <button
                aria-label="Frame anterior"
                disabled={activePlaybackFrameCount <= 1}
                onClick={() => stepSpritePlaybackFrame(-1)}
                type="button"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label={isSpritePlaybackRunning ? "Pausar animação" : "Reproduzir animação"}
                aria-pressed={isSpritePlaybackRunning}
                className={isSpritePlaybackRunning ? "active" : ""}
                disabled={activePlaybackFrameCount <= 1}
                onClick={() => setIsSpritePlaybackRunning((current) => !current)}
                type="button"
              >
                {isSpritePlaybackRunning ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                aria-label="Proximo frame"
                disabled={activePlaybackFrameCount <= 1}
                onClick={() => stepSpritePlaybackFrame(1)}
                type="button"
              >
                <ChevronRight size={16} />
              </button>
              <button
                aria-label="Ultimo frame"
                disabled={activePlaybackFrameCount <= 0}
                onClick={() => selectSpritePlaybackFrame(Math.max(0, activePlaybackFrameCount - 1))}
                type="button"
              >
                <SkipForward size={16} />
              </button>
              <span className="sprite-playback-counter">{activePlaybackFrameIndex + 1} / {activePlaybackFrameCount || 1}</span>
            </div>
            <span aria-hidden="true" className="sprites-tool-divider" />
            <div className="sprite-canvas-view-strip is-compact" aria-label="Visualizacao do canvas">
              <button
                aria-label="Reduzir zoom do canvas de sprite"
                disabled={spriteCanvasZoom <= 2}
                onClick={() => setSpriteCanvasZoom((current) => Math.max(2, current - 2))}
                type="button"
              >
                -
              </button>
              <span>{spriteCanvasZoom}x</span>
              <button
                aria-label="Aumentar zoom do canvas de sprite"
                disabled={spriteCanvasZoom >= 32}
                onClick={() => setSpriteCanvasZoom((current) => Math.min(32, current + 2))}
                type="button"
              >
                +
              </button>
              <button
                aria-label="Ajustar zoom do canvas ao espaco disponivel"
                disabled={!activePreviewMetaspriteFrame || !composerStageSize}
                onClick={() => {
                  if (!activePreviewMetaspriteFrame || !composerStageSize) return;
                  setSpriteCanvasZoom(deriveSpriteCanvasFitScale({
                    containerHeight: composerStageSize.height,
                    containerWidth: composerStageSize.width,
                    frameHeight: activePreviewMetaspriteFrame.height,
                    frameWidth: activePreviewMetaspriteFrame.width,
                    maxScale: 32,
                    padding: 32
                  }));
                }}
                type="button"
              >
                Ajustar
              </button>
              <StudioChip active={showSpriteGrid} onClick={() => setShowSpriteGrid((current) => !current)} aria-label="Grid" title="Grid">
                <Grid3X3 aria-hidden="true" size={15} /><span>Grid</span>
              </StudioChip>
              <StudioChip active={showSpriteOrigin} onClick={() => setShowSpriteOrigin((current) => !current)} aria-label="Origem" title="Origem">
                <Crosshair aria-hidden="true" size={15} /><span>Origem</span>
              </StudioChip>
              <StudioChip active={showSpriteHitbox} onClick={() => setShowSpriteHitbox((current) => !current)} aria-label="Hitbox" title="Hitbox">
                <Scan aria-hidden="true" size={15} /><span>Hitbox</span>
              </StudioChip>
              <StudioChip active={showSpriteOnionSkin} onClick={() => setShowSpriteOnionSkin((current) => !current)} aria-label="Onion skin" title="Onion skin">
                <Layers aria-hidden="true" size={15} /><span>On</span>
              </StudioChip>
            </div>
          </WorkspaceContextToolbar>
          {activeSheet ? (
            <SpritesEditorCenter
              bottomPane={(
                <div className="sprites-editor-bottom-content">
                  <section className="sprites-editor-tiles-row" aria-label="Paleta de tiles">
                    <div className="sprites-editor-row-label">{paletteSourceKind === "reference" ? "Referência visual" : "Folha de sprites"}</div>
                    {spriteSheetPreview(
                      activeSheet,
                      activePreviewAnimation,
                      activePreviewMetaspriteFrame,
                      activePreviewMetaspriteTile,
                      activePaintBrush,
                      spriteSheetInteractionMode,
                      setSpriteSheetInteractionMode,
                      updatePaintBrush,
                      projectPath,
                      sheetImageSizes,
                      setSheetImageSizes,
                      onUpdateAnimationFields,
                      onUpdateMetaspriteTile,
                      true,
                      activeSpriteMode,
                      paletteSourceKind,
                      setPaletteSourceKind,
                      paletteReferenceId,
                      setPaletteReferenceId,
                      paletteReferences,
                      paletteSource?.source ?? activeSheet.source,
                      paletteSource?.bundledDefaultAsset ?? activeSheet.bundledDefaultAsset,
                      paletteImageKey
                    )}
                  </section>
                  <section className="sprites-editor-frames-row" aria-label="Quadros da animação">
                    <div className="sprites-editor-row-label">Quadros{activeGroup ? ` · ${activeGroup.label}` : ""}</div>
                    <SpriteFrameTileStrip
                      activeBrush={activePaintBrush}
                      activeFrame={activePreviewMetaspriteFrame}
                      animation={activePreviewAnimation}
                      imageSize={activeImageSize}
                      onAddMetaspriteTile={onAddMetaspriteTile}
                      onRemoveMetaspriteTile={onRemoveMetaspriteTile}
                      onUpdateAnimationFields={onUpdateAnimationFields}
                      selectedMetaspriteFrameIndex={selectedMetaspriteFrameIndex}
                      selectedMetaspriteTileIndex={selectedMetaspriteTileIndex}
                      selectedMetaspriteTileIndexes={selectedMetaspriteTileIndexes}
                      setIsSpritePlaybackRunning={setIsSpritePlaybackRunning}
                      setSelectedMetaspriteFrameIndex={setSelectedMetaspriteFrameIndex}
                      setSelectedMetaspriteTileIndex={setSelectedMetaspriteTileIndex}
                      setSelectedMetaspriteTileIndexes={setSelectedMetaspriteTileIndexes}
                      sourceURL={activeSourceURL}
                    />
                  </section>
                </div>
              )}
              canvasPane={(
                <div className="sprites-canvas-surface">
            <div className="sprite-mode-segment" role="group" aria-label="Modo de edicao de sprite">
              {spriteAnimatorModes.map((mode) => (
                <StudioChip
                  active={mode.id === activeSpriteMode}
                  aria-label={mode.label}
                  key={mode.id}
                  onClick={() => {
                    setActiveSpriteMode(mode.id);
                    if (mode.id === "geometry") {
                      setActiveInspectorTab(mode.id);
                    } else if (mode.id === "paint" || mode.id === "erase") {
                      setActiveInspectorTab("frame");
                    }
                  }}
                  title={mode.title}
                >
                  {mode.id === "select" ? <MousePointer2 size={17} /> : mode.id === "paint" ? <Stamp size={17} /> : mode.id === "erase" ? <Eraser size={17} /> : <Scan size={17} />}
                </StudioChip>
              ))}
            </div>
                <SpriteComposerPanel
                  activeBrush={activePaintBrush}
                  activeFrame={activePreviewMetaspriteFrame}
                  activeSpriteMode={activeSpriteMode}
                  animation={activePreviewAnimation}
                  displayOptions={canvasDisplayOptions}
                  imageSize={activeImageSize}
                  layout="viewport"
                  onAddMetaspriteTile={onAddMetaspriteTile}
                  onRemoveMetaspriteTile={onRemoveMetaspriteTile}
                  onStageResize={setComposerStageSize}
                  onUpdateMetaspriteTile={onUpdateMetaspriteTile}
                  selectedMetaspriteFrameIndex={selectedMetaspriteFrameIndex}
                  selectedMetaspriteTileIndex={selectedMetaspriteTileIndex}
                  selectedMetaspriteTileIndexes={selectedMetaspriteTileIndexes}
                  setSelectedMetaspriteFrameIndex={setSelectedMetaspriteFrameIndex}
                  setSelectedMetaspriteTileIndex={setSelectedMetaspriteTileIndex}
                  setSelectedMetaspriteTileIndexes={setSelectedMetaspriteTileIndexes}
                  sourceURL={activeSourceURL}
                />
                </div>
              )}
            />
          ) : (
            <p className="muted">Selecione ou crie um sprite sheet para abrir o animador.</p>
          )}
        </section>

        <WorkspaceInspectorRail
          ariaLabel="Inspector de sprite"
          className="sprites-inspector"
          workspaceId="sprites"
        >
          {activeSelection ? (
            <>
              <header className="sprites-inspector-heading"><h3>Animação</h3><p>{activeGroup?.label ?? activeSelection.animation.name} · {spriteDirectionLabels[activeSelection.animation.direction ?? "none"] ?? activeSelection.animation.direction}</p></header>
              <div aria-label="Seções do inspetor de sprite" className="sprites-inspector-tabs" role="tablist">
                {spriteInspectorTabs.map((tab) => (
                  <button
                    aria-controls={`sprites-inspector-panel-${tab.id}`}
                    aria-selected={activeInspectorTab === tab.id}
                    className={activeInspectorTab === tab.id ? "active" : ""}
                    id={`sprites-inspector-tab-${tab.id}`}
                    key={tab.id}
                    onClick={() => setActiveInspectorTab(tab.id)}
                    role="tab"
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div
                aria-labelledby={`sprites-inspector-tab-${activeInspectorTab}`}
                className="sprites-inspector-tab-panel"
                id={`sprites-inspector-panel-${activeInspectorTab}`}
                role="tabpanel"
              >
                {animationEditor(
                  activeSelection.animation,
                  activeAnimationState,
                  presentation.stateDirectionOptionsBySheet[activeSelection.sheet.name] ?? { directions: [], states: [] },
                  presentation.spriteSheets,
                  selectedMetaspriteFrameIndex,
                  selectedMetaspriteTileIndex,
                  setSelectedMetaspriteTileIndex,
                  selectedMetaspriteTileIndexes,
                  setSelectedMetaspriteTileIndexes,
                  onUpdateMetaspriteFrame,
                  onUpdateMetaspriteTile,
                  onMoveMetaspriteTiles,
                  onToggleMetaspriteTilesFlip,
                  onReorderMetaspriteTiles,
                  onRemoveMetaspriteTiles,
                  onFitAnimationHitbox,
                  onCopyAnimationGeometry,
                  onImportSpriteSheets,
                  onUpdateAnimationFields,
                  onUpdateAnimationState,
                  activeInspectorTab
                )}
                {activeInspectorTab === "animation" ? (
                  <>
                    <button className="sprite-inspector-geometry-shortcut" onClick={() => setActiveInspectorTab("geometry")} type="button">Origem e colisão <ChevronRight size={15} /></button>
                    <details className="sprite-inspector-advanced">
                      <summary>Dados GBA e ações</summary>
                      {spriteVramBudgetPanel(activeSelection.animation)}
                      <div className="sprite-animation-actions inspector-actions">
                        <button type="button" onClick={() => onRenameAnimation(activeSelection.animation.id, activeSelection.animation.name)}>Renomear</button>
                        <button type="button" onClick={() => onDuplicateAnimation(activeSelection.animation.id, activeSelection.animation.name)}>Duplicar</button>
                        <button className="danger-button" type="button" onClick={() => onRemoveAnimation(activeSelection.animation.id, activeSelection.animation.name)}>
                          Remover
                        </button>
                      </div>
                    </details>
                    {(presentation.stateDirectionPreviewsBySheet[activeSelection.sheet.name] ?? []).length > 0 ? (
                      <details className="sprite-inspector-advanced sprite-state-direction-preview-section">
                        <summary>Estados e direções</summary>
                        {stateDirectionPreviewGrid(
                          presentation.stateDirectionPreviewsBySheet[activeSelection.sheet.name] ?? [],
                          activeAnimationID,
                          selectedMetaspriteFrameIndex,
                          animationElapsedMs,
                          activeSourceURL,
                          activeImageSize,
                          setSelectedAnimationID,
                          setIsSpritePlaybackRunning,
                          setSelectedMetaspriteFrameIndex
                        )}
                      </details>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted">Selecione uma animação para editar.</p>
          )}

          <details className="sprite-reference-panel" aria-label="Imagens de referência de sprite">
            <summary>Referências</summary>
            {presentation.references.length === 0 ? (
              <p className="muted">Nenhuma referência visual cadastrada.</p>
            ) : (
              presentation.references.map((reference) => (
                <div className={reference.isActive ? "sprite-reference-row active" : "sprite-reference-row"} key={reference.id}>
                  <div>
                    <span>{reference.title}</span>
                    <small>{reference.generatedSpriteAssetName ?? reference.assetName ?? "Sem sprite gerado"}</small>
                  </div>
                  <div className="sprite-reference-actions">
                    <strong>{reference.isVisible ? `${Math.round(reference.opacity * 100)}%` : "oculta"}</strong>
                    <button
                      onClick={() => onGenerateSpriteFromReference(reference.id, reference.title, reference.assetName, reference.generatedSpriteAssetName)}
                      type="button"
                    >
                      Gerar
                    </button>
                  </div>
                </div>
              ))
            )}
          </details>
                      <button
              aria-expanded={validationOpen}
              className="sprites-verify-button"
              onClick={() => setValidationOpen((current) => !current)}
              type="button"
            >
              <ShieldCheck size={16} /> Verificar sprite
              {validationIssues.filter((issue) => issue.severity !== "info").length > 0
                ? ` (${validationIssues.filter((issue) => issue.severity !== "info").length})`
                : ""}
            </button>
        </WorkspaceInspectorRail>
      </div>
    </section>
  );
}
