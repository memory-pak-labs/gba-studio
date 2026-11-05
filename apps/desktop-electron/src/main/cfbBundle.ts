import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import source from "../../scripts/cfb-support-source.json" with { type: "json" };

export interface CfbBundle { executable: string; version: string }
export function cartridgeToolsRoot(isPackaged: boolean, appPath: string, resourcesPath: string): string {
  return isPackaged ? join(resourcesPath, "cartridge-tools") : join(appPath, "build", "cartridge-tools");
}

/** The manifest comes from app resources, never from the writable helper cache. */
export async function loadCfbBundle(root: string, platform: string, arch: string): Promise<CfbBundle | undefined> {
  if (!["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"].includes(`${platform}-${arch}`)) return undefined;
  const directory = join(root, `${platform}-${arch}`);
  let text: string;
  try { text = await readFile(join(directory, "manifest.json"), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  const manifest = JSON.parse(text);
  if (manifest.schemaVersion !== 1 || manifest.version !== source.version || manifest.sourceCommit !== source.commit || manifest.patchSha256 !== source.patchSha256 || manifest.platform !== platform || manifest.arch !== arch) {
    throw new Error("Manifesto do suporte ChisFlash incompatível com esta versão do aplicativo.");
  }
  const binary = platform === "win32" ? "cfb.exe" : "cfb";
  for (const name of [binary, "COPYING", "corresponding-source.tar.gz"]) {
    const expected = manifest.files?.[name];
    if (!expected || !Number.isSafeInteger(expected.bytes) || expected.bytes <= 0 || expected.bytes > 50000000 || !/^[a-f0-9]{64}$/.test(expected.sha256)) throw new Error("Manifesto do suporte ChisFlash inválido.");
    const bytes = await readFile(join(directory, name));
    if (bytes.length !== expected.bytes || createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error(`Checksum do suporte ChisFlash inválido: ${name}.`);
  }
  return { executable: join(directory, binary), version: manifest.version };
}
