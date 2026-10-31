import { describe, expect, it } from "vitest";
import { sceneDiagramPositions, SCENE_DIAGRAM_CARD_SIZE } from "./sceneMapDiagram.js";

describe("scene diagram layout", () => {
  it("keeps branches aligned, includes disconnected scenes and terminates on cycles", () => {
    const rooms = [{ name: "start", isStart: true }, { name: "a" }, { name: "b" }, { name: "end" }, { name: "orphan" }];
    const links = [{ from: "start", to: "a" }, { from: "start", to: "b" }, { from: "a", to: "end" }, { from: "end", to: "start" }];
    const positions = sceneDiagramPositions(rooms, links);
    expect(Object.keys(positions)).toHaveLength(5);
    expect(positions.a.x).toBe(positions.b.x);
    expect(positions.a.x).toBeGreaterThan(positions.start.x);
    expect(positions.end.x).toBeGreaterThan(positions.a.x);
    expect(new Set(Object.values(positions).map(p => `${p.x}:${p.y}`)).size).toBe(5);
    expect(positions.b.y - positions.a.y).toBeGreaterThan(SCENE_DIAGRAM_CARD_SIZE.height);
    expect(sceneDiagramPositions(rooms, [...links, { from: "missing", to: "a" }])).toEqual(positions);
  });

  it("lays out large chains without recursion or modifying authoring positions", () => {
    const rooms = Array.from({ length: 5000 }, (_, index) => ({ name: String(index) }));
    const links = rooms.slice(1).map((room, index) => ({ from: String(index), to: room.name }));
    expect(Object.keys(sceneDiagramPositions(rooms, links))).toHaveLength(rooms.length);
    expect(rooms[0]).toEqual({ name: "0" });
  });
});
