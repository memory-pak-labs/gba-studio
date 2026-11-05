import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CartridgeWriter } from "./cartridgeWriter.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gba-writer-test-"));
  const romPath = join(root, "game.gba");
  const rom = Buffer.alloc(1024, 42); rom[0xb2] = 0x96;
  rom[0xbd] = (-rom.subarray(0xa0, 0xbd).reduce((sum, byte) => sum + byte, 0) - 0x19) & 255;
  await writeFile(romPath, rom);
  let save: Buffer = Buffer.alloc(131072, 7);
  const commands: string[][] = [];
  const info = { type: "info", port: "usb-one", present: true, kind: "gba", id: "01 22", capacity_bytes: 33554432, sector_size: 131072, sector_count: 256 };
  const tool = {
    status: vi.fn(async () => ({ installed: true, supported: true, version: "0.5.2" })),
    install: vi.fn(),
    run: vi.fn(async (args: string[], _listener?: unknown, _firmware?: string) => {
      commands.push(args);
      if (args[0] === "detect") return [{ type: "port", port: "usb-one", burner: true, open: true, vid: "0483", pid: "0721", name: "ChisFlash" }, { type: "summary", command: "detect", burners: 1 }];
      if (args[0] === "info") return [info];
      if (args[0] === "voltage") return [{ type: "voltage", voltage: "3.3V" }];
      if (args[0] === "save-dump") await writeFile(args[args.indexOf("--out") + 1], save);
      if (args[0] === "dump") await writeFile(args[args.indexOf("--out") + 1], await readFile(romPath));
      return [{ type: "result", command: args[0], ok: true, bytes: args[0] === "burn" || args[0] === "dump" ? 1024 : save.length, mismatch_bytes: 0, seconds: 1 }];
    })
  };
  const build = vi.fn(async () => ({ romPath }));
  const writer = new CartridgeWriter({ root, tool, build });
  const request = { profileID: "chisflash-v1.2-fram", port: "usb-one", projectPath: join(root, "game.gba-project"), project: { data: { settings: { save: { saveType: "sram" } } } } } as never;
  return { writer, tool, build, request, root, info, commands, setSave: (data: Buffer) => { save = data; } };
}

describe("cartridge writer transaction", () => {
  it.each(["stm", "stc8"] as const)("binds %s firmware to the complete reviewed transaction", async firmware => {
    const f = await fixture();
    const request = { ...(f.request as object), firmware } as never;
    const prepared = await f.writer.prepare(1, request);
    expect(prepared.ok).toBe(true);
    (request as { firmware: string }).firmware = firmware === "stm" ? "stc8" : "stm";
    expect((await f.writer.write(1, prepared.review!.token)).ok).toBe(true);
    const physicalCalls = f.tool.run.mock.calls.filter(([args]) => args[0] !== "detect");
    expect(physicalCalls.length).toBeGreaterThan(5);
    expect(physicalCalls.every(call => call[2] === firmware)).toBe(true);
  });
  it("rejects unknown firmware before compiling or opening the device", async () => {
    const f = await fixture();
    expect((await f.writer.prepare(1, { ...(f.request as object), firmware: "unknown" } as never)).ok).toBe(false);
    expect(f.build).not.toHaveBeenCalled();
    expect(f.tool.run).not.toHaveBeenCalled();
  });
  it("prepares a snapshot and stable full save backup without burning, then verifies ROM and save", async () => {
    const f = await fixture();
    const prepared = await f.writer.prepare(1, f.request);
    expect(prepared.ok).toBe(true);
    expect(f.commands.some(a => a[0] === "burn")).toBe(false);
    expect((await readFile(prepared.review!.backupPath)).length).toBe(131072);
    const result = await f.writer.write(1, prepared.review!.token);
    expect(result.ok).toBe(true);
    expect(f.commands.filter(a => a[0] === "burn")).toHaveLength(1);
    expect(f.commands.find(a => a[0] === "burn")).not.toContain("--no-verify");
    expect(f.commands.filter(a => a[0] !== "detect").every(a => a.includes("usb-one"))).toBe(true);
    expect(f.commands.some(a => /save-probe|save-write|save-erase/.test(a[0]))).toBe(false);
    expect((await f.writer.write(1, prepared.review!.token)).ok).toBe(false);
  });

  it("rejects stale, unknown and foreign tokens without burning", async () => {
    const f = await fixture();
    expect((await f.writer.write(1, "unknown")).ok).toBe(false);
    const p = await f.writer.prepare(1, f.request);
    expect((await f.writer.write(2, p.review!.token)).ok).toBe(false);
    f.writer.discard(1);
    expect((await f.writer.write(1, p.review!.token)).ok).toBe(false);
    expect(f.commands.some(a => a[0] === "burn")).toBe(false);
  });

  it("blocks a save changed after review, including the bank above 64 KiB", async () => {
    const f = await fixture();
    const p = await f.writer.prepare(1, f.request);
    const changed = Buffer.alloc(131072, 7); changed[0x10003] = 0x40;
    f.setSave(changed);
    expect((await f.writer.write(1, p.review!.token)).ok).toBe(false);
    expect(f.commands.some(a => a[0] === "burn")).toBe(false);
    expect((await readFile(p.review!.backupPath))[0x10003]).toBe(7);
  });

  it("refuses unsupported save profiles before build or USB access", async () => {
    const f = await fixture();
    const request = { ...f.request as object, project: { data: { settings: { save: { saveType: "flash1m" } } } } } as never;
    expect((await f.writer.prepare(1, request)).ok).toBe(false);
    expect(f.build).not.toHaveBeenCalled();
    expect(f.tool.run).not.toHaveBeenCalled();
  });

  it("does not burn when the cartridge is absent, too small or replaced", async () => {
    for (const patch of [{ present: false }, { capacity_bytes: 512 }, { kind: "gb_mbc" }]) {
      const f = await fixture(); Object.assign(f.info, patch);
      expect((await f.writer.prepare(1, f.request)).ok).toBe(false);
      expect(f.commands.some(a => a[0] === "burn")).toBe(false);
    }
    const f = await fixture(); const p = await f.writer.prepare(1, f.request);
    f.info.id = "OTHER";
    expect((await f.writer.write(1, p.review!.token)).ok).toBe(false);
    expect(f.commands.some(a => a[0] === "burn")).toBe(false);
  });

  it("blocks concurrent operations", async () => {
    const f = await fixture();
    let release!: (value: { romPath: string }) => void;
    f.build.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = f.writer.prepare(1, f.request);
    expect((await f.writer.prepare(2, f.request)).ok).toBe(false);
    release({ romPath: join(f.root, "game.gba") });
    await first;
  });

  it("retains the backup and reports failure when post-write save or readback differs", async () => {
    const f = await fixture(); const p = await f.writer.prepare(1, f.request);
    const originalRun = f.tool.run.getMockImplementation()!;
    f.tool.run.mockImplementation(async args => {
      const events = await originalRun(args);
      if (args[0] === "burn") f.setSave(Buffer.alloc(131072, 99));
      return events;
    });
    const result = await f.writer.write(1, p.review!.token);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/save/i);
    expect((await readFile(p.review!.backupPath))[0]).toBe(7);
  });

  it("rejects an unstable backup before offering a review", async () => {
    const f = await fixture(); const original = f.tool.run.getMockImplementation()!;
    let reads = 0;
    f.tool.run.mockImplementation(async args => {
      const events = await original(args);
      if (args[0] === "save-dump" && ++reads === 1) f.setSave(Buffer.alloc(131072, 3));
      return events;
    });
    expect((await f.writer.prepare(1, f.request)).ok).toBe(false);
    expect(f.commands.some(a => a[0] === "burn")).toBe(false);
  });
  it("supports a blank or interrupted GBA ROM when the user selected the physical profile", async () => {
    const f = await fixture(); f.info.kind = "unknown";
    expect((await f.writer.prepare(1, f.request)).ok).toBe(true);
    const noProfile = { ...f.request as object, profileID: "other" } as never;
    expect((await f.writer.prepare(1, noProfile)).ok).toBe(false);
  });

  it("refuses expired reviews and a changed ROM snapshot", async () => {
    for (const change of ["expired", "modified"] as const) {
      const f = await fixture(); const p = await f.writer.prepare(1, f.request);
      if (change === "modified") await writeFile(join(p.review!.backupPath, "..", "game.gba"), Buffer.alloc(1024, 1));
      const clock = change === "expired" ? vi.spyOn(Date, "now").mockReturnValue(p.review!.expiresAt + 1) : null;
      try { expect((await f.writer.write(1, p.review!.token)).ok).toBe(false); }
      finally { clock?.mockRestore(); }
      expect(f.commands.some(a => a[0] === "burn")).toBe(false);
    }
  });

  it("rejects invalid ROM output before reading a cartridge", async () => {
    const f = await fixture(); await writeFile(join(f.root, "game.gba"), Buffer.alloc(1024));
    expect((await f.writer.prepare(1, f.request)).ok).toBe(false);
    expect(f.tool.run).not.toHaveBeenCalled();
  });

  it("does not claim success after an invalid burn result or a readback mismatch", async () => {
    for (const mode of ["result", "readback"] as const) {
      const f = await fixture(); const p = await f.writer.prepare(1, f.request);
      const original = f.tool.run.getMockImplementation()!;
      f.tool.run.mockImplementation(async args => {
        const events = await original(args);
        if (args[0] === "burn" && mode === "result") return [];
        if (args[0] === "dump" && mode === "readback") await writeFile(args[args.indexOf("--out") + 1], Buffer.alloc(1024));
        return events;
      });
      expect((await f.writer.write(1, p.review!.token)).ok).toBe(false);
    }
  });
});
