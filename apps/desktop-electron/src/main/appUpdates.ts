import type { AppUpdater } from "electron-updater";
import { posix, win32 } from "node:path";
import type { AppUpdateResult, AppUpdateState } from "../shared/appUpdates.js";
import type { WindowDocumentState } from "../shared/windowDocumentState.js";

export function supportsIntegratedUpdates(options: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
  executablePath: string;
  appImage?: string;
  exists(path: string): boolean;
}): boolean {
  const paths = options.platform === "win32" ? win32 : posix;
  if (!options.isPackaged || !options.exists(paths.join(options.resourcesPath, "app-update.yml"))) return false;
  if (options.platform === "darwin") return true;
  if (options.platform === "linux") return Boolean(options.appImage);
  return options.platform === "win32" && options.exists(paths.join(paths.dirname(options.executablePath),
    `Uninstall ${paths.basename(options.executablePath, ".exe")}.exe`));
}

export function canRestartForAppUpdate(documents: readonly (WindowDocumentState | undefined)[]): boolean {
  return documents.every((state) => state?.dirty === false
    && (Boolean(state.representedFilename) || state.title === "GBA Studio"));
}

type UpdateClient = Pick<AppUpdater, "autoDownload" | "autoInstallOnAppQuit" | "allowPrerelease" | "allowDowngrade" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall"> & {
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "update-available" | "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "update-not-available", listener: () => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
};

interface Options {
  updater: UpdateClient | null;
  currentVersion: string;
  canInstall(): boolean;
  changed(state: AppUpdateState): void;
}

/** Download and installation are explicit; quitting normally must never install. */
export function createAppUpdateService({ updater, currentVersion, canInstall, changed }: Options) {
  let state: AppUpdateState = { status: updater ? "idle" : "disabled", currentVersion };
  let checking = false;
  const snapshot = (): AppUpdateState => ({ ...state });
  const publish = (next: Omit<AppUpdateState, "currentVersion">) => {
    state = { ...next, currentVersion };
    changed({ ...state });
  };
  const fail = (error: unknown) => publish({ status: "error", error: error instanceof Error ? error.message : String(error) });

  if (updater) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = currentVersion.includes("-");
    updater.allowDowngrade = false;
    updater.on("error", fail);
    updater.on("update-available", (info) => publish({ status: "available", version: info.version }));
    updater.on("update-not-available", () => publish({ status: "not-available" }));
    updater.on("download-progress", (progress) => {
      if (state.status !== "downloading") return;
      publish({ status: "downloading", version: state.version, progress: Math.max(0, Math.min(100, Math.round(progress.percent))) });
    });
    updater.on("update-downloaded", (info) => publish({ status: "downloaded", version: info.version }));
  }

  return {
    state: (): AppUpdateState => ({ ...state }),
    async check(): Promise<AppUpdateState> {
      if (!updater || checking || ["downloading", "downloaded", "installing"].includes(state.status)) return { ...state };
      checking = true;
      publish({ status: "checking" });
      try { await updater.checkForUpdates(); } catch (error) { fail(error); }
      finally { checking = false; }
      return { ...state };
    },
    async download(): Promise<AppUpdateState> {
      if (!updater || state.status !== "available") return { ...state };
      publish({ status: "downloading", version: state.version, progress: 0 });
      try { await updater.downloadUpdate(); } catch (error) { fail(error); }
      return { ...state };
    },
    install(): AppUpdateResult {
      if (!updater || state.status !== "downloaded") return { ok: false, error: "A atualização ainda não está pronta para instalar." };
      if (!canInstall()) return { ok: false, error: "Salve todos os projetos antes de atualizar." };
      publish({ status: "installing", version: state.version });
      try { updater.quitAndInstall(false, true); } catch (error) { fail(error); }
      const afterInstall = snapshot();
      if (afterInstall.status === "error") return { ok: false, error: afterInstall.error };
      return { ok: true };
    }
  };
}
