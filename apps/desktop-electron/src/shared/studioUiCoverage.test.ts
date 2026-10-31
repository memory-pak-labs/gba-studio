import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("primary language coverage gates", () => {
  it("rejects missing UI copy and untranslated JSX text across the renderer", () => {
    const script = fileURLToPath(new URL("../../scripts/audit-ui-copy.mjs", import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--json"], { encoding: "utf8" }));
    expect(report.references).toBeGreaterThan(3000);
    expect(report.missing).toEqual([]);
    expect(report.hardcoded).toEqual([]);
  });
  it("reports measured primary coverage without claiming all additional languages are complete", () => {
    const script = fileURLToPath(new URL("../../scripts/report-i18n-coverage.mjs", import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [script, "--json"], { encoding: "utf8" }));
    for (const locale of ["pt-BR", "en-US", "es-ES"]) {
      expect(report.locales.find((item: { locale: string }) => item.locale === locale).fallbackCount).toBe(0);
      expect(report.uiCatalogCoverage.find((item: { locale: string }) => item.locale === locale).missingKeys).toEqual([]);
    }
    const markdown = execFileSync(process.execPath, [script], { encoding: "utf8" });
    expect(markdown).not.toContain("Os 11 idiomas adicionais possuem cobertura explícita de todas");
  });
});
