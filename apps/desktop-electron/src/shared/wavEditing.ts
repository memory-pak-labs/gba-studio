import type { GBAProjectData } from "./projectFile.js";

export const WAV_EDITOR_MAX_BYTES = 16 * 1024 * 1024;
export interface WavRange { start: number; end: number }
export interface WavData { sampleRate: number; channels: Float32Array[]; loop: WavRange | null }
export interface WavOperation extends WavRange { type: "fadeIn" | "fadeOut" | "normalize" }
/** Positions are source frames, end-exclusive. The source file is never modified. */
export interface WavEdit {
  version: 1;
  sourceSha256: string;
  sourceFrames: number;
  sampleRate: number;
  trimStart: number;
  trimEnd: number;
  loop: WavRange | null;
  operations: WavOperation[];
}
function fail(message: string): never { throw new Error(`WAV: ${message}`); }
const validRange = (range: WavRange, min: number, max: number) => range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= min && range.end <= max && range.start < range.end;
export function validateWavEdit(value: unknown): asserts value is WavEdit {
  if (!value || typeof value !== "object") fail("edição inválida.");
  const e = value as WavEdit;
  if (e.version !== 1 || !/^[a-f0-9]{64}$/.test(e.sourceSha256) || !Number.isInteger(e.sourceFrames) || e.sourceFrames < 1 || e.sourceFrames > WAV_EDITOR_MAX_BYTES || !Number.isInteger(e.sampleRate) || e.sampleRate < 1 || e.sampleRate > 192000) fail("metadados da fonte inválidos.");
  if (!validRange({ start: e.trimStart, end: e.trimEnd }, 0, e.sourceFrames)) fail("trecho vazio ou fora da fonte.");
  if (e.loop !== null && !validRange(e.loop, e.trimStart, e.trimEnd)) fail("loop precisa caber no trecho.");
  if (!Array.isArray(e.operations) || e.operations.length > 128 || e.operations.some(op => !["fadeIn", "fadeOut", "normalize"].includes(op?.type) || !validRange(op, 0, e.sourceFrames))) fail("operação ou intervalo inválido (máximo de 128 operações).");
}
export function decodeWav(bytes: Uint8Array): WavData {
  if (bytes.length < 44 || bytes.length > WAV_EDITOR_MAX_BYTES) fail("arquivo vazio, truncado ou maior que 16 MiB.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const riffEnd = v.getUint32(4, true) + 8;
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || riffEnd > bytes.length || riffEnd < 44) fail("cabeçalho RIFF inválido.");
  let format = 0, channels = 0, sampleRate = 0, bits = 0, alignment = 0, start = -1, length = 0;
  let loop: WavRange | null = null;
  for (let offset = 12; offset < riffEnd;) {
    if (offset + 8 > riffEnd) fail("chunk truncado.");
    const size = v.getUint32(offset + 4, true), p = offset + 8;
    if (p + size > riffEnd) fail("chunk truncado.");
    if (tag(offset) === "fmt ") {
      if (size < 16 || format) fail("formato inválido.");
      format = v.getUint16(p, true); channels = v.getUint16(p + 2, true); sampleRate = v.getUint32(p + 4, true); alignment = v.getUint16(p + 12, true); bits = v.getUint16(p + 14, true);
    } else if (tag(offset) === "data") {
      if (start !== -1) fail("mais de um bloco de áudio.");
      start = p; length = size;
    } else if (tag(offset) === "smpl") {
      if (size < 36) fail("loop truncado.");
      const count = v.getUint32(p + 28, true);
      if (count) {
        if (count !== 1 || size < 60 || loop || v.getUint32(p + 40, true) !== 0 || v.getUint32(p + 52, true) !== 0 || v.getUint32(p + 56, true) !== 0) fail("use um único loop forward contínuo.");
        loop = { start: v.getUint32(p + 44, true), end: v.getUint32(p + 48, true) + 1 };
      }
    }
    offset = p + size + size % 2;
  }
  if (format !== 1 || ![1, 2].includes(channels) || ![8, 16].includes(bits)) fail("use PCM sem compressão, mono ou estéreo, 8 ou 16 bits.");
  if (sampleRate < 1 || sampleRate > 192000 || start < 0 || length < 1 || alignment !== channels * bits / 8 || length % alignment) fail("dados PCM inválidos.");
  const count = length / alignment;
  if (loop && !validRange(loop, 0, count)) fail("loop fora do arquivo.");
  const decoded = Array.from({ length: channels }, (_, channel) => Float32Array.from({ length: count }, (_, i) => {
    const p = start + i * alignment + channel * bits / 8;
    return bits === 8 ? (v.getUint8(p) - 128) / 128 : v.getInt16(p, true) / 32768;
  }));
  return { sampleRate, channels: decoded, loop };
}
export function renderWavEdit(source: WavData, edit: WavEdit): WavData {
  validateWavEdit(edit);
  if (source.sampleRate !== edit.sampleRate || source.channels.some(c => c.length !== edit.sourceFrames)) fail("dimensões da fonte alteradas.");
  const channels = source.channels.map(c => c.slice());
  for (const op of edit.operations) {
    const { start, end } = op;
    let peak = 0;
    if (op.type === "normalize") for (const channel of channels) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
    for (const channel of channels) for (let i = start; i < end; i++) {
      const t = op.end - op.start === 1 ? 0 : (i - op.start) / (op.end - op.start - 1);
      const gain = op.type === "normalize" ? (peak ? .98 / peak : 1) : op.type === "fadeIn" ? t : 1 - t;
      channel[i] *= gain;
    }
  }
  return { sampleRate: source.sampleRate, channels: channels.map(c => c.slice(edit.trimStart, edit.trimEnd)), loop: edit.loop && { start: edit.loop.start - edit.trimStart, end: edit.loop.end - edit.trimStart } };
}
/** Write PCM16 plus smpl. Engine assetc consumes this exact staged file. */
export function encodeWav(wav: WavData): Uint8Array {
  const count = wav.channels[0]?.length ?? 0, channels = wav.channels.length;
  if (!count || ![1, 2].includes(channels) || wav.channels.some(c => c.length !== count) || !Number.isInteger(wav.sampleRate) || wav.sampleRate < 1 || wav.sampleRate > 192000 || wav.loop && !validRange(wav.loop, 0, count)) fail("dados de saída inválidos.");
  const length = count * channels * 2, bytes = new Uint8Array(44 + length + (wav.loop ? 68 : 0));
  if (bytes.length > WAV_EDITOR_MAX_BYTES) fail("saída excede 16 MiB.");
  const v = new DataView(bytes.buffer), tag = (at: number, text: string) => bytes.set(Array.from(text, c => c.charCodeAt(0)), at);
  tag(0, "RIFF"); v.setUint32(4, bytes.length - 8, true); tag(8, "WAVE"); tag(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, wav.sampleRate, true); v.setUint32(28, wav.sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); tag(36, "data"); v.setUint32(40, length, true);
  for (let i = 0; i < count; i++) for (let c = 0; c < channels; c++) {
    const value = wav.channels[c][i]; if (!Number.isFinite(value)) fail("amostra não finita.");
    v.setInt16(44 + (i * channels + c) * 2, Math.max(-32768, Math.min(32767, Math.round(value * 32768))), true);
  }
  if (wav.loop) {
    const p = 44 + length; tag(p, "smpl"); v.setUint32(p + 4, 60, true); v.setUint32(p + 16, Math.round(1e9 / wav.sampleRate), true); v.setUint32(p + 20, 60, true); v.setUint32(p + 36, 1, true); v.setUint32(p + 52, wav.loop.start, true); v.setUint32(p + 56, wav.loop.end - 1, true);
  }
  return bytes;
}
export function wavPeaks(samples: Float32Array, buckets: number): Array<{ min: number; max: number }> {
  if (!samples.length) return [];
  const count = Math.max(1, Math.min(samples.length, Math.floor(buckets)));
  return Array.from({ length: count }, (_, bucket) => {
    const start = Math.floor(bucket * samples.length / count), end = Math.ceil((bucket + 1) * samples.length / count);
    let min = Infinity, max = -Infinity;
    for (let i = start; i < end; i++) { min = Math.min(min, samples[i]); max = Math.max(max, samples[i]); }
    return { min, max };
  });
}
export function updateWavEditInProject(data: GBAProjectData, assetID: string, edit: WavEdit | null): GBAProjectData {
  if (edit) validateWavEdit(edit);
  const assets = Array.isArray(data.assets) ? data.assets as Record<string, unknown>[] : [];
  const asset = assets.find(a => a.id === assetID);
  if (!asset || !/\.wav$/i.test(String(asset.name))) return data;
  const metadata = { ...(asset.metadata as Record<string, unknown>) };
  if (edit) metadata.wavEdit = edit; else delete metadata.wavEdit;
  return { ...data, assets: assets.map(a => a === asset ? { ...a, metadata } : a) };
}
