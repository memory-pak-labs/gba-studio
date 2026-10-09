import { realpath } from "node:fs/promises";
import path from "node:path";

import { inspectAssetFile, type InspectedAssetFile } from "../main/inspectAssetFile.js";
import { analyzePreparedProjectBudget } from "../main/projectBudgetAnalysis.js";
import { openProjectFile } from "../main/projectPersistence.js";
import { isMcpEnabled } from "../shared/mcpSettings.js";
import { deriveProjectContractDiagnostics, type ProjectContractDiagnostics } from "../shared/projectContractDiagnostics.js";
import type { GBAProjectSummary, ParsedGBAProject } from "../shared/projectFile.js";
import type { ProjectBudgetAnalysisResult } from "../shared/projectBudget.js";

export type McpProjectServiceErrorCode =
  | "ASSET_NOT_FOUND"
  | "ASSET_OUTSIDE_PROJECT"
  | "ASSET_SOURCE_MISSING"
  | "ENGINE_PACK_REQUIRED"
  | "MCP_DISABLED"
  | "PROJECT_OPEN_FAILED";

export interface McpProjectServiceFailure {
  ok: false;
  code: McpProjectServiceErrorCode;
  message: string;
}

export interface McpProjectServiceSuccess<T> {
  ok: true;
  data: T;
}

export type McpProjectServiceResult<T> = McpProjectServiceSuccess<T> | McpProjectServiceFailure;

export interface McpAssetSummary {
  id: string;
  name: string;
  kind: string;
  source?: string;
}

export interface McpProjectService {
  projectSummary(): Promise<McpProjectServiceResult<{ projectPath: string; summary: GBAProjectSummary }>>;
  projectDiagnostics(): Promise<McpProjectServiceResult<ProjectContractDiagnostics>>;
  listAssets(): Promise<McpProjectServiceResult<McpAssetSummary[]>>;
  inspectAsset(assetId: string): Promise<McpProjectServiceResult<{ asset: McpAssetSummary; inspection: InspectedAssetFile }>>;
  projectBudget(): Promise<McpProjectServiceResult<ProjectBudgetAnalysisResult>>;
}

export interface McpProjectServiceOptions {
  projectPath: string;
  enginePackPath?: string;
}

export class McpProjectServiceError extends Error {
  constructor(readonly code: McpProjectServiceErrorCode, message: string) {
    super(message);
    this.name = "McpProjectServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function projectAssets(project: ParsedGBAProject): McpAssetSummary[] {
  const assets = Array.isArray(project.data.assets) ? project.data.assets : [];
  return assets.flatMap((asset): McpAssetSummary[] => {
    if (!isRecord(asset)) return [];

    const id = nonEmptyString(asset.id);
    const name = nonEmptyString(asset.name);
    const kind = nonEmptyString(asset.kind);
    if (!id || !name || !kind) return [];

    const metadata = isRecord(asset.metadata) ? asset.metadata : undefined;
    const source = nonEmptyString(metadata?.source);
    return [{ id, name, kind, ...(source ? { source } : {}) }];
  });
}

function isInside(root: string, candidate: string): boolean {
  return candidate !== root && candidate.startsWith(`${root}${path.sep}`);
}

async function isSafeProjectAssetPath(projectPath: string, source: string): Promise<boolean> {
  if (path.isAbsolute(source)) return false;

  const projectRoot = path.resolve(path.dirname(projectPath));
  const candidatePath = path.resolve(projectRoot, source);
  if (!isInside(projectRoot, candidatePath)) return false;

  try {
    const [realProjectRoot, realCandidatePath] = await Promise.all([
      realpath(projectRoot),
      realpath(candidatePath)
    ]);
    return isInside(realProjectRoot, realCandidatePath);
  } catch {
    return true;
  }
}

function success<T>(data: T): McpProjectServiceSuccess<T> {
  return { ok: true, data };
}

function failure(code: McpProjectServiceErrorCode, message: string): McpProjectServiceFailure {
  return { ok: false, code, message };
}

interface OpenedMcpProject {
  project: ParsedGBAProject;
  projectPath: string;
}

function isFailure(value: OpenedMcpProject | McpProjectServiceFailure): value is McpProjectServiceFailure {
  return "ok" in value && value.ok === false;
}

class LocalMcpProjectService implements McpProjectService {
  constructor(
    private readonly projectPath: string,
    private readonly enginePackPath?: string
  ) {}

  private async openAuthorizedProject(): Promise<OpenedMcpProject | McpProjectServiceFailure> {
    const opened = await openProjectFile(this.projectPath);
    if (!opened.project || !opened.path) {
      return failure("PROJECT_OPEN_FAILED", "Não foi possível abrir o projeto configurado para o servidor MCP.");
    }
    if (!isMcpEnabled(opened.project.data)) {
      return failure("MCP_DISABLED", "Ative o MCP local em Ajustes antes de conectar um cliente.");
    }
    return { project: opened.project, projectPath: opened.path };
  }

  async projectSummary(): Promise<McpProjectServiceResult<{ projectPath: string; summary: GBAProjectSummary }>> {
    const opened = await this.openAuthorizedProject();
    if (isFailure(opened)) return opened;
    return success({ projectPath: opened.projectPath, summary: opened.project.summary });
  }

  async projectDiagnostics(): Promise<McpProjectServiceResult<ProjectContractDiagnostics>> {
    const opened = await this.openAuthorizedProject();
    if (isFailure(opened)) return opened;
    return success(deriveProjectContractDiagnostics(opened.project.data));
  }

  async listAssets(): Promise<McpProjectServiceResult<McpAssetSummary[]>> {
    const opened = await this.openAuthorizedProject();
    if (isFailure(opened)) return opened;
    return success(projectAssets(opened.project));
  }

  async inspectAsset(assetId: string): Promise<McpProjectServiceResult<{ asset: McpAssetSummary; inspection: InspectedAssetFile }>> {
    const opened = await this.openAuthorizedProject();
    if (isFailure(opened)) return opened;

    const asset = projectAssets(opened.project).find((item) => item.id === assetId);
    if (!asset) return failure("ASSET_NOT_FOUND", "O asset solicitado não pertence ao projeto configurado.");
    if (!asset.source) return failure("ASSET_SOURCE_MISSING", "O asset solicitado não possui uma origem local inspecionável.");
    if (!await isSafeProjectAssetPath(opened.projectPath, asset.source)) {
      return failure("ASSET_OUTSIDE_PROJECT", "A origem do asset não está contida no projeto configurado.");
    }

    return success({
      asset,
      inspection: await inspectAssetFile({ projectPath: opened.projectPath, source: asset.source })
    });
  }

  async projectBudget(): Promise<McpProjectServiceResult<ProjectBudgetAnalysisResult>> {
    const opened = await this.openAuthorizedProject();
    if (isFailure(opened)) return opened;
    if (!this.enginePackPath) {
      return failure("ENGINE_PACK_REQUIRED", "gbs_project_budget exige --engine-pack na inicialização do servidor.");
    }

    const assetcName = process.platform === "win32" ? "assetc.exe" : "assetc";
    return success(await analyzePreparedProjectBudget({
      assetcPath: path.join(this.enginePackPath, "tools", assetcName),
      enginePackPath: this.enginePackPath,
      project: opened.project.data,
      projectPath: opened.projectPath
    }));
  }
}

export async function createMcpProjectService(options: McpProjectServiceOptions): Promise<McpProjectService> {
  const opened = await openProjectFile(options.projectPath);
  if (!opened.project || !opened.path) {
    throw new McpProjectServiceError("PROJECT_OPEN_FAILED", "Não foi possível abrir o projeto configurado para o servidor MCP.");
  }

  return new LocalMcpProjectService(opened.path, options.enginePackPath);
}
