import { describe, expect, it } from "vitest";
import { dungeonViewportCells, pickDungeonViewportCell } from "./dungeonSceneEditing.js";
import { DUNGEON_DIRECTIONS, projectDungeonActor } from "./dungeonSceneView.js";

describe("Dungeon viewport placement uses runtime cells", () => {
  const grid = { width: 19, height: 19, cells: Array<boolean>(19 * 19).fill(false) };
  it("offers only cells inside the native modern field of view and view distance",()=>{
    const cells=dungeonViewportCells(grid,{x:9,y:9,direction:0},false,{modern:true,viewDistance:3});
    expect(cells.some(c=>c.x===10&&c.y===8)).toBe(false);
    expect(cells.some(c=>c.x===10&&c.y===7)).toBe(true);
    expect(cells.every(c=>c.distance<=3)).toBe(true);
  });
  it.each([0, 1, 2, 3])("round trips an actor ground anchor facing %i", direction => {
    const camera = { x: 9, y: 9, direction }, [dx, dy] = DUNGEON_DIRECTIONS[direction];
    for (const distance of [1, 2, 4, 8]) {
      const cell = { x: camera.x + dx * distance - dy, y: camera.y + dy * distance + dx };
      const projection = projectDungeonActor(grid, camera, cell, false)!;
      expect(pickDungeonViewportCell(grid, camera, { x: projection.x + projection.size / 2, y: projection.y + projection.size })).toMatchObject(cell);
    }
  });
  it("rejects walls, hidden cells, the HUD and clicks outside the camera", () => {
    const camera = { x: 9, y: 9, direction: 0 }, wall = { ...grid, cells: [...grid.cells] };
    wall.cells[7 * 19 + 9] = true;
    expect(dungeonViewportCells(wall, camera).some(c => c.x === 9 && c.y === 7)).toBe(false);
    expect(dungeonViewportCells(wall, camera).some(c => c.x === 9 && c.y === 6)).toBe(false);
    expect(dungeonViewportCells(wall, camera, true).some(c => c.x === 9 && c.y === 7 && c.blocked)).toBe(true);
    for (const point of [{x:-1,y:110},{x:240,y:110},{x:120,y:128},{x:120,y:50}]) expect(pickDungeonViewportCell(grid, camera, point)).toBeNull();
  });
  it("never places beyond map bounds, even when the camera faces the edge", () => {
    const cells = dungeonViewportCells({width:2,height:2,cells:[false,false,false,false]}, {x:0,y:0,direction:0});
    expect(cells).toEqual([]);
  });
});
