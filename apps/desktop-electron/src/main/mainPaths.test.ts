import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { preloadScriptPath } from "./mainPaths.js";

describe("main process paths", () => {
  it("points BrowserWindow at the electron-vite preload output", () => {
    expect(preloadScriptPath("/app/dist/main")).toBe(join("/app/dist/main", "../preload/preload.mjs"));
  });
});
