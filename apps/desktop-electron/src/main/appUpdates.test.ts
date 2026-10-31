import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { canRestartForAppUpdate, createAppUpdateService, supportsIntegratedUpdates } from "./appUpdates.js";

function fixture(canInstall = () => true) {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: false, allowDowngrade: true,
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue([]), quitAndInstall: vi.fn()
  });
  const changed = vi.fn();
  const service = createAppUpdateService({ updater, currentVersion: "0.1.0-beta.3", canInstall, changed });
  return { updater, service, changed };
}

describe("application updates", () => {
  it("recognizes NSIS by the configured executable name and rejects ZIP/development installs", () => {
    const exists = vi.fn((path: string) => path === "C:\\app\\resources\\app-update.yml" || path === "C:\\app\\Uninstall gba-studio.exe");
    const options = { isPackaged: true, platform: "win32" as const, resourcesPath: "C:\\app\\resources", executablePath: "C:\\app\\gba-studio.exe", exists };
    expect(supportsIntegratedUpdates(options)).toBe(true);
    expect(supportsIntegratedUpdates({ ...options, exists: (path) => path.endsWith("app-update.yml") })).toBe(false);
    expect(supportsIntegratedUpdates({ ...options, isPackaged: false })).toBe(false);
    expect(supportsIntegratedUpdates({ ...options, platform: "linux", appImage: undefined })).toBe(false);
  });
  it("requires every editor document to be known, saved and clean", () => {
    const welcome = { dirty: false, representedFilename: "", title: "GBA Studio" };
    const saved = { dirty: false, representedFilename: "/game.gba-project", title: "Game - GBA Studio" };
    expect(canRestartForAppUpdate([welcome, saved])).toBe(true);
    expect(canRestartForAppUpdate([saved, undefined])).toBe(false);
    expect(canRestartForAppUpdate([saved, { ...saved, dirty: true }])).toBe(false);
    expect(canRestartForAppUpdate([{ ...saved, representedFilename: "" }])).toBe(false);
  });
  it("requires explicit download and restart, keeps beta updates and forbids downgrades", () => {
    const { updater } = fixture();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(true);
    expect(updater.allowDowngrade).toBe(false);
    const stable = fixture();
    createAppUpdateService({ updater: stable.updater, currentVersion: "1.0.0", canInstall: () => true, changed: vi.fn() });
    expect(stable.updater.allowPrerelease).toBe(false);
  });

  it("reports a release, download progress and readiness without installing on its own", async () => {
    const { updater, service, changed } = fixture();
    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    updater.emit("update-available", { version: "0.1.0-beta.4" });
    expect(service.state().status).toBe("available");
    await service.download();
    updater.emit("download-progress", { percent: 47.4 });
    expect(service.state().progress).toBe(47);
    updater.emit("update-downloaded", { version: "0.1.0-beta.4" });
    expect(service.state()).toMatchObject({ status: "downloaded", version: "0.1.0-beta.4" });
    expect(changed).toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("offers a stable successor to an RC before looking for another RC", async () => {
    const updater = fixture().updater;
    const channels: boolean[] = [];
    updater.checkForUpdates.mockImplementation(async () => {
      channels.push(updater.allowPrerelease);
      updater.emit("update-available", { version: "0.1.0" });
      return null;
    });
    const service = createAppUpdateService({ updater, currentVersion: "0.1.0-rc.4", canInstall: () => true, changed: vi.fn() });
    expect(await service.check()).toMatchObject({ status: "available", version: "0.1.0" });
    expect(channels).toEqual([false]);
  });

  it("checks RCs when no newer stable release exists or the stable feed is absent", async () => {
    for (const missing of [false, true]) {
      const updater = fixture().updater;
      const channels: boolean[] = [];
      updater.checkForUpdates.mockImplementation(async () => {
        channels.push(updater.allowPrerelease);
        if (!updater.allowPrerelease) {
          if (missing) throw new Error("no stable release");
          updater.emit("update-not-available");
        } else updater.emit("update-available", { version: "0.1.0-rc.5" });
        return null;
      });
      const service = createAppUpdateService({ updater, currentVersion: "0.1.0-rc.4", canInstall: () => true, changed: vi.fn() });
      expect(await service.check()).toMatchObject({ status: "available", version: "0.1.0-rc.5" });
      expect(channels).toEqual([false, true]);
    }
  });

  it("does not recheck or overwrite a download started while a stable check completes", async () => {
    const updater = fixture().updater;
    let finish!: () => void;
    updater.checkForUpdates.mockImplementationOnce(() => {
      updater.emit("update-available", { version: "0.1.0" });
      return new Promise<null>((resolve) => { finish = () => resolve(null); });
    });
    const service = createAppUpdateService({ updater, currentVersion: "0.1.0-rc.4", canInstall: () => true, changed: vi.fn() });
    const checking = service.check();
    await service.download();
    updater.emit("update-downloaded", { version: "0.1.0" });
    finish();
    await checking;
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(service.state()).toMatchObject({ status: "downloaded", version: "0.1.0" });
  });

  it("blocks restart before download, with unsaved work, and repeated requests", () => {
    let safe = false;
    const { updater, service } = fixture(() => safe);
    expect(service.install().ok).toBe(false);
    updater.emit("update-downloaded", { version: "0.1.0-beta.4" });
    expect(service.install().ok).toBe(false);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    safe = true;
    expect(service.install().ok).toBe(true);
    expect(service.install().ok).toBe(false);
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
  });

  it("serializes checks and does not recheck while downloading or ready", async () => {
    const { updater, service } = fixture();
    let done!: () => void;
    updater.checkForUpdates.mockImplementation(() => new Promise<void>((resolve) => { done = resolve; }));
    const pending = service.check();
    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    done(); await pending;
    updater.emit("update-available", { version: "0.2.0" });
    await service.download();
    await service.download();
    await service.check();
    updater.emit("update-downloaded", { version: "0.2.0" });
    await service.check();
    expect(updater.downloadUpdate).toHaveBeenCalledOnce();
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it("handles network and installer failures without quitting or disabling the close guard", async () => {
    const { updater, service } = fixture();
    updater.checkForUpdates.mockRejectedValue(new Error("offline"));
    await service.check();
    expect(service.state().status).toBe("error");
    updater.emit("update-downloaded", { version: "0.2.0" });
    updater.quitAndInstall.mockImplementation(() => { updater.emit("error", new Error("installer failed")); });
    expect(service.install().ok).toBe(false);
    expect(service.state().status).toBe("error");
  });

  it("does not perform network requests in unsupported installations", async () => {
    const service = createAppUpdateService({ updater: null, currentVersion: "1.0.0", canInstall: () => true, changed: vi.fn() });
    await service.check(); await service.download();
    expect(service.state().status).toBe("disabled");
    expect(service.install().ok).toBe(false);
  });
});
