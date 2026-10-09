import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Droplet,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
  type LucideIcon
} from "lucide-react";

import { roomCollisionTypeLabel } from "../shared/roomsWorkspace";
import type { RoomCollisionType } from "../shared/roomsWorkspace";

type CollisionTool = {
  id: string;
  label: string;
  type: RoomCollisionType;
  Icon: LucideIcon;
  tone: string;
};

export interface RoomCollisionFloatingToolbarProps {
  allowedCollisionTypes?: RoomCollisionType[];
  collisionHoverPreviewEnabled: boolean;
  layout?: "docked" | "floating";
  onClearCollision: () => void;
  onSetBorderCollision: () => void;
  selectedCellIndex: number | null;
  selectedCollisionType: RoomCollisionType;
  setCollisionHoverPreviewEnabled: (enabled: boolean) => void;
  setSelectedCollisionType: (collisionType: RoomCollisionType) => void;
}

const basics: CollisionTool[] = [
  { id: "free", label: "Livre", type: "free", Icon: Check, tone: "free" },
  { id: "solid", label: "Solido", type: "solid", Icon: X, tone: "solid" }
];

const directional: CollisionTool[] = [
  { id: "down", label: "Descer", type: "down", Icon: ArrowDown, tone: "dir-down" },
  { id: "up", label: "Subir", type: "up", Icon: ArrowUp, tone: "dir-up" },
  { id: "right", label: "Direita", type: "right", Icon: ArrowRight, tone: "dir-right" },
  { id: "left", label: "Esquerda", type: "left", Icon: ArrowLeft, tone: "dir-left" }
];

const special: CollisionTool[] = [
  { id: "water", label: "Agua", type: "water", Icon: Droplet, tone: "water" },
  { id: "damage", label: "Dano", type: "damage", Icon: X, tone: "damage" },
  { id: "ladder", label: "Escada", type: "ladder", Icon: ArrowUp, tone: "ladder" },
  { id: "event", label: "Evento", type: "event", Icon: Zap, tone: "event" }
];

const ramps: CollisionTool[] = [
  { id: "slope-up-right", label: "Rampa subindo à direita", type: "slope_up_right", Icon: TrendingUp, tone: "slope-up-right" },
  { id: "slope-up-left", label: "Rampa subindo à esquerda", type: "slope_up_left", Icon: TrendingDown, tone: "slope-up-left" }
];

function CollisionToolButton({
  selectedCollisionType,
  setSelectedCollisionType,
  tool
}: {
  selectedCollisionType: RoomCollisionType;
  setSelectedCollisionType: (collisionType: RoomCollisionType) => void;
  tool: CollisionTool;
}): React.ReactElement {
  const ToolIcon = tool.Icon;
  const isActive = selectedCollisionType === tool.type;

  return (
    <button
      aria-label={`Tipo de colisao ${tool.label}`}
      aria-pressed={isActive}
      className={["room-collision-floating-tool", tool.tone, isActive ? "active" : ""].filter(Boolean).join(" ")}
      onClick={() => setSelectedCollisionType(tool.type)}
      title={tool.label}
      type="button"
    >
      <ToolIcon aria-hidden="true" size={18} strokeWidth={2.5} />
    </button>
  );
}

export function RoomCollisionFloatingToolbar({
  allowedCollisionTypes,
  collisionHoverPreviewEnabled,
  layout = "floating",
  onClearCollision,
  onSetBorderCollision,
  selectedCellIndex,
  selectedCollisionType,
  setCollisionHoverPreviewEnabled,
  setSelectedCollisionType
}: RoomCollisionFloatingToolbarProps): React.ReactElement {
  const activeLabel = roomCollisionTypeLabel(selectedCollisionType);
  const allowed = new Set<RoomCollisionType>(allowedCollisionTypes ?? [...basics, ...directional, ...special, ...ramps].map((tool) => tool.type));

  return (
    <div
      className={[
        "room-collision-floating-toolbar",
        layout === "docked" ? "is-docked" : ""
      ].filter(Boolean).join(" ")}
      aria-label="Barra de colisao"
    >
      <div className={["room-collision-floating-active", selectedCollisionType].join(" ")}>
        <span>{activeLabel}</span>
        <strong>{selectedCellIndex === null ? "Sem celula" : `Celula ${selectedCellIndex + 1}`}</strong>
      </div>

      <div className="room-collision-floating-group">
        {basics.filter((tool) => allowed.has(tool.type)).map((tool) => (
          <CollisionToolButton
            key={tool.id}
            selectedCollisionType={selectedCollisionType}
            setSelectedCollisionType={setSelectedCollisionType}
            tool={tool}
          />
        ))}
      </div>

      <div className="room-collision-floating-group">
        {directional.filter((tool) => allowed.has(tool.type)).map((tool) => (
          <CollisionToolButton
            key={tool.id}
            selectedCollisionType={selectedCollisionType}
            setSelectedCollisionType={setSelectedCollisionType}
            tool={tool}
          />
        ))}
      </div>

      <div className="room-collision-floating-group compact">
        {ramps.filter((tool) => allowed.has(tool.type)).map((tool) => (
          <CollisionToolButton
            key={tool.id}
            selectedCollisionType={selectedCollisionType}
            setSelectedCollisionType={setSelectedCollisionType}
            tool={tool}
          />
        ))}
      </div>

      <div className="room-collision-floating-group compact">
        {special.filter((tool) => allowed.has(tool.type)).map((tool) => (
          <CollisionToolButton
            key={tool.id}
            selectedCollisionType={selectedCollisionType}
            setSelectedCollisionType={setSelectedCollisionType}
            tool={tool}
          />
        ))}
      </div>

      <label className="room-collision-floating-toggle" title="Preview no hover">
        <input
          checked={collisionHoverPreviewEnabled}
          onChange={(event) => setCollisionHoverPreviewEnabled(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Hover</span>
      </label>

      {layout === "floating" ? <div className="room-collision-floating-actions">
        <button onClick={onSetBorderCollision} title="Aplicar borda solida" type="button">
          <span>Borda</span>
        </button>
        <button onClick={onClearCollision} title="Limpar colisao" type="button">
          <span>Limpar</span>
        </button>
      </div> : null}
    </div>
  );
}
