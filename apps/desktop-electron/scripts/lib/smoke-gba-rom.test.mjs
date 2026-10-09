import { describe, expect, it } from "vitest";

import { createSmokeGbaRom } from "./smoke-gba-rom.mjs";

describe("smoke GBA ROM fixture", () => {
  it("creates a small bootable GBA cartridge image with a valid header checksum", () => {
    const rom = createSmokeGbaRom();

    let complement = 0;
    for (let offset = 0x0a0; offset <= 0x0bc; offset += 1) {
      complement = (complement - rom[offset]) & 0xff;
    }

    expect(rom.length).toBeGreaterThanOrEqual(0x200);
    expect(rom.readUInt32LE(0x000)).toBe(0xea00002e);
    expect(rom.toString("ascii", 0x0a0, 0x0ab)).toBe("GBASTUDIOCI");
    expect(rom[0x0b2]).toBe(0x96);
    expect(rom[0x0bd]).toBe((complement - 0x19) & 0xff);
    expect(rom.readUInt32LE(0x0c0)).toBe(0xeafffffe);
  });
});
