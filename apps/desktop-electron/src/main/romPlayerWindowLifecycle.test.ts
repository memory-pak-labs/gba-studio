import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  failure: "" as string,
  servers: [] as Server[],
  windows: [] as Array<{ destroyed: boolean }>
}));
vi.mock("node:http", async (original) => {
  const actual = await original<typeof import("node:http")>();
  return { ...actual, createServer: (...args: Parameters<typeof actual.createServer>) => {
    const server = actual.createServer(...args);
    harness.servers.push(server);
    return server;
  } };
});
vi.mock("electron", () => ({ BrowserWindow: class extends EventEmitter {
  id = 1;
  webContents = new EventEmitter();
  destroyed = false;
  constructor() {
    super();
    if (harness.failure === "constructor") throw new Error("constructor failed");
    harness.windows.push(this);
  }
  async loadURL() { throw new Error("load failed"); }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit("closed"); }
} }));
import { openRomPlayerWindow } from "./romPlayerWindow.js";

const roots: string[] = [];
afterEach(async () => {
  for (const server of harness.servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  harness.windows.length = 0;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Play window startup cleanup", () => {
  it.each(["constructor", "loadURL"])("closes acquired resources when %s fails", async (failure) => {
    harness.failure = failure;
    const root = await mkdtemp(path.join(tmpdir(), "gba-play-window-lifecycle-"));
    roots.push(root);
    const romPath = path.join(root, "game.gba");
    await writeFile(romPath, new Uint8Array(16));
    const result = await openRomPlayerWindow({ romPath, mainDirectory: root, appPath: root, resourcesPath: root, packaged: false });
    expect(result.ok).toBe(false);
    expect(harness.servers).toHaveLength(1);
    expect(harness.servers[0].listening).toBe(false);
    for (const window of harness.windows) expect(window.destroyed).toBe(true);
  });
});
