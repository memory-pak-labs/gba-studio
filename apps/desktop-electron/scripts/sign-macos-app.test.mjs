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
  it("lets ad-hoc command-line tools load bundled libraries without adding JIT entitlements", () => {
    for (const file of ["/tmp/gba-studio.app/Contents/Resources/Runtime/Python/bin/python3.13", "/tmp/gba-studio.app/Contents/Resources/Toolchain/devkitARM/bin/arm-none-eabi-g++", "/tmp/gba-studio.app/Contents/Resources/Toolchain/devkitARM/libexec/gcc/arm-none-eabi/15.2.1/cc1plus"]) {
      expect(localSigningOptions(file).entitlements).toEqual(["com.apple.security.cs.disable-library-validation"]);
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
      const tools = join(app, "Contents/Resources/Runtime/bin");
      await mkdir(tools, { recursive: true });
      await writeFile(join(root, "probe-library.c"), "int fixture_value(void) { return 42; }\n");
      await writeFile(join(root, "probe-loader.c"), '#include <dlfcn.h>\n#include <stdio.h>\nint main(int argc, char **argv) { void *lib = dlopen(argv[1], RTLD_NOW); if (!lib) { puts(dlerror()); return 1; } int (*value)(void) = dlsym(lib, "fixture_value"); return value && value() == 42 ? 0 : 2; }\n');
      const library = join(tools, "fixture.dylib");
      const loader = join(tools, "fixture-loader");
      execFileSync("/usr/bin/clang", ["-dynamiclib", join(root, "probe-library.c"), "-o", library]);
      execFileSync("/usr/bin/clang", [join(root, "probe-loader.c"), "-o", loader]);
      await signMacosAppAdHoc(app);
      execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
      // Bundled Python/GCC load their own libraries in separate CLI processes.
      execFileSync(loader, [library]);
      const signature = execFileSync("/usr/bin/codesign", ["-d", "--entitlements", ":-", app], { encoding: "utf8" });
      expect(signature).toContain("com.apple.security.cs.disable-library-validation");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
