import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { deriveDialoguesWorkspacePresentation } from "./dialoguesWorkspace.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { deriveFilesWorkspacePresentation } from "./filesWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "./projectFile.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { deriveSettingsWorkspacePresentation } from "./settingsWorkspace.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/project-contract/fixtures/topdown-demo.gba-project");
const completeTemplateProjectPath = join(dirname(fileURLToPath(import.meta.url)), "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project");
interface ProjectSmokeSample {
  kind: "template" | "fixture" | "real";
  name: string;
  path: string | null;
  contents: string;
}

interface ProjectSmokeEvidenceSample {
  kind: ProjectSmokeSample["kind"];
  name: string;
  path: string | null;
  bytes: number;
  summary: {
    schemaVersion: number | null;
    name: string;
    rooms: number;
    assets: number;
  };
  workspaces: {
    files: number;
    rooms: number;
    sprites: number;
    events: number;
    dialogues: number;
    audio: number;
    settingsSections: number;
  };
}

function externalProjectPaths(): string[] {
  const raw = process.env.GBA_STUDIO_REAL_PROJECT_PATHS;
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("GBA_STUDIO_REAL_PROJECT_PATHS precisa ser um array JSON de strings.");
  }
  return parsed;
}

function projectSamples(): ProjectSmokeSample[] {
  return [
    {
      kind: "template",
      name: "exemplo-gba",
      path: completeTemplateProjectPath,
      contents: readFileSync(completeTemplateProjectPath, "utf8")
    },
    {
      kind: "fixture",
      name: "topdown-demo",
      path: fixturePath,
      contents: readFileSync(fixturePath, "utf8")
    },
    ...externalProjectPaths().map((projectPath) => ({
      kind: "real" as const,
      name: projectPath.split("/").at(-1) ?? projectPath,
      path: projectPath,
      contents: readFileSync(projectPath, "utf8")
    }))
  ];
}

function validateSample(sample: ProjectSmokeSample): ProjectSmokeEvidenceSample {
  const project = parseGBAProjectFile(sample.contents);
  const serialized = serializeGBAProjectFile(project);
  const reparsed = parseGBAProjectFile(serialized);
  const contractIssues = validateGBAProjectMigrationContract(project.data);

  expect(reparsed.data).toEqual(project.data);
  expect(contractIssues).toEqual([]);

  if (sample.kind === "template" && sample.path) {
    const assets = Array.isArray(project.data.assets) ? project.data.assets : [];
    const assetRoot = dirname(sample.path);
    for (const asset of assets) {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) continue;
      const metadata = "metadata" in asset ? asset.metadata : null;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
      const source = "source" in metadata ? metadata.source : null;
      if (typeof source === "string" && source.trim().length > 0) {
        expect(isAbsolute(source), `asset com caminho absoluto: ${source}`).toBe(false);
        expect(existsSync(join(assetRoot, source)), `asset ausente: ${source}`).toBe(true);
      }
    }
  }

  const files = deriveFilesWorkspacePresentation(project.data);
  const rooms = deriveRoomsWorkspacePresentation(project.data);
  const sprites = deriveSpritesWorkspacePresentation(project.data);
  const events = deriveEventsWorkspacePresentation(project.data);
  const dialogues = deriveDialoguesWorkspacePresentation(project.data);
  const audio = deriveAudioWorkspacePresentation(project.data);
  const settings = deriveSettingsWorkspacePresentation(project.data);

  expect(settings.summary.hasSettings).toBe(true);
  expect(settings.sections.length).toBeGreaterThan(0);

  return {
    kind: sample.kind,
    name: sample.name,
    path: sample.path,
    bytes: sample.path ? statSync(sample.path).size : Buffer.byteLength(sample.contents),
    summary: project.summary,
    workspaces: {
      files: files.assets.length,
      rooms: rooms.rooms.length,
      sprites: sprites.summary.animationCount,
      events: events.summary.eventCount,
      dialogues: dialogues.dialogues.length,
      audio: audio.items.length,
      settingsSections: settings.sections.length
    }
  };
}

describe("real project smoke", () => {
  it("opens, validates, serializes and derives migrated workspaces from representative projects", () => {
    const samples = projectSamples();
    const realSamples = samples.filter((sample) => sample.kind === "real");
    const evidenceSamples = samples.map(validateSample);

    if (process.env.GBA_STUDIO_REAL_PROJECT_PATHS !== undefined) {
      expect(realSamples.length).toBeGreaterThan(0);
    }
    expect(evidenceSamples.find((sample) => sample.kind === "template")).toMatchObject({
      name: "exemplo-gba",
      summary: {
        name: "O Último Farol",
        rooms: expect.any(Number),
        assets: expect.any(Number)
      },
      workspaces: {
        rooms: expect.any(Number),
        sprites: expect.any(Number),
        events: expect.any(Number),
        dialogues: expect.any(Number),
        audio: expect.any(Number)
      }
    });
    const templateEvidence = evidenceSamples.find((sample) => sample.kind === "template");
    expect(templateEvidence?.summary.rooms).toBeGreaterThan(0);
    expect(templateEvidence?.workspaces.rooms).toBe(templateEvidence?.summary.rooms);
    expect(templateEvidence?.workspaces.files).toBe(templateEvidence?.summary.assets);
    expect(parseGBAProjectFile(readFileSync(completeTemplateProjectPath, "utf8")).data).toMatchObject({
      name: "O Último Farol",
      settings: {
        general: {
          gameTitle: "O Último Farol",
          startScene: "logo",
          exportFolder: "build"
        },
        build: {
          romFileName: "exemplo.gba"
        }
      }
    });

    const evidencePath = process.env.GBA_STUDIO_PROJECT_SMOKE_EVIDENCE;
    if (evidencePath) {
      mkdirSync(dirname(evidencePath), { recursive: true });
      writeFileSync(evidencePath, `${JSON.stringify({
        ok: true,
        generatedAt: new Date().toISOString(),
        samples: evidenceSamples
      }, null, 2)}\n`);
      expect(existsSync(evidencePath)).toBe(true);
    }
  });
});
