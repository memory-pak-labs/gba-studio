// Original, deterministic test modules generated here; no third-party audio.
export function makeEditableModFixture(channels = 4): Uint8Array {
  const bytes = new Uint8Array(1084 + 2 * 64 * channels * 4 + 64);
  const view = new DataView(bytes.buffer); const text = new TextEncoder();
  bytes.set(text.encode("GBA editable MOD")); bytes.set(text.encode("Fixture PCM"), 20);
  view.setUint16(42, 32); bytes[45] = 48; view.setUint16(48, 32);
  bytes[950] = 3; bytes[951] = 127; bytes.set([0, 1, 0], 952);
  bytes.set(text.encode(channels === 4 ? "M.K." : channels < 10 ? `${channels}CHN` : `${channels}CH`), 1080);
  const cell = (pattern: number, row: number, channel: number, period: number, instrument: number, effect: number, parameter: number) => {
    const offset = 1084 + ((pattern * 64 + row) * channels + channel) * 4;
    bytes.set([(instrument & 0xf0) | (period >> 8), period & 255, (instrument << 4) | effect, parameter], offset);
  };
  cell(0, 0, 0, 428, 1, 15, 6); cell(0, 2, 1, 427, 0, 4, 0x47);
  cell(0, 63, channels - 1, 214, 1, 12, 21); cell(1, 0, 0, 339, 1, 0, 0);
  for (let i = 0; i < 64; i++) bytes[bytes.length - 64 + i] = Math.round(Math.sin(i * Math.PI / 16) * 90) & 255;
  return bytes;
}

export function makeEditableS3mFixture(): Uint8Array {
  const bytes = new Uint8Array(1600); const view = new DataView(bytes.buffer); const text = new TextEncoder();
  bytes.set(text.encode("GBA editable S3M")); bytes[28] = 26; bytes[29] = 16;
  view.setUint16(32, 4, true); view.setUint16(34, 1, true); view.setUint16(36, 2, true);
  view.setUint16(42, 1, true); bytes.set(text.encode("SCRM"), 44);
  bytes[48] = 64; bytes[49] = 6; bytes[50] = 125; bytes[51] = 0x80; bytes[53] = 252;
  bytes.fill(255, 64, 96); bytes[64] = 0; bytes[67] = 8; bytes[81] = 1;
  bytes.set([0, 254, 1, 255], 96); view.setUint16(100, 32, true);
  view.setUint16(102, 40, true); view.setUint16(104, 64, true);
  for (let i = 0; i < 32; i++) bytes[106 + i] = 0x20 | i % 16;
  bytes[512] = 1; view.setUint16(526, 96, true); view.setUint32(528, 64, true);
  view.setUint32(532, 0, true); view.setUint32(536, 64, true); bytes[540] = 48; bytes[543] = 1;
  view.setUint32(544, 8363, true); bytes.set(text.encode("Fixture PCM"), 560); bytes.set(text.encode("SCRS"), 588);
  const p0 = [0xa0, 0x40, 1, 1, 6, 0x81, 8, 0x12, 0, 0xe3, 0x51, 1, 39, 8, 0x47, 0, 0x31, 254, 0, 0, ...Array(61).fill(0)];
  const p1 = [0x20, 0x44, 1, 0, ...Array(63).fill(0)];
  view.setUint16(640, p0.length + 2, true); bytes.set(p0, 642);
  view.setUint16(1024, p1.length + 2, true); bytes.set(p1, 1026);
  for (let i = 0; i < 64; i++) bytes[1536 + i] = Math.round(Math.sin(i * Math.PI / 16) * 90) & 255;
  return bytes;
}
