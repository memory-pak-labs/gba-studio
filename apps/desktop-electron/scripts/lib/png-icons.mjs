import { deflateSync, inflateSync } from "node:zlib";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function parsePng(buffer) {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("PNG invalido: assinatura ausente.");
  }

  let offset = pngSignature.length;
  let header = null;
  const idatChunks = [];
  let palette = null;
  let transparency = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data.readUInt8(8),
        colorType: data.readUInt8(9),
        compression: data.readUInt8(10),
        filter: data.readUInt8(11),
        interlace: data.readUInt8(12)
      };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IEND") {
      break;
    }
  }

  if (!header) {
    throw new Error("PNG invalido: IHDR ausente.");
  }
  const indexed4Bit = header.colorType === 3 && header.bitDepth === 4;
  if ((header.bitDepth !== 8 && !indexed4Bit) || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error("PNG nao suportado para icones: esperado 8-bit ou indexado 4-bit, sem interlace.");
  }
  if (header.colorType !== 2 && header.colorType !== 3 && header.colorType !== 6) {
    throw new Error("PNG nao suportado para icones: esperado RGB, RGBA ou indexado.");
  }
  if (header.colorType === 3 && (!palette || palette.length === 0 || palette.length % 3 !== 0)) {
    throw new Error("PNG indexado invalido: paleta PLTE ausente.");
  }

  return {
    ...header,
    bytesPerPixel: header.colorType === 6 ? 4 : header.colorType === 2 ? 3 : 1,
    rowBytes: header.colorType === 3 && header.bitDepth < 8
      ? Math.ceil(header.width * header.bitDepth / 8)
      : header.width * (header.colorType === 6 ? 4 : header.colorType === 2 ? 3 : 1),
    palette,
    transparency,
    inflated: inflateSync(Buffer.concat(idatChunks))
  };
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function unfilterPngRows(parsed) {
  const rowBytes = parsed.rowBytes ?? parsed.width * parsed.bytesPerPixel;
  const output = Buffer.alloc(parsed.width * parsed.height * 4);
  const previous = Buffer.alloc(rowBytes);
  let inputOffset = 0;

  for (let y = 0; y < parsed.height; y += 1) {
    const filter = parsed.inflated.readUInt8(inputOffset);
    inputOffset += 1;
    const row = Buffer.from(parsed.inflated.subarray(inputOffset, inputOffset + rowBytes));
    inputOffset += rowBytes;

    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= parsed.bytesPerPixel ? row[index - parsed.bytesPerPixel] : 0;
      const above = previous[index] ?? 0;
      const upperLeft = index >= parsed.bytesPerPixel ? previous[index - parsed.bytesPerPixel] : 0;
      if (filter === 1) {
        row[index] = (row[index] + left) & 0xff;
      } else if (filter === 2) {
        row[index] = (row[index] + above) & 0xff;
      } else if (filter === 3) {
        row[index] = (row[index] + Math.floor((left + above) / 2)) & 0xff;
      } else if (filter === 4) {
        row[index] = (row[index] + paethPredictor(left, above, upperLeft)) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`PNG nao suportado: filtro ${filter}.`);
      }
    }

    for (let x = 0; x < parsed.width; x += 1) {
      const input = x * parsed.bytesPerPixel;
      const outputOffset = (y * parsed.width + x) * 4;
      if (parsed.colorType === 3) {
        const packedIndex = row[Math.floor(x * parsed.bitDepth / 8)];
        const paletteIndex = parsed.bitDepth === 4 && x % 2 === 0
          ? packedIndex >> 4
          : parsed.bitDepth === 4
            ? packedIndex & 0x0f
            : packedIndex;
        const paletteOffset = paletteIndex * 3;
        if (paletteOffset + 2 >= parsed.palette.length) {
          throw new Error(`PNG indexado referencia cor inexistente: ${paletteIndex}.`);
        }
        output[outputOffset] = parsed.palette[paletteOffset];
        output[outputOffset + 1] = parsed.palette[paletteOffset + 1];
        output[outputOffset + 2] = parsed.palette[paletteOffset + 2];
        output[outputOffset + 3] = parsed.transparency?.[paletteIndex] ?? 255;
      } else {
        output[outputOffset] = row[input];
        output[outputOffset + 1] = row[input + 1];
        output[outputOffset + 2] = row[input + 2];
        output[outputOffset + 3] = parsed.bytesPerPixel === 4 ? row[input + 3] : 255;
      }
    }

    row.copy(previous);
  }

  return output;
}

export function pngDimensions(buffer) {
  const parsed = parsePng(buffer);
  return { width: parsed.width, height: parsed.height };
}

export function decodePngRgba(buffer) {
  const parsed = parsePng(buffer);
  return {
    height: parsed.height,
    pixels: unfilterPngRows(parsed),
    width: parsed.width
  };
}

export function encodePngRgba(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  const pixels = image?.pixels;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("PNG RGBA precisa de dimensoes inteiras positivas.");
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
    throw new Error("PNG RGBA precisa conter exatamente width * height * 4 bytes.");
  }

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowBytes + 1);
    raw[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * rowBytes, rowBytes)
      .copy(raw, rowOffset + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  header.writeUInt8(0, 10);
  header.writeUInt8(0, 11);
  header.writeUInt8(0, 12);

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

export function resizePngNearest(buffer, size) {
  const parsed = parsePng(buffer);
  const pixels = unfilterPngRows(parsed);
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(parsed.height - 1, Math.floor((y * parsed.height) / size));
    const rowOffset = y * (rowBytes + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(parsed.width - 1, Math.floor((x * parsed.width) / size));
      const sourceOffset = (sourceY * parsed.width + sourceX) * 4;
      const destinationOffset = rowOffset + 1 + x * 4;
      pixels.copy(raw, destinationOffset, sourceOffset, sourceOffset + 4);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  header.writeUInt8(0, 10);
  header.writeUInt8(0, 11);
  header.writeUInt8(0, 12);

  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}
