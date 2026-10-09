import { describe, expect, it } from "vitest";

import {
  hasUniversalMacArchitectures,
  matchingMachORelativePaths,
  parseLipoArchitectures
} from "./macos-universal-runtime.mjs";

describe("macOS universal runtime", () => {
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
