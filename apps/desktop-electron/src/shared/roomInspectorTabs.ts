export type RoomInspectorContextKind = "room" | "actor" | "trigger" | "connection" | "collision" | "height" | "paint";

export type RoomInspectorTabID =
  | "scene"
  | "hud"
  | "background"
  | "camera"
  | "budget"
  | "connections"
  | "events"
  | "dialogues"
  | "actor"
  | "sprite"
  | "movement"
  | "trigger"
  | "area"
  | "connection"
  | "transition"
  | "exit"
  | "entry"
  | "collision"
  | "height";

export interface RoomInspectorTab {
  id: RoomInspectorTabID;
  label: string;
}

const tabsByContext: Record<Exclude<RoomInspectorContextKind, "paint">, RoomInspectorTab[]> = {
  room: [
    { id: "scene", label: "Cena" },
    { id: "events", label: "Eventos" },
    { id: "background", label: "Fundo" },
    { id: "camera", label: "Câmera" },
    { id: "connections", label: "Conexões" },
    { id: "dialogues", label: "Diálogos" },
    { id: "budget", label: "Orçamento" }
  ],
  actor: [
    { id: "actor", label: "Objeto" },
    { id: "events", label: "Eventos" },
    { id: "sprite", label: "Sprite e animação" },
    { id: "movement", label: "Movimento" },
    { id: "dialogues", label: "Diálogos" }
  ],
  trigger: [
    { id: "trigger", label: "Objeto" },
    { id: "events", label: "Eventos" },
    { id: "dialogues", label: "Diálogos" }
  ],
  connection: [
    { id: "connection", label: "Conexão" },
    { id: "transition", label: "Transição" },
    { id: "exit", label: "Saída" },
    { id: "entry", label: "Entrada" },
    { id: "events", label: "Eventos" }
  ],
  collision: [{ id: "collision", label: "Colisão" }],
  height: [{ id: "height", label: "Altura" }]
};

export function roomInspectorTabs(context: RoomInspectorContextKind): RoomInspectorTab[] {
  return context === "paint" ? [] : tabsByContext[context];
}

export function normalizeRoomInspectorTab(
  context: RoomInspectorContextKind,
  current: RoomInspectorTabID | null
): RoomInspectorTabID | null {
  const tabs = roomInspectorTabs(context);
  if (tabs.length === 0) return null;
  return tabs.some((tab) => tab.id === current) ? current : tabs[0].id;
}

export function roomInspectorUsesFullHeight(context: RoomInspectorContextKind): boolean {
  return context === "paint";
}
