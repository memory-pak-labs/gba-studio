import { describe, expect, it } from "vitest";
import { decodeWav, encodeWav, renderWavEdit, validateWavEdit, updateWavEditInProject, wavPeaks, type WavEdit } from "./wavEditing.js";

const wave = () => ({ sampleRate: 8000, channels: [Float32Array.from([0, .125, -.25, .5, -.5, .25, -.125, 0]), Float32Array.from([0, .25, -.5, 1, -1, .5, -.25, 0])], loop: { start: 2, end: 7 } });
const edit = (): WavEdit => ({ version: 1, sourceSha256: "a".repeat(64), sourceFrames: 8, sampleRate: 8000, trimStart: 0, trimEnd: 8, loop: { start: 2, end: 7 }, operations: [] });

describe("non-destructive WAV editing", () => {
  it("roundtrips stereo PCM and exclusive smpl loop endpoints", () => {
    const decoded = decodeWav(encodeWav(wave()));
    expect(decoded.sampleRate).toBe(8000); expect(decoded.channels).toHaveLength(2);
    expect(Array.from(decoded.channels[0])).toEqual(Array.from(wave().channels[0]));
    expect(decoded.loop).toEqual({ start: 2, end: 7 });
  });
  it("decodes unsigned 8-bit mono and rejects compressed or truncated data", () => {
    const wav = encodeWav({ sampleRate: 8000, channels: [Float32Array.from([0, 0])], loop: null });
    const bytes = wav.slice(0, 46); const view = new DataView(bytes.buffer);
    view.setUint32(4, 38, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true); view.setUint32(40, 2, true); bytes[44] = 0; bytes[45] = 255;
    expect(Array.from(decodeWav(bytes).channels[0])).toEqual([-1, 127 / 128]);
    view.setUint16(20, 3, true); expect(() => decodeWav(bytes)).toThrow(/PCM/);
    expect(() => decodeWav(wav.slice(0, 43))).toThrow();
  });
  it("crops at exact frames, applies ordered fades and normalization and rebases loops", () => {
    const original = wave(), before = original.channels.map(channel => Array.from(channel));
    const recipe = { ...edit(), trimStart: 1, trimEnd: 7, operations: [{ type: "normalize" as const, start: 1, end: 7 }, { type: "fadeIn" as const, start: 1, end: 4 }, { type: "fadeOut" as const, start: 4, end: 7 }] };
    const rendered = renderWavEdit(original, recipe);
    expect(rendered.channels[0]).toHaveLength(6); expect(rendered.loop).toEqual({ start: 1, end: 6 });
    expect(rendered.channels[1][0]).toBeCloseTo(0); expect(rendered.channels[1][5]).toBeCloseTo(0);
    expect(rendered.channels[1][2]).toBeCloseTo(.98); expect(rendered.channels[0][2]).toBeCloseTo(.49);
    expect(original.channels.map(channel => Array.from(channel))).toEqual(before);
  });
  it("normalizes silence without NaN and keeps transients in waveform buckets", () => {
    const silent = { ...wave(), channels: [new Float32Array(8)] };
    expect(Array.from(renderWavEdit(silent, { ...edit(), operations: [{ type: "normalize", start: 0, end: 8 }] }).channels[0])).toEqual(new Array(8).fill(0));
    expect(wavPeaks(Float32Array.from([0, -1, .5, 0]), 2)).toEqual([{ min: -1, max: 0 }, { min: 0, max: .5 }]);
  });
  it("preserves previously applied normalization gain when a later crop removes the peak", () => {
    const normalized = { ...edit(), loop: null, operations: [{ type: "normalize" as const, start: 0, end: 8 }] };
    const all = renderWavEdit(wave(), normalized);
    const cut = renderWavEdit(wave(), { ...normalized, trimStart: 1, trimEnd: 3 });
    expect(Array.from(cut.channels[0])).toEqual(Array.from(all.channels[0].slice(1, 3)));
  });
  it("rejects unsafe ranges, malformed recipes and changed source dimensions", () => {
    for (const bad of [{ trimStart: -1 }, { trimEnd: 9 }, { loop: { start: 3, end: 3 } }, { operations: [{ type: "normalize", start: 0, end: Infinity }] }, { operations: [{ type: "unknown", start: 0, end: 2 }] }, { sourceSha256: "bad" }]) expect(() => validateWavEdit({ ...edit(), ...bad })).toThrow();
    expect(() => renderWavEdit(wave(), { ...edit(), sourceFrames: 9 })).toThrow(/fonte/);
  });
  it("persists recipes separately from sources and can restore the project with undo", () => {
    const original = { assets: [{ id: "wav", name: "bell.wav", kind: "Audio", metadata: { source: "Assets/bell.wav", license: "MIT" } }] };
    const changed = updateWavEditInProject(original, "wav", edit());
    expect(JSON.parse(JSON.stringify(changed)).assets[0].metadata.wavEdit).toEqual(edit());
    expect(original.assets[0].metadata).toEqual({ source: "Assets/bell.wav", license: "MIT" });
    expect(updateWavEditInProject(changed, "wav", null)).toEqual(original);
    expect(updateWavEditInProject(original, "missing", edit())).toBe(original);
  });
});
