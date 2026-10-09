import { describe, expect, it } from "vitest";

import { workflowJobText } from "./audit-cross-platform-package-config.mjs";

describe("audit-cross-platform-package-config", () => {
  it("extracts workflow jobs when Git checks out YAML with CRLF line endings", () => {
    const workflowText = [
      "name: CI",
      "",
      "jobs:",
      "  electron-desktop:",
      "    name: Electron Desktop",
      "    steps:",
      "      - name: Audit cross-platform package config",
      "        run: npm run audit:cross-platform -- --strict",
      "  package-local:",
      "    name: Package Electron macOS",
      "    steps:",
      "      - name: Package Electron app, zip and DMG",
      "        run: npm run dist:mac",
      ""
    ].join("\r\n");

    expect(workflowJobText(workflowText, "electron-desktop")).toContain("npm run audit:cross-platform");
    expect(workflowJobText(workflowText, "electron-desktop")).not.toContain("package-local");
  });
});
