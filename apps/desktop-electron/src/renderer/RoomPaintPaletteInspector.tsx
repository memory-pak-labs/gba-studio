import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { InspectorInfoTip } from "./InspectorControls";

import { isDesktopAssetURL, resolveAssetURLWithBundledDefault } from "../shared/spriteAssetURL";
import {
  canvasPointToTilesetTileID,
  deriveMetatileTilesetStamp,
  deriveTilesetTileStamp,
  deriveRoomPaintInspectorPresentation,
  tilesetRegionForTileID,
  type RoomTileStamp,
  type RoomTilePaintTool
} from "../shared/roomsWorkspace";
import type {
  RoomsWorkspaceRoom,
  UpdateRoomFields
} from "../shared/roomsWorkspace/core";

type RoomImageSize = {
  height: number;
  width: number;
};

type RoomPaintPaletteInspectorProps = {
  backgroundAssets: Array<{ label: string; value: string }>;
  onImportTileset(roomID: string): Promise<void>;
  onImportTiledMap(roomID: string): Promise<void>;
  onUpdateRoomFields(roomID: string, fields: UpdateRoomFields): void;
  projectPath?: string;
  room: RoomsWorkspaceRoom;
  selectedCellIndex: number | null;
  selectedTileID: number;
  selectedTileStamp: RoomTileStamp;
  selectedTool: RoomTilePaintTool;
  setSelectedTileID: (tileID: number) => void;
  setSelectedTileStamp: (stamp: RoomTileStamp) => void;
  setSelectedTool: (tool: RoomTilePaintTool) => void;
  videoModeId: number;
  videoModeLabel: string;
};

function selectOptionsWithCurrent(
  options: Array<{ label: string; value: string }>,
  currentValue: string | null
): Array<{ label: string; value: string }> {
  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }

  return [{ label: currentValue, value: currentValue }, ...options];
}

export function RoomPaintPaletteInspector({
  backgroundAssets,
  onImportTileset,
  onImportTiledMap,
  onUpdateRoomFields,
  projectPath,
  room,
  selectedCellIndex,
  selectedTileID,
  selectedTileStamp,
  selectedTool,
  setSelectedTileID,
  setSelectedTileStamp,
  setSelectedTool,
  videoModeId,
  videoModeLabel
}: RoomPaintPaletteInspectorProps): React.ReactElement {
  const backgroundURL = resolveAssetURLWithBundledDefault(
    projectPath,
    room.backgroundSource,
    room.backgroundBundledDefaultAsset
  );
  const hasSelectedTileset = Boolean(room.background?.trim());
  const [tilesetSize, setTilesetSize] = useState<RoomImageSize | null>(null);
  const [tilesetPreviewError, setTilesetPreviewError] = useState(false);
  const [tilesetZoom, setTilesetZoom] = useState(1);
  const selectionStartTileID = useRef<number | null>(null);
  const presentation = deriveRoomPaintInspectorPresentation(room, {
    activeTileLayerMapping: room.activeTileLayerMapping,
    imageSize: tilesetSize,
    layeredPaintingEnabled: room.layeredPaintingEnabled,
    paintedTileCount: room.paintedTileCount,
    selectedTileID,
    selectedTool,
    videoModeId,
    videoModeLabel
  });
  const selectedRegion = tilesetSize
    ? tilesetRegionForTileID({
        imageHeight: tilesetSize.height,
        imageWidth: tilesetSize.width,
        tileHeight: room.backgroundTileHeight,
        tileID: selectedTileID,
        tileOffsetX: room.backgroundTileOffsetX,
        tileOffsetY: room.backgroundTileOffsetY,
        tileWidth: room.backgroundTileWidth
      })
    : null;
  const selectedStampRegion = selectedRegion
    ? {
        ...selectedRegion,
        height: selectedRegion.height * selectedTileStamp.height,
        width: selectedRegion.width * selectedTileStamp.width
      }
    : null;
  const backgroundOptions = selectOptionsWithCurrent(backgroundAssets, room.background);
  useEffect(() => {
    setTilesetSize(null);
    setTilesetPreviewError(false);
  }, [backgroundURL, room.background, room.id]);

  function tileIDFromPalettePointer(event: PointerEvent<HTMLImageElement>): number {
    const image = event.currentTarget;
    const bounds = image.getBoundingClientRect();
    return canvasPointToTilesetTileID({
      imageHeight: image.naturalHeight,
      imageWidth: image.naturalWidth,
      pointX: event.clientX - bounds.left,
      pointY: event.clientY - bounds.top,
      renderedHeight: bounds.height,
      renderedWidth: bounds.width,
      tileHeight: room.backgroundTileHeight,
      tileOffsetX: room.backgroundTileOffsetX,
      tileOffsetY: room.backgroundTileOffsetY,
      tileWidth: room.backgroundTileWidth
    });
  }

  function selectTilesFromPalette(image: HTMLImageElement, startTileID: number, endTileID: number): void {
    const stamp = room.tilemapContract
      ? deriveMetatileTilesetStamp({
          anchorTileID: endTileID,
          blockHeight: room.tilemapContract.metatileHeight,
          blockWidth: room.tilemapContract.metatileWidth,
          imageHeight: image.naturalHeight,
          imageWidth: image.naturalWidth,
          tileHeight: room.backgroundTileHeight,
          tileOffsetX: room.backgroundTileOffsetX,
          tileOffsetY: room.backgroundTileOffsetY,
          tileWidth: room.backgroundTileWidth
        })
      : deriveTilesetTileStamp({
          endTileID,
          imageHeight: image.naturalHeight,
          imageWidth: image.naturalWidth,
          startTileID,
          tileHeight: room.backgroundTileHeight,
          tileOffsetX: room.backgroundTileOffsetX,
          tileOffsetY: room.backgroundTileOffsetY,
          tileWidth: room.backgroundTileWidth
        });
    setSelectedTool("brush");
    setSelectedTileID(stamp.tileIDs[0] ?? endTileID);
    setSelectedTileStamp(stamp);
  }

  function startTilesetSelection(event: PointerEvent<HTMLImageElement>): void {
    event.preventDefault();
    const tileID = tileIDFromPalettePointer(event);
    selectionStartTileID.current = tileID;
    event.currentTarget.setPointerCapture(event.pointerId);
    selectTilesFromPalette(event.currentTarget, tileID, tileID);
  }

  function continueTilesetSelection(event: PointerEvent<HTMLImageElement>): void {
    if (selectionStartTileID.current === null || event.buttons !== 1) return;
    selectTilesFromPalette(event.currentTarget, selectionStartTileID.current, tileIDFromPalettePointer(event));
  }

  function finishTilesetSelection(event: PointerEvent<HTMLImageElement>): void {
    if (selectionStartTileID.current !== null) {
      selectTilesFromPalette(event.currentTarget, selectionStartTileID.current, tileIDFromPalettePointer(event));
    }
    selectionStartTileID.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function cancelTilesetSelection(event: PointerEvent<HTMLImageElement>): void {
    selectionStartTileID.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <section className="room-paint-inspector" aria-label="Inspector Pintura">
      <div className="room-paint-panel">
        <div className="room-paint-panel-heading">
          <h4>Paleta</h4>
          <p className="room-paint-video-mode">{presentation.videoModeLabel}</p>
        </div>
      </div>

      {room.tilemapContract ? (
        <div aria-label="Contrato modular do tilemap" className="room-paint-metatile-contract">
          <strong>Metatile {room.tilemapContract.metatileWidth * room.backgroundTileWidth}×{room.tilemapContract.metatileHeight * room.backgroundTileHeight}</strong>
          <InspectorInfoTip label="Metatile">Base BG2 · Topo BG1 · colisão alinhada em metatile</InspectorInfoTip>
        </div>
      ) : null}

      <div className="room-paint-free-selection" aria-label="Pincel por seleção livre">
        <span className="room-paint-selection-title">
          <strong>Seleção livre</strong>
          <InspectorInfoTip label="Seleção livre">Arraste sobre o tileset para montar o pincel.</InspectorInfoTip>
        </span>
        <em>{selectedTileStamp.width}×{selectedTileStamp.height}</em>
      </div>

      <div className="room-paint-tileset-header">
        <span>Tileset</span>
        <select
          onChange={(event) => onUpdateRoomFields(room.id, { backgroundAssetName: event.currentTarget.value })}
          value={room.background ?? ""}
        >
          <option value="">Sem tileset</option>
          {backgroundOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button aria-label="Importar tileset PNG" onClick={() => void onImportTileset(room.id)} type="button">
          +
        </button>
        <button aria-label="Importar mapa Tiled" onClick={() => void onImportTiledMap(room.id)} type="button">
          Tiled
        </button>
      </div>

      <div className="room-paint-tileset-zoom" role="group" aria-label="Zoom do tileset">
        <button
          aria-label="Reduzir zoom do tileset"
          onClick={() => setTilesetZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))}
          type="button"
        >
          <ZoomOut aria-hidden="true" size={15} strokeWidth={2.3} />
        </button>
        <strong>{Math.round(tilesetZoom * 100)}%</strong>
        <button
          aria-label="Aumentar zoom do tileset"
          onClick={() => setTilesetZoom((current) => Math.min(4, Number((current + 0.25).toFixed(2))))}
          type="button"
        >
          <ZoomIn aria-hidden="true" size={15} strokeWidth={2.3} />
        </button>
      </div>

      <div className={`room-paint-tileset-preview${tilesetPreviewError || (hasSelectedTileset && !backgroundURL) ? " is-error" : ""}`}>
        {backgroundURL && !tilesetPreviewError ? (
          <div
            className="room-paint-tileset-image-wrap"
            style={{
              height: tilesetSize ? `${tilesetSize.height * tilesetZoom}px` : undefined,
              width: tilesetSize ? `${tilesetSize.width * tilesetZoom}px` : undefined
            }}
          >
            <img
              alt={`Tileset ${presentation.backgroundName}`}
              crossOrigin={isDesktopAssetURL(backgroundURL) ? "anonymous" : undefined}
              onError={() => {
                setTilesetSize(null);
                setTilesetPreviewError(true);
              }}
              onLoad={(event) => {
                setTilesetPreviewError(false);
                setTilesetSize({
                  height: event.currentTarget.naturalHeight,
                  width: event.currentTarget.naturalWidth
                });
              }}
              onPointerCancel={cancelTilesetSelection}
              onPointerDown={startTilesetSelection}
              onPointerMove={continueTilesetSelection}
              onPointerUp={finishTilesetSelection}
              src={backgroundURL}
              style={{
                height: tilesetSize ? `${tilesetSize.height * tilesetZoom}px` : undefined,
                width: tilesetSize ? `${tilesetSize.width * tilesetZoom}px` : undefined
              }}
            />
            {selectedStampRegion ? (
              <span
                aria-hidden="true"
                className="room-paint-selected-tile"
                style={{
                  height: `${selectedStampRegion.height * tilesetZoom}px`,
                  left: `${selectedStampRegion.x * tilesetZoom}px`,
                  top: `${selectedStampRegion.y * tilesetZoom}px`,
                  width: `${selectedStampRegion.width * tilesetZoom}px`
                }}
              />
            ) : null}
          </div>
        ) : tilesetPreviewError || (hasSelectedTileset && !backgroundURL) ? (
          <p role="status">
            <strong>Não foi possível carregar o tileset.</strong>
            <span>Verifique o asset em Arquivos ou importe um PNG novamente.</span>
          </p>
        ) : (
          <p role="status">Selecione um tileset para abrir a paleta.</p>
        )}
        <em>{presentation.tileCountLabel}</em>
      </div>

      <p className="room-paint-floating-meta">
        {presentation.activeTileLabel} · Pincel {selectedTileStamp.width}×{selectedTileStamp.height}
        {selectedCellIndex === null ? "" : ` · Celula ${selectedCellIndex + 1}`}
      </p>
    </section>
  );
}
