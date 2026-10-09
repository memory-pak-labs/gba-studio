import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { hardenMacInfoPlistFile } from "./macos-bundle-hardening.mjs";

export async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const entries = await readdir(context.appOutDir, { withFileTypes: true });
  const appBundle = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (!appBundle) {
    throw new Error(`Bundle macOS nao encontrado em ${context.appOutDir}.`);
  }

  await hardenMacInfoPlistFile(join(context.appOutDir, appBundle.name, "Contents", "Info.plist"));
}

export default afterPack;
