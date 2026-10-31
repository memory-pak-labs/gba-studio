import { uiText as ui, useStudioUiText } from "./studioUiText";
import { Box, Camera, Eye, EyeOff, Grid3X3, Image, Layers3, LayoutTemplate, Lock, Monitor, ScanLine, Shield, Unlock, UserRound, X, Zap } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { RoomCollisionFloatingToolbar } from "./RoomCollisionFloatingToolbar";
import { RoomPaintFloatingToolbar } from "./RoomPaintFloatingToolbar";
import type { RoomCanvasLayerID, RoomEditorToolPanelMode } from "../shared/roomsWorkspace/core";
import type { RoomCollisionType, RoomTilePaintTool } from "../shared/roomsWorkspace";
import type { RoomsWorkspaceRoom } from "../shared/roomsWorkspace/core";
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
  const ui = useStudioUiText();
  return (
    <WorkspaceContextToolbar
      aria-label={ui("Ferramentas contextuais do Editor")}
      className={[
        "rooms-editor-secondary-toolbar",
        selectedToolPanelMode === "collision" ? "is-collision-toolbar" : ""
      ].filter(Boolean).join(" ")}
    >
      <div className="rooms-editor-secondary-toolbar-primary">
        {sceneActions}
      </div>
      {selectedToolPanelMode === "paint" || selectedToolPanelMode === "collision" || selectedToolPanelMode === "hud" ? (
        <div className="rooms-editor-secondary-toolbar-tools" aria-label={ui("Opções da ferramenta")}>
          <strong className="room-context-tool-label">
            {selectedToolPanelMode === "paint" ? ui("Pintura") : selectedToolPanelMode === "collision" ? ui("Colisão") : ui("HUD")}
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

export function RoomEditorCanvasControls({ canvasLayerLocks, canvasLayerVisibility, room, setCanvasLayerLock, setCanvasLayerVisibility }: Pick<RoomEditorSecondaryToolbarProps, "canvasLayerLocks" | "canvasLayerVisibility" | "room" | "setCanvasLayerLock" | "setCanvasLayerVisibility">): React.ReactElement {
  const ui = useStudioUiText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelID = useId();
  const layers = [...roomCanvasLayers, ...(room.runtime?.type === "menu" ? menuCanvasLayers : [])];

  function closePanel(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => { setOpen(false); }, [room.id]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape, true);
    };
  }, [open]);

  const rail = rootRef.current?.closest(".room-editor-tool-rail");
  const panel = open ? <div aria-label={ui("Camadas")} className="room-canvas-layers-panel" id={panelID} ref={panelRef} role="region">
      <div className="room-canvas-layers-panel-header">
        <strong>{ui("Camadas")}</strong>
        <button aria-label={ui("Fechar painel de camadas")} onClick={closePanel} title={ui("Fechar")} type="button">
          <X aria-hidden="true" size={14} />
        </button>
      </div>
      <div className="room-canvas-layer-controls">
        {layers.map(([layer, label, Icon]) => {
          const visibilityLabel = canvasLayerVisibility[layer] ? ui("Ocultar camada {0}", { 0: ui(label) }) : ui("Mostrar camada {0}", { 0: ui(label) });
          const lockLabel = canvasLayerLocks[layer] ? ui("Desbloquear camada {0}", { 0: ui(label) }) : ui("Bloquear camada {0}", { 0: ui(label) });
          return <div className="room-canvas-layer-control" key={layer}>
          <Icon aria-hidden="true" size={14} /><span>{ui(label)}</span>
          <button aria-label={visibilityLabel}
            aria-pressed={canvasLayerVisibility[layer]} onClick={() => setCanvasLayerVisibility(layer, !canvasLayerVisibility[layer])}
            title={visibilityLabel} type="button">
            {canvasLayerVisibility[layer] ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}
          </button>
          <button aria-label={lockLabel}
            aria-pressed={canvasLayerLocks[layer]} onClick={() => setCanvasLayerLock(layer, !canvasLayerLocks[layer])}
            title={lockLabel} type="button">
            {canvasLayerLocks[layer] ? <Lock aria-hidden="true" size={14} /> : <Unlock aria-hidden="true" size={14} />}
          </button>
        </div>; })}
        {(room.sceneType === "isometric" ? isometricOverlayLayers : isometricOverlayLayers.filter(([layer]) => layer === "cameraBounds")).map(([layer, label, Icon]) => {
          const visibilityLabel = canvasLayerVisibility[layer] ? ui("Ocultar overlay {0}", { 0: ui(label) }) : ui("Mostrar overlay {0}", { 0: ui(label) });
          return <div className="room-canvas-layer-control is-visibility-only" key={layer}>
          <Icon aria-hidden="true" size={14} /><span>{ui(label)}</span>
          <button aria-label={visibilityLabel}
            aria-pressed={canvasLayerVisibility[layer]} onClick={() => setCanvasLayerVisibility(layer, !canvasLayerVisibility[layer])}
            title={visibilityLabel} type="button">
            {canvasLayerVisibility[layer] ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}
          </button>
        </div>; })}
      </div>
      </div> : null;

  return <div className="room-canvas-layer-toolbar" aria-label={ui("Visibilidade do canvas")}>
    <div className="room-canvas-layers-control" ref={rootRef}>
      <button aria-label={ui("Camadas")} aria-expanded={open} aria-controls={panelID}
        className="room-canvas-layers-toggle" onClick={() => setOpen(current => !current)} ref={triggerRef}
        title={ui("Camadas")} type="button">
        <Layers3 aria-hidden="true" size={16} strokeWidth={2.2} />
      </button>
      {panel && rail ? createPortal(panel, rail) : panel}
    </div>
  </div>;
}
