import { decodeRgb555 } from './rgb555-framebuffer-contract.mjs';

export function exportedHudFramebufferMasks(header, presetId) {
  const escaped = String(presetId).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const symbol = header.match(new RegExp(`\\{\\s*"${escaped}",\\s*"(?:advanced|standard)",\\s*(\\w+),\\s*\\d+\\s*\\}`))?.[1];
  if (!symbol) return [];
  const body = header.match(new RegExp(`HudLayoutComponent ${symbol}\\[\\] = \\{([\\s\\S]*?)\\};`))?.[1];
  if (!body) throw new Error(`Missing declared HUD components for ${presetId}`);
  const quoted = '"(?:[^"\\\\]|\\\\.)*"';
  const components = new RegExp(`\\{\\s*${quoted},\\s*${quoted},\\s*${quoted},\\s*${quoted},\\s*${quoted},\\s*(-?\\d+),\\s*(-?\\d+),\\s*(\\d+),\\s*(\\d+),\\s*\\d+,\\s*(true|false)`, 'g');
  return [...body.matchAll(components)].filter(match=>match[5]==='true').map(match=>({x:Number(match[1]),y:Number(match[2]),width:Number(match[3]),height:Number(match[4])}));
}

// mGBA 0.10.5 GBASerializedState (serialize.h). Fail closed on a layout
// change rather than interpreting arbitrary offsets as hardware evidence.
export function decodeMGBAHardwareVideoState(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 0x1000 || view.getUint32(0,true) !== 0x01000007) throw new Error('Unsupported mGBA video state layout');
  const word = offset => view.getUint16(offset,true);
  const sizes = [[[8,8],[16,16],[32,32],[64,64]],[[16,8],[32,8],[32,16],[64,32]],[[8,16],[8,32],[16,32],[32,64]]];
  const objects = [];
  for (let index=0;index<128;index++) {
    const offset=0xc00+index*8, a0=word(offset),a1=word(offset+2),a2=word(offset+4);
    if ((a0 & 0x300) === 0x200) continue;
    const size=sizes[a0>>14]?.[a1>>14];
    if (!size) throw new Error('Invalid native OAM shape');
    const affine=(a0&0x100)!==0, matrixIndex=(a1>>9)&31;
    const matrix = affine ? Object.fromEntries(['pa','pb','pc','pd'].map((key,i)=>[key,view.getInt16(0xc00+matrixIndex*32+6+i*8,true)])) : null;
    objects.push({index,x:(a1&511)>255?(a1&511)-512:a1&511,y:(a0&255)>159?(a0&255)-256:a0&255,
      width:size[0],height:size[1],tile:a2&1023,palette:a2>>12,priority:(a2>>10)&3,affine,matrix,
      flipX:!affine&&(a1&0x1000)!==0,flipY:!affine&&(a1&0x2000)!==0});
  }
  return {bg:[0,1,2,3].map(i=>({cnt:word(0x408+2*i),x:word(0x410+4*i),y:word(0x412+4*i)})),objects};
}

// Match an unambiguous single-part asset to its actual native OAM entry.
// This keeps actor fidelity tied to hardware position and orientation.
export function nativeSinglePartSpriteObject(header, symbol, nativeVideo) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frames = [...header.matchAll(new RegExp(`${escaped}_frame_\\d+_parts\\[1\\]\\s*=\\s*\\{\\s*\\{\\s*-?\\d+\\s*,\\s*-?\\d+\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)`, 'g'))];
  const objects = (nativeVideo?.objects ?? []).filter(object => !object.affine && frames.some(frame =>
    object.tile === Number(frame[1]) && object.palette === Number(frame[2])));
  return objects.length === 1 ? objects[0] : null;
}

// Coordinate and color must both match a declared overlay. A palette-wide
// allowance would conceal unrelated corrupted pixels of the same color.
export function framebufferOcclusionPixels(layers, {width = 240, height = 160} = {}) {
  const allowed = new Set();
  for (const {source, x = 0, y = 0} of layers) {
    for (let sy = 0; sy < source.height; sy++) for (let sx = 0; sx < source.width; sx++) {
      const dx = Math.floor(x) + sx, dy = Math.floor(y) + sy;
      const offset = (sy * source.width + sx) * 4;
      if (dx < 0 || dy < 0 || dx >= width || dy >= height || source.pixels[offset + 3] === 0) continue;
      const color = (source.pixels[offset] >> 3) | ((source.pixels[offset + 1] >> 3) << 5) | ((source.pixels[offset + 2] >> 3) << 10);
      allowed.add(`${dy * width + dx}:${decodeRgb555(color).join(',')}`);
    }
  }
  return allowed;
}

// Same 8.8 inverse matrix and integer sampling as racing_vehicle_sprite_transform.
export function transformRacingSpriteSheetRgba({source, frameWidth, frameHeight, heading, matrix = null}) {
  const sine = [0,98,181,237,256,237,181,98,0,-98,-181,-237,-256,-237,-181,-98];
  const angle = Number(heading) & 15, pa = matrix?.pa ?? sine[(angle + 4) & 15], pb = matrix?.pb ?? sine[angle];
  const pc = matrix?.pc ?? -pb, pd = matrix?.pd ?? pa;
  const pixels = new Uint8Array(source.width * source.height * 4);
  const centerX = frameWidth / 2, centerY = frameHeight / 2;
  for (let origin = 0; origin < source.width; origin += frameWidth) {
    for (let y = 0; y < frameHeight; y++) for (let x = 0; x < frameWidth; x++) {
      const sx = Math.floor((pa * (x - centerX) + pb * (y - centerY)) / 256) + centerX;
      const sy = Math.floor((pc * (x - centerX) + pd * (y - centerY)) / 256) + centerY;
      if (sx < 0 || sy < 0 || sx >= frameWidth || sy >= frameHeight) continue;
      pixels.set(source.pixels.subarray((sy * source.width + origin + sx) * 4, (sy * source.width + origin + sx) * 4 + 4), (y * source.width + origin + x) * 4);
    }
  }
  return {...source,pixels};
}
