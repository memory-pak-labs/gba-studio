import { useEffect, useRef } from "react";
import type { HudComponent, HudPresetPresentation } from "../shared/hudPresets";
import { dialogueFontSourceRect, renderSkin } from "./dialoguePreviewSnapshot";
import { dialogueFontRows, normalizeDialogueText } from "../shared/dialogueFont";
import { prepareInterfaceFontPreview } from "./interfaceFontPreview";

const HUD_VIEWPORT_WIDTH = 240;
const HUD_VIEWPORT_HEIGHT = 160;

export interface HudPreviewSnapshotProps {
  preset: HudPresetPresentation;
  backgroundAssetURL?: string | null;
  fontAssetURL?: string | null;
  resolveComponentAssetURL?: (component: HudComponent) => string | null;
  actionLabel?: string;
  className?: string;
  transparentBackground?: boolean;
}

const FALLBACK_COLORS: Record<HudComponent["kind"], { fill: string; stroke: string; text: string }> = {
  frame: { fill: "#182b38", stroke: "#d9b56c", text: "#f8e9b4" },
  text: { fill: "#264f59", stroke: "#8dc4ae", text: "#f8e9b4" },
  bar: { fill: "#102330", stroke: "#8dc4ae", text: "#f8e9b4" },
  icon: { fill: "#b85b4b", stroke: "#f8e9b4", text: "#182b38" }
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

type FontAtlas = HTMLCanvasElement | HTMLImageElement | null;
/** The native HUD places one glyph per tile, wrapping at the component bounds. */
export function drawHudText(context: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number, font: FontAtlas = null, ink = "#f0e0b8"): void {
  const columns = Math.floor(width / 8), rows = Math.floor(height / 8);
  let column = 0, line = 0;
  context.fillStyle = ink;
  for (const character of normalizeDialogueText(text)) {
    if (character === "\n") { line++; column = 0; continue; }
    if (column >= columns) { line++; column = 0; }
    if (columns < 1 || line >= rows) break;
    const px = x + column * 8, py = y + line * 8;
    if (font) {
      const source = dialogueFontSourceRect(character);
      context.drawImage(font, source.x, source.y, 8, 8, px, py, 8, 8);
    } else {
      dialogueFontRows(character).forEach((row, dy) => {
        for (let dx = 0; dx < 8; dx++) if (row & (1 << (7 - dx))) context.fillRect(px + dx, py + dy, 1, 1);
      });
    }
    column++;
  }
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) return;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (imageWidth - sourceWidth) / 2;
  const sourceY = (imageHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawFallbackComponent(
  context: CanvasRenderingContext2D,
  component: HudComponent,
  actionLabel: string,
  font: FontAtlas = null,
  ink = "#f0e0b8"
): void {
  const x = clamp(component.x, 0, HUD_VIEWPORT_WIDTH);
  const y = clamp(component.y, 0, HUD_VIEWPORT_HEIGHT);
  const width = clamp(component.width, 1, HUD_VIEWPORT_WIDTH - x);
  const height = clamp(component.height, 1, HUD_VIEWPORT_HEIGHT - y);
  const colors = FALLBACK_COLORS[component.kind];

  if (component.kind !== "text") {
    context.fillStyle = colors.fill;
    context.fillRect(x, y, width, height);
    context.strokeStyle = colors.stroke;
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
  }

  if (component.kind === "bar") {
    const fillWidth = Math.max(2, Math.floor((width - 4) * 0.68));
    context.fillStyle = "#e86a4a";
    context.fillRect(x + 2, y + Math.max(2, Math.floor(height / 2) - 2), fillWidth, Math.min(4, Math.max(2, height - 4)));
    return;
  }

  if (component.kind === "frame") return;

  const label = component.text || component.label || (component.kind === "icon" ? "*" : actionLabel);
  drawHudText(context, label, x, y, width, height, font, ink);
}

export function drawHudComponent(
  context: CanvasRenderingContext2D,
  component: HudComponent,
  image: HTMLImageElement | undefined,
  actionLabel: string,
  font: FontAtlas = null,
  ink = "#f0e0b8"
): void {
  const x = clamp(component.x, 0, HUD_VIEWPORT_WIDTH);
  const y = clamp(component.y, 0, HUD_VIEWPORT_HEIGHT);
  const width = clamp(component.width, 1, HUD_VIEWPORT_WIDTH - x);
  const height = clamp(component.height, 1, HUD_VIEWPORT_HEIGHT - y);

  if (image && component.kind === "frame" && image.naturalWidth === 24 && image.naturalHeight === 24)
    renderSkin(context, image, { x, y, width, height });
  else if (image) drawCover(context, image, x, y, width, height);
  else drawFallbackComponent(context, component, actionLabel, font, ink);

  if (component.kind === "text" && image && (component.text || component.label)) {
    drawHudText(context, component.text || component.label, x, y, width, height, font, ink);
  }
}

export function drawStandardHud(
  context: CanvasRenderingContext2D,
  preset: HudPresetPresentation,
  backgroundImage: HTMLImageElement | undefined,
  actionLabel: string,
  font: FontAtlas = null
): void {
  const width = clamp(preset.width, 24, HUD_VIEWPORT_WIDTH);
  const height = clamp(preset.height, 8, HUD_VIEWPORT_HEIGHT);
  const x = Math.floor((HUD_VIEWPORT_WIDTH - width) / 2);
  const y = preset.position === "Inferior" ? HUD_VIEWPORT_HEIGHT - height : 0;

  if (backgroundImage?.naturalWidth === 24 && backgroundImage.naturalHeight === 24)
    renderSkin(context, backgroundImage, {x, y, width, height});
  else if (backgroundImage) drawCover(context, backgroundImage, x, y, width, height);
  else {
    drawFallbackComponent(context, {
      id: "standard-hud",
      kind: "frame",
      label: "HUD",
      text: "",
      asset: "",
      x,
      y,
      width,
      height,
      zIndex: 0,
      visible: true
    }, actionLabel);
  }

  const textY = y + Math.max(0, Math.floor((height - 8) / 16) * 8);
  drawHudText(context, "HP 03", x + 8, textY, width - 16, 8, font);
  const rightX = Math.max(x + 8, x + width - 8 - Array.from(normalizeDialogueText(actionLabel)).length * 8);
  drawHudText(context, actionLabel, rightX, textY, x + width - 8 - rightX, 8, font);
}

export function HudPreviewSnapshot({
  preset,
  backgroundAssetURL = null,
  fontAssetURL = null,
  resolveComponentAssetURL,
  actionLabel = "A: confirmar",
  className,
  transparentBackground = false
}: HudPreviewSnapshotProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    const visibleComponents = preset.mode === "advanced"
      ? preset.components.filter((component) => component.visible).slice().sort((a, b) => a.zIndex - b.zIndex)
      : [];
    const imageSources = new Map<string, HTMLImageElement>();
    const componentSources = new Map<string, string>();
    visibleComponents.forEach((component) => {
      const source = resolveComponentAssetURL?.(component) ?? null;
      if (source) componentSources.set(component.id, source);
    });

    const draw = (): void => {
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, HUD_VIEWPORT_WIDTH, HUD_VIEWPORT_HEIGHT);
      if (!transparentBackground) {
        context.fillStyle = "#0b1824";
        context.fillRect(0, 0, HUD_VIEWPORT_WIDTH, HUD_VIEWPORT_HEIGHT);
      }

      const fontImage = fontAssetURL ? imageSources.get(fontAssetURL) : undefined;
      const backgroundImage = backgroundAssetURL ? imageSources.get(backgroundAssetURL) : undefined;
      const font = fontImage?.complete && fontImage.naturalWidth
        ? prepareInterfaceFontPreview(fontImage, backgroundImage?.complete ? backgroundImage : null, preset.textColor) : null;

      if (preset.mode === "advanced") {
        const ink = preset.textColor === undefined ? "#f0e0b8" : `rgb(${(preset.textColor & 31) << 3},${((preset.textColor >> 5) & 31) << 3},${((preset.textColor >> 10) & 31) << 3})`;
        visibleComponents.forEach((component) => {
          const source = componentSources.get(component.id);
          drawHudComponent(context, component, source ? imageSources.get(source) : undefined, actionLabel, font, ink);
        });
      } else {
        drawStandardHud(context, preset, backgroundImage, actionLabel, font);
      }
    };

    const sources = new Set<string>([
      ...(backgroundAssetURL ? [backgroundAssetURL] : []),
      ...(fontAssetURL ? [fontAssetURL] : []),
      ...componentSources.values()
    ]);
    const images: HTMLImageElement[] = [];
    if (typeof Image === "function") {
      sources.forEach((source) => {
        const image = new Image();
        images.push(image);
        imageSources.set(source, image);
        image.onload = draw;
        image.onerror = draw;
        image.src = source;
      });
    }
    draw();

    return () => {
      images.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [actionLabel, backgroundAssetURL, fontAssetURL, preset, resolveComponentAssetURL, transparentBackground]);

  return (
    <canvas
      aria-label="Preview renderizado da HUD"
      className={className}
      data-hud-preview-renderer="native-contract"
      height={HUD_VIEWPORT_HEIGHT}
      ref={canvasRef}
      width={HUD_VIEWPORT_WIDTH}
    />
  );
}
