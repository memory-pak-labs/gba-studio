import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePngRgba } from "./lib/png-icons.mjs";

const templateBackgrounds = resolve(
  import.meta.dirname,
  "../default-assets/templates/exemplo-gba/Assets/backgrounds"
);
const templateProject = resolve(import.meta.dirname, "../default-assets/templates/exemplo-gba/exemplo-gba.gba-project");

function inspectPixels(image) {
  const colors = new Set();
  let invalidAlpha = 0;
  let fullBlackRows = 0;
  for (let y = 0; y < image.height; y += 1) {
    let blackPixels = 0;
    for (let x = 0; x < image.width; x += 1) {
      const offset = ((y * image.width) + x) * 4;
      if (image.pixels[offset + 3] !== 255) invalidAlpha += 1;
      if (image.pixels[offset] === 0 && image.pixels[offset + 1] === 0 && image.pixels[offset + 2] === 0) {
        blackPixels += 1;
      }
      colors.add(image.pixels.subarray(offset, offset + 3).toString("hex"));
    }
    if (blackPixels === image.width) fullBlackRows += 1;
  }
  return { colorCount: colors.size, invalidAlpha, fullBlackRows };
}

describe("backgrounds aprovados das cenas iniciais do Exemplo GBA", () => {
  it.each(["logo", "abertura", "titulo"])("mantém o fundo ativo de %s preparado para o canvas GBA", async (sceneName) => {
    const project = JSON.parse(await readFile(templateProject, "utf8"));
    const scene = project.rooms.find((room) => room.name === sceneName);
    const name = scene?.backgroundAssetName;
    const asset = project.assets.find((item) => item.name === name);
    expect(name).toBeTruthy();
    expect(asset?.metadata?.reviewStatus).toBe("approved");
    expect(asset?.metadata?.colorMode).toBe("4bpp");

    const decoded = decodePngRgba(await readFile(join(templateBackgrounds, name)));
    const pixels = inspectPixels(decoded);

    expect(decoded).toMatchObject({ width: 240, height: 160 });
    expect(pixels.colorCount).toBeGreaterThan(1);
    expect(pixels.colorCount).toBeLessThanOrEqual(256);
    expect(pixels.invalidAlpha).toBe(0);
    expect(pixels.fullBlackRows).toBe(0);
  });
});
