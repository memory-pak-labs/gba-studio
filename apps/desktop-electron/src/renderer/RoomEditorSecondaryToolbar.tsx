import { Box, Camera, Eye, EyeOff, Grid3X3, Image, Layers3, LayoutTemplate, Lock, Map as MapIcon, Monitor, ScanLine, Shield, Unlock, UserRound, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RoomCollisionFloatingToolbar } from "./RoomCollisionFloatingToolbar";
import { RoomPaintFloatingToolbar } from "./RoomPaintFloatingToolbar";
import type { RoomCanvasLayerID, RoomEditorToolPanelMode } from "../shared/roomsWorkspace/core";
import type { RoomCollisionType, RoomTilePaintTool } from "../shared/roomsWorkspace";
import type { RoomsWorkspaceRoom } from "../shared/roomsWorkspace/core";
import { EditorPopover } from "./EditorPopover";
import { WorkspaceContextToolbar } from "./studioUi";
import { sceneTypeProfile } from "../shared/sceneTypeProfiles";

const roomCanvasLayers: Array<[RoomCanvasLayerID, string, LucideIcon]> = [
  ["background", "Fundo", Image],
  ["grid", "Grade", Grid3X3],
  ["collision", "Colisão", Shield],
  ["actors", "Atores", UserRound],
  ["hitboxes", "Bounds", ScanLine],
  ["triggers", "Triggers", Zap],
  ["hud", "HUD", Monitor]
];

const menuCanvasLayers: Array<[RoomCanvasLayerID, string, LucideIcon]> = [
  ["composition", "Guias da composição", LayoutTemplate]
];

const isometricOverlayLayers: Array<[RoomCanvasLayerID, string, LucideIcon]> = [
  ["cameraBounds", "Câmera", Camera],
  ["worldBounds", "Mundo", Box]
];

export interface RoomEditorSecondaryToolbarProps {
  canvasLayerLocks: Record<RoomCanvasLayerID, boolean>;
  canvasLayerVisibility: Record<RoomCanvasLayerID, boolean>;
  collisionHoverPreviewEnabled: boolean;
  ghostOpacity: number;
  ghostPreviewEnabled: boolean;
  minimapAvailable: boolean;
  minimapVisible: boolean;
  onClearCollision: () => void;
  onSetActiveTileLayerMapping: (mapping: string) => void;
  onSetBorderCollision: () => void;
  projectPath?: string;
  room: RoomsWorkspaceRoom;
  selectedCellIndex: number | null;
  selectedCollisionType: RoomCollisionType;
  selectedTileID: number;
  selectedTool: RoomTilePaintTool;
  selectedToolPanelMode: RoomEditorToolPanelMode;
  sceneActions?: React.ReactElement | null;
  hudTools?: React.ReactElement | null;
  setCollisionHoverPreviewEnabled: (enabled: boolean) => void;
  setCanvasLayerLock: (layer: RoomCanvasLayerID, locked: boolean) => void;
  setCanvasLayerVisibility: (layer: RoomCanvasLayerID, visible: boolean) => void;
  setGhostOpacity: (opacity: number) => void;
  setGhostPreviewEnabled: (enabled: boolean) => void;
  setMinimapVisible: (visible: boolean) => void;
  setSelectedCollisionType: (collisionType: RoomCollisionType) => void;
  setSelectedTool: (tool: RoomTilePaintTool) => void;
  videoModeId: number;
  videoModeLabel: string;
}

export function RoomEditorSecondaryToolbar({
  collisionHoverPreviewEnabled,
  ghostOpacity,
  ghostPreviewEnabled,
  onClearCollision,
  onSetActiveTileLayerMapping,
  onSetBorderCollision,
  projectPath,
  room,
  selectedCellIndex,
  selectedCollisionType,
  selectedTileID,
  selectedTool,
  selectedToolPanelMode,
  sceneActions,
  hudTools,
  setCollisionHoverPreviewEnabled,
  setGhostOpacity,
  setGhostPreviewEnabled,
  setSelectedCollisionType,
  setSelectedTool,
  videoModeId,
  videoModeLabel
}: RoomEditorSecondaryToolbarProps): React.ReactElement {
  return (
    <WorkspaceContextToolbar
      aria-label="Ferramentas contextuais do Editor"
      className={[
        "rooms-editor-secondary-toolbar",
        selectedToolPanelMode === "collision" ? "is-collision-toolbar" : ""
      ].filter(Boolean).join(" ")}
    >
      <div className="rooms-editor-secondary-toolbar-primary">
        {sceneActions}
      </div>
      {selectedToolPanelMode === "paint" || selectedToolPanelMode === "collision" || selectedToolPanelMode === "hud" ? (
        <div className="rooms-editor-secondary-toolbar-tools" aria-label="Opções da ferramenta">
          <strong className="room-context-tool-label">
            {selectedToolPanelMode === "paint" ? "Pintura" : selectedToolPanelMode === "collision" ? "Colisão" : "HUD"}
          </strong>
          {selectedToolPanelMode === "paint" ? (
            <RoomPaintFloatingToolbar
              ghostOpacity={ghostOpacity}
              ghostPreviewEnabled={ghostPreviewEnabled}
              layout="docked"
              onSetActiveTileLayerMapping={onSetActiveTileLayerMapping}
              projectPath={projectPath}
              room={room}
              selectedTileID={selectedTileID}
              selectedTool={selectedTool}
              setGhostOpacity={setGhostOpacity}
              setGhostPreviewEnabled={setGhostPreviewEnabled}
              setSelectedTool={setSelectedTool}
              videoModeId={videoModeId}
              videoModeLabel={videoModeLabel}
            />
          ) : null}
          {selectedToolPanelMode === "collision" ? (
            <RoomCollisionFloatingToolbar
              allowedCollisionTypes={sceneTypeProfile(room.sceneType).collisionTypes}
              collisionHoverPreviewEnabled={collisionHoverPreviewEnabled}
              layout="docked"
              onClearCollision={onClearCollision}
              onSetBorderCollision={onSetBorderCollision}
              selectedCellIndex={selectedCellIndex}
              selectedCollisionType={selectedCollisionType}
              setCollisionHoverPreviewEnabled={setCollisionHoverPreviewEnabled}
              setSelectedCollisionType={setSelectedCollisionType}
            />
          ) : null}
          {selectedToolPanelMode === "hud" ? hudTools : null}
        </div>
      ) : null}

    </WorkspaceContextToolbar>
  );
}

export function RoomEditorCanvasControls({ canvasLayerLocks, canvasLayerVisibility, minimapAvailable, minimapVisible, room, setCanvasLayerLock, setCanvasLayerVisibility, setMinimapVisible, hideMinimapToggle = false }: Pick<RoomEditorSecondaryToolbarProps, "canvasLayerLocks" | "canvasLayerVisibility" | "minimapAvailable" | "minimapVisible" | "room" | "setCanvasLayerLock" | "setCanvasLayerVisibility" | "setMinimapVisible"> & { hideMinimapToggle?: boolean }): React.ReactElement {
  const layers = [...roomCanvasLayers, ...(room.runtime?.type === "menu" ? menuCanvasLayers : [])];
  return <div className="room-canvas-layer-toolbar" aria-label="Visibilidade do canvas">
    <EditorPopover label="Camadas" icon={<Layers3 aria-hidden="true" size={14} />} className="room-canvas-layers-popover">
      <div className="room-canvas-layer-controls">
        {layers.map(([layer, label, Icon]) => <div className="room-canvas-layer-control" key={layer}>
          <Icon aria-hidden="true" size={14} /><span>{label}</span>
          <button aria-label={`${canvasLayerVisibility[layer] ? "Ocultar" : "Mostrar"} camada ${label}`}
            aria-pressed={canvasLayerVisibility[layer]} onClick={() => setCanvasLayerVisibility(layer, !canvasLayerVisibility[layer])}
            title={`${canvasLayerVisibility[layer] ? "Ocultar" : "Mostrar"} ${label}`} type="button">
            {canvasLayerVisibility[layer] ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}
          </button>
          <button aria-label={`${canvasLayerLocks[layer] ? "Desbloquear" : "Bloquear"} camada ${label}`}
            aria-pressed={canvasLayerLocks[layer]} onClick={() => setCanvasLayerLock(layer, !canvasLayerLocks[layer])}
            title={`${canvasLayerLocks[layer] ? "Desbloquear" : "Bloquear"} ${label}`} type="button">
            {canvasLayerLocks[layer] ? <Lock aria-hidden="true" size={14} /> : <Unlock aria-hidden="true" size={14} />}
          </button>
        </div>)}
        {(room.sceneType === "isometric" ? isometricOverlayLayers : isometricOverlayLayers.filter(([layer]) => layer === "cameraBounds")).map(([layer, label, Icon]) => <div className="room-canvas-layer-control is-visibility-only" key={layer}>
          <Icon aria-hidden="true" size={14} /><span>{label}</span>
          <button aria-label={`${canvasLayerVisibility[layer] ? "Ocultar" : "Mostrar"} overlay ${label}`}
            aria-pressed={canvasLayerVisibility[layer]} onClick={() => setCanvasLayerVisibility(layer, !canvasLayerVisibility[layer])}
            title={`${canvasLayerVisibility[layer] ? "Ocultar" : "Mostrar"} ${label}`} type="button">
            {canvasLayerVisibility[layer] ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}
          </button>
        </div>)}
      </div>
    </EditorPopover>
    {!hideMinimapToggle ? <button aria-label={`${minimapVisible ? "Ocultar" : "Mostrar"} minimapa`} aria-pressed={minimapVisible}
      className="room-canvas-minimap-toggle" disabled={!minimapAvailable} onClick={() => setMinimapVisible(!minimapVisible)}
      title={minimapAvailable ? `${minimapVisible ? "Ocultar" : "Mostrar"} minimapa` : "Minimapa disponível quando a cena ultrapassa o viewport"} type="button">
      <MapIcon aria-hidden="true" size={13} /><span>Minimapa</span>
    </button> : null}
  </div>;
}
