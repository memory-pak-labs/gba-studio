import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseTrackerModule, writeTrackerModule } from "./trackerModule.js";
import { makeEditableModFixture, makeEditableS3mFixture } from "./trackerModuleFixtures.js";

const parse = (bytes: Uint8Array, format: "MOD" | "S3M") => parseTrackerModule(bytes, format, createHash("sha256").update(bytes).digest("hex"));

describe("native tracker module editing", () => {
  it("round-trips the approved Exemplo GBA modules without modifying their bytes", async () => {
    const root = path.resolve("default-assets/templates/exemplo-gba");
    const data = JSON.parse(await readFile(path.join(root, "exemplo-gba.gba-project"), "utf8"));
    const modules = data.assets.filter((asset: { name: string }) => /\.(mod|s3m)$/i.test(asset.name));
    expect(modules.length).toBeGreaterThan(0);
    for (const asset of modules) {
      const bytes = await readFile(path.join(root, asset.metadata.source));
      const format = path.extname(asset.name).slice(1).toUpperCase() as "MOD" | "S3M";
      expect(writeTrackerModule(bytes, parse(bytes, format)), asset.name).toEqual(new Uint8Array(bytes));
    }
  });
  it.each([4, 8, 16])("opens all %i MOD channels, patterns, instruments and native commands", channels => {
    const song = parse(makeEditableModFixture(channels), "MOD");
    expect(song.patterns).toHaveLength(2);
    expect(song.patterns[0].channels).toHaveLength(channels);
    expect(song.patternOrder).toEqual([song.patterns[0].id, song.patterns[1].id, song.patterns[0].id]);
    expect(song.patterns[0].channels[0].notes[0]).toBe("C4");
    expect(song.patterns[0].channels[0].trackerCells[0]).toMatchObject({ instrument: 1, effect: 15, parameter: 6, period: 428 });
    expect(song.trackerModule.instruments[0]).toMatchObject({ number: 1, name: "Fixture PCM", length: 64, loopStart: 0, loopEnd: 64 });
  });

  it.each(["MOD", "S3M"] as const)("leaves every original %s byte identical without musical edits", format => {
    const bytes = format === "MOD" ? makeEditableModFixture(16) : makeEditableS3mFixture();
    const before = bytes.slice();
    const song = parse(bytes, format);
    song.patterns[0].name = "Nome no editor";
    expect(writeTrackerModule(bytes, song)).toEqual(bytes);
    expect(bytes).toEqual(before);
  });

  it("edits MOD notes without changing inherited instruments, effects, microtuning or sample bytes", () => {
    const bytes = makeEditableModFixture(8); const before = bytes.slice();
    const song = parse(bytes, "MOD");
    song.patterns[0].channels[0].notes[0] = "D4";
    song.patterns[1].channels[1].trackerCells[3] = { instrument: 1, effect: 12, parameter: 21 };
    const output = writeTrackerModule(bytes, song); const again = parse(output, "MOD");
    expect(again.patterns[0].channels[0].notes[0]).toBe("D4");
    expect(again.patterns[0].channels[0].trackerCells[0]).toMatchObject({ instrument: 1, effect: 15, parameter: 6 });
    expect(again.patterns[0].channels[1].trackerCells[2].period).toBe(427);
    expect(again.patterns[1].channels[1].trackerCells[3]).toMatchObject({ instrument: 1, effect: 12, parameter: 21 });
    expect(output.slice(-64)).toEqual(bytes.slice(-64));
    expect(bytes).toEqual(before);
  });

  it("edits S3M sparse channels while retaining note cuts, volume columns, commands, panning and sample payload", () => {
    const bytes = makeEditableS3mFixture(); const song = parse(bytes, "S3M");
    expect(song.trackerModule.channelMap).toEqual([0, 3, 17]);
    expect(song.patterns[0].channels[2].notes[2]).toBe("OFF");
    expect(song.patterns[0].channels[1].trackerCells[1]).toMatchObject({ volume: 39, effect: 8, parameter: 0x47 });
    song.patterns[0].channels[1].notes[1] = "F#5";
    song.patterns[0].channels[1].trackerCells[1].parameter = 0x34;
    const output = writeTrackerModule(bytes, song); const again = parse(output, "S3M");
    expect(again.patterns[0].channels[1].notes[1]).toBe("F#5");
    expect(again.patterns[0].channels[1].trackerCells[1]).toMatchObject({ volume: 39, effect: 8, parameter: 0x34, instrument: 1 });
    expect(again.patterns[0].channels[2].notes[2]).toBe("OFF");
    expect(again.trackerModule.originalOrders).toEqual([0, 254, 1, 255]);
    expect(again.trackerModule.panning).toEqual(song.trackerModule.panning);
    expect(again.patterns[0].trackerHiddenChannels).toEqual(song.patterns[0].trackerHiddenChannels);
    const instrument = new DataView(output.buffer, output.byteOffset, output.byteLength).getUint16(0x60 + 4, true) * 16;
    const pointer = (output[instrument + 13] << 16) | output[instrument + 14] | (output[instrument + 15] << 8);
    expect(output.slice(pointer * 16, pointer * 16 + 64)).toEqual(bytes.slice(1536, 1600));
  });

  it.each(["MOD", "S3M"] as const)("supports new patterns and order edits in %s without replacing instruments", format => {
    const bytes = format === "MOD" ? makeEditableModFixture(4) : makeEditableS3mFixture();
    const song = parse(bytes, format); const added = structuredClone(song.patterns[0]);
    added.id = "new-pattern"; added.channels.forEach((c, i) => { c.id = `new-channel-${i}`; c.notes[4] = "A4"; });
    song.patterns.push(added); song.patternOrder = [added.id, song.patterns[1].id];
    const again = parse(writeTrackerModule(bytes, song), format);
    expect(again.patternOrder.map(id => again.patterns.findIndex(p => p.id === id))).toEqual([2, 1]);
    expect(again.patterns[2].channels[0].notes[4]).toBe("A4");
    expect(again.trackerModule.instruments).toEqual(song.trackerModule.instruments);
  });

  it.each(["MOD", "S3M"] as const)("rejects truncated %s and invalid edits rather than dropping data", format => {
    const bytes = format === "MOD" ? makeEditableModFixture(4) : makeEditableS3mFixture();
    expect(() => parse(bytes.slice(0, 80), format)).toThrow();
    const song = parse(bytes, format); song.patterns[0].channels[0].trackerCells[0].instrument = 999;
    expect(() => writeTrackerModule(bytes, song)).toThrow(/instrumento/i);
    song.patterns[0].channels[0].trackerCells[0].instrument = 1;
    song.patternOrder = ["missing"];
    expect(() => writeTrackerModule(bytes, song)).toThrow(/sequência|padrão/i);
  });

  it("rejects modules above the engine's 16-channel capacity", () => {
    const bytes = makeEditableModFixture(16); bytes.set(new TextEncoder().encode("32CH"), 1080);
    expect(() => parse(bytes, "MOD")).toThrow(/16 canais/);
  });

  it("does not insert unused MOD patterns into the sample payload", () => {
    const bytes = makeEditableModFixture(4); const song = parse(bytes, "MOD");
    song.patternOrder = [song.patterns[0].id];
    const result = writeTrackerModule(bytes, song);
    const sampleOffset = 1084 + 64 * 4 * 4;
    expect(result.slice(sampleOffset, sampleOffset + 64)).toEqual(bytes.slice(-64));
    expect(parse(result, "MOD").trackerModule.instruments[0].length).toBe(64);
  });
});
