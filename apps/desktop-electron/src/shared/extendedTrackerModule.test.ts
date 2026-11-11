import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { parseTrackerModule, writeTrackerModule, validateTrackerModuleSong } from "./trackerModule.js";
import { makeXmFixture, makeItFixture } from "./extendedTrackerFixtures.js";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
describe("XM and IT native module authoring", () => {
  it.each(["XM", "IT"] as const)("reads variable rows and roundtrips %s without changing source bytes", format => {
    const bytes = format === "XM" ? makeXmFixture(16, 5) : makeItFixture(63, 7); const song = parseTrackerModule(bytes, format, hash(bytes));
    validateTrackerModuleSong(song);
    expect(song.patterns[0].steps).toBe(format === "XM" ? 5 : 7); expect(song.patterns[0].channels[0].notes[0]).toBe(format === "XM" ? "C4" : "C5");
    expect(song.patterns[0].channels[0].notes.at(-1)).toBe("OFF"); expect(writeTrackerModule(bytes, song)).toEqual(bytes);
    if (format === "IT") { expect(song.trackerModule.channelMap).toEqual([63]); expect(song.patterns[0].channels[0].notes[1]).toBe("C5"); }
  });
  it.each(["XM", "IT"] as const)("edits %s cells and orders while retaining the original instrument/sample payload", format => {
    const bytes = format === "XM" ? makeXmFixture() : makeItFixture(); const before = bytes.slice();
    const song = parseTrackerModule(bytes, format, hash(bytes)); song.patterns[0].channels[0].notes[0] = "D4"; song.patterns[0].channels[0].trackerCells[0].parameter = 150;
    song.patternOrder.push(song.patternOrder[0]); song.bpm = 150;
    const output = writeTrackerModule(bytes, song), decoded = parseTrackerModule(output, format, hash(output));
    expect(decoded.patterns[0].channels[0].notes[0]).toBe("D4"); expect(decoded.patterns[0].channels[0].trackerCells[0].parameter).toBe(150); expect(decoded.patternOrder).toHaveLength(2); expect(decoded.bpm).toBe(150);
    expect(bytes).toEqual(before); expect(output.slice(-128)).toEqual(bytes.slice(-128));
  });
  it("rejects truncated files, invalid packed patterns and more than sixteen audible channels", () => {
    const xm = makeXmFixture(); expect(() => parseTrackerModule(xm.slice(0, 345), "XM", hash(xm))).toThrow();
    expect(() => parseTrackerModule(makeXmFixture(18), "XM", hash(xm))).toThrow(/16/);
    const it = makeItFixture(); new DataView(it.buffer).setUint32(197, 0xfffffff0, true); expect(() => parseTrackerModule(it, "IT", hash(it))).toThrow();
  });
  it.each(["XM", "IT"] as const)("applies source limits to %s before decoding", format => {
    expect(() => parseTrackerModule(new Uint8Array(8 * 1024 * 1024 + 1), format, "0".repeat(64))).toThrow(/8 MiB/);
    expect(() => parseTrackerModule(format === "XM" ? makeXmFixture() : makeItFixture(), format, "invalid")).toThrow(/Hash/);
  });
});
