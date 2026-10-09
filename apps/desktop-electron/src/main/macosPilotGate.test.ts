import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("gate:macos-pilot", () => {
  it("runs the complete-project checks before git diff hygiene and strict readiness", async () => {
    const script = await readFile(
      path.resolve(process.cwd(), "scripts/gate-macos-pilot.mjs"),
      "utf8"
    );

    const auditIndex = script.indexOf('label: "Auditoria piloto macOS"');
    const engineRomSmokeIndex = script.indexOf('label: "Smoke Engine ROM + mGBA"');
    const realProjectAuditIndex = script.indexOf('label: "Auditoria projeto real"');
    const functionalParityIndex = script.indexOf('label: "Auditoria paridade funcional"');
    const signingIndex = script.indexOf('label: "Auditoria signing macOS"');
    const diffIndex = script.indexOf('label: "Higiene do diff"');
    const strictIndex = script.indexOf('label: "Readiness macOS estrita"');

    expect(signingIndex).toBeGreaterThanOrEqual(0);
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(engineRomSmokeIndex).toBeGreaterThanOrEqual(0);
    expect(realProjectAuditIndex).toBeGreaterThanOrEqual(0);
    expect(functionalParityIndex).toBeGreaterThanOrEqual(0);
    expect(auditIndex).toBeGreaterThan(signingIndex);
    expect(realProjectAuditIndex).toBeGreaterThan(engineRomSmokeIndex);
    expect(functionalParityIndex).toBeGreaterThan(realProjectAuditIndex);
    expect(diffIndex).toBeGreaterThan(functionalParityIndex);
    expect(strictIndex).toBeGreaterThan(diffIndex);
    expect(script).toContain('command: "git"');
    expect(script).toContain('args: ["diff", "--check"]');
    expect(script).toContain('args: ["run", "audit:macos-signing", "--", "--strict"]');
    expect(script).not.toContain("smoke:functional-p0");
    expect(script).not.toContain("smoke:preview-p0");
    expect(script).not.toContain("smoke:engine-rom-p0");
    expect(script).toContain('args: ["run", "smoke:engine-rom", "--", "--open-mgba"]');
    expect(script).toContain('args: ["run", "audit:real-project", "--", "--strict"]');
    expect(script).toContain('args: ["run", "audit:functional-parity", "--", "--strict"]');
    expect(script).toContain('args: ["run", "audit:macos-pilot", "--", "--strict"]');
    expect(script).toContain("repoRoot");
  });
});
