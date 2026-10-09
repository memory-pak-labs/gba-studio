import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { validateReleaseArtifacts } from "./validate-ci-artifacts.mjs";

async function withReleaseDir(files, callback) {
  const releaseDir = await mkdtemp(join(tmpdir(), "gbastudio-release-"));
  try {
    await Promise.all(
      Object.entries(files).map(([name, size]) => writeFile(join(releaseDir, name), Buffer.alloc(size)))
    );
    await callback(releaseDir);
  } finally {
    await rm(releaseDir, { force: true, recursive: true });
  }
}

describe("validateReleaseArtifacts", () => {
  it("accepts the expected macOS package formats when they are non-empty", async () => {
    await withReleaseDir(
      {
        "GBA Studio-0.1.0-arm64.dmg": 2048,
        "GBA Studio-0.1.0-arm64-mac.zip": 2048
      },
      async (releaseDir) => {
        const report = await validateReleaseArtifacts({ platform: "macos", releaseDir, minBytes: 1024 });

        expect(report.ok).toBe(true);
        expect(report.items.map((item) => item.extension)).toEqual([".dmg", ".zip"]);
      }
    );
  });

  it("reports missing and undersized artifacts for Linux", async () => {
    await withReleaseDir(
      {
        "GBA Studio-0.1.0.AppImage": 16,
        "GBA Studio-0.1.0.deb": 2048
      },
      async (releaseDir) => {
        const report = await validateReleaseArtifacts({ platform: "linux", releaseDir, minBytes: 1024 });

        expect(report.ok).toBe(false);
        expect(report.blockers).toContain("Artefato .AppImage tem tamanho invalido.");
        expect(report.blockers).toContain("Artefato .tar.gz ausente.");
      }
    );
  });
});
