import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeProjectMemoryReport } from "./projectMemoryReport.js";

describe("project memory report", () => {
  it("combines post-link ROM/RAM usage with compiled GBA resource pressure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-project-memory-"));
    try {
      const romPath = path.join(root, "game.gba");
      const assetReportPath = path.join(root, "asset_pack_report.json");
      await writeFile(romPath, Buffer.alloc(1024));
      await writeFile(path.join(root, "game.map"), `
Linker script and memory map
 .text.runtime 0x08000000 0x100 build/topdown_runtime.o
 .rodata.assets 0x08000100 0x200 build/assets/player.o
 .ewram.bss 0x02000000 0x400 build/runtime_state.o
 .ewram.runtime.menu 0x02000400 0x300 build/menu_runtime.o
 .ewram.runtime.isometric 0x02000400 0x500 build/isometric_runtime.o
 .iwram.text 0x03000000 0x80 build/irq.o
`, "utf8");
      await writeFile(assetReportPath, JSON.stringify({
        schema: 13,
        budget_summary: {
          bg_tiles: { used: 320, capacity: 896, remaining: 576, percent_used: 35.7, severity: "ok" },
          obj_tiles: { used: 128, capacity: 1024, remaining: 896, percent_used: 12.5, severity: "ok" },
          oam_sprites: { used: 42, capacity: 128, remaining: 86, percent_used: 32.8, severity: "ok" }
        },
        resource_bank_groups: [{
          name: "scene_town",
          assets: ["town", "player"],
          banks: [{ resource: "bg_tiles", count: 320 }]
        }],
        group_pressure_report: [{
          name: "scene_town",
          asset_count: 2,
          assets: ["town", "player"],
          resources: {
            bg_tiles: { requested: 320, capacity: 896, percent_of_pool: 35.7 }
          },
          severity: "ok"
        }],
        fragmentation_report: {
          bg_tiles: { used: 320, capacity: 896, remaining: 576, largest_free_block: 512, free_fragment_count: 2 }
        }
      }), "utf8");

      const artifact = await writeProjectMemoryReport({ assetReportPath, romPath });

      expect(artifact.report).toMatchObject({
        schema: 1,
        rom: { fileBytes: 1024, linkedBytes: 0x300, capacityBytes: 32 * 1024 * 1024 },
        ram: {
          ewram: { usedBytes: 0x900, capacityBytes: 256 * 1024 },
          iwram: { usedBytes: 0x80, capacityBytes: 32 * 1024 }
        },
        resources: {
          bg_tiles: { used: 320, capacity: 896 },
          oam_sprites: { used: 42, capacity: 128 }
        },
        peakGroups: [expect.objectContaining({ name: "scene_town", peakPercent: 35.7 })]
      });
      await expect(readFile(artifact.path, "utf8")).resolves.toContain("\"fragmentation\"");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
