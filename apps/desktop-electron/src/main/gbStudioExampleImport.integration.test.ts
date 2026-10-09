import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { auditExportEventCommandCoverage } from "./exportEngineProject.js";

const canonicalImportedProjectPath = path.join(
  process.cwd(),
  "default-assets",
  "templates",
  "exemplo-gba",
  "exemplo-gba.gba-project"
);

describe("canonical GB Studio imported project", () => {
  it("keeps the current imported Exemplo fixture migration-valid and export-complete", async () => {
    const project = parseGBAProjectFile(
      await readFile(canonicalImportedProjectPath, "utf8")
    ).data;

    expect(project).toMatchObject({
      schemaVersion: 1,
      name: "O Último Farol",
      gbStudioImport: {
        sourceProjectFile: "Exemplo.gbsproj",
        sourceVersion: "4.2.0",
        sourceRelease: "10",
        resourceCount: 281,
        translatedEventCount: 650,
        unsupportedEventCount: 0
      }
    });
    expect((project.rooms as unknown[]).length).toBeGreaterThan(0);
    const assets = Array.isArray(project.assets) ? project.assets : [];
    const animations = Array.isArray(project.animations) ? project.animations : [];
    expect(assets.length).toBeGreaterThan(0);
    expect(animations.length).toBeGreaterThan(0);
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);
    expect(auditExportEventCommandCoverage(project)).toEqual({
      ok: true,
      unsupported: []
    });

    const events = deriveEventsWorkspacePresentation(project);
    expect(events.summary.missingReferenceCount).toBe(0);
  });
});
