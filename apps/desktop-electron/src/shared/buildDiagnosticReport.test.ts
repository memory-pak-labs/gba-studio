import { describe, expect, it } from "vitest";
import { buildDiagnosticReport } from "./buildDiagnosticReport.js";

describe("shareable build diagnostics", () => {
  it("rejects non-boolean configuration values from malformed metadata", () => {
    const report = buildDiagnosticReport({ ran: true, exitCode: 0,
      environment: { incrementalCache: "/Users/private", customCompilerFlags: "secret-token" } as never
    });
    expect(report.configuration.incrementalCache).toBeNull();
    expect(report.configuration.customCompilerFlags).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/private|secret-token/);
  });
  it("reports versions, used configuration and probable cause without raw private data", () => {
    const report = buildDiagnosticReport({ ran: true, exitCode: 2,
      stdout: '/Users/alice/Private Game/main.cpp -DTOKEN=secret-user-token\n',
      stderr: 'ld: section .ewram_bss will not fit in region ewram\nregion ewram overflowed by 1704 bytes',
      error: 'https://alice:password@example.com?token=secret-user-token',
      environment: { capturedAt: "2026-10-22T23:00:00Z", editorVersion: "0.1.0", engineVersion: "2.24.0", compilerVersion: "15.1.0", platform: "darwin", arch: "arm64", kind: "mixed", makeTarget: "all", incrementalCache: true, customCompilerFlags: false }
    });
    expect(report.versions).toEqual({ editor: "0.1.0", enginePack: "2.24.0", compiler: "15.1.0" });
    expect(report.probableCause.code).toBe("EWRAM_OVERFLOW");
    expect(report.configuration).toMatchObject({ kind: "mixed", incrementalCache: true });
    const text = JSON.stringify(report);
    for (const privateValue of ["alice", "Private Game", "secret-user-token", "password", "example.com", "/Users/"]) expect(text).not.toContain(privateValue);
    expect(report.rawLogsIncluded).toBe(false);
  });
  it("does not invent a cause or version when evidence is unavailable", () => {
    const report = buildDiagnosticReport({ ran: false, exitCode: null, error: "unknown failure" });
    expect(report.probableCause.code).toBe("UNKNOWN");
    expect(report.versions.compiler).toBeNull();
    expect(report.status).toBe("not-started");
  });
  it("uses doctor codes without including private blocker messages", () => {
    const report = buildDiagnosticReport({ ran: false, exitCode: null }, {
      ok: false, version: null, enginePackPath: "/Users/alice/pack", platform: "darwin", engineVersion: "2.24.0", checksPassed: 2, checksTotal: 3,
      blockers: [{ id: "GBS_DOCTOR_TOOLCHAIN", message: "/Users/alice/secret" }]
    });
    expect(report.doctor).toMatchObject({ ok: false, checksPassed: 2, codes: ["GBS_DOCTOR_TOOLCHAIN"] });
    expect(JSON.stringify(report)).not.toContain("alice");
  });
});
