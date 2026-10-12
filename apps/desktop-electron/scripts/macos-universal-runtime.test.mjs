import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  auditUniversalMachOTree,
  hasUniversalMacArchitectures,
  macosVersionExceeds,
  matchingMachORelativePaths,
  parseMinimumMacosVersions,
  parseLipoArchitectures
} from "./macos-universal-runtime.mjs";

describe("macOS universal runtime", () => {
  it.skipIf(process.platform !== "darwin")("audits literal Electron helper names ending in parentheses", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "gba-macos-audit-"));
    try {
      await copyFile(process.execPath, path.join(root, "GBA Studio Helper (GPU)"));
      const audit = await auditUniversalMachOTree(root, { maximumMacosVersion: "99.0" });
      expect(audit.total).toBe(1);
      expect(audit.binaries[0].minimumMacosVersions.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("excludes bytecode and static archives from codesign while retaining native executables and libraries", () => {
    const config = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const ignored = (file) => config.build.mac.signIgnore.some((pattern) => new RegExp(pattern).test(file));
    expect(ignored("Runtime/Python/lib/python3.13/__pycache__/typing.cpython-313.pyc")).toBe(true);
    expect(ignored("Toolchain/devkitARM/lib/gcc/arm-none-eabi/libgcc.a")).toBe(true);
    for (const file of ["MacOS/gba-studio", "Toolchain/bin/make", "Runtime/Python/bin/python3.13", "Runtime/Python/lib/libpython3.13.dylib", "Runtime/Python/lib/python3.13/lib-dynload/_ssl.cpython-313-darwin.so", "Toolchain/devkitARM/bin/arm-none-eabi-g++"]) expect(ignored(file)).toBe(false);
  });
  it("rejects host tools requiring a newer macOS than the advertised minimum", () => {
    expect(parseMinimumMacosVersions("cmd LC_BUILD_VERSION\n cmdsize 32\n platform MACOS\n minos 27.0\n sdk 27.0")).toEqual(["27.0"]);
    expect(parseMinimumMacosVersions("cmd LC_VERSION_MIN_MACOSX\n cmdsize 16\n version 10.13\n sdk 11.0")).toEqual(["10.13"]);
    expect(macosVersionExceeds("27.0", "12.0")).toBe(true);
    expect(macosVersionExceeds("10.15", "10.9")).toBe(true);
    expect(macosVersionExceeds("11.0", "12.0")).toBe(false);
  });
  it("requires both Apple Silicon and Intel slices", () => {
    expect(parseLipoArchitectures("x86_64 arm64\n")).toEqual(["arm64", "x86_64"]);
    expect(hasUniversalMacArchitectures(["arm64", "x86_64"])).toBe(true);
    expect(hasUniversalMacArchitectures(["arm64"])).toBe(false);
    expect(hasUniversalMacArchitectures(["x86_64"])).toBe(false);
  });

  it("rejects architecture-specific toolchains with different Mach-O layouts", () => {
    expect(matchingMachORelativePaths(["devkitARM/bin/g++", "tools/bin/grit"], [
      "tools/bin/grit",
      "devkitARM/bin/g++"
    ])).toEqual(["devkitARM/bin/g++", "tools/bin/grit"]);

    expect(() => matchingMachORelativePaths(
      ["devkitARM/bin/g++", "tools/bin/grit"],
      ["devkitARM/bin/g++"]
    )).toThrow(/layouts Mach-O diferentes/);
  });
});
