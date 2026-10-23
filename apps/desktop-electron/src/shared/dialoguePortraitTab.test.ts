import { expect, it } from "vitest";
import { dialoguePreviewLayoutForSettings } from "./sceneRuntimeExport.js";
import { portraitTabColors, portraitTabFramePixels, portraitTabPalette } from "./dialoguePortraitTab.js";

it("keeps closed portrait and name frames outside all three message rows", () => {
  const layout = dialoguePreviewLayoutForSettings({ presentation: "portrait_tab" }, "Guardiã", "right");
  expect(layout.box).toEqual({ x: 8, y: 112, width: 224, height: 40 });
  expect(layout.nameLabel).toEqual({ x: 104, y: 96, width: 72, height: 16 });
  expect(layout.text).toEqual({ x: 16, y: 120, width: 208, height: 24 });
  const pixels = portraitTabFramePixels(layout, true, true);
  const pixel = (x: number, y: number): number[] => [...pixels.slice((y * 240 + x) * 4, (y * 240 + x) * 4 + 4)];
  expect(pixel(8, 56)).toEqual([0, 0, 0, 0]);
  expect(pixel(180, 60)).toEqual([8, 48, 56, 255]);
  const outline = [0, 24, 32, 255];
  expect(pixel(176, 104)).toEqual(outline);
  expect(pixel(175, 104)).toEqual(outline);
  expect(pixel(200, 111)).toEqual(outline);
  expect(pixel(152, 111)).toEqual(outline);
  expect(pixel(200, 112)).toEqual(outline);
  expect(pixel(152, 112)).toEqual(outline);
  expect(pixel(112, 100)).toEqual([16, 56, 72, 255]);
});

it("follows the chosen skin palette instead of displaying fixed petroleum colors", () => {
  expect(portraitTabPalette()).toEqual(portraitTabColors);
  const palette = portraitTabPalette(new Uint8ClampedArray([120, 40, 20, 255, 248, 240, 216, 255]));
  expect(palette[6]).toBe("#f8f0d8");
  expect(palette[5]).toBe("#000000");
  expect(palette[7]).toBe("#f8f0d8");
});
