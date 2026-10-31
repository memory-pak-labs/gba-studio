import { describe, expect, it, vi } from "vitest";
import { configureTranslatedRuntime } from "./translatedRuntime.js";

function fixture(translated = true, existingFlags = "") {
  return { runningUnderARM64Translation: translated, commandLine: {
    getSwitchValue: vi.fn(() => existingFlags), appendSwitch: vi.fn()
  } };
}

describe("Rosetta renderer compilation policy", () => {
  it.each([
    ["darwin", "arm64", true], ["darwin", "x64", false],
    ["win32", "x64", true], ["linux", "x64", true]
  ] as const)("preserves the native runtime on %s/%s (translated=%s)", (platform, arch, translated) => {
    const app = fixture(translated);
    configureTranslatedRuntime(app, platform, arch);
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it("uses one JavaScript tier and eagerly optimized Wasm only under Rosetta", () => {
    const app = fixture();
    configureTranslatedRuntime(app, "darwin", "x64");
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith("js-flags",
      "--max-opt=1 --always-sparkplug --no-liftoff --no-wasm-lazy-compilation --no-wasm-tier-up");
  });

  it("preserves unrelated flags supplied by the launcher", () => {
    const app = fixture(true, "--trace-gc");
    configureTranslatedRuntime(app, "darwin", "x64");
    expect(app.commandLine.appendSwitch.mock.calls[0][1]).toMatch(/^--trace-gc --max-opt=1 /);
  });
});
