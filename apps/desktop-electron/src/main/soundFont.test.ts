import { describe, expect, it } from "vitest";
import { convertSoundFont } from "./soundFont.js";

import { soundFontFixture } from "../testFixtures/soundFont.js";

describe("SoundFont to GBA sample instruments", () => {
  it("reads preset zones, tuning, provenance and creates bounded mono WAVs", () => {
    const bank = convertSoundFont(soundFontFixture(), "piano.sf2");
    expect(bank.instruments).toHaveLength(1);
    expect(bank.instruments[0]).toMatchObject({ rootNote: "C4", loop: false, keyRange: [36, 96], preset: 2, bank: 0 });
    expect(bank.instruments[0].wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bank.instruments[0].wav.readUInt16LE(22)).toBe(1);
    expect(bank.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("preserves sample loops in a WAV smpl chunk", () => {
    const item = convertSoundFont(soundFontFixture({ loop: true }), "loop.sf2").instruments[0];
    expect(item.loop).toBe(true);
    const at = item.wav.indexOf("smpl"); expect(at).toBeGreaterThan(0);
    expect(item.wav.readUInt32LE(at + 8 + 44)).toBe(16);
    expect(item.wav.readUInt32LE(at + 8 + 48)).toBe(111); // WAV end is inclusive.
  });
  it.each([Buffer.from("invalid"), soundFontFixture().subarray(0, 90), soundFontFixture({ badIndex: true }), soundFontFixture({ sampleType: 0x8001 })])("rejects corrupt, truncated and ROM-referencing banks", bytes => {
    expect(() => convertSoundFont(bytes, "bad.sf2")).toThrow(/SoundFont/);
  });
});
