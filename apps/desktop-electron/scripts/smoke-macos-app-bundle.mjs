import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { auditUniversalMachOTree } from "./macos-universal-runtime.mjs";

const execFileAsync = promisify(execFile);
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = join(
  process.env.GBA_STUDIO_SMOKE_OUTPUT_DIR || join(appRoot, "artifacts/macos-app/latest"),
  "bundle_evidence.json"
);

function firstExistingPath(paths) {
  return paths.find((item) => existsSync(item)) ?? paths[0];
}

function packagedAppPath() {
  if (process.env.GBA_STUDIO_PACKAGED_APP_PATH?.trim()) return process.env.GBA_STUDIO_PACKAGED_APP_PATH.trim();
  return firstExistingPath([
    join(appRoot, "release/mac-universal/gba-studio.app"),
    join(appRoot, "release/mac-arm64/gba-studio.app"),
    join(appRoot, "release/mac/gba-studio.app"),
    join(appRoot, "release/mac-arm64/GBA Studio.app"),
    join(appRoot, "release/mac/GBA Studio.app")
  ]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readInfoPlist(infoPlistPath) {
  const { stdout } = await execFileAsync("plutil", ["-convert", "json", "-o", "-", infoPlistPath], {
    maxBuffer: 1024 * 1024
  });
  return JSON.parse(stdout);
}

async function assertExecutable(filePath) {
  await access(filePath, constants.X_OK);
  const fileStat = await stat(filePath);
  assert(fileStat.isFile(), `Expected executable file at ${filePath}.`);
}

async function assertFile(filePath, label) {
  const fileStat = await stat(filePath);
  assert(fileStat.isFile(), `Expected ${label} at ${filePath}.`);
}

async function inspectCodeSignature(codePath, options = {}) {
  const verifyArguments = ["--verify", "--strict", "--verbose=2"];
  if (options.deep) verifyArguments.push("--deep");
  verifyArguments.push(codePath);
  await execFileAsync("codesign", verifyArguments, {
    maxBuffer: 1024 * 1024
  });
  const { stderr } = await execFileAsync("codesign", ["-dvvv", codePath], {
    maxBuffer: 1024 * 1024
  });
  const entitlementResult = await execFileAsync("codesign", ["--display", "--entitlements", ":-", codePath], {
    maxBuffer: 1024 * 1024
  });
  const entitlements = `${entitlementResult.stdout}\n${entitlementResult.stderr}`;
  const codeDirectoryFlags = stderr.match(/^CodeDirectory .* flags=[^\n]+$/m)?.[0] ?? "";
  return {
    path: codePath,
    valid: true,
    adHoc: stderr.includes("Signature=adhoc"),
    hardenedRuntime: codeDirectoryFlags.includes("runtime"),
    authority: stderr.match(/^Authority=(.+)$/m)?.[1] ?? null,
    teamIdentifier: stderr.match(/^TeamIdentifier=(.+)$/m)?.[1] ?? null,
    entitlements: {
      allowJit: entitlements.includes("com.apple.security.cs.allow-jit"),
      allowUnsignedExecutableMemory: entitlements.includes("com.apple.security.cs.allow-unsigned-executable-memory"),
      disableLibraryValidation: entitlements.includes("com.apple.security.cs.disable-library-validation")
    }
  };
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("[smoke-macos-app-bundle] skipped: current platform is not macOS.");
    return;
  }

  const appPath = packagedAppPath();
  const contentsPath = join(appPath, "Contents");
  const resourcesPath = join(contentsPath, "Resources");
  const infoPlistPath = join(contentsPath, "Info.plist");
  const iconPath = join(resourcesPath, "icon.icns");
  const projectIconPath = join(resourcesPath, "file-gbastudio.icns");
  const appAsarPath = join(resourcesPath, "app.asar");
  const frameworksPath = join(contentsPath, "Frameworks");

  assert(existsSync(appPath), `Packaged app was not found at ${appPath}. Run npm run package first.`);
  await assertFile(infoPlistPath, "Info.plist");
  await assertFile(iconPath, "icon.icns");
  await assertFile(projectIconPath, "file-gbastudio.icns");
  await assertFile(appAsarPath, "app.asar");

  const infoPlist = await readInfoPlist(infoPlistPath);
  const executablePath = join(contentsPath, "MacOS", infoPlist.CFBundleExecutable ?? "gba-studio");
  await assertExecutable(executablePath);
  const documentTypes = Array.isArray(infoPlist.CFBundleDocumentTypes) ? infoPlist.CFBundleDocumentTypes : [];
  const documentExtensions = documentTypes.flatMap((item) => item.CFBundleTypeExtensions ?? []);
  const projectDocumentType = documentTypes.find((item) => item.CFBundleTypeExtensions?.includes("gba-project"));

  assert(infoPlist.CFBundleIdentifier === "br.com.gbastudio.desktop", "Unexpected CFBundleIdentifier.");
  assert(infoPlist.CFBundleExecutable === "gba-studio", "Unexpected CFBundleExecutable.");
  assert(infoPlist.CFBundlePackageType === "APPL", "Unexpected CFBundlePackageType.");
  assert(infoPlist.CFBundleName === "GBA Studio" || infoPlist.CFBundleDisplayName === "GBA Studio", "Missing GBA Studio bundle name.");
  assert(infoPlist.CFBundleIconFile === "icon.icns", "Missing GBA Studio app icon.");
  assert(infoPlist.LSApplicationCategoryType === "public.app-category.developer-tools", "Unexpected macOS app category.");
  assert(documentExtensions.includes("gba-project"), "Missing .gba-project file association.");
  assert(documentExtensions.includes("gbastudio"), "Missing .gbastudio file association.");
  assert(projectDocumentType?.CFBundleTypeIconFile === "file-gbastudio.icns", "Missing .gba-project document icon.");
  assert(documentTypes.some((item) => item.CFBundleTypeRole === "Editor"), "Missing Editor document role.");
  const privacyUsageKeys = [
    "NSAudioCaptureUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSBluetoothPeripheralUsageDescription",
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription"
  ];
  for (const key of privacyUsageKeys) {
    assert(!(key in infoPlist), `Unused privacy prompt remains in Info.plist: ${key}.`);
  }
  const appTransportSecurity = infoPlist.NSAppTransportSecurity ?? {};
  const exceptionDomains = appTransportSecurity.NSExceptionDomains ?? {};
  assert(appTransportSecurity.NSAllowsArbitraryLoads === false, "NSAllowsArbitraryLoads must be false.");
  assert(appTransportSecurity.NSAllowsLocalNetworking === true, "Local player networking must remain allowed.");
  assert(
    JSON.stringify(Object.keys(exceptionDomains).sort()) === JSON.stringify(["127.0.0.1", "localhost"]),
    "ATS exceptions must be restricted to localhost and 127.0.0.1."
  );
  for (const domain of ["localhost", "127.0.0.1"]) {
    assert(exceptionDomains[domain]?.NSExceptionAllowsInsecureHTTPLoads === true, `Local HTTP exception missing for ${domain}.`);
    assert(exceptionDomains[domain]?.NSIncludesSubdomains === false, `Local ATS exception is too broad for ${domain}.`);
  }

  const codeSignature = await inspectCodeSignature(appPath, { deep: true });
  assert(codeSignature.hardenedRuntime, "Main app signature is missing hardened runtime.");
  assert(codeSignature.entitlements.allowJit, "Main app signature is missing allow-jit.");
  assert(codeSignature.entitlements.allowUnsignedExecutableMemory, "Main app signature is missing allow-unsigned-executable-memory.");
  assert(
    codeSignature.adHoc === codeSignature.entitlements.disableLibraryValidation,
    "Library validation may be disabled only for the local ad-hoc fallback."
  );

  const nestedEntries = (await readdir(frameworksPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && (entry.name.endsWith(".app") || entry.name.endsWith(".framework")))
    .map((entry) => join(frameworksPath, entry.name));
  const nestedSignatures = [];
  for (const nestedPath of nestedEntries) {
    const signature = await inspectCodeSignature(nestedPath, { deep: true });
    assert(signature.hardenedRuntime, `Nested Electron component is missing hardened runtime: ${nestedPath}.`);
    const isHelperApp = nestedPath.endsWith(".app");
    if (signature.adHoc && isHelperApp) {
      assert(signature.entitlements.disableLibraryValidation, `Ad-hoc helper cannot load Electron framework: ${nestedPath}.`);
    } else {
      assert(!signature.entitlements.disableLibraryValidation, `Unexpected library validation exception: ${nestedPath}.`);
    }
    nestedSignatures.push(signature);
  }
  const architectureAudit = await auditUniversalMachOTree(appPath);
  if (appPath.includes("mac-universal")) {
    assert(
      architectureAudit.invalid.length === 0,
      `Universal bundle contains single-arch Mach-O files: ${architectureAudit.invalid.map((item) => item.relativePath).join(", ")}.`
    );
  }

  const evidence = {
    ok: true,
    generatedAt: new Date().toISOString(),
    appPath,
    executablePath,
    bundleIdentifier: infoPlist.CFBundleIdentifier,
    bundleName: infoPlist.CFBundleDisplayName ?? infoPlist.CFBundleName,
    bundleVersion: infoPlist.CFBundleShortVersionString,
    category: infoPlist.LSApplicationCategoryType,
    documentExtensions,
    appIconFile: infoPlist.CFBundleIconFile,
    projectDocumentIconFile: projectDocumentType?.CFBundleTypeIconFile,
    hasIcon: existsSync(iconPath),
    hasProjectDocumentIcon: existsSync(projectIconPath),
    hasAppAsar: existsSync(appAsarPath),
    privacyUsageKeysRemoved: privacyUsageKeys,
    appTransportSecurity,
    codeSignature,
    nestedSignatures,
    architectureAudit: {
      machOBinaries: architectureAudit.total,
      invalid: architectureAudit.invalid
    }
  };

  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`[smoke-macos-app-bundle] ok: ${appPath}`);
  console.log(`[smoke-macos-app-bundle] evidence: ${evidencePath}`);
}

main().catch((error) => {
  console.error("[smoke-macos-app-bundle] failed");
  console.error(error);
  process.exit(1);
});
