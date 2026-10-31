import { describe, expect, it } from "vitest";
import { macosPackageArguments } from "./package-macos.mjs";
import { hasExactMacArchitecture, macosMachOArchitecture } from "./macos-universal-runtime.mjs";
import { embeddedRuntimeArchitecture } from "./prepare-embedded-runtime.mjs";

describe("separate macOS packages", () => {
  it.each([["arm64", "arm64"], ["x64", "x86_64"]])("keeps %s Electron and runtime architectures aligned", (electron, machO) => {
    expect(macosMachOArchitecture(electron)).toBe(machO);
    expect(embeddedRuntimeArchitecture({ GBA_STUDIO_MAC_ARCH: electron })).toBe(electron);
    expect(macosPackageArguments(electron)).toEqual(["--mac", `--${electron}`, "--publish", "never"]);
    expect(macosPackageArguments(electron, true)).toContain("--dir");
    expect(hasExactMacArchitecture([machO], electron)).toBe(true);
    expect(hasExactMacArchitecture(["arm64", "x86_64"], electron)).toBe(false);
    expect(hasExactMacArchitecture([machO === "arm64" ? "x86_64" : "arm64"], electron)).toBe(false);
  });
  it("rejects unsupported and conflicting architecture requests", () => {
    expect(() => macosPackageArguments("universal")).toThrow("Arquitetura macOS desconhecida");
    expect(() => embeddedRuntimeArchitecture({ GBA_STUDIO_MAC_ARCH: "x64", GBA_STUDIO_REQUIRE_UNIVERSAL_RUNTIME: "1" })).toThrow("nunca ambos");
  });
});
