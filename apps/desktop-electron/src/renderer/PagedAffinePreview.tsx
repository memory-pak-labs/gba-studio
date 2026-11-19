import { useEffect, useRef, type ReactElement } from "react";

import {
  affineMatrixForScenePresentation,
  type AffineScenePresentation,
  type AffineSceneSourceSize
} from "../shared/affineScene";

const width = 240;
const height = 160;

export function PagedAffinePreview({
  url, label, presentation, size, scroll
}: {
  url: string;
  label: string;
  presentation: AffineScenePresentation;
  size: AffineSceneSourceSize;
  scroll?: { x: number; y: number };
}): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const matrix = affineMatrixForScenePresentation(presentation, size, scroll);
  const { pa, pb, pc, pd, referenceX8, referenceY8 } = matrix;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const determinant = pa * pd - pb * pc;
    if (!determinant) return;
    const source = new Image();
    source.onload = () => {
      const a = 256 * pd / determinant;
      const b = -256 * pc / determinant;
      const c = -256 * pb / determinant;
      const d = 256 * pa / determinant;
      const sourceX = referenceX8 / 256;
      const sourceY = referenceY8 / 256;
      context.resetTransform();
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = false;
      // Canvas samples at pixel centers; the GBA applies its matrix at integer screen coordinates.
      context.setTransform(a, b, c, d, 0.5 - (a * sourceX + c * sourceY), 0.5 - (b * sourceX + d * sourceY));
      if (!presentation.wrap) {
        context.drawImage(source, 0, 0);
        return;
      }
      const horizontal = [0, pa * width / 256, pb * height / 256, (pa * width + pb * height) / 256];
      const vertical = [0, pc * width / 256, pd * height / 256, (pc * width + pd * height) / 256];
      const firstX = Math.floor((sourceX + Math.min(...horizontal)) / source.width);
      const lastX = Math.floor((sourceX + Math.max(...horizontal)) / source.width);
      const firstY = Math.floor((sourceY + Math.min(...vertical)) / source.height);
      const lastY = Math.floor((sourceY + Math.max(...vertical)) / source.height);
      for (let y = firstY; y <= lastY; y += 1) {
        for (let x = firstX; x <= lastX; x += 1) {
          context.drawImage(source, x * source.width, y * source.height);
        }
      }
    };
    source.src = url;
    return () => { source.onload = null; };
  }, [url, pa, pb, pc, pd, referenceX8, referenceY8, presentation.wrap]);

  return <canvas
    aria-label={label}
    role="img"
    ref={canvas}
    className="paged-affine-preview"
    width={width}
    height={height}
    style={{ display: "block", width: "100%", maxWidth: 480, imageRendering: "pixelated" }}
  />;
}
