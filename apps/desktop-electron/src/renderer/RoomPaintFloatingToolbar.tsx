import { useEffect, useState, type CSSProperties } from "react";

import { resolveAssetURLWithBundledDefault } from "../shared/spriteAssetURL";
import {
  deriveRoomPaintInspectorPresentation,
  tilesetRegionForTileID,
  type RoomTilePaintTool
} from "../shared/roomsWorkspace";
import type { RoomsWorkspaceRoom } from "../shared/roomsWorkspace/core";

type RoomImageSize = {
  height: number;
  width: number;
};

export interface RoomPaintFloatingToolbarProps {
  ghostOpacity: number;
  ghostPreviewEnabled: boolean;
  layout?: "docked" | "floating";
  onSetActiveTileLayerMapping(mapping: string): void;
  projectPath?: string;
  room: RoomsWorkspaceRoom;
  selectedTileID: number;
  selectedTool: RoomTilePaintTool;
  setGhostOpacity: (opacity: number) => void;
  setGhostPreviewEnabled: (enabled: boolean) => void;
  setSelectedTool: (tool: RoomTilePaintTool) => void;
  videoModeId: number;
  videoModeLabel: string;
}

function selectedTilePreviewStyle(
  backgroundURL: string,
  region: { height: number; width: number; x: number; y: number },
  imageSize: RoomImageSize
): CSSProperties {
  const scale = Math.max(region.width, region.height) > 0
    ? 28 / Math.max(region.width, region.height)
    : 1;

  return {
    backgroundImage: `url("${backgroundURL}")`,
    backgroundPosition: `-${region.x * scale}px -${region.y * scale}px`,
    backgroundSize: `${imageSize.width * scale}px ${imageSize.height * scale}px`,
    height: `${Math.max(20, region.height * scale)}px`,
    width: `${Math.max(20, region.width * scale)}px`
  };
}

export function RoomPaintFloatingToolbar({
  ghostOpacity,
  ghostPreviewEnabled,
  layout = "floating",
  onSetActiveTileLayerMapping,
  projectPath,
  room,
  selectedTileID,
  selectedTool,
  setGhostOpacity,
  setGhostPreviewEnabled,
  setSelectedTool,
  videoModeId,
  videoModeLabel
}: RoomPaintFloatingToolbarProps): React.ReactElement {
  const backgroundURL = resolveAssetURLWithBundledDefault(
    projectPath,
    room.backgroundSource,
    room.backgroundBundledDefaultAsset
  );
  const [loadedTileset, setLoadedTileset] = useState<{ url: string; size: RoomImageSize } | null>(null);
  const tilesetSize = loadedTileset?.url === backgroundURL ? loadedTileset.size : null;
  useEffect(() => {
    if (!backgroundURL) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth && image.naturalHeight) {
        setLoadedTileset({ url: backgroundURL, size: { width: image.naturalWidth, height: image.naturalHeight } });
      }
    };
    image.src = backgroundURL;
    return () => { cancelled = true; image.onload = null; };
  }, [backgroundURL]);
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
  const selectedRegion = tilesetSize ? tilesetRegionForTileID({
    imageHeight: tilesetSize.height, imageWidth: tilesetSize.width,
    tileHeight: room.backgroundTileHeight, tileWidth: room.backgroundTileWidth,
    tileOffsetX: room.backgroundTileOffsetX, tileOffsetY: room.backgroundTileOffsetY, tileID: selectedTileID
  }) : null;
  const logicalMappings = new Set<string>(room.tilemapContract?.logicalLayers.map((layer) => layer.hardwareMapping) ?? []);
  const layerOptions = room.tilemapContract
    ? presentation.layerOptions.filter((option) => logicalMappings.has(option.mapping))
    : presentation.layerOptions;

  return (
    <div
      className={[
        "room-paint-floating-toolbar",
        layout === "docked" ? "is-docked" : ""
      ].filter(Boolean).join(" ")}
      aria-label="Barra de pintura"
    >
      <div className="room-paint-floating-toolbar-row">
        <div className="room-paint-floating-toolbar-preview" title={`Tile ${selectedTileID}`}>
          {backgroundURL && selectedRegion && tilesetSize ? (
            <span
              aria-hidden="true"
              className="room-paint-floating-toolbar-tile"
              style={selectedTilePreviewStyle(backgroundURL, selectedRegion, tilesetSize)}
            />
          ) : (
            <span className="room-paint-floating-toolbar-tile empty"># {selectedTileID}</span>
          )}
        </div>

        <label className="room-paint-floating-control">
          <span>Camada</span>
          <select
            disabled={!presentation.layeredPaintingEnabled}
            onChange={(event) => onSetActiveTileLayerMapping(event.currentTarget.value)}
            value={room.activeTileLayerMapping}
          >
            {layerOptions.map((option) => (
              <option disabled={!option.available} key={option.mapping} value={option.mapping}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="room-paint-floating-control">
          <span>Modo</span>
          <select
            onChange={(event) => setSelectedTool(event.currentTarget.value as RoomTilePaintTool)}
            value={selectedTool}
          >
            <option value="brush">Pincel</option>
            <option value="eraser">Borracha</option>
            <option value="fill">Preencher</option>
          </select>
        </label>

        <label className="room-paint-floating-ghost">
          <input
            checked={ghostPreviewEnabled}
            onChange={(event) => setGhostPreviewEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>Fantasma</span>
        </label>

        <label className="room-paint-floating-opacity" title="Opacidade do preview fantasma · mínimo 0% · máximo 100% · passo 5%">
          <span>Opac. {Math.round(ghostOpacity * 100)}%</span>
          <input
            aria-label="Opacidade do preview fantasma"
            disabled={!ghostPreviewEnabled}
            max={1}
            min={0}
            onChange={(event) => setGhostOpacity(event.currentTarget.valueAsNumber)}
            step={0.05}
            type="range"
            value={ghostOpacity}
          />
        </label>
      </div>
    </div>
  );
}
