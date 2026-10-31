import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { auditExportEventCommandCoverage, buildEngineExportProjectContract } from "./exportEngineProject.js";

const canonicalImportedProjectPath = path.join(
  process.cwd(),
  "default-assets",
  "templates",
  "exemplo-gba",
  "exemplo-gba.gba-project"
);

describe("canonical GB Studio imported project", () => {
  it("requires only features declared by the current Engine Pack", async () => {
    const project = parseGBAProjectFile(await readFile(canonicalImportedProjectPath, "utf8")).data;
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "../../packages/GBAStudioEngine/enginepack.json"), "utf8"));
    const supported = new Set<string>();
    for (const [group, values] of Object.entries(manifest.capabilities as Record<string, unknown>)) {
      supported.add(group);
      for (const value of Array.isArray(values) ? values : typeof values === "string" ? [values] : []) {
        if (typeof value === "string") { supported.add(value); supported.add(`${group}.${value}`); }
      }
    }
    expect(buildEngineExportProjectContract(project).requires.features.filter(feature => !supported.has(feature))).toEqual([]);
    const withRuntimeCondition = structuredClone(project);
    for (const key of ["rooms", "scenas"] as const) {
      const room = (withRuntimeCondition[key] as any[]).find(scene => scene.name === "menu_start");
      room.runtime.config.items[0].availableRuntime = "racing";
    }
    const conditionalFeatures = buildEngineExportProjectContract(withRuntimeCondition).requires.features;
    expect(conditionalFeatures).toContain("menu_runtime_conditions");
    expect(conditionalFeatures.filter(feature => !supported.has(feature))).toEqual([]);
  });

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
