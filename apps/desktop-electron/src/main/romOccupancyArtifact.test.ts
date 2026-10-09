import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeRomOccupancyArtifact } from "./romOccupancyArtifact.js";

describe("ROM occupancy artifact", () => {
  it("writes a reader-friendly report beside the linked ROM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gbastudio-rom-occupancy-"));
    try {
      const romPath = path.join(root, "game.gba");
      await writeFile(romPath, Buffer.alloc(256));
      await writeFile(path.join(root, "game.map"), `
Linker script and memory map
 .text 0x08000000 0x40 build/main.o
 .rodata.assets 0x08000040 0x80 build/assets/player.o
`, "utf8");

      const result = await writeRomOccupancyArtifact(romPath);

      expect(result?.report.romBytes).toBe(0xc0);
      await expect(readFile(result!.path, "utf8")).resolves.toContain("\"assets\"");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
