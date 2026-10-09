import { describe, expect, it } from "vitest";

import { decodePngRgba, encodePngRgba } from "./png-icons.mjs";
import { composeRgbaContactSheet, renderPngContactSheet } from "./png-contact-sheet.mjs";

function solidImage(index, width = 2, height = 2) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = index;
    pixels[offset + 1] = 255 - index;
    pixels[offset + 2] = index * 3;
    pixels[offset + 3] = 255;
  }
  return { height, pixels, width };
}

describe("PNG contact sheet", () => {
  it("composes all 20 Exemplo scenes in project order as a 5x4 native viewport grid", () => {
    const images = Array.from({ length: 20 }, (_, index) => solidImage(index + 1));
    const sheet = composeRgbaContactSheet(images, {
      columns: 5,
      expectedCount: 20,
      targetHeight: 2,
      targetWidth: 2
    });

    expect(sheet).toMatchObject({ columns: 5, height: 8, rows: 4, width: 10 });
    expect(sheet.pixels).toHaveLength(10 * 8 * 4);
    expect(sheet.pixels[0]).toBe(1);
    expect(sheet.pixels[(2 * 4) + 0]).toBe(2);
    expect(sheet.pixels[((6 * 10 + 8) * 4) + 0]).toBe(20);
  });

  it("rejects an incomplete review instead of silently publishing 17 scenes", () => {
    const images = Array.from({ length: 17 }, (_, index) => solidImage(index + 1));
    expect(() => composeRgbaContactSheet(images, {
      columns: 5,
      expectedCount: 20,
      targetHeight: 2,
      targetWidth: 2
    })).toThrow("20");
  });

  it("encodes the composed pixels as a readable PNG", () => {
    const sources = Array.from({ length: 20 }, (_, index) => encodePngRgba(solidImage(index + 1)));
    const png = renderPngContactSheet(sources, {
      columns: 5,
      expectedCount: 20,
      targetHeight: 2,
      targetWidth: 2
    });
    const decoded = decodePngRgba(png);

    expect(decoded).toMatchObject({ height: 8, width: 10 });
    expect(decoded.pixels[0]).toBe(1);
  });
});
