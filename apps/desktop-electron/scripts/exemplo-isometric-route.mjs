// Mercado uses screen-oriented input, while its collision grid uses tile axes.
const directions = new Map([
  ["1,0", ["ArrowRight", "ArrowDown"]],
  ["-1,0", ["ArrowLeft", "ArrowUp"]],
  ["0,-1", ["ArrowUp", "ArrowRight"]],
  ["0,1", ["ArrowDown", "ArrowLeft"]]
]);

export function isometricDirectionButtons(dx, dy) {
  return directions.get(`${dx},${dy}`) ?? null;
}

export function findIsometricRoute(room, start, destination, obstacles = []) {
  const width = Number(room?.width);
  const height = Number(room?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      !Array.isArray(room?.collisionTypes?.runs)) throw new Error("Mapa isométrico inválido.");
  const types = [];
  for (const [type, count] of room.collisionTypes.runs) {
    if (typeof type !== "string" || !Number.isInteger(count) || count < 0 || types.length + count > width * height)
      throw new Error("Colisão isométrica inválida.");
    for (let i = 0; i < count; i += 1) types.push(type);
  }
  if (types.length !== width * height) throw new Error("Colisão isométrica incompleta.");
  const levels = room.heightLevels ?? Array(width * height).fill(0);
  if (!Array.isArray(levels) || levels.length !== types.length) throw new Error("Alturas isométricas inválidas.");
  const inside = (p) => Number.isInteger(p?.x) && Number.isInteger(p?.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!inside(start) || !inside(destination) || types[destination.y * width + destination.x] === "solid") return null;
  const key = (point) => `${point.x},${point.y}`;
  const occupied = new Set(obstacles.filter(inside).map(key));
  if (occupied.has(key(destination))) return null;
  const previous = new Map([[key(start), null]]);
  const queue = [{ x: start.x, y: start.y }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === destination.x && current.y === destination.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (!inside(next) || previous.has(key(next)) || occupied.has(key(next))) continue;
      const fromIndex = current.y * width + current.x;
      const toIndex = next.y * width + next.x;
      if (types[toIndex] === "solid") continue;
      if (levels[fromIndex] !== levels[toIndex] && !types[fromIndex].includes("slope") && !types[toIndex].includes("slope")) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  if (!previous.has(key(destination))) return null;
  const path = [];
  for (let point = { x: destination.x, y: destination.y }; point; point = previous.get(key(point))) path.push(point);
  return path.reverse();
}
