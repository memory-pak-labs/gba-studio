import { protocol, type CustomScheme } from "electron";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, resolve, sep } from "node:path";

import { desktopAssetProtocol, parseDesktopAssetURL } from "../shared/spriteAssetURL.js";

export function registerDesktopAssetProtocolScheme(additionalSchemes: CustomScheme[] = []): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: desktopAssetProtocol,
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true
    }
  }, ...additionalSchemes]);
}

export function isPathInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const candidate = resolve(candidatePath);
  const directory = resolve(directoryPath);
  return candidate === directory || candidate.startsWith(`${directory}${sep}`);
}

function assetContentType(assetPath: string): string {
  switch (extname(assetPath).toLowerCase()) {
    case ".bmp":
      return "image/bmp";
    case ".gif":
      return "image/gif";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".mp3":
      return "audio/mpeg";
    case ".ogg":
      return "audio/ogg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".wav":
      return "audio/wav";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function resolveDesktopAssetPath(
  url: string,
  projectRoots: Iterable<string>
): Promise<string | null> {
  const requestedPath = parseDesktopAssetURL(url);
  if (!requestedPath || !isAbsolute(requestedPath)) return null;

  const candidatePath = resolve(requestedPath);
  for (const projectRoot of projectRoots) {
    const rootPath = resolve(projectRoot);
    if (!isPathInsideDirectory(candidatePath, rootPath)) continue;

    try {
      const [realRootPath, realCandidatePath] = await Promise.all([
        realpath(rootPath),
        realpath(candidatePath)
      ]);
      if (isPathInsideDirectory(realCandidatePath, realRootPath)) return realCandidatePath;
    } catch {
      return null;
    }
  }

  return null;
}

export function registerDesktopAssetProtocol(projectRoots: ReadonlySet<string>): void {
  protocol.handle(desktopAssetProtocol, async (request) => {
    const assetPath = await resolveDesktopAssetPath(request.url, projectRoots);
    if (!assetPath) return new Response("Asset fora do projeto aberto.", { status: 403 });

    try {
      const body = await readFile(assetPath);
      return new Response(new Uint8Array(body), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          "Content-Type": assetContentType(assetPath)
        }
      });
    } catch {
      return new Response("Asset não encontrado.", { status: 404 });
    }
  });
}
