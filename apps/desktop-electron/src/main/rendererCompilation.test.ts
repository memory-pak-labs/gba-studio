import { describe, expect, it, vi } from "vitest";
import { configureRendererCompilation } from "./rendererCompilation.js";

function fixture(translated = true, existingFlags = "") {
  return { runningUnderARM64Translation: translated, commandLine: {
    getSwitchValue: vi.fn(() => existingFlags), appendSwitch: vi.fn()
  } };
}

describe("macOS Intel renderer compilation policy", () => {
  it.each([
    ["darwin", "arm64", true],
    ["win32", "x64", true], ["linux", "x64", true]
  ] as const)("preserves the native runtime on %s/%s (translated=%s)", (platform, arch, translated) => {
    const app = fixture(translated);
    configureRendererCompilation(app, platform, arch);
    expect(app.commandLine.appendSwitch).not.toHaveBeenCalled();
  });

  it("compiles native Intel emulation at the optimized Wasm tier before the first renderer", () => {
    const app = fixture(false);
    configureRendererCompilation(app, "darwin", "x64");
    expect(app.commandLine.appendSwitch).toHaveBeenCalledOnce();
    const [name, flags] = app.commandLine.appendSwitch.mock.calls[0];
    expect(name).toBe("js-flags");
    expect(flags).toContain("--no-maglev");
    expect(flags).not.toContain("--max-opt=");
    expect(flags).not.toContain("--always-sparkplug");
    expect(flags.split(" ")).toEqual(expect.arrayContaining([
      "--no-liftoff", "--no-wasm-lazy-compilation", "--no-wasm-tier-up"
    ]));
  });

  it("preserves native Intel launcher diagnostics", () => {
    const app = fixture(false, "--trace-gc");
    configureRendererCompilation(app, "darwin", "x64");
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith("js-flags", expect.stringMatching(/^--trace-gc /));
  });

  it("retains the single JavaScript tier under Rosetta", () => {
    const app = fixture();
    configureRendererCompilation(app, "darwin", "x64");
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith("js-flags",
      "--max-opt=1 --always-sparkplug --no-liftoff --no-wasm-lazy-compilation --no-wasm-tier-up");
  });

  it("preserves unrelated flags supplied by the launcher", () => {
    const app = fixture(true, "--trace-gc");
    configureRendererCompilation(app, "darwin", "x64");
    expect(app.commandLine.appendSwitch.mock.calls[0][1]).toMatch(/^--trace-gc --max-opt=1 /);
  });
});
