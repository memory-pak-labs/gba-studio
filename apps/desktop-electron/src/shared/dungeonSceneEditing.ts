import { DUNGEON_DIRECTIONS, dungeonBlocked, projectDungeonActor, type DungeonCamera, type DungeonGrid } from "./dungeonSceneView.js";

export interface DungeonViewportCell {
  x: number; y: number; screenX: number; screenY: number; distance: number; blocked: boolean;
}
/** Ground anchors use the native actor projection, not background pixels or screen tiles. */
type ProjectionOptions = {modern?:boolean;viewDistance?:number};
export function dungeonViewportCells(grid: DungeonGrid, camera: DungeonCamera, includeWalls = false, options?:ProjectionOptions): DungeonViewportCell[] {
  const [dx, dy] = DUNGEON_DIRECTIONS[camera.direction & 3], cells: DungeonViewportCell[] = [];
  for (let distance = 1; distance <= 8; distance++) for (let lateral = -distance; lateral <= distance; lateral++) {
    const x = camera.x + dx * distance - dy * lateral, y = camera.y + dy * distance + dx * lateral;
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
    const blocked = dungeonBlocked(grid, x, y);
    if (blocked && !includeWalls) continue;
    const projection = projectDungeonActor(grid, camera, {x, y}, false, options);
    if (projection) cells.push({x, y, distance, blocked, screenX: projection.x + projection.size / 2, screenY: projection.y + projection.size});
  }
  return cells;
}
export function pickDungeonViewportCell(grid: DungeonGrid, camera: DungeonCamera, point: {x:number;y:number}, options?:ProjectionOptions): DungeonViewportCell | null {
  if (point.x < 0 || point.x >= 240 || point.y <= 62 || point.y >= 128) return null;
  let closest: DungeonViewportCell | null = null, score = Infinity;
  for (const cell of dungeonViewportCells(grid, camera, false, options)) {
    const distance = (point.x-cell.screenX)**2 + (point.y-cell.screenY)**2;
    if (distance < score) { closest = cell; score = distance; }
  }
  // Do not snap a drop across the room or onto the wall above the visible floor.
  return closest && score <= Math.max(4, 24 / closest.distance)**2 ? closest : null;
}
