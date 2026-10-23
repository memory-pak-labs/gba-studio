import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { workflowJobText, createCrossPlatformPackageConfigReport } from "./audit-cross-platform-package-config.mjs";

describe("audit-cross-platform-package-config", () => {
  const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8");
  const options = () => ({
    packageJson: JSON.parse(read("../package.json")),
    workflowText: read("../../../.github/workflows/ci.yml"),
    desktopWorkflowText: read("../../../.github/workflows/desktop-packages.yml"),
    mainProcessText: read("../src/main/main.ts")
  });

  it("validates the canonical repository and current local-macOS/CI-Windows-Linux pipeline", () => {
    const report = createCrossPlatformPackageConfigReport(options());
    expect(report.blockers).toEqual([]);
    expect(report.status).toBe("ready");
    expect(report.note).toContain("nao substitui");
  });

  it("rejects an unsigned-off pipeline that omits installed-package smokes", () => {
    const input = options();
    input.desktopWorkflowText = input.desktopWorkflowText.replaceAll(/node scripts\/smoke-electron-exemplo-scenes\.mjs --packaged/g, "echo missing packaged scene smoke");
    const report = createCrossPlatformPackageConfigReport(input);
    expect(report.items.find(item => item.id === "ci-artifact-validation").state).toBe("blocked");
  });

  it("rejects a macOS distribution that omits the Intel installer", () => {
    const input = options();
    delete input.packageJson.scripts["dist:mac:x64"];
    const report = createCrossPlatformPackageConfigReport(input);
    expect(report.items.find(item => item.id === "macos-architectures").state).toBe("blocked");
  });

  it("rejects an unsigned DMG container independently of app signing", () => {
    const input = options();
    input.packageJson.build.dmg.sign = false;
    const report = createCrossPlatformPackageConfigReport(input);
    expect(report.items.find(item => item.id === "macos-dmg-signing").state).toBe("blocked");
  });

  it("rejects packaging before the strict audit", () => {
    const input = options();
    input.desktopWorkflowText = input.desktopWorkflowText.replace("npm run audit:cross-platform -- --strict", "echo audit omitted");
    const report = createCrossPlatformPackageConfigReport(input);
    expect(report.items.find(item => item.id === "ci-cross-platform-audit").state).toBe("blocked");
  });
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
