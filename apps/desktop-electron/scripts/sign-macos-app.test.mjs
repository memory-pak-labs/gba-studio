import { describe, expect, it } from "vitest";
import { localSigningOptions } from "./sign-macos-app.mjs";

describe("macOS ad-hoc signing for CI", () => {
  it("allows Electron apps to load the ad-hoc framework", () => {
    for (const file of ["/tmp/gba-studio.app", "/tmp/gba-studio.app/Contents/MacOS/gba-studio", "/tmp/gba-studio.app/Contents/Frameworks/gba-studio Helper.app"]) {
      expect(localSigningOptions(file)).toMatchObject({ entitlements: expect.stringContaining("entitlements.mac.local.plist"), hardenedRuntime: true });
    }
  });
  it("keeps Electron framework and bundled compiler libraries without app entitlements", () => {
    for (const file of ["/tmp/gba-studio.app/Contents/Frameworks/Electron Framework.framework", "/tmp/gba-studio.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework", "/tmp/gba-studio.app/Contents/Resources/Runtime/Python/lib/libpython.dylib"]) {
      expect(localSigningOptions(file)).toEqual({ entitlements: [], hardenedRuntime: true, timestamp: "none" });
    }
  });
});
