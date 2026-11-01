import { useEffect, useRef } from "react";
import type { MenuTextInputConfig } from "../shared/menuScene";
import { menuTextInputLayout } from "../shared/menuTextInputLayout";
import { drawHudText } from "./hudPreviewSnapshot";
import { prepareInterfaceFontPreview } from "./interfaceFontPreview";
import { useStudioUiText } from "./studioUiText";

export function MenuTextInputPreview({ input, fontAssetURL, showFieldGuide = false }: { input: MenuTextInputConfig; fontAssetURL?: string | null; showFieldGuide?: boolean }) {
  const ui = useStudioUiText();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = ref.current?.getContext("2d"), layout = menuTextInputLayout(input);
    if (!context) return;
    context.clearRect(0, 0, 240, 160);
    if (!layout) return;
    let cancelled = false;
    const draw = (font: HTMLImageElement | HTMLCanvasElement | null = null) => {
      if (cancelled) return;
      context.clearRect(0, 0, 240, 160);
      context.imageSmoothingEnabled = false;
      // BottomGrid intentionally has no extra name modal or technical labels.
      // Its scene already owns the field frame and the keycaps.
      for (const key of layout.keys) drawHudText(context, key.label, key.glyphX, key.glyphY, key.label.length * 8, 8, font, "#101830");
      if (showFieldGuide) {
        const field = layout.nameField;
        context.strokeStyle = "#6d2bf1";
        context.setLineDash([1, 1]);
        context.strokeRect(field.x - 0.5, field.y - 0.5, field.width + 1, field.height + 1);
        context.setLineDash([]);
      }
      const key = layout.keys[0];
      const corner = [0xF0, 0xC0, 0xC0, 0x80, 0, 0, 0, 0];
      context.fillStyle = "#ffbd31";
      for (const flipX of [false, true]) for (const flipY of [false, true]) {
        corner.forEach((row, y) => { for (let x = 0; x < 8; x++) if (row & (1 << (7 - x))) {
          context.fillRect(key.x + (flipX ? key.width - 1 - x : x), key.y + (flipY ? key.height - 1 - y : y), 1, 1);
        } });
      }
    };
    draw();
    if (fontAssetURL) {
      const font = new Image();
      font.crossOrigin = "anonymous";
      font.onload = () => draw(prepareInterfaceFontPreview(font, null, 0x1862));
      font.src = fontAssetURL;
    }
    return () => { cancelled = true; };
  }, [input, fontAssetURL, showFieldGuide]);
  return <canvas ref={ref} width={240} height={160} className="room-menu-text-input-preview"
    role="img" aria-label={ui("Prévia visual da entrada do nome")} data-native-text-input="bottom_grid" />;
}
