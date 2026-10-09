import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { parseGBAProjectFile } from "./projectFile.js";
import { buildScenePreflightReport } from "./scenePreflight.js";
import {
  buildCompleteProjectFixture,
  COMPLETE_PROJECT_FIXTURE_REGISTRY,
  validateCompleteProjectFixture
} from "./completeProjectFixture.js";

const templatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
);

describe("complete structural project fixture", () => {
  it("covers every canonical scene without mutating production data or adding assets", () => {
    const source = parseGBAProjectFile(readFileSync(templatePath, "utf8")).data;
    const sourceSnapshot = JSON.stringify(source);
    const productionArena = buildScenePreflightReport(source, "arena_arrancada");

    const fixture = buildCompleteProjectFixture(source);
    const canonicalSceneCount = Array.isArray(source.rooms) ? source.rooms.length : 0;

    expect(JSON.stringify(source)).toBe(sourceSnapshot);
    expect(fixture.data).not.toBe(source);
    expect(fixture.data.assets).toEqual(source.assets);
    expect(fixture.data.fixture).toMatchObject({
      schema: 1,
      registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
      mode: "structural",
      productionReady: false
    });
    expect(fixture.manifest).toMatchObject({
      schema: 1,
      registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
      mode: "structural",
      productionReady: false,
      status: "review",
      sceneCount: canonicalSceneCount
    });
    expect(fixture.manifest.scenes).toHaveLength(canonicalSceneCount);
    expect(new Set(fixture.manifest.scenes.map((scene) => scene.name)))
      .toEqual(new Set(((source.rooms ?? []) as Array<{ name: string }>).map((room) => room.name)));
    expect(fixture.manifest.scenes.map((scene) => scene.name))
      .toEqual(expect.arrayContaining(["armazem_das_mares", "observatorio_do_farol"]));
    expect(fixture.manifest.scenes.every((scene) => ["complete", "review"].includes(scene.structuralStatus))).toBe(true);
    expect(fixture.manifest.scenes.some((scene) => scene.structuralStatus === "review")).toBe(true);
    expect(fixture.manifest.scenes.some((scene) => scene.placeholderRoles.length > 0)).toBe(true);
    expect(fixture.manifest.scenes.find((scene) => scene.name === "arena_arrancada")).toMatchObject({
      productionStatus: "review",
      structuralStatus: "complete",
      placeholderRoles: ["collision"]
    });
    expect(productionArena.status).toBe("review");
    expect(buildScenePreflightReport(fixture.data, "arena_arrancada").status).toBe("ready");
    expect(validateGBAProjectMigrationContract(fixture.data)).toEqual([]);
    expect(validateCompleteProjectFixture(fixture.manifest)).toEqual([]);

    const exported = buildEngineExportProjectContract(fixture.data, { structuralFixture: fixture.manifest });
    expect(exported.structural_fixture).toMatchObject({
      registry: COMPLETE_PROJECT_FIXTURE_REGISTRY,
      mode: "structural",
      production_ready: false,
      scene_count: canonicalSceneCount
    });
  });

  it("keeps unresolved requirements visible when no reusable binary asset exists", () => {
    const source = {
      name: "Minimal fixture source",
      scenas: [{
        id: "scene-fight",
        name: "fight",
        sceneType: "luta",
        width: 2,
        height: 2,
        collisionTypes: ["free", "free", "free", "free"]
      }],
      assets: []
    };

    const fixture = buildCompleteProjectFixture(source);

    expect(fixture.data.assets).toEqual([]);
    expect(fixture.manifest.status).toBe("review");
    expect(fixture.manifest.scenes[0]).toMatchObject({
      structuralStatus: "review",
      productionReady: false
    });
    expect(fixture.manifest.scenes[0].issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REQUIRED_ASSET_MISSING" })
    ]));
  });

  it("rejects a manifest that could be mistaken for production", () => {
    const source = parseGBAProjectFile(readFileSync(templatePath, "utf8")).data;
    const manifest = buildCompleteProjectFixture(source).manifest;

    expect(validateCompleteProjectFixture({
      ...manifest,
      productionReady: true
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PRODUCTION_READY_FORBIDDEN" })
    ]));
  });
});
