import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { sign } from "@electron/osx-sign";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const localEntitlementsPath = join(appRoot, "build/entitlements.mac.local.plist");

export function localSigningOptions(filePath) {
  const isApp = filePath.endsWith(".app") || filePath.includes("/Contents/MacOS/");
  return {
    entitlements: isApp ? localEntitlementsPath : [],
    hardenedRuntime: true,
    timestamp: "none"
  };
}

export async function signMacosAppAdHoc(appPath) {
  await sign({
    app: appPath,
    identity: "-",
    identityValidation: false,
    platform: "darwin",
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: true,
    ignore: JSON.parse(await readFile(join(appRoot, "package.json"), "utf8")).build.mac.signIgnore,
    optionsForFile: localSigningOptions
  });
}

function packagedAppPath() {
  return [
    join(appRoot, "release/mac-universal/gba-studio.app"),
    join(appRoot, "release/mac-arm64/gba-studio.app"),
    join(appRoot, "release/mac/gba-studio.app"),
    join(appRoot, "release/mac-arm64/GBA Studio.app"),
    join(appRoot, "release/mac/GBA Studio.app")
  ].find((candidate) => existsSync(candidate));
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("[sign-macos-app] skipped: current platform is not macOS.");
    return;
  }

  const appPath = packagedAppPath();
  if (!appPath) {
    throw new Error("Packaged macOS app not found. Run electron-builder before signing.");
  }

  const { stdout: identities } = await execFileAsync("security", ["find-identity", "-v", "-p", "codesigning"], {
    maxBuffer: 1024 * 1024
  });
  const developerID = identities.match(/\"(Developer ID Application: [^\"]+)\"/)?.[1] ?? null;

  if (developerID) {
    await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
      maxBuffer: 8 * 1024 * 1024
    });
    console.log(`[sign-macos-app] ok: preserved ${developerID}`);
    console.log(`[sign-macos-app] app: ${appPath}`);
    return;
  }

  await signMacosAppAdHoc(appPath);
  await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
    maxBuffer: 8 * 1024 * 1024
  });

  console.log("[sign-macos-app] ok: ad-hoc local signature");
  console.log(`[sign-macos-app] app: ${appPath}`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error("[sign-macos-app] failed");
  console.error(error);
  process.exit(1);
});
