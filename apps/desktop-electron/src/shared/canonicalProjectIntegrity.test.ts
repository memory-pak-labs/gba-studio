import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateGBAProjectMigrationContract, type GBAProjectData } from "../../../../packages/project-contract/src/index.js";
import { auditExportEventCommandCoverage } from "../main/exportEngineProject.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "./projectFile.js";

const projectPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
);
const assetRoot = dirname(projectPath);
const collections = ["rooms", "scenas", "assets", "actors", "triggers", "events", "animations", "audioItems"] as const;

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function integrityIssues(data: GBAProjectData): string[] {
  const issues = validateGBAProjectMigrationContract(data)
    .map((issue) => `${issue.validator}: ${JSON.stringify(issue.issue)}`);

  for (const collection of collections) {
    const ids = new Set<string>();
    for (const item of records(data[collection])) {
      const id = item.id;
      if (typeof id !== "string" || id.trim().length === 0) {
        issues.push(`${collection}: ID ausente`);
      } else if (ids.has(id)) {
        issues.push(`${collection}: ID duplicado ${id}`);
      } else {
        ids.add(id);
      }
    }
  }

  const roomIDs = records(data.rooms).map((room) => room.id).sort();
  const sceneIDs = records(data.scenas).map((scene) => scene.id).sort();
  if (JSON.stringify(roomIDs) !== JSON.stringify(sceneIDs)) {
    issues.push("rooms/scenas: IDs divergentes");
  }

  for (const asset of records(data.assets)) {
    const metadata = asset.metadata;
    const source = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).source
      : null;
    if (typeof source !== "string" || source.trim().length === 0) {
      issues.push(`asset ${String(asset.name)}: fonte não declarada`);
      continue;
    }
    const resolved = resolve(assetRoot, source);
    const outsideRoot = isAbsolute(source) || relative(assetRoot, resolved).startsWith("..");
    if (outsideRoot || !existsSync(resolved)) {
      issues.push(`asset ${String(asset.name)}: fonte ausente ou externa ${source}`);
    }
  }

  const events = deriveEventsWorkspacePresentation(data);
  if (events.summary.missingReferenceCount > 0) {
    issues.push(`eventos: ${events.summary.missingReferenceCount} referencia(s) ausente(s)`);
  }
  const exportCoverage = auditExportEventCommandCoverage(data);
  if (!exportCoverage.ok) {
    issues.push(`export: ${exportCoverage.unsupported.join(", ")}`);
  }
  return issues;
}

function currentProject(): GBAProjectData {
  return parseGBAProjectFile(readFileSync(projectPath, "utf8")).data;
}

describe("integridade dinâmica do Exemplo GBA", () => {
  it("abre o projeto atual, preserva o round-trip e resolve referências e arquivos", () => {
    const project = parseGBAProjectFile(readFileSync(projectPath, "utf8"));
    expect(parseGBAProjectFile(serializeGBAProjectFile(project)).data).toEqual(project.data);
    expect(integrityIssues(project.data)).toEqual([]);
  });

  it("tolera adicionar e retirar uma cena válida sem atualizar contagens fixas", () => {
    const data = structuredClone(currentProject());
    const originalRoomCount = records(data.rooms).length;
    const sourceScene = records(data.rooms)[0];
    expect(sourceScene).toBeDefined();
    const extraScene = {
      ...sourceScene,
      id: "scene-iteration-check",
      name: "iteration_check",
      gbStudioSceneID: "iteration-check"
    };
    (data.rooms as unknown[]).push(extraScene);
    (data.scenas as unknown[]).push(structuredClone(extraScene));
    expect(records(data.rooms)).toHaveLength(originalRoomCount + 1);
    expect(integrityIssues(data)).toEqual([]);
    (data.rooms as unknown[]).pop();
    (data.scenas as unknown[]).pop();
    expect(records(data.rooms)).toHaveLength(originalRoomCount);
    expect(integrityIssues(data)).toEqual([]);
  });

  it("falha diante de uma fonte ausente ou de um ID duplicado", () => {
    const missingAsset = structuredClone(currentProject());
    const asset = records(missingAsset.assets)[0];
    const metadata = asset.metadata as Record<string, unknown>;
    metadata.source = "Assets/sprites/arquivo-que-nao-existe.png";
    expect(integrityIssues(missingAsset)).toContain(
      `asset ${String(asset.name)}: fonte ausente ou externa ${metadata.source}`
    );

    const duplicateID = structuredClone(currentProject());
    (duplicateID.assets as unknown[]).push(structuredClone(records(duplicateID.assets)[0]));
    expect(integrityIssues(duplicateID)).toContain(`assets: ID duplicado ${String(asset.id)}`);
  });
});
