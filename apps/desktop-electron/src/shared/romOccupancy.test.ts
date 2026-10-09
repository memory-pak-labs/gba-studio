import { describe, expect, it } from "vitest";
import { deriveRomOccupancyReport, parseGnuLinkerMap } from "./romOccupancy.js";

describe("ROM occupancy explorer", () => {
  it("parses linked and discarded GNU map sections and groups bytes by source", () => {
    const map = `
Discarded input sections
 .text.unused  0x00000000       0x20 build/unused_feature.o
Linker script and memory map
 .text          0x08000000       0x40 build/main.o
 .text.runtime  0x08000040       0x30 build/topdown_runtime.o
 .rodata.assets 0x08000070       0x80 build/assets/player.o
 .rodata.audio  0x080000f0       0x20 build/audio/theme.o
 .data          0x02000000       0x10 build/main.o
`;

    const parsed = parseGnuLinkerMap(map);
    const report = deriveRomOccupancyReport(parsed);

    expect(report.romBytes).toBe(0x40 + 0x30 + 0x80 + 0x20);
    expect(report.ramBytes).toBe(0x10);
    expect(report.discardedBytes).toBe(0x20);
    expect(report.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "code", bytes: 0x40 }),
      expect.objectContaining({ id: "scenes", bytes: 0x30 }),
      expect.objectContaining({ id: "assets", bytes: 0x80 }),
      expect.objectContaining({ id: "audio", bytes: 0x20 })
    ]));
  });

  it("parses GNU map entries whose section or source continues on the next line", () => {
    const map = `
Linker script and memory map
.text           0x080000d0      0x100
 *(.text .text.*)
                0x080000d0       0x30 build/cutscene_runtime.o
 .text.startup
                0x08000100       0xd0 build/crt0.o
.rodata         0x080001d0      0x200
 .rodata.scene_background
                0x080001d0      0x200 build/assets/town_background.o
.ewram          0x02000000      0x400
                0x02000000      0x400 build/runtime_state.o
`;

    const report = deriveRomOccupancyReport(parseGnuLinkerMap(map));

    expect(report.romBytes).toBe(0x30 + 0xd0 + 0x200);
    expect(report.ramBytes).toBe(0x400);
    expect(report.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "scenes", bytes: 0x30 }),
      expect.objectContaining({ id: "code", bytes: 0xd0 }),
      expect.objectContaining({ id: "assets", bytes: 0x200 })
    ]));
  });
});
