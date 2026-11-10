/** Small authored fixtures: no third-party music or samples. */
export function makeXmFixture(channels = 2, rows = 5): Uint8Array {
  const pattern = new Uint8Array(rows * channels * 5);
  pattern.set([49, 1, 0x40, 0x0f, 125]);
  pattern.set([97, 0, 0, 0, 0], (rows - 1) * channels * 5);
  const instrument = 336 + 9 + pattern.length, headerSize = 263, sampleSize = 128;
  const out = new Uint8Array(instrument + headerSize + 40 + sampleSize), v = new DataView(out.buffer);
  const text = (at: number, s: string) => out.set(new TextEncoder().encode(s), at);
  text(0, "Extended Module: "); text(17, "GBA authored XM"); out[37] = 26; text(38, "GBA Studio test");
  v.setUint16(58, 0x104, true); v.setUint32(60, 276, true); v.setUint16(64, 1, true);
  v.setUint16(68, channels, true); v.setUint16(70, 1, true); v.setUint16(72, 1, true); v.setUint16(74, 1, true); v.setUint16(76, 6, true); v.setUint16(78, 125, true);
  v.setUint32(336, 9, true); v.setUint16(341, rows, true); v.setUint16(343, pattern.length, true); out.set(pattern, 345);
  v.setUint32(instrument, headerSize, true); text(instrument + 4, "Authored sine"); v.setUint16(instrument + 27, 1, true); v.setUint32(instrument + 29, 40, true);
  const sample = instrument + headerSize; v.setUint32(sample, sampleSize, true); v.setUint32(sample + 8, sampleSize, true); out[sample + 12] = 64; out[sample + 14] = 1; out[sample + 15] = 128;
  let previous = 0; for (let i = 0; i < sampleSize; i++) { const value = Math.round(Math.sin(i * Math.PI / 16) * 80); out[sample + 40 + i] = (value - previous) & 255; previous = value; }
  return out;
}
export function makeItFixture(channel = 0, rows = 7): Uint8Array {
  const pattern = [0x80 | (channel + 1), 15, 60, 1, 48, 20, 125, 0,
    0x80 | (channel + 1), 0xf0, 0, ...Array(Math.max(0, rows - 3)).fill(0), 0x80 | (channel + 1), 1, 255, 0];
  const sample = 208, packed = sample + 80, pcm = packed + 8 + pattern.length;
  const out = new Uint8Array(pcm + 128), v = new DataView(out.buffer);
  const text = (at: number, s: string) => out.set(new TextEncoder().encode(s), at);
  text(0, "IMPM"); text(4, "GBA authored IT"); v.setUint16(32, 1, true); v.setUint16(36, 1, true); v.setUint16(38, 1, true); v.setUint16(40, 0x214, true); v.setUint16(42, 0x214, true); v.setUint16(44, 9, true);
  out[48] = 128; out[49] = 48; out[50] = 6; out[51] = 125; out[52] = 128;
  out.fill(128 + 32, 64, 128); out[64 + channel] = 32; out.fill(64, 128, 192);
  v.setUint32(193, sample, true); v.setUint32(197, packed, true);
  text(sample, "IMPS"); out[sample + 17] = 64; out[sample + 18] = 17; out[sample + 19] = 64; text(sample + 20, "Authored sine"); out[sample + 46] = 1;
  v.setUint32(sample + 48, 128, true); v.setUint32(sample + 56, 128, true); v.setUint32(sample + 60, 8363, true); v.setUint32(sample + 72, pcm, true);
  v.setUint16(packed, pattern.length, true); v.setUint16(packed + 2, rows, true); out.set(pattern, packed + 8);
  for (let i = 0; i < 128; i++) out[pcm + i] = Math.round(Math.sin(i * Math.PI / 16) * 80) & 255;
  return out;
}
