import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { InspectAssetPipelineResult } from "../shared/ipc.js";

export interface InspectAssetFileOptions {
  projectPath: string;
  source: string;
  assetID?: string;
  colorMode?: "4bpp" | "8bpp";
}

export interface InspectedAssetFile {
  exists: boolean;
  format: string;
  byteSize?: number;
  width?: number;
  height?: number;
  estimatedGbaBytes?: number;
  gbaBudgetPercent?: number;
  pipeline?: InspectAssetPipelineResult;
}

interface JsonRecord {
  [key: string]: unknown;
}

interface AssetInspectionContext {
  metadata: JsonRecord;
  name: string;
}

interface ExportArtifacts {
  exportPath: string;
  reportPath?: string;
  contractPath?: string;
  reportMtimeMs?: number;
}

const GBA_VRAM_BYTES = 96 * 1024;

function sourceFormat(source: string): string {
  const extension = path.extname(source).slice(1).trim();
  return extension ? extension.toUpperCase() : "ARQUIVO";
}

function projectAssetPath(projectPath: string, source: string): string | null {
  const projectDirectory = path.resolve(path.dirname(projectPath));
  const candidate = path.resolve(projectDirectory, source);
  if (candidate !== projectDirectory && !candidate.startsWith(`${projectDirectory}${path.sep}`)) return null;
  return candidate;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeResourceStem(value: string): string {
  const basename = value.replaceAll("\\", "/").split("/").pop() ?? value;
  return basename
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeProjectSource(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").toLocaleLowerCase("pt-BR");
}

async function readProjectData(projectPath: string): Promise<JsonRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(projectPath, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function findAssetInspectionContext(
  projectPath: string,
  source: string,
  assetID: string
): Promise<{ project: JsonRecord | null; asset: AssetInspectionContext | null }> {
  const project = await readProjectData(projectPath);
  const assets = Array.isArray(project?.assets) ? project.assets.filter(isRecord) : [];
  const assetIndex = assets.findIndex((asset, index) => {
    const candidateID = stringField(asset.id, `asset-${index + 1}`);
    const metadata = isRecord(asset.metadata) ? asset.metadata : {};
    return candidateID === assetID || stringField(metadata.source, "") === source;
  });
  if (assetIndex < 0) return { project, asset: null };

  const asset = assets[assetIndex];
  return {
    project,
    asset: {
      metadata: isRecord(asset.metadata) ? asset.metadata : {},
      name: stringField(asset.name, path.basename(source))
    }
  };
}

function preparedStageFromMetadata(metadata: JsonRecord): InspectAssetPipelineResult["preparedStatus"] {
  const status = stringField(metadata.assetcStatus, "").toLocaleLowerCase("pt-BR");
  if (status === "attention") return "attention";
  if (["safe", "pack-validated", "scene-verified", "approved"].includes(status) || metadata.assetcReviewed === true) {
    return "complete";
  }
  return "pending";
}

function projectTarget(project: JsonRecord | null, projectPath: string): string {
  const settings = isRecord(project?.settings) ? project.settings : {};
  const build = isRecord(settings.build) ? settings.build : {};
  const general = isRecord(settings.general) ? settings.general : {};
  const romFileName = stringField(build.romFileName, "");
  const title = stringField(general.gameTitle, path.basename(projectPath, path.extname(projectPath)));
  return normalizeResourceStem(romFileName || title) || "game";
}

async function existingFile(filePath: string): Promise<{ path: string; mtimeMs: number } | null> {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile() ? { path: filePath, mtimeMs: fileStats.mtimeMs } : null;
  } catch {
    return null;
  }
}

async function locateExportArtifacts(projectPath: string, project: JsonRecord | null): Promise<ExportArtifacts | null> {
  const projectDirectory = path.dirname(projectPath);
  const settings = isRecord(project?.settings) ? project.settings : {};
  const general = isRecord(settings.general) ? settings.general : {};
  const exportFolder = stringField(general.exportFolder, "build");
  const candidates = [path.resolve(projectDirectory, exportFolder, projectTarget(project, projectPath))];

  try {
    const latest = JSON.parse(await readFile(path.join(projectDirectory, ".gba-cache", "engine", "latest.json"), "utf8")) as unknown;
    if (isRecord(latest) && typeof latest.outputPath === "string" && latest.outputPath.trim()) {
      candidates.push(path.resolve(latest.outputPath));
    }
  } catch {
    // A project does not need to have a persistent engine cache.
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const exportPath = path.resolve(candidate);
    if (seen.has(exportPath)) continue;
    seen.add(exportPath);
    const report = await existingFile(path.join(exportPath, "asset_pack_report.json"));
    const contract = await existingFile(path.join(exportPath, "export_project.json"));
    if (report || contract) {
      return {
        exportPath,
        ...(report ? { reportPath: report.path, reportMtimeMs: report.mtimeMs } : {}),
        ...(contract ? { contractPath: contract.path } : {})
      };
    }
  }

  return null;
}

function resourceMatchesSource(value: unknown, sourceStem: string): boolean {
  return typeof value === "string" && normalizeResourceStem(value) === sourceStem;
}

function reportMatchesAsset(report: JsonRecord, sourceStem: string): { matched: boolean; attention: boolean } {
  const assetReports = isRecord(report.asset_reports) ? report.asset_reports : {};
  for (const [key, value] of Object.entries(assetReports)) {
    const record = isRecord(value) ? value : {};
    if (!resourceMatchesSource(key, sourceStem) && !resourceMatchesSource(record.id, sourceStem) && !resourceMatchesSource(record.name, sourceStem)) continue;
    const diagnostics = Array.isArray(record.diagnostics) ? record.diagnostics : [];
    return { matched: true, attention: record.ok === false || diagnostics.length > 0 };
  }

  const exportPlan = isRecord(report.export_plan) ? report.export_plan : {};
  const headers = Array.isArray(exportPlan.headers) ? exportPlan.headers.filter(isRecord) : [];
  for (const header of headers) {
    const inputs = Array.isArray(header.inputs) ? header.inputs : [];
    if (inputs.some((input) => resourceMatchesSource(input, sourceStem))) {
      return { matched: true, attention: header.status === "error" || header.ok === false };
    }
  }

  return { matched: false, attention: false };
}

async function contractMatchesAsset(contract: JsonRecord, source: string, sourceStem: string): Promise<boolean> {
  const copiedAssets = Array.isArray(contract.copied_assets) ? contract.copied_assets.filter(isRecord) : [];
  if (copiedAssets.some((asset) => normalizeProjectSource(stringField(asset.source, "")) === normalizeProjectSource(source))) {
    return true;
  }

  const assetPack = isRecord(contract.asset_pack) ? contract.asset_pack : {};
  const packedAssets = Array.isArray(assetPack.assets) ? assetPack.assets.filter(isRecord) : [];
  if (packedAssets.some((asset) => [asset.id, asset.name, asset.png, asset.header].some((value) => resourceMatchesSource(value, sourceStem)))) {
    return true;
  }

  const generatedAssets = Array.isArray(contract.generated_assets) ? contract.generated_assets : [];
  return generatedAssets.some((value) => resourceMatchesSource(value, sourceStem));
}

async function inspectAssetPipeline(
  options: InspectAssetFileOptions,
  sourceMtimeMs: number | null
): Promise<InspectAssetPipelineResult> {
  const context = await findAssetInspectionContext(options.projectPath, options.source, options.assetID ?? "");
  const preparedStatus = context.asset ? preparedStageFromMetadata(context.asset.metadata) : "pending";
  const artifacts = await locateExportArtifacts(options.projectPath, context.project);
  if (!artifacts) {
    return {
      preparedStatus,
      exportedStatus: "pending",
      exportedDetail: "no_export"
    };
  }

  let report: JsonRecord | null = null;
  if (artifacts.reportPath) {
    try {
      const parsed: unknown = JSON.parse(await readFile(artifacts.reportPath, "utf8"));
      report = isRecord(parsed) ? parsed : null;
    } catch {
      report = null;
    }
  }

  let contractMatch = false;
  if (artifacts.contractPath) {
    try {
      const parsed: unknown = JSON.parse(await readFile(artifacts.contractPath, "utf8"));
      contractMatch = isRecord(parsed)
        ? await contractMatchesAsset(parsed, options.source, normalizeResourceStem(context.asset?.name ?? options.source))
        : false;
    } catch {
      contractMatch = false;
    }
  }

  const sourceStem = normalizeResourceStem(context.asset?.name ?? options.source);
  const reportMatch = report ? reportMatchesAsset(report, sourceStem) : { matched: false, attention: false };
  const exported = contractMatch || reportMatch.matched;
  let exportedStatus: InspectAssetPipelineResult["exportedStatus"] = "pending";
  let exportedDetail = "Asset não localizado no contrato de exportação.";
  if (exported) {
    exportedStatus = reportMatch.attention ? "attention" : "complete";
    exportedDetail = reportMatch.attention
      ? "report_diagnostic"
      : "registered";
    if (sourceMtimeMs !== null && artifacts.reportMtimeMs !== undefined && sourceMtimeMs > artifacts.reportMtimeMs) {
      exportedStatus = "attention";
      exportedDetail = "source_newer";
    }
  } else if (artifacts.reportPath || artifacts.contractPath) {
    exportedStatus = "attention";
    exportedDetail = "not_in_export";
  }

  if (exportedStatus === "complete" && preparedStatus !== "complete") {
    exportedStatus = "attention";
    exportedDetail = "prepared_pending";
  }

  return {
    preparedStatus,
    ...(preparedStatus === "attention" ? { preparedDetail: "assetc_attention" } : {}),
    exportedStatus,
    exportedDetail,
    ...(artifacts.reportPath ? { reportPath: artifacts.reportPath } : {}),
    exportPath: artifacts.exportPath
  };
}

export async function inspectAssetFile(options: InspectAssetFileOptions): Promise<InspectedAssetFile> {
  const format = sourceFormat(options.source);
  const assetPath = projectAssetPath(options.projectPath, options.source);
  if (!assetPath) return { exists: false, format };

  try {
    const fileStats = await stat(assetPath);
    const pipeline = options.assetID
      ? await inspectAssetPipeline(options, fileStats.mtimeMs)
      : undefined;
    const result: InspectedAssetFile = {
      exists: true,
      format,
      byteSize: fileStats.size,
      ...(pipeline ? { pipeline } : {})
    };
    if (format !== "PNG") return result;

    const handle = await open(assetPath, "r");
    try {
      const header = Buffer.alloc(24);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      const hasPngSignature = bytesRead >= 24 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!hasPngSignature) return result;
      const width = header.readUInt32BE(16);
      const height = header.readUInt32BE(20);
      const estimatedGbaBytes = options.colorMode === "8bpp" ? width * height + 512 : Math.ceil((width * height) / 2) + 32;
      return {
        ...result,
        width,
        height,
        estimatedGbaBytes,
        gbaBudgetPercent: Math.round((estimatedGbaBytes / GBA_VRAM_BYTES) * 1000) / 10
      };
    } finally {
      await handle.close();
    }
  } catch {
    return { exists: false, format };
  }
}
