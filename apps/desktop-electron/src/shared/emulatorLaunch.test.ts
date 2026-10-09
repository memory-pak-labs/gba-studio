import { describe, expect, it } from "vitest";
import {
  emulatorConfiguredForPlay,
  resolveConfiguredEmulatorPath,
  resolveDefaultEmulatorPath,
  resolveEmulatorLaunchPlan
} from "./emulatorLaunch.js";

describe("emulatorLaunch", () => {
  it("uses the macOS mGBA.app default when emulatorPath is empty", () => {
    expect(resolveDefaultEmulatorPath("darwin")).toBe("/Applications/mGBA.app");
    expect(resolveConfiguredEmulatorPath("", "darwin")).toBe("/Applications/mGBA.app");
    expect(emulatorConfiguredForPlay("", "darwin")).toBe(true);
  });

  it("requires an explicit emulator path outside macOS defaults", () => {
    expect(resolveDefaultEmulatorPath("win32")).toBe("");
    expect(emulatorConfiguredForPlay("", "win32")).toBe(false);
    expect(emulatorConfiguredForPlay("C:\\Tools\\mGBA.exe", "win32")).toBe(true);
  });

  it("opens ROMs through macOS app bundles with open -a", () => {
    expect(resolveEmulatorLaunchPlan({
      emulatorPath: "/Applications/mGBA.app",
      romPath: "/tmp/demo/build/game.gba",
      platform: "darwin"
    })).toEqual({
      kind: "macos-open-app",
      emulatorPath: "/Applications/mGBA.app",
      romPath: "/tmp/demo/build/game.gba"
    });
  });

  it("spawns direct emulator binaries when configured", () => {
    expect(resolveEmulatorLaunchPlan({
      emulatorPath: "/usr/local/bin/mgba",
      romPath: "/tmp/demo/build/game.gba",
      platform: "darwin"
    })).toEqual({
      kind: "spawn",
      emulatorPath: "/usr/local/bin/mgba",
      romPath: "/tmp/demo/build/game.gba",
      spawnExecutable: "/usr/local/bin/mgba"
    });
  });

  it("does not throw when called without an explicit platform in an environment without the Node `process` global (renderer context)", () => {
    const originalProcess = globalThis.process;
    // @ts-expect-error simulating a browser/renderer execution context where `process` is undefined
    delete globalThis.process;

    try {
      expect(() => resolveDefaultEmulatorPath()).not.toThrow();
      expect(() => resolveConfiguredEmulatorPath("")).not.toThrow();
      expect(() => emulatorConfiguredForPlay("")).not.toThrow();
      expect(() => resolveEmulatorLaunchPlan({ emulatorPath: "", romPath: "/tmp/demo/build/game.gba" })).not.toThrow();
    } finally {
      globalThis.process = originalProcess;
    }
  });
});
