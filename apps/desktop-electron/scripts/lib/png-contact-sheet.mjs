import { decodePngRgba, encodePngRgba } from "./png-icons.mjs";

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} precisa ser um inteiro positivo.`);
  }
  return number;
}

function assertImage(image, index) {
  const width = positiveInteger(image?.width, `Imagem ${index + 1}: largura`);
  const height = positiveInteger(image?.height, `Imagem ${index + 1}: altura`);
  if (!(image?.pixels instanceof Uint8Array) || image.pixels.length !== width * height * 4) {
    throw new Error(`Imagem ${index + 1} nao contem pixels RGBA validos.`);
  }
  return { height, pixels: image.pixels, width };
}

export function composeRgbaContactSheet(images, options = {}) {
  if (!Array.isArray(images)) throw new Error("O contact sheet precisa de uma lista de imagens.");
  const expectedCount = positiveInteger(options.expectedCount, "Quantidade esperada");
  if (images.length !== expectedCount) {
    throw new Error(`O contact sheet exige ${expectedCount} cenas, mas recebeu ${images.length}.`);
  }
  const columns = positiveInteger(options.columns, "Colunas");
  const targetWidth = positiveInteger(options.targetWidth, "Largura alvo");
  const targetHeight = positiveInteger(options.targetHeight, "Altura alvo");
  const rows = Math.ceil(expectedCount / columns);
  const width = columns * targetWidth;
  const height = rows * targetHeight;
  const pixels = Buffer.alloc(width * height * 4);

  images.forEach((candidate, index) => {
    const image = assertImage(candidate, index);
    const cellX = (index % columns) * targetWidth;
    const cellY = Math.floor(index / columns) * targetHeight;
    for (let y = 0; y < targetHeight; y += 1) {
      const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / targetHeight));
      for (let x = 0; x < targetWidth; x += 1) {
        const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / targetWidth));
        const sourceOffset = (sourceY * image.width + sourceX) * 4;
        const destinationOffset = ((cellY + y) * width + cellX + x) * 4;
        Buffer.from(image.pixels.buffer, image.pixels.byteOffset + sourceOffset, 4)
          .copy(pixels, destinationOffset);
      }
    }
  });

  return { columns, height, pixels, rows, width };
}

export function renderPngContactSheet(buffers, options = {}) {
  const sheet = composeRgbaContactSheet(buffers.map((buffer) => decodePngRgba(buffer)), options);
  return encodePngRgba(sheet);
}
