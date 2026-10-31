import type { SceneMapPosition } from "../shared/sceneMapLayout.js";

export const SCENE_DIAGRAM_CARD_SIZE = { width: 240, height: 112 } as const;

/** View-only breadth-first layout. Loops and disconnected scenes remain navigable. */
export function sceneDiagramPositions(
  rooms: readonly { name: string; isStart?: boolean }[],
  connections: readonly { from: string; to: string }[]
): Record<string, SceneMapPosition> {
  const outgoing = new Map(rooms.map(room => [room.name, new Set<string>()]));
  const incoming = new Set<string>();
  for (const { from, to } of connections) {
    if (!outgoing.has(from) || !outgoing.has(to) || from === to) continue;
    outgoing.get(from)!.add(to);
    incoming.add(to);
  }
  const depths = new Map<string, number>();
  const roots = [...rooms.filter(room => room.isStart), ...rooms.filter(room => !incoming.has(room.name)), ...rooms];
  for (const root of roots) {
    if (depths.has(root.name)) continue;
    depths.set(root.name, 0);
    const queue = [root.name];
    for (let index = 0; index < queue.length; index++) {
      const from = queue[index];
      for (const to of outgoing.get(from) ?? []) {
        if (depths.has(to)) continue;
        depths.set(to, depths.get(from)! + 1);
        queue.push(to);
      }
    }
  }
  const rows = new Map<number, number>();
  return Object.fromEntries(rooms.map(room => {
    const depth = depths.get(room.name) ?? 0;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    return [room.name, { x: 48 + depth * (SCENE_DIAGRAM_CARD_SIZE.width + 88), y: 48 + row * (SCENE_DIAGRAM_CARD_SIZE.height + 56) }];
  }));
}
