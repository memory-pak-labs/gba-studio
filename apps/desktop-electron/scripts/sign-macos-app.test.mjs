import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localSigningOptions, signMacosAppAdHoc } from "./sign-macos-app.mjs";

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
  it.skipIf(process.platform !== "darwin")("signs a real Mach-O app with the installed osx-sign API", async () => {
    const root = await mkdtemp(join(tmpdir(), "gba-studio-signing-test-"));
    const app = join(root, "Fixture.app");
    try {
      await mkdir(join(app, "Contents/MacOS"), { recursive: true });
      await writeFile(join(root, "fixture.c"), "int main(void) { return 0; }\n");
      await writeFile(join(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>br.com.gbastudio.signing-test</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string></dict></plist>`);
      execFileSync("/usr/bin/clang", [join(root, "fixture.c"), "-o", join(app, "Contents/MacOS/fixture")]);
      await signMacosAppAdHoc(app);
      execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
      const signature = execFileSync("/usr/bin/codesign", ["-d", "--entitlements", ":-", app], { encoding: "utf8" });
      expect(signature).toContain("com.apple.security.cs.disable-library-validation");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
