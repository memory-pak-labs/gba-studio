type Rgb = readonly [number, number, number];

/** assetc maps the atlas background to transparency and every glyph pixel to index 4. */
export function interfaceFontPreviewPixels(pixels: Uint8ClampedArray, ink: Rgb): Uint8ClampedArray {
  const output = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3] || (pixels[i] === pixels[0] && pixels[i + 1] === pixels[1] && pixels[i + 2] === pixels[2] && pixels[i + 3] === pixels[3])) continue;
    output.set([...ink, 255], i);
  }
  return output;
}
export function interfaceFrameInk(pixels: Uint8ClampedArray, fill: Rgb): Rgb {
  let ink: Rgb = [240, 224, 184];
  let maximum = -1;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const score = 2 * (pixels[i] - fill[0]) ** 2 + 4 * (pixels[i + 1] - fill[1]) ** 2 + (pixels[i + 2] - fill[2]) ** 2;
    if (score > maximum) { maximum = score; ink = [pixels[i], pixels[i + 1], pixels[i + 2]]; }
  }
  return ink;
}
export function prepareInterfaceFontPreview(font: HTMLImageElement | null, box: HTMLImageElement | null, color?: number): HTMLCanvasElement | HTMLImageElement | null {
  if (!font) return null;
  const canvas = document.createElement("canvas");
  canvas.width = font.naturalWidth || font.width; canvas.height = font.naturalHeight || font.height;
  const context = canvas.getContext("2d");
  if (!context?.getImageData) return font;
  try {
    let ink: Rgb = [240, 224, 184];
    if (box) {
      const skin = document.createElement("canvas"); skin.width = 24; skin.height = 24;
      const skinContext = skin.getContext("2d");
      if (skinContext) {
        skinContext.drawImage(box, 0, 0);
        const fill = skinContext.getImageData(12, 12, 1, 1).data;
        ink = interfaceFrameInk(skinContext.getImageData(0, 0, 24, 24).data, [fill[0], fill[1], fill[2]]);
      }
    }
    if (color !== undefined) ink = [(color & 31) << 3, ((color >> 5) & 31) << 3, ((color >> 10) & 31) << 3];
    context.drawImage(font, 0, 0);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    frame.data.set(interfaceFontPreviewPixels(frame.data, ink));
    context.putImageData(frame, 0, 0);
    return canvas;
  } catch { return font; }
}
