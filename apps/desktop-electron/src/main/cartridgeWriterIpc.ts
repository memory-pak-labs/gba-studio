import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cartridgeWriterChannels as channels, type CartridgePrepareRequest } from "../shared/cartridgeWriter.js";
import { CartridgeWriter } from "./cartridgeWriter.js";
import { ManagedCfbTool } from "./cfbTool.js";
import { cartridgeToolsRoot } from "./cfbBundle.js";
import { buildProjectRomArtifact } from "./webRomPipeline.js";

let writer: CartridgeWriter | undefined;
export function cartridgeWriteInProgress(): boolean { return writer?.isWriting ?? false; }

function isRendererFile(current: URL, renderer: string): boolean {
  if (current.href === renderer) return true;
  if (current.protocol !== "file:") return false;
  try {
    return realpathSync(fileURLToPath(current)) === realpathSync(fileURLToPath(renderer));
  } catch {
    return false;
  }
}

export function registerCartridgeWriterIpc(): void {
  const root = join(app.getPath("userData"), "cartridge-writer");
  writer = new CartridgeWriter({
    root, tool: new ManagedCfbTool(root, process.platform, process.arch, fetch, cartridgeToolsRoot(app.isPackaged, app.getAppPath(), process.resourcesPath)),
    build: request => buildProjectRomArtifact({ data: request.project.data, projectPath: request.projectPath }),
    progress: (owner, progress) => {
      const window = BrowserWindow.getAllWindows().find(w => w.webContents.id === owner);
      if (window && !window.isDestroyed()) window.webContents.send(channels.progress, progress);
    }
  });
  function owner(event: IpcMainInvokeEvent): number {
    if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error("Solicitação do gravador fora da janela do editor.");
    const current = new URL(event.senderFrame.url); current.hash = ""; current.search = "";
    const renderer = pathToFileURL(join(app.getAppPath(), "dist/renderer/index.html")).href;
    const dev = process.env.ELECTRON_RENDERER_URL;
    if (!isRendererFile(current, renderer) && (!dev || current.origin !== new URL(dev).origin)) throw new Error("Origem não autorizada para o gravador.");
    return event.sender.id;
  }
  ipcMain.handle(channels.status, event => writer!.status(owner(event)));
  ipcMain.handle(channels.install, event => { owner(event); return writer!.install(); });
  ipcMain.handle(channels.detect, event => { owner(event); return writer!.detect(); });
  ipcMain.handle(channels.prepare, (event, request: CartridgePrepareRequest) => writer!.prepare(owner(event), request));
  ipcMain.handle(channels.write, (event, token: string) => writer!.write(owner(event), token));
  ipcMain.handle(channels.discard, event => writer!.discard(owner(event)));
  app.on("web-contents-created", (_event, contents) => contents.once("destroyed", () => writer?.discard(contents.id)));
}
