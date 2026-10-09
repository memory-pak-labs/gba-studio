import { renderIsometricRoomRgba, decodeRgb555 } from './rgb555-framebuffer-contract.mjs';

// Paged rooms use a shared 8bpp palette and two baked maps. The ordinary
// asset headers are not the representation uploaded by this native path.
export function decodeNativeIsometricPagedComposition(header, room) {
  const name = String(room?.name ?? '').replace(/[^a-zA-Z0-9_]/g, '_');
  const symbol = `${name}_paged`;
  const definition = header.match(new RegExp(`IsoBakedComposition ${symbol} \\{\\s*${symbol}_tiles,\\s*(\\d+),\\s*${symbol}_background,\\s*${symbol}_foreground,\\s*(\\d+),\\s*(\\d+),\\s*\\{\\s*(-?\\d+),\\s*(-?\\d+)\\s*\\},\\s*&${symbol}_palette`));
  if (!definition) return null;
  const array = suffix => {
    const match = header.match(new RegExp(`${symbol}_${suffix}\\[\\] = \\{([^}]+)\\}`));
    if (!match) throw new Error(`Missing native paged ${suffix}`);
    return match[1].split(',').map(value => Number(value.trim())).filter(Number.isFinite);
  };
  const tileCount = Number(definition[1]);
  const widthTiles = Number(definition[2]), heightTiles = Number(definition[3]);
  const width = widthTiles * 8, height = heightTiles * 8;
  const tiles = array('tiles'), palette = array('palette_colors');
  if (widthTiles < 1 || heightTiles < 1 || tiles.length !== tileCount * 64 || palette.length > 256) {
    throw new Error('Invalid native paged dimensions or tile data');
  }
  const layer = (suffix, transparent) => {
    const map = array(suffix);
    if (map.length !== widthTiles * heightTiles) throw new Error('Invalid native paged map size');
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const tile = map[(y >> 3) * widthTiles + (x >> 3)];
      if (!Number.isInteger(tile) || tile < 0 || tile >= tileCount) throw new Error('Invalid native paged tile reference');
      const index = tiles[tile * 64 + (y & 7) * 8 + (x & 7)];
      if (!Number.isInteger(index) || index < 0 || index >= palette.length) throw new Error('Invalid native paged palette reference');
      pixels.set([...decodeRgb555(palette[index]), transparent && index === 0 ? 0 : 255], (y * width + x) * 4);
    }
    return {width, height, pixels};
  };
  return {background:layer('background',false), foreground:layer('foreground',true),
    origin:{x:Number(definition[4]),y:Number(definition[5])}};
}

// Audit the actual baked representation, not the unused legacy 4bpp atlas.
export function auditNativeIsometricComposition(header, room, source) {
  const name = room.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const definition = header.match(new RegExp(`IsoBakedComposition ${name}_baked \\{[^}]+\\{\\s*(-?\\d+),\\s*(-?\\d+)\\s*\\},\\s*&${name}_baked_palette`));
  if (!definition) return { audited: false, ok: false };
  const array = suffix => {
    const match = header.match(new RegExp(`${name}_baked_${suffix}\\[\\] = \\{([^}]+)\\}`));
    if (!match) throw new Error(`Missing native composition ${suffix}`);
    return match[1].split(',').map(value => Number(value.trim()));
  };
  const shape = definition[0].match(/_baked_foreground,\s*(\d+),\s*(\d+)/);
  if (!shape) throw new Error('Missing native composition dimensions');
  const width = Number(shape[1]) * 8, height = Number(shape[2]) * 8;
  const tiles = array('tiles'), palette = array('palette_colors');
  let comparedPixelCount = 0, mismatchCount = 0;
  for (const [suffix, visualTiles] of [['background', room.visual_tiles], ['foreground', room.background_layers.bg1]]) {
    const map = array(suffix);
    const expected = renderIsometricRoomRgba({
      sourcePixels: source.pixels, sourceWidth: source.width, sourceHeight: source.height,
      roomWidth: room.width_tiles, roomHeight: room.height_tiles, visualTiles,
      tileWidth: room.tileset_tile_width_pixels, tileHeight: room.tileset_tile_height_pixels,
      renderTileWidth: room.tileset_render_width_pixels, renderTileHeight: room.tileset_render_height_pixels,
      renderOffsetY: room.tileset_render_offset_y_pixels, heightLevels: room.height_levels,
      bounds: {x:Number(definition[1]),y:Number(definition[2]),width,height},
      grid: {originX:room.grid.origin.x,originY:room.grid.origin.y,heightStep:room.grid.height_step_pixels}
    });
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const index = tiles[map[(y>>3)*(width>>3)+(x>>3)]*64+(y&7)*8+(x&7)];
      const offset = (y*width+x)*4;
      const alpha = expected.pixels[offset+3] !== 0;
      comparedPixelCount++;
      if ((index !== 0) !== alpha || (alpha && decodeRgb555(palette[index]).some((value,channel) => value !== expected.pixels[offset+channel]))) mismatchCount++;
    }
  }
  return {audited:true,ok:mismatchCount===0,comparedPixelCount,mismatchCount};
}
