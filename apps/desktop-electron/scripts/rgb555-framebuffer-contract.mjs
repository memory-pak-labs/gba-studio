function expandFiveBits(value) {
  const channel = Number(value) & 0x1F;
  return (channel << 3) | (channel >> 2);
}

const RGB555_CHANNEL_VALUES = new Set(Array.from({ length: 32 }, (_, value) => expandFiveBits(value)));

export function auditRgb555FramebufferEncoding(colorHistogram) {
  const entries = Array.isArray(colorHistogram) ? colorHistogram : [];
  const invalidColors = entries
    .map((entry) => entry?.rgb)
    .filter((rgb) => !Array.isArray(rgb)
      || rgb.length !== 3
      || rgb.some((channel) => !RGB555_CHANNEL_VALUES.has(Number(channel))));
  return {
    audited: true,
    colorCount: entries.length,
    invalidColors,
    ok: entries.length > 0 && invalidColors.length === 0
  };
}

export function decodeRgb555(value) {
  const color = Number(value) & 0x7FFF;
  return [
    expandFiveBits(color),
    expandFiveBits(color >> 5),
    expandFiveBits(color >> 10)
  ];
}

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolve4bppPaletteIndex(tilemapEntry, localPaletteIndex) {
  const paletteBank = (Number(tilemapEntry) >> 12) & 0x0F;
  return paletteBank * 16 + localPaletteIndex;
}

function parseExportedPaletteAssetMetadata(headerSource, symbol) {
  const paletteAssetMatch = headerSource.match(
    new RegExp(`${escapedRegExp(symbol)}_palette_asset\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`, "mi")
  );
  if (!paletteAssetMatch) return null;
  const values = paletteAssetMatch[1]
    .split(",")
    .slice(-2)
    .map((entry) => Number.parseInt(entry.trim(), 0));
  if (values.length < 2 || !values.slice(0, 2).every(Number.isInteger)) return null;
  return { colorCount: values[0], startIndex: values[1] };
}

function resolveExportedPaletteArrayIndex(tilemapEntry, localPaletteIndex, palette, paletteAsset, bitsPerPixel = 4) {
  const globalPaletteIndex = bitsPerPixel === 8
    ? localPaletteIndex
    : resolve4bppPaletteIndex(tilemapEntry, localPaletteIndex);
  if (bitsPerPixel === 8) return globalPaletteIndex;
  // assetc emits a compact palette array when the asset owns fewer than the
  // complete 256-color hardware palette. Its start_index is then the global
  // base represented by palette[0]. Full 256-color arrays remain global.
  const compactPalette = paletteAsset
    && paletteAsset.colorCount === palette.length
    && paletteAsset.colorCount < 256;
  return compactPalette ? globalPaletteIndex - paletteAsset.startIndex : globalPaletteIndex;
}

export function parseExportedRgb555Palette(headerSource, symbol) {
  if (typeof headerSource !== "string" || typeof symbol !== "string" || symbol.length === 0) {
    throw new Error("Fonte e simbolo da paleta RGB555 sao obrigatorios.");
  }
  const pattern = new RegExp(
    `constexpr\\s+uint16_t\\s+${escapedRegExp(symbol)}_palette\\s*\\[[^\\]]+\\]\\s*=\\s*\\{([^}]+)\\}`,
    "m"
  );
  const match = headerSource.match(pattern);
  if (!match) throw new Error(`Paleta RGB555 exportada nao encontrada para ${symbol}.`);
  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const value = Number.parseInt(entry, 0);
      if (!Number.isInteger(value)) throw new Error(`Valor RGB555 invalido em ${symbol}: ${entry}.`);
      return value & 0x7FFF;
    });
}

export function parseExportedRgb555Palettes(headerSource) {
  if (typeof headerSource !== "string") return [];
  const values = [];
  for (const match of headerSource.matchAll(
    /constexpr\s+uint16_t\s+[A-Za-z0-9_]+_palette(?:_colors)?\s*\[[^\]]*\]\s*=\s*\{([^}]+)\}/gm
  )) {
    for (const entry of match[1].split(",").map((value) => value.trim()).filter(Boolean)) {
      const value = Number.parseInt(entry, 0);
      if (!Number.isInteger(value)) throw new Error(`Valor RGB555 invalido: ${entry}.`);
      values.push(value & 0x7FFF);
    }
  }
  return values;
}

export function parseNativeRgb15Palette(source, symbol) {
  const match = typeof source === "string" && typeof symbol === "string"
    ? source.match(new RegExp(
      `constexpr\\s+uint16_t\\s+${escapedRegExp(symbol)}\\s*\\[\\s*\\]\\s*=\\s*\\{([\\s\\S]*?)\\};`,
      "m"
    ))
    : null;
  if (!match) throw new Error(`Paleta nativa ${symbol} nao encontrada.`);
  const entries = [...match[1].matchAll(/gbs::rgb15\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)];
  if (entries.length === 0) throw new Error(`Paleta nativa ${symbol} nao contem cores RGB555.`);
  return entries.map((entry) => {
    const [red, green, blue] = entry.slice(1).map(Number);
    if ([red, green, blue].some((channel) => channel > 31)) {
      throw new Error(`Paleta nativa ${symbol} contem canal fora de RGB555.`);
    }
    return red | (green << 5) | (blue << 10);
  });
}

export function parseExportedTilemapEntries(headerSource, symbol) {
  return parseExportedNumericArray(headerSource, symbol, "tilemap_entries", "uint16_t");
}

function parseExportedNumericArray(headerSource, symbol, suffix, type) {
  const pattern = new RegExp(
    `constexpr\\s+${type}\\s+${escapedRegExp(symbol)}_${suffix}\\s*\\[[^;=]+\\]\\s*=\\s*\\{([\\s\\S]*?)\\};`,
    "m"
  );
  const match = headerSource.match(pattern);
  if (!match) throw new Error(`Array ${suffix} exportado nao encontrado para ${symbol}.`);
  return [...match[1].matchAll(/0x[0-9a-f]+|\b\d+\b/gi)].map((entry) => {
    const value = Number.parseInt(entry[0], 0);
    if (!Number.isInteger(value)) throw new Error(`Valor invalido em ${symbol}_${suffix}: ${entry[0]}.`);
    return value;
  });
}

export function parseExportedBackgroundTileAsset(headerSource, symbol) {
  const tileAssetMatch = headerSource.match(
    new RegExp(`${escapedRegExp(symbol)}_tile_asset\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*;`, "mi")
  );
  if (!tileAssetMatch) throw new Error(`TileAsset de fundo exportado nao encontrado para ${symbol}.`);
  const assetBody = tileAssetMatch[1];
  const destinationMatch = assetBody.match(
    new RegExp(
      `${escapedRegExp(symbol)}_tile_count\\s*,\\s*(0x[0-9a-f]+|\\d+)\\s*,\\s*(?:true|false)(?:\\s*,\\s*(?:gbs::ColorDepth::Bpp)?(4|8))?`,
      "mi"
    )
  );
  if (!destinationMatch) throw new Error(`TileAsset de fundo exportado nao possui metadados para ${symbol}.`);
  const bitsPerPixel = destinationMatch?.[2] ? Number.parseInt(destinationMatch[2], 10) : 4;
  return { bitsPerPixel, destinationTile: Number.parseInt(destinationMatch[1], 0) };
}

export function decodeExportedTileDataRgba(options) {
  const headerSource = options?.headerSource;
  const symbol = options?.symbol;
  const tilesPerRow = Number(options?.tilesPerRow);
  if (!Number.isInteger(tilesPerRow) || tilesPerRow <= 0) {
    throw new Error("Largura do atlas de tiles compilados precisa ser positiva e inteira.");
  }
  const palette = parseExportedRgb555Palette(headerSource, symbol);
  const tileBytes = parseExportedNumericArray(headerSource, symbol, options?.tileArraySuffix ?? "tiles", "uint8_t");
  const { bitsPerPixel, destinationTile } = parseExportedBackgroundTileAsset(headerSource, symbol);
  const bytesPerTile = bitsPerPixel === 8 ? 64 : 32;
  if (tileBytes.length === 0 || tileBytes.length % bytesPerTile !== 0) {
    throw new Error(`Tiles ${bitsPerPixel}bpp invalidos para ${symbol}: ${tileBytes.length} byte(s).`);
  }
  const tileCount = tileBytes.length / bytesPerTile;
  const width = tilesPerRow * 8;
  const height = Math.ceil(tileCount / tilesPerRow) * 8;
  const pixels = new Uint8Array(width * height * 4);
  for (let tileIndex = 0; tileIndex < tileCount; tileIndex += 1) {
    const tileOriginX = (tileIndex % tilesPerRow) * 8;
    const tileOriginY = Math.floor(tileIndex / tilesPerRow) * 8;
    const tileOffset = tileIndex * bytesPerTile;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const packed = tileBytes[tileOffset + (bitsPerPixel === 8 ? y * 8 + x : y * 4 + Math.floor(x / 2))];
        const localPaletteIndex = bitsPerPixel === 8
          ? packed
          : x % 2 === 0 ? packed & 0x0F : (packed >> 4) & 0x0F;
        const paletteIndex = localPaletteIndex;
        const color = palette[paletteIndex];
        if (color === undefined) {
          throw new Error(`Tile ${tileIndex} usa indice ${paletteIndex} fora da paleta de ${symbol}.`);
        }
        const pixelOffset = (((tileOriginY + y) * width) + tileOriginX + x) * 4;
        pixels.set([...decodeRgb555(color), paletteIndex === 0 ? 0 : 255], pixelOffset);
      }
    }
  }
  return { bitsPerPixel, destinationTile, height, pixels, tileCount, width };
}

function parseExportedMetaSpriteParts(headerSource, symbol, frameCount) {
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const match = headerSource.match(new RegExp(
      `constexpr\\s+gbs::MetaSpritePart\\s+${escapedRegExp(symbol)}_frame_${frameIndex}_parts\\s*\\[[^\\]]+\\]\\s*=\\s*\\{([\\s\\S]*?)\\};`,
      "m"
    ));
    if (!match) return null;
    const parts = [...match[1].matchAll(/\{([^{}]+)\}/g)].map((partMatch) => {
      const fields = partMatch[1].split(",").map((field) => field.trim());
      if (fields.length !== 8) return null;
      const numericFields = [0, 1, 2, 3, 6, 7].map((index) => Number.parseInt(fields[index], 0));
      if (numericFields.some((value) => !Number.isInteger(value))) return null;
      if (!["true", "false"].includes(fields[4]) || !["true", "false"].includes(fields[5])) return null;
      return {
        flipX: fields[4] === "true",
        flipY: fields[5] === "true",
        height: numericFields[5],
        tileIndex: numericFields[2],
        width: numericFields[4],
        x: numericFields[0],
        y: numericFields[1]
      };
    });
    if (parts.length === 0 || parts.some((part) => part === null)) return null;
    frames.push(parts);
  }
  return frames;
}

export function decodeExportedTilemapRgba(options) {
  const headerSource = options?.headerSource;
  const symbol = options?.symbol;
  const width = Number(options?.width);
  const height = Number(options?.height);
  const transparentPaletteZero = options?.transparentPaletteZero !== false;
  if (![width, height].every(Number.isInteger)
    || width <= 0 || height <= 0 || width % 8 !== 0 || height % 8 !== 0) {
    throw new Error("Tilemap compilado precisa de dimensoes positivas alinhadas a 8 pixels.");
  }
  const palette = parseExportedRgb555Palette(headerSource, symbol);
  const paletteAsset = parseExportedPaletteAssetMetadata(headerSource, symbol);
  const tileBytes = parseExportedNumericArray(headerSource, symbol, "tiles", "uint8_t");
  const tilemapEntries = parseExportedNumericArray(headerSource, symbol, "tilemap_entries", "uint16_t");
  const { bitsPerPixel, destinationTile } = parseExportedBackgroundTileAsset(headerSource, symbol);
  const bytesPerTile = bitsPerPixel === 8 ? 64 : 32;
  const widthTiles = width / 8;
  const heightTiles = height / 8;
  if (tilemapEntries.length !== widthTiles * heightTiles) {
    throw new Error(`Tilemap ${symbol} tem ${tilemapEntries.length} entrada(s), esperado ${widthTiles * heightTiles}.`);
  }
  if (tileBytes.length === 0 || tileBytes.length % bytesPerTile !== 0) {
    throw new Error(`Tiles ${bitsPerPixel}bpp invalidos para ${symbol}: ${tileBytes.length} byte(s).`);
  }

  const tileCount = tileBytes.length / bytesPerTile;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const entry = tilemapEntries[(Math.floor(y / 8) * widthTiles) + Math.floor(x / 8)];
      // Paged 8bpp maps keep ROM atlas indices above the hardware 10-bit tile limit.
      const tileIndex = (bitsPerPixel === 8 ? entry : entry & 0x03FF) - destinationTile;
      const tileX = bitsPerPixel === 4 && (entry & 0x0400) !== 0 ? 7 - (x % 8) : x % 8;
      const tileY = bitsPerPixel === 4 && (entry & 0x0800) !== 0 ? 7 - (y % 8) : y % 8;
      if (tileIndex < 0 || tileIndex >= tileCount) {
        throw new Error(`Tilemap ${symbol} referencia tile invalido ${tileIndex + destinationTile}.`);
      }
      const tileOffset = tileIndex * bytesPerTile;
      const packed = tileBytes[tileOffset + (bitsPerPixel === 8 ? tileY * 8 + tileX : (tileY * 4) + Math.floor(tileX / 2))];
      const localPaletteIndex = bitsPerPixel === 8
        ? packed
        : tileX % 2 === 0 ? packed & 0x0F : (packed >> 4) & 0x0F;
      const paletteIndex = resolveExportedPaletteArrayIndex(
        entry,
        localPaletteIndex,
        palette,
        paletteAsset,
        bitsPerPixel
      );
      const color = palette[paletteIndex];
      if (color === undefined) {
        throw new Error(`Tilemap ${symbol} usa indice ${paletteIndex} fora da paleta.`);
      }
      const offset = ((y * width) + x) * 4;
      pixels.set([
        ...decodeRgb555(color),
        transparentPaletteZero && localPaletteIndex === 0 ? 0 : 255
      ], offset);
    }
  }
  return {
    bitsPerPixel,
    destinationTile,
    height,
    palette,
    pixels,
    tileCount,
    tilemapEntryCount: tilemapEntries.length,
    width
  };
}

export function compositeRgbaLayers(layers) {
  const normalized = Array.isArray(layers) ? layers : [];
  const first = normalized[0];
  const width = Number(first?.width);
  const height = Number(first?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Composicao RGBA exige pelo menos uma camada com dimensoes validas.");
  }
  const pixels = new Uint8Array(width * height * 4);
  for (const layer of normalized) {
    if (
      Number(layer?.width) !== width
      || Number(layer?.height) !== height
      || !(layer?.pixels instanceof Uint8Array)
      || layer.pixels.length !== pixels.length
    ) {
      throw new Error("Todas as camadas RGBA precisam compartilhar dimensoes e pixels validos.");
    }
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = layer.pixels[offset + 3];
      if (alpha === 0) continue;
      if (alpha === 255 || pixels[offset + 3] === 0) {
        pixels.set(layer.pixels.subarray(offset, offset + 4), offset);
        continue;
      }
      const inverse = 255 - alpha;
      const destinationAlpha = pixels[offset + 3];
      const outputAlpha = alpha + Math.round(destinationAlpha * inverse / 255);
      for (let channel = 0; channel < 3; channel += 1) {
        const premultiplied = layer.pixels[offset + channel] * alpha
          + Math.round(pixels[offset + channel] * destinationAlpha * inverse / 255);
        pixels[offset + channel] = outputAlpha > 0 ? Math.round(premultiplied / outputAlpha) : 0;
      }
      pixels[offset + 3] = outputAlpha;
    }
  }
  return { height, pixels, width };
}

export function decodeExportedSpriteSheetRgba(options) {
  const frameCount = Number(options?.frameCount);
  const frameWidth = Number(options?.frameWidth);
  const frameHeight = Number(options?.frameHeight);
  if (![frameCount, frameWidth, frameHeight].every(Number.isInteger)
    || frameCount <= 0 || frameWidth <= 0 || frameHeight <= 0
    || frameWidth % 8 !== 0 || frameHeight % 8 !== 0) {
    throw new Error("Frames compilados precisam de dimensoes positivas e multiplas de 8.");
  }
  const tilesPerFrameRow = frameWidth / 8;
  const tilesPerFrame = tilesPerFrameRow * (frameHeight / 8);
  const packed = decodeExportedTileDataRgba({
    headerSource: options?.headerSource,
    symbol: options?.symbol,
    tilesPerRow: tilesPerFrameRow
  });
  const expectedTileCount = frameCount * tilesPerFrame;
  // Composite OBJ parts have their own row stride even without deduplication.
  const deduplicatedFrameParts = parseExportedMetaSpriteParts(options?.headerSource, options?.symbol, frameCount);
  if (packed.tileCount !== expectedTileCount && !deduplicatedFrameParts) {
    throw new Error(`Sheet ${options?.symbol} exportou ${packed.tileCount} tile(s), esperado ${frameCount * tilesPerFrame}.`);
  }
  const width = frameCount * frameWidth;
  const height = frameHeight;
  const pixels = new Uint8Array(width * height * 4);
  if (deduplicatedFrameParts) {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const framePacked = options.headerSource.includes(`${options.symbol}_frame_${frameIndex}_tiles[`)
        ? decodeExportedTileDataRgba({...options,tilesPerRow:tilesPerFrameRow,tileArraySuffix:`frame_${frameIndex}_tiles`})
        : packed;
      for (const part of deduplicatedFrameParts[frameIndex]) {
        for (let localY = 0; localY < part.height; localY += 1) {
          for (let localX = 0; localX < part.width; localX += 1) {
            const tileIndex = part.tileIndex - packed.destinationTile
              + Math.floor(localY / 8) * (part.width / 8)
              + Math.floor(localX / 8);
            if (tileIndex < 0 || tileIndex >= framePacked.tileCount) {
              throw new Error(`Sheet ${options?.symbol} referencia tile ${tileIndex}, mas exportou ${framePacked.tileCount}.`);
            }
            const sourceX = (tileIndex % tilesPerFrameRow) * 8
              + (part.flipX ? 7 - (localX % 8) : localX % 8);
            const sourceY = Math.floor(tileIndex / tilesPerFrameRow) * 8
              + (part.flipY ? 7 - (localY % 8) : localY % 8);
            const targetX = frameIndex * frameWidth + part.x + localX;
            const targetY = part.y + localY;
            if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
            const sourceOffset = ((sourceY * framePacked.width + sourceX) * 4);
            const targetOffset = ((targetY * width + targetX) * 4);
            pixels.set(framePacked.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
          }
        }
      }
    }
  } else {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      for (let y = 0; y < frameHeight; y += 1) {
        const sourceOffset = (((frameIndex * frameHeight + y) * frameWidth) * 4);
        const targetOffset = ((y * width + frameIndex * frameWidth) * 4);
        pixels.set(packed.pixels.subarray(sourceOffset, sourceOffset + frameWidth * 4), targetOffset);
      }
    }
  }
  return {
    bitsPerPixel: packed.bitsPerPixel,
    destinationTile: packed.destinationTile,
    frameCount,
    frameHeight,
    frameWidth,
    height,
    pixels,
    tileCount: packed.tileCount,
    width
  };
}

export function dominantExportedTilemapRgb555(headerSource, symbol) {
  const palette = parseExportedRgb555Palette(headerSource, symbol);
  const paletteAsset = parseExportedPaletteAssetMetadata(headerSource, symbol);
  const tileBytes = parseExportedNumericArray(headerSource, symbol, "tiles", "uint8_t");
  const tilemapEntries = parseExportedNumericArray(headerSource, symbol, "tilemap_entries", "uint16_t");
  const { bitsPerPixel, destinationTile } = parseExportedBackgroundTileAsset(headerSource, symbol);
  const bytesPerTile = bitsPerPixel === 8 ? 64 : 32;
  if (tileBytes.length === 0 || tileBytes.length % bytesPerTile !== 0) {
    throw new Error(`Tiles ${bitsPerPixel}bpp invalidos para ${symbol}: ${tileBytes.length} byte(s).`);
  }
  if (tilemapEntries.length === 0) {
    throw new Error(`Tilemap vazio para ${symbol}.`);
  }
  const tileCount = tileBytes.length / bytesPerTile;
  const palettePixelCounts = Array.from({ length: palette.length }, () => 0);
  for (const entry of tilemapEntries) {
    const encodedTileIndex = bitsPerPixel === 8 ? entry : entry & 0x03FF;
    const tileIndex = encodedTileIndex - destinationTile;
    if (tileIndex < 0 || tileIndex >= tileCount) {
      throw new Error(`Tilemap ${symbol} referencia tile ${encodedTileIndex} com destino ${destinationTile}, mas exportou ${tileCount}.`);
    }
    const offset = tileIndex * bytesPerTile;
    for (let byteIndex = 0; byteIndex < bytesPerTile; byteIndex += 1) {
      const byte = tileBytes[offset + byteIndex] & 0xFF;
      const paletteIndexes = bitsPerPixel === 8
        ? [resolveExportedPaletteArrayIndex(entry, byte, palette, paletteAsset, bitsPerPixel)]
        : [
            resolveExportedPaletteArrayIndex(entry, byte & 0x0F, palette, paletteAsset, bitsPerPixel),
            resolveExportedPaletteArrayIndex(entry, (byte >> 4) & 0x0F, palette, paletteAsset, bitsPerPixel)
          ];
      if (paletteIndexes.some((paletteIndex) => paletteIndex >= palette.length)) {
        throw new Error(`Tile ${tileIndex} usa indice fora da paleta de ${symbol}.`);
      }
      for (const paletteIndex of paletteIndexes) palettePixelCounts[paletteIndex] += 1;
    }
  }
  let paletteIndex = 0;
  for (let index = 1; index < palettePixelCounts.length; index += 1) {
    if (palettePixelCounts[index] > palettePixelCounts[paletteIndex]) paletteIndex = index;
  }
  return {
    bitsPerPixel,
    destinationTile,
    dominantPixelCount: palettePixelCounts[paletteIndex],
    expectedRgb555: palette[paletteIndex],
    palette,
    paletteIndex,
    palettePixelCounts,
    pixelCount: tilemapEntries.length * 64,
    tileCount,
    tilemapEntryCount: tilemapEntries.length
  };
}

export function exportedTilemapRgb555Coverage(
  headerSource,
  symbol,
  minimumPixelRatio,
  options = {}
) {
  const tilemap = dominantExportedTilemapRgb555(headerSource, symbol);
  const minimum = Math.min(1, Math.max(0, Number(minimumPixelRatio) || 0));
  const excludedRgb555 = new Set(
    (Array.isArray(options?.excludeRgb555) ? options.excludeRgb555 : [])
      .map((value) => Number(value) & 0x7FFF)
  );
  const byColor = new Map();
  for (let index = 0; index < tilemap.palettePixelCounts.length; index += 1) {
    const count = tilemap.palettePixelCounts[index];
    if (count <= 0) continue;
    const color = tilemap.palette[index] & 0x7FFF;
    if (excludedRgb555.has(color)) continue;
    const group = byColor.get(color) ?? { color, count: 0, paletteIndices: [] };
    group.count += count;
    group.paletteIndices.push(index);
    byColor.set(color, group);
  }
  const ranked = [...byColor.values()].sort((left, right) => (
    right.count - left.count || left.paletteIndices[0] - right.paletteIndices[0]
  ));
  const selected = [];
  let exportedPixelCount = 0;
  for (const group of ranked) {
    if (selected.length > 0 && exportedPixelCount / tilemap.pixelCount >= minimum) break;
    selected.push(group);
    exportedPixelCount += group.count;
  }
  return {
    bitsPerPixel: tilemap.bitsPerPixel,
    destinationTile: tilemap.destinationTile,
    expectedRgb555: selected.map((group) => group.color),
    exportedPixelCount,
    exportedPixelRatio: tilemap.pixelCount > 0 ? exportedPixelCount / tilemap.pixelCount : 0,
    minimumPixelRatio: minimum,
    palette: tilemap.palette,
    paletteIndices: selected.flatMap((group) => group.paletteIndices),
    palettePixelCounts: tilemap.palettePixelCounts,
    pixelCount: tilemap.pixelCount,
    tileCount: tilemap.tileCount,
    tilemapEntryCount: tilemap.tilemapEntryCount
  };
}

export function usedExportedTilemapRgb555(coverage) {
  const palette = Array.isArray(coverage?.palette) ? coverage.palette : [];
  const counts = Array.isArray(coverage?.palettePixelCounts) ? coverage.palettePixelCounts : [];
  return palette
    .filter((_, index) => Number(counts[index]) > 0)
    .map((value) => Number(value) & 0x7FFF);
}

function rgb888ToRgb555(red, green, blue) {
  return ((Number(red) >> 3) & 0x1F)
    | (((Number(green) >> 3) & 0x1F) << 5)
    | (((Number(blue) >> 3) & 0x1F) << 10);
}

const SCREEN_WIDTH = 240;
const SCREEN_HEIGHT = 160;
const CAMERA_SCALE_ONE = 256;
const CAMERA_ZOOM_MIN = 128;
const CAMERA_ZOOM_MAX = 1024;

function clampInt(value, minimum, maximum) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return minimum;
  return Math.max(minimum, Math.min(maximum, safeValue));
}

function scaleCameraValue(value, zoomX256) {
  return Math.trunc((Number(value) * clampInt(zoomX256, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX)) / CAMERA_SCALE_ONE);
}

function unscaleCameraValue(value, zoomX256) {
  const safeZoom = clampInt(zoomX256, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
  return Math.trunc((Number(value) * CAMERA_SCALE_ONE) / safeZoom);
}

function moveCameraValueToward(current, target, smoothingX256) {
  if (current === target) return current;
  const smoothing = clampInt(smoothingX256, 1, CAMERA_SCALE_ONE);
  const amount = smoothing >= CAMERA_SCALE_ONE
    ? target - current
    : Math.trunc(((target - current) * smoothing) / CAMERA_SCALE_ONE);
  return current + (amount === 0 ? (target > current ? 1 : -1) : amount);
}

function isometricCameraWorldToScreen(worldPixelsX, worldPixelsY, camera) {
  const zoomX256 = Number(camera?.zoomX256 ?? camera?.zoom_x256 ?? CAMERA_SCALE_ONE);
  const positionX = Number(camera?.position?.x ?? camera?.position_x ?? 0);
  const positionY = Number(camera?.position?.y ?? camera?.position_y ?? 0);
  const panOffsetX = Number(camera?.panOffset?.x ?? camera?.pan_offset_pixels?.x ?? 0);
  const panOffsetY = Number(camera?.panOffset?.y ?? camera?.pan_offset_pixels?.y ?? 0);
  const shakeOffsetX = Number(camera?.shakeOffset?.x ?? camera?.shake_offset_pixels?.x ?? 0);
  const shakeOffsetY = Number(camera?.shakeOffset?.y ?? camera?.shake_offset_pixels?.y ?? 0);
  return {
    x: SCREEN_WIDTH / 2 + scaleCameraValue(worldPixelsX - positionX - SCREEN_WIDTH / 2, zoomX256) + panOffsetX + shakeOffsetX,
    y: SCREEN_HEIGHT / 2 + scaleCameraValue(worldPixelsY - positionY - SCREEN_HEIGHT / 2, zoomX256) + panOffsetY + shakeOffsetY
  };
}

export function resolveIsometricCameraPosition(room, runtimeState) {
  const cameraInput = room?.camera;
  const grid = room?.grid;
  const player = runtimeState?.player;
  if (!cameraInput?.position || !cameraInput?.bounds || !grid?.origin
    || !Number.isFinite(player?.x) || !Number.isFinite(player?.y)) return null;
  const playerIndex = Number(player.y) * Number(room?.width_tiles ?? 0) + Number(player.x);
  const elevation = Number(room?.height_levels?.[playerIndex] ?? 0);
  const focus = {
    x: Number(grid.origin.x) + (Number(player.x) - Number(player.y)) * Number(grid.tile_width_pixels) / 2,
    y: Number(grid.origin.y) + (Number(player.x) + Number(player.y)) * Number(grid.tile_height_pixels) / 2
      - elevation * Number(grid.height_step_pixels ?? 0)
  };
  const bounds = {
    x: Number(cameraInput.bounds.x),
    y: Number(cameraInput.bounds.y),
    width: Number(cameraInput.bounds.width),
    height: Number(cameraInput.bounds.height)
  };
  const panOffset = {
    x: Number(cameraInput.pan_offset_pixels?.x ?? cameraInput.panOffset?.x ?? 0),
    y: Number(cameraInput.pan_offset_pixels?.y ?? cameraInput.panOffset?.y ?? 0)
  };
  const shakeOffset = {
    x: Number(cameraInput.shake_offset_pixels?.x ?? cameraInput.shakeOffset?.x ?? 0),
    y: Number(cameraInput.shake_offset_pixels?.y ?? cameraInput.shakeOffset?.y ?? 0)
  };
  const dead = cameraInput.dead_zone ?? { x: 96, y: 64, width: 48, height: 32 };
  const smoothingX256 = room?.tileset
    ? CAMERA_SCALE_ONE
    : Number(cameraInput.smoothing_x256 ?? 64);
  let position = { x: Number(cameraInput.position.x), y: Number(cameraInput.position.y) };
  let zoomX256 = Number(cameraInput.zoom_x256 ?? CAMERA_SCALE_ONE);
  const targetZoomX256 = Number(cameraInput.target_zoom_x256 ?? zoomX256);
  const tickCount = Math.max(1, Math.min(4096, Math.trunc(Number(runtimeState?.frame) || 0)));
  for (let tick = 0; tick < tickCount; tick += 1) {
    zoomX256 = moveCameraValueToward(
      clampInt(zoomX256, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX),
      clampInt(targetZoomX256, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX),
      smoothingX256
    );
    if (cameraInput.follow_enabled) {
      const screen = isometricCameraWorldToScreen(focus.x, focus.y, {
        panOffset,
        position,
        shakeOffset,
        zoomX256
      });
      const screenX = screen.x - panOffset.x - shakeOffset.x;
      const screenY = screen.y - panOffset.y - shakeOffset.y;
      let deltaX = 0;
      let deltaY = 0;
      if (screenX < Number(dead.x)) deltaX = screenX - Number(dead.x);
      else if (screenX > Number(dead.x) + Number(dead.width)) deltaX = screenX - Number(dead.x) - Number(dead.width);
      if (screenY < Number(dead.y)) deltaY = screenY - Number(dead.y);
      else if (screenY > Number(dead.y) + Number(dead.height)) deltaY = screenY - Number(dead.y) - Number(dead.height);
      position = {
        x: moveCameraValueToward(position.x, position.x + unscaleCameraValue(deltaX, zoomX256), smoothingX256),
        y: moveCameraValueToward(position.y, position.y + unscaleCameraValue(deltaY, zoomX256), smoothingX256)
      };
    }
    const halfVisibleWidth = unscaleCameraValue(SCREEN_WIDTH / 2, zoomX256);
    const halfVisibleHeight = unscaleCameraValue(SCREEN_HEIGHT / 2, zoomX256);
    let minX = bounds.x - (SCREEN_WIDTH / 2 - halfVisibleWidth);
    let minY = bounds.y - (SCREEN_HEIGHT / 2 - halfVisibleHeight);
    let maxX = bounds.x + bounds.width - (SCREEN_WIDTH / 2 + halfVisibleWidth);
    let maxY = bounds.y + bounds.height - (SCREEN_HEIGHT / 2 + halfVisibleHeight);
    if (maxX < minX) minX = maxX = bounds.x + bounds.width / 2 - SCREEN_WIDTH / 2;
    if (maxY < minY) minY = maxY = bounds.y + bounds.height / 2 - SCREEN_HEIGHT / 2;
    position = {
      x: clampInt(position.x, minX, maxX),
      y: clampInt(position.y, minY, maxY)
    };
  }
  const nativeScroll = room?.paged_surface ? runtimeState?.nativeVideo?.bg?.[2] : null;
  if (nativeScroll && Number.isFinite(nativeScroll.x) && Number.isFinite(nativeScroll.y)) {
    // Initial DMA may span several video frames without advancing the camera.
    // Prefer the actual BG scroll; its 256px ring is unwrapped near the model.
    position = {
      x: nativeScroll.x + Math.round((position.x - nativeScroll.x) / 256) * 256,
      y: nativeScroll.y + Math.round((position.y - nativeScroll.y) / 256) * 256
    };
  }
  return { bounds, panOffset, position, shakeOffset, zoomX256 };
}

export function resolveIsometricAuthoredBackgroundScroll(camera, background) {
  const width = Math.max(0, Math.trunc(Number(background?.width) || 0));
  const height = Math.max(0, Math.trunc(Number(background?.height) || 0));
  return {
    x: clampInt(
      Math.trunc(Number(camera?.position?.x) || 0),
      0,
      Math.max(0, width - SCREEN_WIDTH)
    ),
    y: clampInt(
      Math.trunc(Number(camera?.position?.y) || 0),
      0,
      Math.max(0, height - SCREEN_HEIGHT)
    )
  };
}

export function resolveWorldMapFramebufferViewport(project, background) {
  const sourceWidth = Math.max(0, Math.trunc(Number(background?.width) || 0));
  const sourceHeight = Math.max(0, Math.trunc(Number(background?.height) || 0));
  const nodes = Array.isArray(project?.nodes) ? project.nodes : [];
  const initialNode = Math.max(0, Math.trunc(Number(project?.initial_node) || 0));
  const node = nodes[initialNode];
  const position = node?.position;
  const x = Number(position?.x);
  const y = Number(position?.y);
  return {
    x: Math.max(0, Math.min(sourceWidth - SCREEN_WIDTH, Math.trunc((Number.isFinite(x) ? x : 0) - SCREEN_WIDTH / 2))),
    y: Math.max(0, Math.min(sourceHeight - SCREEN_HEIGHT, Math.trunc((Number.isFinite(y) ? y : 0) - SCREEN_HEIGHT / 2)))
  };
}

export function resolvePointClickPropFramebufferMasks(scene) {
  const masks = new Map();
  for (const prop of scene?.props ?? []) {
    const animation = prop.animations?.find((candidate) => candidate.name === prop.animation);
    for (const frame of animation?.frame_metasprites ?? []) {
      for (const part of frame.parts ?? []) {
        const mask = {
          x: Number(prop.position?.x) + Number(part.x),
          y: Number(prop.position?.y) + Number(part.y),
          width: Number(part.width),
          height: Number(part.height)
        };
        if (!Object.values(mask).every(Number.isFinite) || mask.width <= 0 || mask.height <= 0) continue;
        masks.set(JSON.stringify(mask), mask);
      }
    }
  }
  return [...masks.values()];
}

export function resolveIsometricActorFramebufferMasks(room, runtimeState) {
  const camera = resolveIsometricCameraPosition(room, runtimeState);
  const grid = room?.grid;
  if (!camera || !grid?.origin) return [];
  return (Array.isArray(room?.actors) ? room.actors : [])
    .filter((actor) => Number.isFinite(actor?.tile?.x) && Number.isFinite(actor?.tile?.y))
    .map((actor, actorIndex) => {
      const tileX = actorIndex === 0 && Number.isFinite(runtimeState?.player?.x)
        ? Number(runtimeState.player.x)
        : Number(actor.tile.x);
      const tileY = actorIndex === 0 && Number.isFinite(runtimeState?.player?.y)
        ? Number(runtimeState.player.y)
        : Number(actor.tile.y);
      const heightIndex = (Math.trunc(tileY) * Number(room.width_tiles)) + Math.trunc(tileX);
      const authoredElevation = Number(actor.tile?.z ?? room.height_levels?.[heightIndex] ?? 0);
      const elevation = actorIndex === 0
        ? Number(room.height_levels?.[heightIndex] ?? authoredElevation)
        : authoredElevation;
      const width = Math.max(1, Number(actor.size?.x ?? 16));
      const height = Math.max(1, Number(actor.size?.y ?? 16));
      const centerX = Number(grid.origin.x)
        + (tileX - tileY) * Number(grid.tile_width_pixels) / 2;
      const centerY = Number(grid.origin.y)
        + (tileX + tileY) * Number(grid.tile_height_pixels) / 2
        - elevation * Number(grid.height_step_pixels ?? 0);
      const screen = isometricCameraWorldToScreen(
        centerX + Number(actor.screen_offset?.x ?? -width / 2),
        centerY + Number(actor.screen_offset?.y ?? -height),
        camera
      );
      return {
        height,
        width,
        x: Math.round(screen.x),
        y: Math.round(screen.y)
      };
    });
}

export function renderIsometricRoomRgba(options) {
  const sourcePixels = options?.sourcePixels;
  const sourceWidth = Number(options?.sourceWidth);
  const sourceHeight = Number(options?.sourceHeight);
  const sourceTilemapEntries = options?.sourceTilemapEntries;
  const tileWidth = Number(options?.tileWidth);
  const tileHeight = Number(options?.tileHeight);
  const renderTileWidth = Number(options?.renderTileWidth ?? tileWidth);
  const renderTileHeight = Number(options?.renderTileHeight ?? tileHeight);
  const renderOffsetY = Number(options?.renderOffsetY ?? 0);
  const tileOffsetX = Number(options?.tileOffsetX ?? 0);
  const tileOffsetY = Number(options?.tileOffsetY ?? 0);
  const roomWidth = Number(options?.roomWidth);
  const roomHeight = Number(options?.roomHeight);
  const sourceTileDestination = Number(options?.sourceTileDestination ?? 0);
  const bounds = options?.bounds;
  const grid = options?.grid;
  const visualTiles = options?.visualTiles;
  const heightLevels = options?.heightLevels;
  const sourceTilemapWidth = Number(options?.sourceTilemapWidth);
  const hasSourceTilemapEntries = Array.isArray(sourceTilemapEntries) && sourceTilemapEntries.length > 0;
  const sourceTileEntriesWidth = Math.floor(
    Number.isInteger(sourceTilemapWidth) && sourceTilemapWidth > 0
      ? sourceTilemapWidth
      : sourceWidth / 8
  );
  const numericFields = [sourceWidth, sourceHeight, tileWidth, tileHeight, renderTileWidth, renderTileHeight, tileOffsetX, tileOffsetY, roomWidth, roomHeight,
    Number(bounds?.x), Number(bounds?.y), Number(bounds?.width), Number(bounds?.height),
    Number(grid?.originX), Number(grid?.originY), Number(grid?.heightStep)];
  if (!numericFields.every(Number.isInteger) || sourceWidth <= 0 || sourceHeight <= 0
    || tileWidth <= 0 || tileHeight <= 0 || renderTileWidth <= 0 || renderTileHeight <= 0
    || renderTileWidth % 8 !== 0 || renderTileHeight % 8 !== 0
    || tileOffsetX < 0 || tileOffsetY < 0
    || roomWidth <= 0 || roomHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("Geometria isometrica inteira e positiva e obrigatoria.");
  }
  if (!Number.isInteger(sourceTileDestination) || sourceTileDestination < 0) {
    throw new Error("tileDestination invalido para renderizacao isometrica.");
  }
  if (!(sourcePixels instanceof Uint8Array) || sourcePixels.length !== sourceWidth * sourceHeight * 4) {
    throw new Error("Pixels RGBA do tileset isometrico sao invalidos.");
  }
  if (!Array.isArray(visualTiles) || visualTiles.length !== roomWidth * roomHeight
    || !Array.isArray(heightLevels) || heightLevels.length !== roomWidth * roomHeight) {
    throw new Error("Mapa visual e alturas precisam cobrir toda a cena isometrica.");
  }
  if (!Number.isInteger(sourceTileEntriesWidth) || sourceTileEntriesWidth < 1) {
    throw new Error("Largura do tilemap de fontes isometricas invalida.");
  }
  const logicalColumns = Math.floor((sourceWidth - tileOffsetX) / renderTileWidth);
  if (logicalColumns <= 0) throw new Error("Tileset isometrico nao contem nenhum tile logico.");
  const sourceSubtileColumns = sourceWidth / 8;
  const sourceSubtileRows = sourceHeight / 8;
  const sourceTileMapHeight = hasSourceTilemapEntries
    ? Math.max(1, Math.ceil(sourceTilemapEntries.length / sourceTileEntriesWidth))
    : 0;
  const sourceTilesPerRow = Math.floor(sourceWidth / 8);
  const pixels = new Uint8Array(bounds.width * bounds.height * 4);
  const halfWidth = tileWidth / 2;
  const halfHeight = tileHeight / 2;
  const cameraInput = options?.camera;
  const hasCamera = Number.isFinite(Number(grid?.originX))
    && Number.isFinite(Number(grid?.originY))
    && Number.isFinite(Number(bounds?.width))
    && Number.isFinite(Number(bounds?.height))
    && Number.isFinite(Number(bounds?.x))
    && Number.isFinite(Number(bounds?.y))
    && Number.isFinite(Number(cameraInput?.position?.x ?? cameraInput?.position_x))
    && Number.isFinite(Number(cameraInput?.position?.y ?? cameraInput?.position_y))
    && Number.isFinite(Number(cameraInput?.zoom_x256 ?? cameraInput?.zoomX256 ?? CAMERA_SCALE_ONE));
  const camera = hasCamera ? {
    panOffset: {
      x: Number(cameraInput?.panOffset?.x ?? cameraInput?.pan_offset_pixels?.x ?? 0),
      y: Number(cameraInput?.panOffset?.y ?? cameraInput?.pan_offset_pixels?.y ?? 0)
    },
    position: {
      x: Number(cameraInput?.position?.x ?? cameraInput?.position_x ?? 0),
      y: Number(cameraInput?.position?.y ?? cameraInput?.position_y ?? 0)
    },
    shakeOffset: {
      x: Number(cameraInput?.shakeOffset?.x ?? cameraInput?.shake_offset_pixels?.x ?? 0),
      y: Number(cameraInput?.shakeOffset?.y ?? cameraInput?.shake_offset_pixels?.y ?? 0)
    },
    zoomX256: Number(cameraInput?.zoom_x256 ?? cameraInput?.zoomX256 ?? CAMERA_SCALE_ONE)
  } : null;
  const unscaled = Number(camera?.zoomX256 ?? CAMERA_SCALE_ONE) === CAMERA_SCALE_ONE;
  const maxDepth = roomWidth + roomHeight - 2;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    for (let tileY = 0; tileY < roomHeight; tileY += 1) {
      const tileX = depth - tileY;
      if (tileX < 0 || tileX >= roomWidth) continue;
      const index = tileY * roomWidth + tileX;
      const visualTile = Number(visualTiles[index]);
      if (!Number.isInteger(visualTile) || visualTile <= 0) continue;
      const logicalIndex = visualTile - 1;
      const sourceBaseX = tileOffsetX + (logicalIndex % logicalColumns) * renderTileWidth;
      const sourceBaseY = tileOffsetY + Math.floor(logicalIndex / logicalColumns) * renderTileHeight;
      const sourceTileBaseX = Math.floor(sourceBaseX / 8);
      const sourceTileBaseY = Math.floor(sourceBaseY / 8);
      const centerX = grid.originX + (tileX - tileY) * halfWidth;
      const centerY = grid.originY + (tileX + tileY) * halfHeight + renderOffsetY
        - Math.max(0, Math.floor(Number(heightLevels[index]) || 0)) * grid.heightStep;
      const targetBaseX = hasCamera ? 0 : centerX - renderTileWidth / 2 - bounds.x;
      const targetBaseY = hasCamera ? 0 : centerY - bounds.y;
      const subtilesWide = renderTileWidth / 8;
      const subtilesHigh = renderTileHeight / 8;
      for (let sourceSubtileY = 0; sourceSubtileY < subtilesHigh; sourceSubtileY += 1) {
        const sourceTileY = sourceTileBaseY + sourceSubtileY;
        for (let sourceSubtileX = 0; sourceSubtileX < subtilesWide; sourceSubtileX += 1) {
          const sourceTileX = sourceTileBaseX + sourceSubtileX;
          if (hasSourceTilemapEntries && (sourceTileX < 0 || sourceTileX >= sourceTileEntriesWidth || sourceTileY < 0 || sourceTileY >= sourceTileMapHeight)) {
            continue;
          }
          let sourceTileAtlasX = sourceTileX;
          let sourceTileAtlasY = sourceTileY;
          let flipX = false;
          let flipY = false;
          if (hasSourceTilemapEntries) {
            const sourceTileOffset = sourceTileY * sourceTileEntriesWidth + sourceTileX;
            if (sourceTileOffset >= sourceTilemapEntries.length) {
              continue;
            }
            const sourceTileRaw = Number(sourceTilemapEntries[sourceTileOffset]);
            const sourceTileIndex = sourceTileRaw & 0x03ff;
            if (!Number.isInteger(sourceTileRaw) || sourceTileRaw === 0 || sourceTileIndex === 0) {
              continue;
            }
            const localTileIndex = sourceTileIndex - sourceTileDestination;
            if (localTileIndex < 0) {
              continue;
            }
            sourceTileAtlasX = localTileIndex % sourceTilesPerRow;
            sourceTileAtlasY = Math.floor(localTileIndex / sourceTilesPerRow);
            flipX = (sourceTileRaw & 0x0400) !== 0;
            flipY = (sourceTileRaw & 0x0800) !== 0;
            if (sourceTileAtlasX < 0 || sourceTileAtlasX >= sourceSubtileColumns
              || sourceTileAtlasY < 0 || sourceTileAtlasY >= sourceSubtileRows) {
              continue;
            }
          }
          if (sourceTileAtlasX < 0 || sourceTileAtlasY < 0
            || sourceTileAtlasX >= sourceSubtileColumns || sourceTileAtlasY >= sourceSubtileRows) {
            continue;
          }
          for (let sourceY = 0; sourceY < 8; sourceY += 1) {
            const localY = flipY ? 7 - sourceY : sourceY;
            const sheetY = sourceTileAtlasY * 8 + localY;
            if (sheetY < 0 || sheetY >= sourceHeight) continue;
            for (let sourceX = 0; sourceX < 8; sourceX += 1) {
              const localX = flipX ? 7 - sourceX : sourceX;
              const sheetX = sourceTileAtlasX * 8 + localX;
              if (sheetX < 0 || sheetX >= sourceWidth) continue;
              const sourceOffset = ((sheetY * sourceWidth) + sheetX) * 4;
              if (sourceOffset < 0 || sourceOffset + 3 >= sourcePixels.length) continue;
              if (sourcePixels[sourceOffset + 3] === 0) continue;
              const sourceColor = decodeRgb555(rgb888ToRgb555(
                sourcePixels[sourceOffset],
                sourcePixels[sourceOffset + 1],
                sourcePixels[sourceOffset + 2]
              ));
              let targetX = targetBaseX + sourceSubtileX * 8 + sourceX;
              let targetY = targetBaseY + sourceSubtileY * 8 + sourceY;
              if (unscaled && hasCamera) {
                const start = isometricCameraWorldToScreen(
                  centerX - renderTileWidth / 2 + sourceSubtileX * 8 + sourceX,
                  centerY + sourceSubtileY * 8 + sourceY,
                  camera
                );
                targetX = start.x;
                targetY = start.y;
              } else if (!unscaled && hasCamera) {
                const start = isometricCameraWorldToScreen(
                  centerX - renderTileWidth / 2 + sourceSubtileX * 8 + sourceX,
                  centerY + sourceSubtileY * 8 + sourceY,
                  camera
                );
                const end = isometricCameraWorldToScreen(
                  centerX - renderTileWidth / 2 + sourceSubtileX * 8 + sourceX + 1,
                  centerY + sourceSubtileY * 8 + sourceY + 1,
                  camera
                );
                if (end.x <= 0 || end.y <= 0 || start.x >= bounds.width || start.y >= bounds.height) {
                  continue;
                }
                for (let scaledY = start.y; scaledY < end.y; scaledY += 1) {
                  for (let scaledX = start.x; scaledX < end.x; scaledX += 1) {
                    const scaledIndex = ((scaledY * bounds.width) + scaledX) * 4;
                    if (scaledX < 0 || scaledY < 0 || scaledX >= bounds.width || scaledY >= bounds.height) continue;
                    pixels.set([...sourceColor, 255], scaledIndex);
                  }
                }
                continue;
              }
              if (targetX < 0 || targetX >= bounds.width || targetY < 0 || targetY >= bounds.height) continue;
              const targetOffset = ((targetY * bounds.width) + targetX) * 4;
              pixels.set([...sourceColor, 255], targetOffset);
            }
          }
        }
      }
    }
  }
  return { bounds: { ...bounds }, height: bounds.height, pixels, width: bounds.width };
}

export function auditRgbaAgainstExportedTilemap(options) {
  const headerSource = options?.headerSource;
  const symbol = options?.symbol;
  const width = Number(options?.width);
  const height = Number(options?.height);
  const pixels = options?.pixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width % 8 !== 0 || height % 8 !== 0) {
    throw new Error("Dimensoes do PNG precisam ser multiplos positivos de 8.");
  }
  if (!(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
    throw new Error("Pixels RGBA nao correspondem as dimensoes informadas.");
  }

  const palette = parseExportedRgb555Palette(headerSource, symbol);
  const paletteAsset = parseExportedPaletteAssetMetadata(headerSource, symbol);
  const referencePaletteColors = normalizeReferencePaletteColors(options?.referencePaletteColors);
  const tileBytes = parseExportedNumericArray(headerSource, symbol, "tiles", "uint8_t");
  const tilemapEntries = parseExportedNumericArray(headerSource, symbol, "tilemap_entries", "uint16_t");
  const { bitsPerPixel, destinationTile } = parseExportedBackgroundTileAsset(headerSource, symbol);
  const bytesPerTile = bitsPerPixel === 8 ? 64 : 32;
  const widthTiles = width / 8;
  const heightTiles = height / 8;
  if (tilemapEntries.length !== widthTiles * heightTiles) {
    throw new Error(`Tilemap ${symbol} tem ${tilemapEntries.length} entrada(s), esperado ${widthTiles * heightTiles}.`);
  }

  let mismatchCount = 0;
  let firstMismatch = null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const entry = tilemapEntries[(Math.floor(y / 8) * widthTiles) + Math.floor(x / 8)];
      const tileIndex = (bitsPerPixel === 8 ? entry : entry & 0x03FF) - destinationTile;
      const tileX = bitsPerPixel === 4 && (entry & 0x0400) !== 0 ? 7 - (x % 8) : x % 8;
      const tileY = bitsPerPixel === 4 && (entry & 0x0800) !== 0 ? 7 - (y % 8) : y % 8;
      const tileOffset = tileIndex * bytesPerTile;
      if (tileIndex < 0 || tileOffset + bytesPerTile - 1 >= tileBytes.length) {
        throw new Error(`Tilemap ${symbol} referencia tile invalido ${tileIndex + destinationTile}.`);
      }
      const packed = tileBytes[tileOffset + (bitsPerPixel === 8 ? tileY * 8 + tileX : (tileY * 4) + Math.floor(tileX / 2))];
      const localPaletteIndex = bitsPerPixel === 8
        ? packed
        : tileX % 2 === 0 ? packed & 0x0F : (packed >> 4) & 0x0F;
      const paletteIndex = resolveExportedPaletteArrayIndex(
        entry,
        localPaletteIndex,
        palette,
        paletteAsset,
        bitsPerPixel
      );
      const exportedRgb555 = palette[paletteIndex];
      if (exportedRgb555 === undefined) {
        throw new Error(`Tilemap ${symbol} usa indice de paleta invalido ${paletteIndex}.`);
      }
      const sourceOffset = ((y * width) + x) * 4;
      if (pixels[sourceOffset + 3] === 0) continue;
      const sourceRgb = referencePaletteColors
        ? nearestReferencePaletteColor(
          [pixels[sourceOffset], pixels[sourceOffset + 1], pixels[sourceOffset + 2]],
          referencePaletteColors
        )
        : [pixels[sourceOffset], pixels[sourceOffset + 1], pixels[sourceOffset + 2]];
      const sourceRgb555 = rgb888ToRgb555(sourceRgb[0], sourceRgb[1], sourceRgb[2]);
      if (sourceRgb555 !== exportedRgb555) {
        mismatchCount += 1;
        firstMismatch ??= { exportedRgb555, sourceRgb555, x, y };
      }
    }
  }
  const pixelCount = width * height;
  const referenceRgb555 = referencePaletteColors?.map((color) => rgb888ToRgb555(color[0], color[1], color[2])) ?? [];
  const referencePaletteMatchesExport = referenceRgb555.length > 0
    && referenceRgb555.every((value, index) => palette[index] === value);
  return {
    bitsPerPixel,
    firstMismatch,
    mismatchCount,
    mismatchRatio: mismatchCount / pixelCount,
    ok: referencePaletteColors ? referencePaletteMatchesExport : mismatchCount === 0,
    pixelCount
  };
}

function normalizeReferencePaletteColors(colors) {
  if (!Array.isArray(colors) || colors.length === 0) return null;
  const normalized = colors
    .filter((color) => Array.isArray(color) && color.length === 3)
    .map((color) => color.map((channel) => Number(channel)));
  return normalized.length > 0
    && normalized.every((color) => color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255))
    ? normalized
    : null;
}

function nearestReferencePaletteColor(color, palette) {
  return palette.reduce((best, candidate, index) => {
    const error = 2 * ((color[0] - candidate[0]) ** 2)
      + 4 * ((color[1] - candidate[1]) ** 2)
      + ((color[2] - candidate[2]) ** 2);
    if (!best || error < best.error || (error === best.error && index < best.index)) {
      return { color: candidate, error, index };
    }
    return best;
  }, null)?.color ?? color;
}

export function remapRgbaToPaletteReference(options) {
  const pixels = options?.pixels;
  const width = Number(options?.width);
  const height = Number(options?.height);
  const palette = normalizeReferencePaletteColors(options?.referencePaletteColors);
  if (!(pixels instanceof Uint8Array) || !Number.isInteger(width) || !Number.isInteger(height)
    || width <= 0 || height <= 0 || pixels.length !== width * height * 4 || !palette) {
    throw new Error("Pixels e paleta de referencia validos sao obrigatorios para remapeamento RGB555.");
  }
  const remapped = new Uint8Array(pixels);
  const displayPalette = palette.map((color) => {
    const rgb555 = rgb888ToRgb555(color[0], color[1], color[2]);
    return decodeRgb555(rgb555);
  });
  for (let offset = 0; offset < remapped.length; offset += 4) {
    if (remapped[offset + 3] === 0) continue;
    const color = nearestReferencePaletteColor(
      [remapped[offset], remapped[offset + 1], remapped[offset + 2]],
      displayPalette
    );
    remapped[offset] = color[0];
    remapped[offset + 1] = color[1];
    remapped[offset + 2] = color[2];
  }
  return { height, pixels: remapped, width };
}

function parseExportedSpriteDestinationTile(headerSource, symbol, frameIndex = null) {
  const frameAssetName = Number.isInteger(frameIndex)
    ? `${symbol}_frame_${frameIndex}_tile_asset`
    : null;
  const assetName = frameAssetName && headerSource.includes(frameAssetName)
    ? frameAssetName
    : `${symbol}_tile_asset`;
  const destinationPattern = new RegExp(
    `TileAsset\\s+${escapedRegExp(assetName)}\\s*=\\s*\\{[\\s\\S]*?,\\s*(?:[A-Za-z0-9_]+|\\d+)\\s*,\\s*(0x[0-9a-f]+|\\d+)`,
    "mi"
  );
  const match = headerSource.match(destinationPattern);
  if (!match) throw new Error(`Destino dos tiles OBJ nao encontrado para ${symbol}.`);
  return Number.parseInt(match[1], 0);
}

function parseExportedSpriteFrameParts(headerSource, symbol, frameIndex) {
  const pattern = new RegExp(
    `constexpr\\s+gbs::MetaSpritePart\\s+${escapedRegExp(symbol)}_frame_${frameIndex}_parts\\s*\\[[^\\]]+\\]\\s*=\\s*\\{([\\s\\S]*?)\\};`,
    "m"
  );
  const match = headerSource.match(pattern);
  if (!match) throw new Error(`Partes do frame ${frameIndex} nao encontradas para ${symbol}.`);
  const parts = [...match[1].matchAll(
    /\{\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}/g
  )].map((entry) => ({
    height: Number(entry[8]),
    hflip: entry[5] === "true",
    palette: Number(entry[4]),
    tileIndex: Number(entry[3]),
    vflip: entry[6] === "true",
    width: Number(entry[7]),
    x: Number(entry[1]),
    y: Number(entry[2])
  }));
  if (parts.length === 0) throw new Error(`Frame ${frameIndex} de ${symbol} nao possui partes OBJ validas.`);
  return parts;
}

export function auditRgbaAgainstExportedSpriteFrame(options) {
  const headerSource = options?.headerSource;
  const symbol = options?.symbol;
  const frameIndex = Number(options?.frameIndex ?? 0);
  const frameWidth = Number(options?.frameWidth);
  const frameHeight = Number(options?.frameHeight);
  const sheetWidth = Number(options?.sheetWidth);
  const pixels = options?.pixels;
  const sourceX = Number(options?.sourceX ?? (frameIndex * frameWidth));
  const sourceY = Number(options?.sourceY ?? 0);
  const transparentPaletteIndex = Number(options?.transparentPaletteIndex ?? 0);
  const allowPaletteRemap = options?.allowPaletteRemap === true;
  if (typeof headerSource !== "string" || typeof symbol !== "string" || symbol.length === 0) {
    throw new Error("Fonte e simbolo OBJ sao obrigatorios.");
  }
  if (![frameIndex, frameWidth, frameHeight, sheetWidth, sourceX, sourceY].every(Number.isInteger)
    || frameIndex < 0 || frameWidth <= 0 || frameHeight <= 0 || sheetWidth <= 0
    || frameWidth % 8 !== 0 || frameHeight % 8 !== 0 || sourceX < 0 || sourceY < 0) {
    throw new Error("Geometria do frame OBJ precisa usar inteiros positivos alinhados a 8 pixels.");
  }
  if (!Number.isInteger(transparentPaletteIndex) || transparentPaletteIndex < 0 || transparentPaletteIndex > 15) {
    throw new Error("Indice transparente do OBJ precisa estar entre 0 e 15.");
  }
  if (!(pixels instanceof Uint8Array) || pixels.length % (sheetWidth * 4) !== 0) {
    throw new Error("Pixels RGBA nao correspondem a largura da spritesheet.");
  }
  const sheetHeight = pixels.length / (sheetWidth * 4);
  if (sourceX + frameWidth > sheetWidth || sourceY + frameHeight > sheetHeight) {
    throw new Error("Frame solicitado ultrapassa a spritesheet RGBA.");
  }

  const palette = parseExportedRgb555Palette(headerSource, symbol);
  const frameTileSuffix = `frame_${frameIndex}_tiles`;
  const tileBytes = headerSource.includes(`${symbol}_${frameTileSuffix}`)
    ? parseExportedNumericArray(headerSource, symbol, frameTileSuffix, "uint8_t")
    : parseExportedNumericArray(headerSource, symbol, "tiles", "uint8_t");
  const destinationTile = parseExportedSpriteDestinationTile(headerSource, symbol, frameIndex);
  const parts = parseExportedSpriteFrameParts(headerSource, symbol, frameIndex);
  const exportedIndexes = new Uint8Array(frameWidth * frameHeight);
  let clippedPixelCount = 0;
  for (const part of parts) {
    if (part.width <= 0 || part.height <= 0 || part.width % 8 !== 0 || part.height % 8 !== 0) {
      throw new Error(`Parte OBJ ${part.width}x${part.height} invalida em ${symbol}.`);
    }
    const baseTile = part.tileIndex - destinationTile;
    for (let partY = 0; partY < part.height; partY += 1) {
      for (let partX = 0; partX < part.width; partX += 1) {
        const destinationX = part.x + partX;
        const destinationY = part.y + partY;
        if (destinationX < 0 || destinationX >= frameWidth || destinationY < 0 || destinationY >= frameHeight) {
          clippedPixelCount += 1;
          continue;
        }
        const sampleX = part.hflip ? part.width - 1 - partX : partX;
        const sampleY = part.vflip ? part.height - 1 - partY : partY;
        const tileIndex = baseTile
          + (Math.floor(sampleY / 8) * (part.width / 8))
          + Math.floor(sampleX / 8);
        const tileOffset = tileIndex * 32;
        if (tileIndex < 0 || tileOffset + 31 >= tileBytes.length) {
          throw new Error(`Parte OBJ de ${symbol} referencia tile invalido ${tileIndex + destinationTile}.`);
        }
        const tileX = sampleX % 8;
        const tileY = sampleY % 8;
        const packed = tileBytes[tileOffset + (tileY * 4) + Math.floor(tileX / 2)];
        exportedIndexes[(destinationY * frameWidth) + destinationX] = tileX % 2 === 0
          ? packed & 0x0F
          : (packed >> 4) & 0x0F;
      }
    }
  }

  let alphaMismatchCount = 0;
  let colorMismatchCount = 0;
  let opaquePixelCount = 0;
  let partiallyTransparentPixelCount = 0;
  let firstAlphaMismatch = null;
  let firstColorMismatch = null;
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const sourceOffset = (((sourceY + y) * sheetWidth) + sourceX + x) * 4;
      const alpha = pixels[sourceOffset + 3];
      const paletteIndex = exportedIndexes[(y * frameWidth) + x];
      const sourceOpaque = alpha > 0;
      const exportedOpaque = paletteIndex !== transparentPaletteIndex;
      if (alpha > 0 && alpha < 255) partiallyTransparentPixelCount += 1;
      if (sourceOpaque) opaquePixelCount += 1;
      if (sourceOpaque !== exportedOpaque) {
        alphaMismatchCount += 1;
        firstAlphaMismatch ??= { alpha, paletteIndex, x, y };
        continue;
      }
      if (!sourceOpaque) continue;
      const sourceRgb555 = rgb888ToRgb555(pixels[sourceOffset], pixels[sourceOffset + 1], pixels[sourceOffset + 2]);
      const exportedRgb555 = palette[paletteIndex];
      if (exportedRgb555 === undefined || (!allowPaletteRemap && sourceRgb555 !== exportedRgb555)) {
        colorMismatchCount += 1;
        firstColorMismatch ??= { exportedRgb555: exportedRgb555 ?? null, paletteIndex, sourceRgb555, x, y };
      }
    }
  }
  return {
    alphaMismatchCount,
    clippedPixelCount,
    colorMismatchCount,
    destinationTile,
    firstAlphaMismatch,
    firstColorMismatch,
    frameIndex,
    ok: alphaMismatchCount === 0 && colorMismatchCount === 0 && clippedPixelCount === 0
      && partiallyTransparentPixelCount === 0,
    opaquePixelCount,
    palette,
    paletteRemapped: allowPaletteRemap,
    partiallyTransparentPixelCount,
    partCount: parts.length,
    pixelCount: frameWidth * frameHeight
  };
}

export function auditRgbaAgainstFramebufferWithMasks(options) {
  const sourcePixels = options?.sourcePixels;
  const width = Number(options?.width);
  const height = Number(options?.height);
  const sourceX = Number(options?.sourceX ?? 0);
  const sourceY = Number(options?.sourceY ?? 0);
  const framebuffer = options?.framebuffer;
  const framebufferWidth = Number(options?.framebufferWidth);
  const framebufferHeight = Number(options?.framebufferHeight);
  const compareWidth = Number(options?.compareWidth ?? Math.min(width, framebufferWidth));
  const compareHeight = Number(options?.compareHeight ?? Math.min(height, framebufferHeight));
  const masks = Array.isArray(options?.masks) ? options.masks : [];
  if (![width, height, sourceX, sourceY, framebufferWidth, framebufferHeight, compareWidth, compareHeight]
    .every(Number.isInteger)
    || width <= 0 || height <= 0 || framebufferWidth <= 0 || framebufferHeight <= 0
    || sourceX < 0 || sourceY < 0 || compareWidth <= 0 || compareHeight <= 0
    || sourceX + compareWidth > width || sourceY + compareHeight > height
    || compareWidth > framebufferWidth || compareHeight > framebufferHeight) {
    throw new Error("Dimensoes inteiras validas de fonte e framebuffer sao obrigatorias.");
  }
  if (!(sourcePixels instanceof Uint8Array) || sourcePixels.length !== width * height * 4) {
    throw new Error("Pixels RGBA da fonte nao correspondem as dimensoes informadas.");
  }
  if (!(framebuffer instanceof Uint8Array) || framebuffer.length !== framebufferWidth * framebufferHeight * 4) {
    throw new Error("Pixels RGBA do framebuffer nao correspondem as dimensoes informadas.");
  }
  const normalizedMasks = masks.map((mask) => {
    const normalized = {
      height: Number(mask?.height),
      width: Number(mask?.width),
      x: Number(mask?.x),
      y: Number(mask?.y)
    };
    if (!Object.values(normalized).every(Number.isInteger)
      || normalized.width < 0 || normalized.height < 0) {
      throw new Error("Mascaras do framebuffer precisam usar geometria inteira nao negativa.");
    }
    return normalized;
  });

  let comparedPixelCount = 0;
  let maskedPixelCount = 0;
  let mismatchCount = 0;
  let transparentPixelCount = 0;
  let firstMismatch = null;
  let mismatchBounds = null;
  const mismatchSamples = [];
  for (let y = 0; y < compareHeight; y += 1) {
    for (let x = 0; x < compareWidth; x += 1) {
      if (normalizedMasks.some((mask) => (
        x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height
      ))) {
        maskedPixelCount += 1;
        continue;
      }
      const offset = (((sourceY + y) * width) + sourceX + x) * 4;
      if (sourcePixels[offset + 3] === 0) {
        transparentPixelCount += 1;
        continue;
      }
      comparedPixelCount += 1;
      const expectedRgb555 = rgb888ToRgb555(
        sourcePixels[offset],
        sourcePixels[offset + 1],
        sourcePixels[offset + 2]
      );
      const expectedRgb = decodeRgb555(expectedRgb555);
      const framebufferOffset = ((y * framebufferWidth) + x) * 4;
      const actualRgb = [
        framebuffer[framebufferOffset],
        framebuffer[framebufferOffset + 1],
        framebuffer[framebufferOffset + 2]
      ];
      if (actualRgb.some((channel, index) => channel !== expectedRgb[index])) {
        mismatchCount += 1;
        const mismatch = { actualRgb, expectedRgb, expectedRgb555, x, y };
        firstMismatch ??= mismatch;
        if (mismatchSamples.length < 32) mismatchSamples.push(mismatch);
        mismatchBounds = mismatchBounds === null
          ? { maxX: x, maxY: y, minX: x, minY: y }
          : {
            maxX: Math.max(mismatchBounds.maxX, x),
            maxY: Math.max(mismatchBounds.maxY, y),
            minX: Math.min(mismatchBounds.minX, x),
            minY: Math.min(mismatchBounds.minY, y)
          };
      }
    }
  }
  return {
    comparedPixelCount,
    firstMismatch,
    maskedPixelCount,
    mismatchBounds,
    mismatchCount,
    mismatchRatio: comparedPixelCount > 0 ? mismatchCount / comparedPixelCount : 1,
    ok: comparedPixelCount > 0 && mismatchCount === 0,
    source: { x: sourceX, y: sourceY },
    mismatchSamples,
    transparentPixelCount
  };
}

export function auditAlphaBlendedRgbaAgainstFramebuffer(options) {
  const width = Number(options?.width);
  const height = Number(options?.height);
  const backgroundPixels = options?.backgroundPixels;
  const overlayPixels = options?.overlayPixels;
  const allowedAlpha = [...new Set(
    (Array.isArray(options?.allowedAlpha) ? options.allowedAlpha : [])
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 16)
  )];
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Dimensoes inteiras validas dos backgrounds sao obrigatorias.");
  }
  if (!(backgroundPixels instanceof Uint8Array) || backgroundPixels.length !== width * height * 4
    || !(overlayPixels instanceof Uint8Array) || overlayPixels.length !== width * height * 4) {
    throw new Error("Os dois backgrounds precisam fornecer pixels RGBA completos.");
  }
  if (allowedAlpha.length === 0) {
    throw new Error("Ao menos um coeficiente alpha GBA entre 1 e 16 e obrigatorio.");
  }
  const framebuffer = options?.framebuffer;
  const framebufferWidth = Number(options?.framebufferWidth);
  const framebufferHeight = Number(options?.framebufferHeight);
  if (!Number.isInteger(framebufferWidth) || !Number.isInteger(framebufferHeight)
    || framebufferWidth < width || framebufferHeight < height
    || !(framebuffer instanceof Uint8Array)
    || framebuffer.length !== framebufferWidth * framebufferHeight * 4) {
    throw new Error("Framebuffer RGBA completo e compativel com os backgrounds e obrigatorio.");
  }
  const masks = (Array.isArray(options?.masks) ? options.masks : []).map((mask) => {
    const normalized = {
      height: Number(mask?.height),
      width: Number(mask?.width),
      x: Number(mask?.x),
      y: Number(mask?.y)
    };
    if (!Object.values(normalized).every(Number.isInteger)
      || normalized.width < 0 || normalized.height < 0) {
      throw new Error("Mascaras da composicao alpha precisam usar geometria inteira nao negativa.");
    }
    return normalized;
  });

  let opaqueOverlayPixelCount = 0;
  const candidates = allowedAlpha.map((alpha) => {
    const composedPixels = new Uint8Array(width * height * 4);
    let candidateOpaqueOverlayPixelCount = 0;
    for (let offset = 0; offset < composedPixels.length; offset += 4) {
      const backgroundRgb = decodeRgb555(rgb888ToRgb555(
        backgroundPixels[offset],
        backgroundPixels[offset + 1],
        backgroundPixels[offset + 2]
      ));
      const overlayOpaque = overlayPixels[offset + 3] > 0;
      const overlayRgb = overlayOpaque
        ? decodeRgb555(rgb888ToRgb555(
          overlayPixels[offset],
          overlayPixels[offset + 1],
          overlayPixels[offset + 2]
        ))
        : backgroundRgb;
      if (overlayOpaque) candidateOpaqueOverlayPixelCount += 1;
      for (let channel = 0; channel < 3; channel += 1) {
        composedPixels[offset + channel] = overlayOpaque && alpha < 16
          ? Math.min(255, Math.floor(
            ((overlayRgb[channel] * alpha) + (backgroundRgb[channel] * (16 - alpha))) / 16
          ))
          : overlayRgb[channel];
      }
      composedPixels[offset + 3] = 255;
    }
    opaqueOverlayPixelCount = candidateOpaqueOverlayPixelCount;
    let comparedPixelCount = 0;
    let maskedPixelCount = 0;
    let mismatchCount = 0;
    let firstMismatch = null;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (masks.some((mask) => (
          x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height
        ))) {
          maskedPixelCount += 1;
          continue;
        }
        comparedPixelCount += 1;
        const expectedOffset = ((y * width) + x) * 4;
        const actualOffset = ((y * framebufferWidth) + x) * 4;
        const expectedRgb = Array.from(composedPixels.subarray(expectedOffset, expectedOffset + 3));
        const actualRgb = Array.from(framebuffer.subarray(actualOffset, actualOffset + 3));
        if (actualRgb.some((channel, index) => channel !== expectedRgb[index])) {
          mismatchCount += 1;
          firstMismatch ??= { actualRgb, expectedRgb, x, y };
        }
      }
    }
    return {
      alpha,
      comparedPixelCount,
      firstMismatch,
      maskedPixelCount,
      mismatchCount,
      mismatchRatio: comparedPixelCount > 0 ? mismatchCount / comparedPixelCount : 1,
      ok: comparedPixelCount > 0 && mismatchCount === 0
    };
  });
  const best = candidates.reduce((current, candidate) => (
    current === null || candidate.mismatchCount < current.mismatchCount ? candidate : current
  ), null);
  return {
    ...best,
    allowedAlpha,
    audited: true,
    candidates: candidates.map((candidate) => ({
      alpha: candidate.alpha,
      mismatchCount: candidate.mismatchCount,
      mismatchRatio: candidate.mismatchRatio,
      ok: candidate.ok
    })),
    opaqueOverlayPixelCount
  };
}

export function findBestRgbaFramebufferCropWithMasks(options) {
  const width = Number(options?.width);
  const height = Number(options?.height);
  const compareWidth = Number(options?.compareWidth);
  const compareHeight = Number(options?.compareHeight);
  const maxSourceX = Math.min(Number(options?.maxSourceX), width - compareWidth);
  const maxSourceY = Math.min(Number(options?.maxSourceY), height - compareHeight);
  if (![width, height, compareWidth, compareHeight, maxSourceX, maxSourceY].every(Number.isInteger)
    || compareWidth <= 0 || compareHeight <= 0 || maxSourceX < 0 || maxSourceY < 0) {
    throw new Error("Limites inteiros validos da busca de camera sao obrigatorios.");
  }

  let best = null;
  let candidateCount = 0;
  for (let sourceY = 0; sourceY <= maxSourceY; sourceY += 1) {
    for (let sourceX = 0; sourceX <= maxSourceX; sourceX += 1) {
      const candidate = auditRgbaAgainstFramebufferWithMasks({
        ...options,
        sourceX,
        sourceY
      });
      candidateCount += 1;
      if (best === null || candidate.mismatchCount < best.mismatchCount) {
        best = candidate;
      }
      if (candidate.ok) {
        return { ...candidate, candidateCount };
      }
    }
  }
  return { ...best, candidateCount };
}

export function auditOpaqueRgbaAgainstFramebufferRegion(options) {
  const sourcePixels = options?.sourcePixels;
  const sourceSheetWidth = Number(options?.sourceSheetWidth);
  const sourceX = Number(options?.sourceX ?? 0);
  const sourceY = Number(options?.sourceY ?? 0);
  const frameWidth = Number(options?.frameWidth);
  const frameHeight = Number(options?.frameHeight);
  const framebuffer = options?.framebuffer;
  const framebufferWidth = Number(options?.framebufferWidth);
  const framebufferHeight = Number(options?.framebufferHeight);
  const targetX = Number(options?.targetX);
  const targetY = Number(options?.targetY);
  const flipX = options?.flipX === true;
  const flipY = options?.flipY === true;
  const allowedOcclusionRgb555 = new Set(
    (Array.isArray(options?.allowedOcclusionRgb555) ? options.allowedOcclusionRgb555 : [])
      .map((value) => Number(value) & 0x7FFF)
  );
  const allowedOcclusionPixels = options?.allowedOcclusionPixels instanceof Set
    ? options.allowedOcclusionPixels
    : null;
  if (![sourceSheetWidth, sourceX, sourceY, frameWidth, frameHeight, framebufferWidth, framebufferHeight, targetX, targetY]
    .every(Number.isInteger)
    || sourceSheetWidth <= 0 || frameWidth <= 0 || frameHeight <= 0
    || framebufferWidth <= 0 || framebufferHeight <= 0 || sourceX < 0 || sourceY < 0) {
    throw new Error("Geometria inteira de fonte e framebuffer e obrigatoria.");
  }
  if (!(sourcePixels instanceof Uint8Array) || sourcePixels.length % (sourceSheetWidth * 4) !== 0) {
    throw new Error("Pixels RGBA da fonte sao invalidos.");
  }
  if (!(framebuffer instanceof Uint8Array) || framebuffer.length !== framebufferWidth * framebufferHeight * 4) {
    throw new Error("Pixels RGBA do framebuffer sao invalidos.");
  }
  const sourceSheetHeight = sourcePixels.length / (sourceSheetWidth * 4);
  if (sourceX + frameWidth > sourceSheetWidth || sourceY + frameHeight > sourceSheetHeight) {
    throw new Error("Frame solicitado ultrapassa a fonte RGBA.");
  }

  let comparedPixelCount = 0;
  let mismatchCount = 0;
  let occludedPixelCount = 0;
  let firstMismatch = null;
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const sourceOffset = (((sourceY + y) * sourceSheetWidth) + sourceX + x) * 4;
      if (sourcePixels[sourceOffset + 3] === 0) continue;
      const destinationX = targetX + (flipX ? frameWidth - 1 - x : x);
      const destinationY = targetY + (flipY ? frameHeight - 1 - y : y);
      const inBounds = destinationX >= 0 && destinationX < framebufferWidth
        && destinationY >= 0 && destinationY < framebufferHeight;
      if (!inBounds) continue;
      const expectedRgb555 = rgb888ToRgb555(
        sourcePixels[sourceOffset],
        sourcePixels[sourceOffset + 1],
        sourcePixels[sourceOffset + 2]
      );
      const expectedRgb = decodeRgb555(expectedRgb555);
      const framebufferOffset = ((destinationY * framebufferWidth) + destinationX) * 4;
      const actualRgb = [framebuffer[framebufferOffset], framebuffer[framebufferOffset + 1], framebuffer[framebufferOffset + 2]];
      const mismatches = actualRgb.some((channel, index) => channel !== expectedRgb[index]);
      if (mismatches && (allowedOcclusionRgb555.has(rgb888ToRgb555(...actualRgb))
        || allowedOcclusionPixels?.has(`${destinationY * framebufferWidth + destinationX}:${actualRgb.join(",")}`))) {
        occludedPixelCount += 1;
        continue;
      }
      comparedPixelCount += 1;
      if (mismatches) {
        mismatchCount += 1;
        firstMismatch ??= { actualRgb, expectedRgb, expectedRgb555, source: { x, y }, target: { x: destinationX, y: destinationY } };
      }
    }
  }
  return {
    comparedPixelCount,
    firstMismatch,
    mismatchCount,
    mismatchRatio: comparedPixelCount > 0 ? mismatchCount / comparedPixelCount : 1,
    occludedPixelCount,
    ok: comparedPixelCount > 0 && mismatchCount === 0,
    target: { x: targetX, y: targetY }
  };
}

export function findBestOpaqueRgbaFramebufferFrame(options) {
  const candidateSourceXs = Array.isArray(options?.candidateSourceXs)
    ? options.candidateSourceXs.map(Number)
    : [];
  const candidateTargets = Array.isArray(options?.candidateTargets)
    ? options.candidateTargets
    : [];
  const candidateFlipsX = Array.isArray(options?.candidateFlipsX)
    ? options.candidateFlipsX.map(Boolean)
    : [false];
  const minimumComparedPixelCount = Math.max(
    0,
    Number.isInteger(Number(options?.minimumComparedPixelCount))
      ? Number(options.minimumComparedPixelCount)
      : 0
  );
  if (candidateSourceXs.length === 0 || candidateTargets.length === 0 || candidateFlipsX.length === 0) {
    throw new Error("Frames, alvos e orientacoes candidatas sao obrigatorios.");
  }

  let best = null;
  let fallback = null;
  let candidateCount = 0;
  for (const target of candidateTargets) {
    for (const sourceX of candidateSourceXs) {
      for (const flipX of candidateFlipsX) {
        const candidate = auditOpaqueRgbaAgainstFramebufferRegion({
          ...options,
          flipX,
          sourceX,
          targetX: Number(target?.x),
          targetY: Number(target?.y)
        });
        candidateCount += 1;
        const result = { ...candidate, flipX, sourceX };
        const fallbackRank = [result.mismatchCount, -result.comparedPixelCount];
        const currentFallbackRank = fallback === null
          ? null
          : [fallback.mismatchCount, -fallback.comparedPixelCount];
        if (fallback === null || fallbackRank.some((value, index) => (
          value < currentFallbackRank[index]
          && fallbackRank.slice(0, index).every((prefix, prefixIndex) => (
            prefix === currentFallbackRank[prefixIndex]
          ))
        ))) {
          fallback = result;
        }
        if (result.comparedPixelCount < minimumComparedPixelCount) continue;
        const resultRank = [
          result.ok ? 0 : result.comparedPixelCount > 0 ? 1 : 2,
          result.mismatchCount,
          -result.comparedPixelCount
        ];
        const bestRank = best === null ? null : [
          best.ok ? 0 : best.comparedPixelCount > 0 ? 1 : 2,
          best.mismatchCount,
          -best.comparedPixelCount
        ];
        if (best === null || resultRank.some((value, index) => (
          value < bestRank[index]
          && resultRank.slice(0, index).every((prefix, prefixIndex) => prefix === bestRank[prefixIndex])
        ))) {
          best = result;
        }
        if (result.ok) {
          return { ...result, candidateCount };
        }
      }
    }
  }
  return { ...(best ?? fallback), candidateCount };
}

export function auditRgb555FramebufferColor(options) {
  const expectedRgb555 = Number(options?.expectedRgb555) & 0x7FFF;
  const expectedRgb = decodeRgb555(expectedRgb555);
  const pixelCount = Number(options?.framebufferPixelCount);
  const minimumPixelRatio = Math.max(0, Number(options?.minimumPixelRatio ?? 0));
  const histogram = Array.isArray(options?.colorHistogram) ? options.colorHistogram : [];
  const actualCount = histogram.reduce((total, entry) => {
    const rgb = Array.isArray(entry?.rgb) ? entry.rgb.map(Number) : [];
    return rgb.length === 3 && rgb.every((channel, index) => channel === expectedRgb[index])
      ? total + Math.max(0, Number(entry?.count) || 0)
      : total;
  }, 0);
  const actualRatio = Number.isFinite(pixelCount) && pixelCount > 0 ? actualCount / pixelCount : 0;
  return {
    actualCount,
    actualRatio,
    expectedRgb,
    expectedRgb555,
    minimumPixelRatio,
    ok: actualRatio >= minimumPixelRatio
  };
}

export function auditRgb555FramebufferColors(options) {
  const expectedRgb555 = Array.isArray(options?.expectedRgb555)
    ? [...new Set(options.expectedRgb555.map((value) => Number(value) & 0x7FFF))]
    : [];
  const expectedColors = new Set(expectedRgb555.map((value) => decodeRgb555(value).join(",")));
  const pixelCount = Number(options?.framebufferPixelCount);
  const minimumPixelRatio = Math.max(0, Number(options?.minimumPixelRatio ?? 0));
  const histogram = Array.isArray(options?.colorHistogram) ? options.colorHistogram : [];
  const actualCount = histogram.reduce((total, entry) => {
    const rgb = Array.isArray(entry?.rgb) ? entry.rgb.map(Number) : [];
    return rgb.length === 3 && expectedColors.has(rgb.join(","))
      ? total + Math.max(0, Number(entry?.count) || 0)
      : total;
  }, 0);
  const actualRatio = Number.isFinite(pixelCount) && pixelCount > 0 ? actualCount / pixelCount : 0;
  return {
    actualCount,
    actualRatio,
    expectedRgb: expectedRgb555.map(decodeRgb555),
    expectedRgb555,
    minimumPixelRatio,
    ok: actualRatio >= minimumPixelRatio
  };
}

export function auditRgb555FramebufferPalette(options) {
  const expectedRgb555 = Array.isArray(options?.expectedRgb555)
    ? [...new Set(options.expectedRgb555.map((value) => Number(value) & 0x7FFF))]
    : [];
  const expectedColors = new Set(expectedRgb555.map((value) => decodeRgb555(value).join(",")));
  const pixelCount = Number(options?.framebufferPixelCount);
  const minimumPixelRatio = Math.max(0, Number(options?.minimumPixelRatio ?? 1));
  const histogram = Array.isArray(options?.colorHistogram) ? options.colorHistogram : [];
  const unexpectedColors = [];
  let actualCount = 0;
  for (const entry of histogram) {
    const rgb = Array.isArray(entry?.rgb) ? entry.rgb.map(Number) : [];
    const count = Math.max(0, Number(entry?.count) || 0);
    if (rgb.length === 3 && expectedColors.has(rgb.join(","))) {
      actualCount += count;
    } else if (count > 0) {
      unexpectedColors.push({ count, rgb });
    }
  }
  const actualRatio = Number.isFinite(pixelCount) && pixelCount > 0 ? actualCount / pixelCount : 0;
  return {
    actualCount,
    actualRatio,
    expectedColorCount: expectedColors.size,
    expectedRgb555,
    minimumPixelRatio,
    ok: actualRatio >= minimumPixelRatio,
    unexpectedColors
  };
}
