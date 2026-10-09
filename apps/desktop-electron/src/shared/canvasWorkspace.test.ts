import { describe, expect, it } from "vitest";
import {
  findNextFreeCanvasPosition,
  wheelZoomCanvasViewport
} from "./canvasWorkspace.js";

describe("canvas workspace helpers", () => {
  it("finds a free card position without overlapping existing rectangles", () => {
    const next = findNextFreeCanvasPosition({
      existingRects: [
        { x: 24, y: 24, width: 300, height: 180 },
        { x: 356, y: 24, width: 300, height: 180 },
        { x: 688, y: 24, width: 300, height: 180 }
      ],
      gap: 32,
      preferred: { x: 24, y: 24 },
      size: { width: 300, height: 180 },
      worldWidth: 1120
    });

    expect(next).toEqual({ x: 24, y: 236 });
  });

  it("zooms around the cursor while preserving the focused world point", () => {
    const next = wheelZoomCanvasViewport({
      current: { scrollLeft: 400, scrollTop: 240, zoom: 1 },
      deltaY: -120,
      maxZoom: 2,
      minZoom: 0.5,
      pointer: { x: 200, y: 120 },
      zoomFactor: 1.25
    });

    expect(next.zoom).toBe(1.25);
    expect(next.scrollLeft).toBe(550);
    expect(next.scrollTop).toBe(330);
  });
});
