export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  height: number;
  width: number;
}

export interface CanvasRect extends CanvasPoint, CanvasSize {}

export interface CanvasViewport {
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
}

export interface FindNextFreeCanvasPositionOptions {
  existingRects: CanvasRect[];
  gap?: number;
  preferred: CanvasPoint;
  size: CanvasSize;
  worldWidth?: number;
}

export interface WheelZoomCanvasViewportOptions {
  current: CanvasViewport;
  deltaY: number;
  maxZoom: number;
  minZoom: number;
  pointer: CanvasPoint;
  zoomFactor?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rectsOverlap(first: CanvasRect, second: CanvasRect): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

export function findNextFreeCanvasPosition(options: FindNextFreeCanvasPositionOptions): CanvasPoint {
  const gap = options.gap ?? 32;
  const stepX = options.size.width + gap;
  const stepY = options.size.height + gap;
  const startX = Math.max(0, Math.round(options.preferred.x));
  const startY = Math.max(0, Math.round(options.preferred.y));
  const maxX = Math.max(startX, (options.worldWidth ?? Number.POSITIVE_INFINITY) - options.size.width);

  for (let row = 0; row < 200; row += 1) {
    const y = startY + row * stepY;
    for (let column = 0; column < 200; column += 1) {
      const x = startX + column * stepX;
      if (x > maxX) break;
      const candidate = { x, y, width: options.size.width, height: options.size.height };
      if (!options.existingRects.some((rect) => rectsOverlap(candidate, rect))) {
        return { x, y };
      }
    }
  }

  return { x: startX, y: startY + 200 * stepY };
}

export function wheelZoomCanvasViewport(options: WheelZoomCanvasViewportOptions): CanvasViewport {
  const factor = options.zoomFactor ?? 1.1;
  const nextZoom = clamp(
    options.current.zoom * (options.deltaY < 0 ? factor : 1 / factor),
    options.minZoom,
    options.maxZoom
  );
  const worldX = (options.current.scrollLeft + options.pointer.x) / options.current.zoom;
  const worldY = (options.current.scrollTop + options.pointer.y) / options.current.zoom;
  return {
    scrollLeft: Math.round(worldX * nextZoom - options.pointer.x),
    scrollTop: Math.round(worldY * nextZoom - options.pointer.y),
    zoom: nextZoom
  };
}
