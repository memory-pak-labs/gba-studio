import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Arch } from "builder-util";

import { hardenMacInfoPlistFile } from "./macos-bundle-hardening.mjs";
import { recordSignedCfbExecutable } from "./sign-cartridge-tools.mjs";
import { isUniversalMacIntermediate } from "./prepare-cartridge-tools.mjs";

export async function prunePackagedCartridgeTools(appBundle, architecture, appOutDir = "") {
  if (architecture === "universal" || isUniversalMacIntermediate(appOutDir)) return;
  if (architecture !== "arm64" && architecture !== "x64") {
    throw new Error(`Arquitetura macOS desconhecida: ${architecture}`);
  }
  const other = architecture === "arm64" ? "x64" : "arm64";
  // This is only the disposable output bundle; the source tool cache stays intact.
  await rm(join(appBundle, "Contents", "Resources", "cartridge-tools", `darwin-${other}`), { recursive: true, force: true });
}

export async function afterPack(context) {
  // Windows signs extra executables during copying, before afterPack.
  if (context.electronPlatformName === "win32") {
    await recordSignedCfbExecutable(join(context.appOutDir, "resources/cartridge-tools/win32-x64"));
  }
  if (context.electronPlatformName !== "darwin") return;

  const entries = await readdir(context.appOutDir, { withFileTypes: true });
  const appBundle = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (!appBundle) {
    throw new Error(`Bundle macOS nao encontrado em ${context.appOutDir}.`);
  }

  const appPath = join(context.appOutDir, appBundle.name);
  await prunePackagedCartridgeTools(appPath, Arch[context.arch], context.appOutDir);
  await hardenMacInfoPlistFile(join(appPath, "Contents", "Info.plist"));
}

export default afterPack;
