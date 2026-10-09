import { describe, expect, it } from "vitest";
import { resolveMainWindowBounds, resolveMainWindowChrome } from "./windowOptions.js";

describe("resolveMainWindowBounds", () => {
  it("uses a wide editor window close to the main display proportion", () => {
    expect(resolveMainWindowBounds({ width: 2560, height: 1440 })).toEqual({
      width: 1600,
      height: 1040,
      minWidth: 900,
      minHeight: 800
    });
  });

  it("keeps the initial window inside smaller laptop work areas", () => {
    expect(resolveMainWindowBounds({ width: 1440, height: 900 })).toEqual({
      width: 1274,
      height: 828,
      minWidth: 900,
      minHeight: 800
    });
  });

  it("preserves the reference proportion when height is constrained", () => {
    expect(resolveMainWindowBounds({ width: 1440, height: 700 })).toEqual({
      width: 991,
      height: 644,
      minWidth: 900,
      minHeight: 644
    });
  });

  it("does not force minimum bounds beyond compact displays", () => {
    expect(resolveMainWindowBounds({ width: 1200, height: 760 })).toEqual({
      width: 1075,
      height: 699,
      minWidth: 900,
      minHeight: 699
    });
  });

  it("opens with the reference display proportion when the work area matches it", () => {
    expect(resolveMainWindowBounds({ width: 1470, height: 956 })).toEqual({
      width: 1352,
      height: 879,
      minWidth: 900,
      minHeight: 800
    });
  });
});

describe("main window chrome", () => {
  it("keeps native macOS controls in the workspace header", () => {
    expect(resolveMainWindowChrome("darwin")).toEqual({
      titleBarStyle: "hidden", trafficLightPosition: { x: 16, y: 19 }
    });
  });
  it.each(["win32", "linux"] as const)("preserves native chrome on %s", (platform) => {
    expect(resolveMainWindowChrome(platform)).toEqual({});
  });
});
