import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeProjectMemoryReport } from "./projectMemoryReport.js";

const memorySymbols = (bssEnd = 0x03005c8c, ewramEnd = 0x0203fee8) => `
                0x${bssEnd.toString(16)} __bss_end = .
                0x${ewramEnd.toString(16)} __ewram_bss_end = .
                0x03005cfc __stack_bottom = (__stack_top - __system_stack_size)
                0x03007cfc __stack_top = __svc_stack_bottom
                0x03007cfc __svc_stack_bottom = (__svc_stack_top - __svc_stack_size)
                0x03007dfc __svc_stack_top = __irq_stack_bottom
                0x03007dfc __irq_stack_bottom = (__irq_stack_top - __irq_stack_size)
                0x03007ffc __irq_stack_top = __irq_handler_slot
`;

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
${memorySymbols(0x03000080, 0x02000900)}
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
        schema: 2,
        rom: { fileBytes: 1024, linkedBytes: 0x300, capacityBytes: 32 * 1024 * 1024 },
        ram: {
          ewram: { usedBytes: 0x900, capacityBytes: 256 * 1024 },
          iwram: { usedBytes: 0x80 + 8964, linkedBytes: 0x80, reservedBytes: 8964, capacityBytes: 32 * 1024 },
          linkedBytes: 0x980
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

  it("reports the static gap before reserved stacks, alignment and near-full RAM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-memory-stack-gap-"));
    try {
      const romPath = path.join(root, "game.gba"), assetReportPath = path.join(root, "assets.json");
      await writeFile(romPath, Buffer.alloc(4));
      await writeFile(assetReportPath, JSON.stringify({ schema: 13 }));
      await writeFile(path.join(root, "game.map"), `
Linker script and memory map
 .bss 0x03000000 0x5c4c build/engine.o
 .ewram_bss 0x02000000 0x1f2b0 build/engine.o
 .ewram_runtime_menu 0x0201f2b0 0x1000 build/menu_runtime.o
 .ewram_runtime_iso 0x0201f2b0 0x20c2c build/isometric_runtime.o
${memorySymbols()}`);
      const { report } = await writeProjectMemoryReport({ romPath, assetReportPath });
      expect(report.ram.iwram).toMatchObject({
        usedBytes: 32768 - 112, remainingBytes: 112, linkedBytes: 0x5c4c,
        paddingBytes: 64, reservedBytes: 8964, severity: "warning",
        stacks: { systemBytes: 8192, irqBytes: 512, supervisorBytes: 256 }
      });
      expect(report.ram.ewram).toMatchObject({
        usedBytes: 262144 - 280, remainingBytes: 280, paddingBytes: 12,
        reservedBytes: 0, severity: "warning"
      });
      expect(report.ram.linkedBytes).toBe(report.ram.iwram.linkedBytes + report.ram.ewram.linkedBytes);
      expect(report.warnings.join(" ")).toContain("IWRAM");
      expect(report.warnings.join(" ")).toContain("EWRAM");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("does not label an overflowing static region as available RAM", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-memory-overflow-"));
    try {
      const romPath = path.join(root, "game.gba"), assetReportPath = path.join(root, "assets.json");
      await writeFile(romPath, Buffer.alloc(4));
      await writeFile(assetReportPath, "{}");
      await writeFile(path.join(root, "game.map"), memorySymbols(0x03005d00, 0x02040004));
      const { report } = await writeProjectMemoryReport({ romPath, assetReportPath });
      expect(report.ram.iwram).toMatchObject({ severity: "error", remainingBytes: 0 });
      expect(report.ram.ewram).toMatchObject({ severity: "error", remainingBytes: 0 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("refuses an incomplete linker map instead of claiming unmeasured headroom", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gba-memory-incomplete-"));
    try {
      const romPath = path.join(root, "game.gba"), assetReportPath = path.join(root, "assets.json");
      await writeFile(romPath, Buffer.alloc(4));
      await writeFile(assetReportPath, "{}");
      await writeFile(path.join(root, "game.map"), "Linker script and memory map\n .bss 0x03000000 0x80 build/main.o");
      await expect(writeProjectMemoryReport({ romPath, assetReportPath })).rejects.toThrow(/__bss_end|símbolo|symbol/i);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
