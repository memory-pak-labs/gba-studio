import { findNextFreeCanvasPosition, type CanvasRect } from "../canvasWorkspace.js";
import type {
  EventsWorkspaceGraphBindingEdge,
  EventsWorkspaceGraphEdge,
  EventsWorkspaceGraphNode,
  EventsWorkspaceContextBindingSlotState
} from "./core.js";

export const EVENT_GRAPH_NODE_WIDTH = 196;
export const EVENT_GRAPH_NODE_HEIGHT = 118;
export const GRAPH_LAYOUT_GAP = 32;
export const GRAPH_LAYOUT_CONTEXT_X = 48;
export const GRAPH_LAYOUT_START_Y = 48;
export const GRAPH_LAYOUT_SCRIPT_OFFSET_X = 64;
export const GRAPH_LAYOUT_HORIZONTAL_STEP = EVENT_GRAPH_NODE_WIDTH + 72;

export function estimateContextNodeHeight(
  node: Pick<EventsWorkspaceGraphNode, "contextBindingSlots">
): number {
  const sectionCount = new Set(node.contextBindingSlots.map((slot) => slot.section).filter(Boolean)).size;
  return 54 + node.contextBindingSlots.length * 28 + sectionCount * 14 + 20;
}

export function graphNodeHeight(
  node: Pick<EventsWorkspaceGraphNode, "nodeKind" | "contextBindingSlots">
): number {
  return node.nodeKind === "context" ? estimateContextNodeHeight(node) : EVENT_GRAPH_NODE_HEIGHT;
}

export function graphNodeToRect(
  node: Pick<EventsWorkspaceGraphNode, "x" | "y" | "nodeKind" | "contextBindingSlots">
): CanvasRect {
  return {
    x: node.x,
    y: node.y,
    width: EVENT_GRAPH_NODE_WIDTH,
    height: graphNodeHeight(node)
  };
}

export function rectsOverlap(first: CanvasRect, second: CanvasRect): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

export function bindingSlotTopOffset(
  slots: EventsWorkspaceContextBindingSlotState[],
  bindingKey: string
): number {
  let offset = 54;
  const seenSections = new Set<string>();

  for (const slot of slots) {
    if (slot.section && !seenSections.has(slot.section)) {
      seenSections.add(slot.section);
      offset += 14;
    }
    if (slot.bindingKey === bindingKey) {
      return offset;
    }
    offset += 28;
  }

  return 54;
}

export interface LayoutEventsGraphInput {
  nodes: EventsWorkspaceGraphNode[];
  graphEdges: EventsWorkspaceGraphEdge[];
  graphBindingEdges: EventsWorkspaceGraphBindingEdge[];
  savedPositions: Record<string, { x: number; y: number }>;
}

function contextNodesInLayoutOrder(nodes: EventsWorkspaceGraphNode[]): EventsWorkspaceGraphNode[] {
  const rooms = nodes.filter((node) => node.nodeKind === "context" && node.contextKind === "room");
  const actors = nodes.filter((node) => node.nodeKind === "context" && node.contextKind === "actor");
  const triggers = nodes.filter((node) => node.nodeKind === "context" && node.contextKind === "trigger");
  return [...rooms, ...actors, ...triggers];
}

function placedRects(
  nodes: EventsWorkspaceGraphNode[],
  positions: Record<string, { x: number; y: number }>
): CanvasRect[] {
  return nodes
    .filter((node) => positions[node.id])
    .map((node) => graphNodeToRect({ ...node, ...positions[node.id]! }));
}

export function layoutEventsGraphNodes(input: LayoutEventsGraphInput): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const nodesByID = new Map(input.nodes.map((node) => [node.id, node]));
  const nodesByName = new Map(input.nodes.map((node) => [node.eventName, node]));

  for (const [nodeID, position] of Object.entries(input.savedPositions)) {
    positions[nodeID] = { ...position };
  }

  let contextY = GRAPH_LAYOUT_START_Y;
  for (const node of contextNodesInLayoutOrder(input.nodes)) {
    if (positions[node.id]) {
      const rect = graphNodeToRect({ ...node, ...positions[node.id]! });
      contextY = Math.max(contextY, rect.y + rect.height + GRAPH_LAYOUT_GAP);
      continue;
    }

    positions[node.id] = { x: GRAPH_LAYOUT_CONTEXT_X, y: contextY };
    contextY += graphNodeHeight(node) + GRAPH_LAYOUT_GAP;
  }

  for (const edge of input.graphBindingEdges) {
    const source = nodesByID.get(edge.sourceNodeID);
    const target = nodesByName.get(edge.targetEventName);
    if (!source || !target || target.nodeKind !== "event" || positions[target.id]) continue;

    const sourcePosition = positions[source.id];
    if (!sourcePosition) continue;

    positions[target.id] = {
      x: sourcePosition.x + EVENT_GRAPH_NODE_WIDTH + GRAPH_LAYOUT_SCRIPT_OFFSET_X,
      y: sourcePosition.y + bindingSlotTopOffset(source.contextBindingSlots, edge.bindingKey)
    };
  }

  const queue = input.nodes
    .filter((node) => node.nodeKind === "event" && positions[node.id])
    .map((node) => node.id);
  const visited = new Set(queue);

  while (queue.length > 0) {
    const sourceID = queue.shift();
    if (!sourceID) break;

    const sourcePosition = positions[sourceID];
    if (!sourcePosition) continue;

    for (const edge of input.graphEdges) {
      if (edge.sourceEventID !== sourceID) continue;
      const target = nodesByName.get(edge.targetEventName);
      if (!target || target.nodeKind !== "event" || positions[target.id]) continue;

      positions[target.id] = {
        x: sourcePosition.x + GRAPH_LAYOUT_HORIZONTAL_STEP,
        y: sourcePosition.y
      };
      if (!visited.has(target.id)) {
        visited.add(target.id);
        queue.push(target.id);
      }
    }
  }

  const scriptColumnBase = GRAPH_LAYOUT_CONTEXT_X + EVENT_GRAPH_NODE_WIDTH + GRAPH_LAYOUT_SCRIPT_OFFSET_X;
  for (const node of input.nodes) {
    if (node.nodeKind !== "event" || positions[node.id]) continue;

    positions[node.id] = findNextFreeCanvasPosition({
      existingRects: placedRects(input.nodes, positions),
      gap: GRAPH_LAYOUT_GAP,
      preferred: { x: scriptColumnBase, y: GRAPH_LAYOUT_START_Y },
      size: { width: EVENT_GRAPH_NODE_WIDTH, height: EVENT_GRAPH_NODE_HEIGHT },
      worldWidth: 4800
    });
  }

  return positions;
}

export function preferredPositionBesideBinding(
  contextNode: EventsWorkspaceGraphNode,
  bindingKey: string
): { x: number; y: number } {
  return {
    x: contextNode.x + EVENT_GRAPH_NODE_WIDTH + GRAPH_LAYOUT_SCRIPT_OFFSET_X,
    y: contextNode.y + bindingSlotTopOffset(contextNode.contextBindingSlots, bindingKey)
  };
}
