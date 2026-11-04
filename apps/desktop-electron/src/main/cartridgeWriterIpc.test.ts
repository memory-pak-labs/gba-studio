import { beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  status: vi.fn(), install: vi.fn(), detect: vi.fn(), prepare: vi.fn(), write: vi.fn(), discard: vi.fn(), writing: false, appPath: ""
}));
vi.mock("electron", () => ({
  app: { getPath: () => "/user-data", getAppPath: () => state.appPath, on: vi.fn() },
  BrowserWindow: { fromWebContents: (sender: { id: number }) => sender.id === 1 ? {} : null, getAllWindows: () => [] },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => state.handlers.set(channel, handler) }
}));
vi.mock("./cfbTool.js", async importOriginal => ({ ...await importOriginal<typeof import("./cfbTool.js")>(), ManagedCfbTool: class {} }));
vi.mock("./webRomPipeline.js", () => ({ buildProjectRomArtifact: vi.fn() }));
vi.mock("./cartridgeWriter.js", () => ({ CartridgeWriter: class {
  get isWriting() { return state.writing; }
  status = state.status; install = state.install; detect = state.detect;
  prepare = state.prepare; write = state.write; discard = state.discard;
} }));
import { cartridgeWriteInProgress, registerCartridgeWriterIpc } from "./cartridgeWriterIpc.js";

function event(url = pathToFileURL(join(process.cwd(), "dist/renderer/index.html")).href, id = 1) {
  const mainFrame = { url };
  return { sender: { id, mainFrame }, senderFrame: mainFrame };
}
beforeEach(() => { vi.clearAllMocks(); state.handlers.clear(); state.writing = false; state.appPath = process.cwd(); registerCartridgeWriterIpc(); });

describe("cartridge IPC authority", () => {
  it("binds transactions and progress status to the originating editor window", () => {
    const request = { projectPath: "/game.gba-project" };
    state.handlers.get("cartridge:prepare")!(event(), request);
    expect(state.prepare).toHaveBeenCalledWith(1, request);
    state.handlers.get("cartridge:write")!(event(), "token");
    expect(state.write).toHaveBeenCalledWith(1, "token");
    state.handlers.get("cartridge:status")!(event());
    expect(state.status).toHaveBeenCalledWith(1);
    expect([...state.handlers.keys()].sort()).toEqual(["cartridge:detect", "cartridge:discard", "cartridge:install", "cartridge:prepare", "cartridge:status", "cartridge:write"]);
  });
  it("rejects external origins, other local files, subframes and unowned web contents", () => {
    for (const bad of [event("https://example.com"), event("file:///other/index.html"), event(undefined, 99), { ...event(), senderFrame: { url: "file:///app/dist/renderer/index.html" } }]) {
      expect(() => state.handlers.get("cartridge:write")!(bad, "token")).toThrow();
    }
    expect(state.write).not.toHaveBeenCalled();
  });
  it("accepts the canonical renderer behind a symbolic app path without accepting other files", () => {
    const temp = mkdtempSync(join(tmpdir(), "gba-cartridge-origin-"));
    const actual = join(temp, "app");
    const alias = join(temp, "app-link");
    mkdirSync(join(actual, "dist/renderer"), { recursive: true });
    writeFileSync(join(actual, "dist/renderer/index.html"), "");
    writeFileSync(join(actual, "dist/renderer/other.html"), "");
    symlinkSync(actual, alias, "dir");
    state.appPath = alias;
    const renderer = pathToFileURL(join(realpathSync(actual), "dist/renderer/index.html")).href;
    const other = pathToFileURL(join(realpathSync(actual), "dist/renderer/other.html")).href;
    expect(() => state.handlers.get("cartridge:status")!(event(renderer))).not.toThrow();
    expect(state.status).toHaveBeenCalledWith(1);
    expect(() => state.handlers.get("cartridge:write")!(event(other), "token")).toThrow();
    expect(state.write).not.toHaveBeenCalled();
  });
  it("reports the physical write lock for normal window close and application quit", () => {
    expect(cartridgeWriteInProgress()).toBe(false);
    state.writing = true;
    expect(cartridgeWriteInProgress()).toBe(true);
  });
});
