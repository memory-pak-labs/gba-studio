import { describe, expect, it } from "vitest";
import path from "node:path";

import { defaultWelcomeSavedProjectPath } from "./smoke-electron-welcome-paths.mjs";

describe("smoke electron welcome paths", () => {
  it("saves the example project inside a slugged project folder", () => {
    expect(defaultWelcomeSavedProjectPath("/tmp/gba-studio-electron-welcome-test")).toBe(
      path.join("/tmp/gba-studio-electron-welcome-test", "novo_projeto", "novo_projeto.gba-project")
    );
  });
});
