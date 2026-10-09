import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { signAsync } = require("@electron/osx-sign");
const localEntitlementsPath = join(appRoot, "build/entitlements.mac.local.plist");

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

  await signAsync({
    app: appPath,
    identity: "-",
    identityValidation: false,
    platform: "darwin",
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: true,
    optionsForFile: () => ({
      entitlements: localEntitlementsPath,
      hardenedRuntime: true,
      timestamp: "none"
    })
  });
  await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], {
    maxBuffer: 8 * 1024 * 1024
  });

  console.log("[sign-macos-app] ok: ad-hoc local signature");
  console.log(`[sign-macos-app] app: ${appPath}`);
}

main().catch((error) => {
  console.error("[sign-macos-app] failed");
  console.error(error);
  process.exit(1);
});
