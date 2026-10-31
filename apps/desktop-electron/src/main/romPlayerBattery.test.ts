import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { WebContents } from "electron";
import { afterEach, describe, expect, it } from "vitest";
import { createRomPlayerBattery, registerRomPlayerBattery } from "./romPlayerBattery.js";

const roots: string[] = [];
async function root() { const dir = await mkdtemp(path.join(tmpdir(), "gba-player-battery-")); roots.push(dir); return dir; }
afterEach(async () => { await Promise.all(roots.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
function record(identity: string, data = "AQID") { return JSON.stringify({ schema: 1, romSha256: identity, data }); }

describe("persistent Play battery", () => {
  it("survives a new instance and ROM rebuild while keeping different ROM paths separate", async () => {
    const dir = await root();
    const rom = path.join(dir, "project", "game.gba");
    await mkdir(path.dirname(rom), { recursive: true });
    await writeFile(rom, "first ROM");
    const first = createRomPlayerBattery(dir, rom);
    expect(first.read()).toBeNull();
    first.write(record(first.identity));
    await writeFile(rom, "rebuilt ROM");
    const reopened = createRomPlayerBattery(dir, rom);
    expect(reopened.identity).toBe(first.identity);
    expect(reopened.read()).toBe(record(first.identity));
    expect(createRomPlayerBattery(dir, path.join(dir, "other", "game.gba")).read()).toBeNull();
  });

  it("separates the complete game from each scene test while preserving each scene's save", async () => {
    const dir = await root(); const rom = path.join(dir, "game.gba");
    const scene = createRomPlayerBattery(dir, rom, "id:scene-a");
    scene.write(record(scene.identity));
    expect(createRomPlayerBattery(dir, rom, "id:scene-a").read()).toBe(record(scene.identity));
    expect(createRomPlayerBattery(dir, rom, "id:scene-b").read()).toBeNull();
    expect(createRomPlayerBattery(dir, rom).read()).toBeNull();
  });

  it("rejects malformed records and leaves the last valid save intact", async () => {
    const dir = await root();
    const battery = createRomPlayerBattery(dir, path.join(dir, "game.gba"));
    const saved = record(battery.identity);
    battery.write(saved);
    for (const invalid of ["{", record("f".repeat(64)), record(battery.identity, "bad!"), "a".repeat(176001)]) {
      expect(() => battery.write(invalid)).toThrow();
      expect(battery.read()).toBe(saved);
    }
    await writeFile(battery.filePath, "corrupt");
    expect(() => battery.read()).toThrow();
    expect(await readFile(battery.filePath, "utf8")).toBe("corrupt");
  });

  it("does not follow a symlink in the save directory", async () => {
    const dir = await root(); const outside = await root();
    await symlink(outside, path.join(dir, "rom-player-saves"), "dir");
    const battery = createRomPlayerBattery(dir, path.join(dir, "game.gba"));
    expect(() => battery.write(record(battery.identity))).toThrow();
  });

  it("only accepts battery requests from the registered player main frame", async () => {
    const dir = await root(); const battery = createRomPlayerBattery(dir, path.join(dir, "game.gba"));
    const contents = new EventEmitter() as WebContents;
    const frame = { url: "http://127.0.0.1:4321/player/runtime.html?desktopBattery=1" };
    Object.defineProperty(contents, "mainFrame", { value: frame });
    registerRomPlayerBattery(contents, battery, frame.url);
    const invoke = (senderFrame: unknown, operation: string, value?: string) => {
      const event = { senderFrame, returnValue: undefined as unknown };
      contents.emit("ipc-message-sync", event, "rom-player:battery", operation, value);
      return event.returnValue;
    };
    expect(invoke(frame, "identity")).toEqual({ ok: true, value: battery.identity });
    expect(invoke({}, "write", record(battery.identity))).toEqual({ ok: false });
    expect(battery.read()).toBeNull();
    frame.url = "http://127.0.0.1:9999/player/runtime.html";
    expect(invoke(frame, "write", record(battery.identity))).toEqual({ ok: false });
    frame.url = "http://127.0.0.1:4321/player/runtime.html?desktopBattery=1";
    expect(invoke(frame, "write", record(battery.identity))).toEqual({ ok: true, value: null });
    expect(invoke(frame, "read")).toEqual({ ok: true, value: record(battery.identity) });
  });
});
