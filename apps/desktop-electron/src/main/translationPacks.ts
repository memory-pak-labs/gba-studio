import { registerDesktopAssetProtocolScheme } from "./desktopAssetProtocol.js";
import { app, ipcMain, protocol } from "electron";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ipcChannels,
  type DownloadTranslationPackResult,
  type TranslationPackStatusResult
} from "../shared/ipc.js";
import type { TranslationPackCatalog, TranslationPackFile, TranslationPackManifest, TranslationPackStatus } from "../shared/translationPacks.js";

export const translationModelProtocol = "gba-translation";

const translationModelProtocolPath = "translation-models";

function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const candidate = path.resolve(candidatePath);
  const directory = path.resolve(directoryPath);
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
}

export function registerTranslationModelProtocolScheme(): void {
  registerDesktopAssetProtocolScheme([{
    scheme: translationModelProtocol,
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true
    }
  }]);
}

function catalogCandidates(appPath: string): string[] {
  return [
    path.join(appPath, "dist", "renderer", "translation-packs.json"),
    path.join(appPath, ".cache", "translation-runtime", "translation-packs.json")
  ];
}

async function readTranslationPackCatalog(appPath: string): Promise<TranslationPackCatalog> {
  for (const candidate of catalogCandidates(appPath)) {
    try {
      return JSON.parse(await readFile(candidate, "utf8")) as TranslationPackCatalog;
    } catch {
      // Try the next dev/packaged location.
    }
  }
  throw new Error("Catálogo de pacotes de tradução não encontrado. Execute prepare:translation-models.");
}

function bundledModelsRoot(appPath: string): string[] {
  return [
    path.join(appPath, "dist", "renderer", translationModelProtocolPath),
    path.join(appPath, ".cache", "translation-runtime", translationModelProtocolPath)
  ];
}

function userModelsRoot(): string {
  return path.join(app.getPath("userData"), translationModelProtocolPath);
}

function packFileEntries(pack: TranslationPackManifest): Array<{ pair: string; part: string; file: TranslationPackFile }> {
  return Object.entries(pack.files).flatMap(([pair, files]) => Object.entries(files).map(([part, file]) => ({ pair, part, file })));
}

async function fileMatchesChecksum(filePath: string, expectedHash: string): Promise<boolean> {
  try {
    const digest = createHash("sha256").update(await readFile(filePath)).digest("hex");
    return digest === expectedHash;
  } catch {
    return false;
  }
}

async function downloadTranslationFile(file: TranslationPackFile, destination: string): Promise<void> {
  if (await fileMatchesChecksum(destination, file.expectedSha256Hash)) return;

  const remote = new URL(file.remoteURL);
  if (remote.protocol !== "https:" || remote.hostname !== "storage.googleapis.com") {
    throw new Error(`Origem de modelo não autorizada: ${file.remoteURL}`);
  }

  const response = await fetch(remote);
  if (!response.ok) throw new Error(`Falha ao baixar modelo: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== file.expectedSha256Hash) throw new Error(`Checksum inválido para ${file.name}`);

  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function isPackInstalled(pack: TranslationPackManifest): Promise<boolean> {
  if (pack.bundled) return true;
  const root = userModelsRoot();
  const entries = packFileEntries(pack);
  if (entries.length === 0) return false;
  return (await Promise.all(entries.map(async ({ pair, file }) => {
    const candidate = path.join(root, pair, path.basename(file.name));
    return fileMatchesChecksum(candidate, file.expectedSha256Hash);
  }))).every(Boolean);
}

async function translationPackStatuses(): Promise<TranslationPackStatus[]> {
  const catalog = await readTranslationPackCatalog(app.getAppPath());
  return Promise.all(catalog.packs.map(async (pack): Promise<TranslationPackStatus> => ({
    id: pack.id,
    label: pack.label,
    description: pack.description,
    languages: pack.languages,
    bundled: pack.bundled,
    available: pack.available,
    installed: pack.available && await isPackInstalled(pack),
    sizeBytes: pack.sizeBytes,
    unavailableReason: pack.unavailableReason
  })));
}

export function registerTranslationPackIpcHandlers(): void {
  ipcMain.handle(ipcChannels.getTranslationPackStatus, async (): Promise<TranslationPackStatusResult> => {
    try {
      return { ok: true, packs: await translationPackStatuses() };
    } catch (error) {
      return { ok: false, packs: [], error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(ipcChannels.downloadTranslationPack, async (_event, packID: string): Promise<DownloadTranslationPackResult> => {
    try {
      const catalog = await readTranslationPackCatalog(app.getAppPath());
      const pack = catalog.packs.find((entry) => entry.id === packID);
      if (!pack) return { ok: false, error: "Pacote de tradução não encontrado." };
      if (pack.bundled) return { ok: true, packID: pack.id };
      if (!pack.available) return { ok: false, error: pack.unavailableReason ?? "Pacote indisponível." };

      for (const { pair, file } of packFileEntries(pack)) {
        const destination = path.join(userModelsRoot(), pair, path.basename(file.name));
        await downloadTranslationFile(file, destination);
      }
      return { ok: true, packID: pack.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(ipcChannels.removeTranslationPack, async (_event, packID: string): Promise<DownloadTranslationPackResult> => {
    try {
      const catalog = await readTranslationPackCatalog(app.getAppPath());
      const pack = catalog.packs.find((entry) => entry.id === packID);
      if (!pack) return { ok: false, error: "Pacote de tradução não encontrado." };
      if (pack.bundled) return { ok: false, error: "O pacote básico não pode ser removido." };

      await Promise.all(pack.pairs.map((pair) => rm(path.join(userModelsRoot(), pair), { force: true, recursive: true })));
      return { ok: true, packID: pack.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

async function resolveLocalModelPath(
  catalog: TranslationPackCatalog,
  pair: string,
  fileName: string
): Promise<string | null> {
  const file = catalog.packs
    .flatMap((pack) => Object.entries(pack.files[pair] ?? {}).map(([, entry]) => entry))
    .find((entry) => entry.name === fileName);
  if (!file || path.basename(file.name) !== fileName) return null;

  const roots = [userModelsRoot(), ...bundledModelsRoot(app.getAppPath())];
  for (const root of roots) {
    const candidate = path.resolve(root, pair, fileName);
    if (!isPathInsideDirectory(candidate, root)) continue;
    try {
      const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
      if (isPathInsideDirectory(realCandidate, realRoot)) return realCandidate;
    } catch {
      // Continue to the next packaged/user-data root.
    }
  }
  return null;
}

export function registerTranslationModelProtocol(): void {
  protocol.handle(translationModelProtocol, async (request) => {
    try {
      const url = new URL(request.url);
      const pair = url.searchParams.get("pair")?.trim() ?? "";
      const fileName = url.searchParams.get("file")?.trim() ?? "";
      if (!/^[a-z]{4}$/.test(pair) || !fileName || path.basename(fileName) !== fileName) {
        return new Response("Modelo inválido.", { status: 400 });
      }

      const catalog = await readTranslationPackCatalog(app.getAppPath());
      const modelPath = await resolveLocalModelPath(catalog, pair, fileName);
      if (!modelPath) return new Response("Modelo não instalado.", { status: 404 });
      const body = await readFile(modelPath);
      return new Response(new Uint8Array(body), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "Content-Type": "application/octet-stream"
        }
      });
    } catch {
      return new Response("Modelo não encontrado.", { status: 404 });
    }
  });
}
