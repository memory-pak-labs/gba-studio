import { describe, expect, it } from "vitest";
import { compileRgbaToRgb555, remapRgbaToRgb555Palette } from "./rgb555.js";

describe("RGB555 preview compilation", () => {
  it("round-trips visible pixels through the same 5-bit channels used by the framebuffer", () => {
    const source = new Uint8ClampedArray([
      250, 129, 7, 255,
      19, 20, 21, 0
    ]);

    expect(Array.from(compileRgbaToRgb555(source))).toEqual([
      255, 132, 0, 255,
      16, 16, 16, 0
    ]);
    expect(Array.from(source)).toEqual([
      250, 129, 7, 255,
      19, 20, 21, 0
    ]);
  });

  it("maps every visible pixel to an authored RGB555 palette", () => {
    expect(Array.from(remapRgbaToRgb555Palette(
      new Uint8ClampedArray([250, 20, 20, 255, 20, 240, 20, 255]),
      [0x001f, 0x03e0]
    ))).toEqual([
      255, 0, 0, 255,
      0, 255, 0, 255
    ]);
  });

  it("preserves adjacent high RGB555 tones instead of collapsing 248 into 247", () => {
    expect(Array.from(remapRgbaToRgb555Palette(
      new Uint8ClampedArray([
        248, 0, 0, 255,
        240, 0, 0, 255
      ]),
      [0x001f, 0x001e]
    ))).toEqual([
      255, 0, 0, 255,
      247, 0, 0, 255
    ]);
  });
});
