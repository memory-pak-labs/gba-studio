import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ProjectPluginRegistry } from "../shared/gbaStudioPlugins.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import type { AssetPackBudgetReport, ProjectBudgetAnalysisResult } from "../shared/projectBudget.js";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { writeEngineSchemaExport } from "./engineProjectExport.js";

export interface AnalyzePreparedProjectBudgetOptions {
  assetcPath: string;
  enginePackPath: string;
  enginePackVersion?: string;
  pluginRegistry?: ProjectPluginRegistry;
  project: GBAProjectData;
  projectPath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAssetPackBudgetReport(value: unknown): AssetPackBudgetReport | null {
  if (!isRecord(value) || typeof value.schema !== "number") return null;
  return value as unknown as AssetPackBudgetReport;
}

export async function analyzePreparedProjectBudget(
  options: AnalyzePreparedProjectBudgetOptions
): Promise<ProjectBudgetAnalysisResult> {
  const prepared = prepareEngineProjectExport(options.project, {
    enginePackPath: options.enginePackPath,
    enginePackVersion: options.enginePackVersion,
    pluginRegistry: options.pluginRegistry
  });
  if (!prepared.generated) {
    return { ok: false, error: prepared.error ?? "Falha ao preparar análise de orçamento." };
  }

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "gba-studio-budget-"));
  const destination = path.join(temporaryRoot, prepared.generated.target);
  try {
    await writeEngineSchemaExport({
      destination,
      prepared: prepared.generated,
      assetcPath: options.assetcPath,
      projectPath: options.projectPath
    });
    const raw = JSON.parse(await readFile(path.join(destination, "asset_pack_report.json"), "utf8")) as unknown;
    const report = parseAssetPackBudgetReport(raw);
    if (!report) {
      return { ok: false, target: prepared.generated.target, error: "O compilador retornou um relatório de orçamento inválido." };
    }
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      report,
      target: prepared.generated.target
    };
  } catch (error) {
    return {
      ok: false,
      target: prepared.generated.target,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
