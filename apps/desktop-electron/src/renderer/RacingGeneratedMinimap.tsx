import type { RacingTopdownTrackConfig } from "../shared/sceneTypeProfiles";

type Point = { x: number; y: number };

function pointOnRoute(points: Point[], distance: number): Point {
  const lengths = points.map((from, index) => {
    const to = points[(index + 1) % points.length];
    const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
    return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return points[0];
  let remaining = ((distance % total) + total) % total;
  for (let i = 0; i < points.length; i++) {
    const length = lengths[i];
    if (!length) continue;
    if (remaining < length) {
      const from = points[i], to = points[(i + 1) % points.length];
      return { x: from.x + Math.trunc((to.x - from.x) * remaining / length), y: from.y + Math.trunc((to.y - from.y) * remaining / length) };
    }
    remaining -= length;
  }
  return points[0];
}

/** Mirrors the runtime's generated 64×40 minimap at the starting position. */
export function RacingGeneratedMinimap({ label, width, height, track, player, rivalCount }: {
  label: string; width: number; height: number; track: RacingTopdownTrackConfig; player: Point; rivalCount: number;
}) {
  const project = (point: Point): Point => ({
    x: 5 + Math.floor(Math.max(0, Math.min(point.x, width - 1)) * 54 / width),
    y: 5 + Math.floor(Math.max(0, Math.min(point.y, height - 1)) * 30 / height)
  });
  const route = track.pathPoints ?? [];
  const checkpoint = route.length >= 2 && track.checkpoints.length
    ? track.checkpoints[track.finishAtZero ? 1 % track.checkpoints.length : 0] : undefined;
  const projectedPlayer = project(player);
  const rivals = route.length >= 2
    ? Array.from({ length: Math.min(8, rivalCount) }, (_, index) => project(pointOnRoute(route, -(index + 1) * 32)))
    : [];
  return <svg aria-label={label} role="img" viewBox="0 0 64 40" shapeRendering="crispEdges"
    style={{ position: "absolute", left: "3.333333%", top: "60%", width: "26.666667%", height: "25%", zIndex: 3, pointerEvents: "none", imageRendering: "pixelated" }}>
    <rect width="64" height="40" fill="#002941" />
    <rect x="0.5" y="0.5" width="63" height="39" fill="none" stroke="#f6eecd" />
    {route.length >= 2 ? <polygon points={route.map(point => { const p = project(point); return `${p.x},${p.y}`; }).join(" ")}
      fill="none" stroke="#10948b" strokeWidth="3" strokeLinejoin="round" /> : null}
    {checkpoint ? (() => { const p = project(checkpoint); return <rect x={p.x - 1} y={p.y - 1} width="3" height="3" fill="#e6debd" />; })() : null}
    {rivals.map((point, index) => <rect key={index} x={point.x} y={point.y} width="2" height="2" fill="#e69c18" />)}
    <rect x={projectedPlayer.x - 1} y={projectedPlayer.y - 1} width="3" height="3" fill="#f6e6cd" />
  </svg>;
}
