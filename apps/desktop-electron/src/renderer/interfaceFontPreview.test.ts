import { expect, it } from "vitest";
import { interfaceFontPreviewPixels, interfaceFrameInk } from "./interfaceFontPreview.js";
it("removes the atlas background and paints glyphs using the active skin ink", () => {
  const input = new Uint8ClampedArray([12, 28, 44, 255, 240, 232, 192, 255, 12, 28, 44, 255]);
  expect([...interfaceFontPreviewPixels(input, [240, 224, 184])]).toEqual([0, 0, 0, 0, 240, 224, 184, 255, 0, 0, 0, 0]);
  expect([...input.slice(0, 4)]).toEqual([12, 28, 44, 255]);
});
it("selects the greatest weighted contrast from the fill like assetc", () => {
  expect(interfaceFrameInk(new Uint8ClampedArray([16, 32, 48, 255, 160, 152, 112, 255, 240, 224, 184, 255]), [16, 32, 48])).toEqual([240, 224, 184]);
});
