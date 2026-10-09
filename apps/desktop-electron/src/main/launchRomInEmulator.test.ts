import { describe, expect, it } from "vitest";
import { resolveEmulatorLaunchPlan } from "../shared/emulatorLaunch.js";

describe("launchRomInEmulator planning", () => {
  it("keeps macOS app bundle launches separate from binary spawns", () => {
    expect(resolveEmulatorLaunchPlan({
      emulatorPath: "/Applications/mGBA.app",
      romPath: "/tmp/game.gba",
      platform: "darwin"
    }).kind).toBe("macos-open-app");

    expect(resolveEmulatorLaunchPlan({
      emulatorPath: "/opt/homebrew/bin/mgba",
      romPath: "/tmp/game.gba",
      platform: "darwin"
    }).kind).toBe("spawn");
  });
});
