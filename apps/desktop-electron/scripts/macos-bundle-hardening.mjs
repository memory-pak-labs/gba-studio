import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const unusedPrivacyUsageKeys = [
  "NSAudioCaptureUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription"
];

const localPlayerException = Object.freeze({
  NSExceptionAllowsInsecureHTTPLoads: true,
  NSIncludesSubdomains: false
});

export function hardenMacInfoPlist(infoPlist) {
  const hardened = structuredClone(infoPlist);

  for (const key of unusedPrivacyUsageKeys) {
    delete hardened[key];
  }

  hardened.NSAppTransportSecurity = {
    NSAllowsArbitraryLoads: false,
    NSAllowsLocalNetworking: true,
    NSExceptionDomains: {
      localhost: { ...localPlayerException },
      "127.0.0.1": { ...localPlayerException }
    }
  };

  return hardened;
}

export async function hardenMacInfoPlistFile(infoPlistPath) {
  const { stdout } = await execFileAsync("plutil", ["-convert", "json", "-o", "-", infoPlistPath], {
    maxBuffer: 1024 * 1024
  });
  const hardened = hardenMacInfoPlist(JSON.parse(stdout));
  const temporaryJsonPath = join(dirname(infoPlistPath), `.Info.hardened-${process.pid}.json`);

  try {
    await writeFile(temporaryJsonPath, `${JSON.stringify(hardened, null, 2)}\n`, "utf8");
    await execFileAsync("plutil", ["-convert", "xml1", "-o", infoPlistPath, temporaryJsonPath], {
      maxBuffer: 1024 * 1024
    });
    await readFile(infoPlistPath);
  } finally {
    await rm(temporaryJsonPath, { force: true });
  }
}
