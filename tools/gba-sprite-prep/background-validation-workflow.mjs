import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateBackgroundEvidence } from "./background-validator.mjs";

const reportSchema = 1;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function requiredString(record, key, context) {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} nao informa ${key}.`);
  }
  return value.trim();
}

function integerOrDefault(record, key, fallback, context) {
  const value = record[key];
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${context}.${key} precisa ser um inteiro positivo.`);
  }
  return value;
}

function relativeReportPath(destination, filePath) {
  return path.relative(destination, filePath).split(path.sep).join("/");
}

function destinationPath(destination, relativePath) {
  const root = path.resolve(destination);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Arquivo de background fora do destino: ${relativePath}`);
  }
  return resolved;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function emptyReport(destination, warning) {
  return {
    schema: reportSchema,
    kind: "GBAStudioBackgroundValidationReport",
    destination,
    ready: false,
    status: "candidate",
    warnings: [warning],
    assets: []
  };
}

function overallStatus(results) {
  if (results.length === 0) return "candidate";
  if (results.some((result) => result.status === "impossible")) return "impossible";
  if (results.some((result) => result.status === "attention")) return "attention";
  if (results.some((result) => result.status === "palette-prepared")) return "palette-prepared";
  if (results.every((result) => result.status === "pack-validated")) return "pack-validated";
  return "candidate";
}

/**
 * Materializes the per-background assetc evidence for an already exported project.
 * The callback is injectable so the discovery/report contract can be tested
 * without depending on a locally installed Engine Pack.
 */
export async function materializeBackgroundValidation({
  destination,
  runAssetc
}) {
  const resolvedDestination = path.resolve(destination);
  const reportPath = path.join(resolvedDestination, "background-validation.json");
  const exportPath = path.join(resolvedDestination, "export_project.json");
  const packPath = path.join(resolvedDestination, "asset_pack_report.json");

  if (!(await pathExists(exportPath))) {
    const report = emptyReport(resolvedDestination, "export_project_missing");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { ...report, reportPath };
  }
  if (!(await pathExists(packPath))) {
    const report = emptyReport(resolvedDestination, "asset_pack_report_missing");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { ...report, reportPath };
  }

  const exportContract = JSON.parse(await readFile(exportPath, "utf8"));
  const packReport = JSON.parse(await readFile(packPath, "utf8"));
  const assetPack = isRecord(exportContract.asset_pack) ? exportContract.asset_pack : {};
  const assets = records(assetPack.assets)
    .filter((asset) => asset.kind === "bg" && asset.optimize_background_tiles === true);
  const validationDirectory = path.join(resolvedDestination, "background-validation");
  await mkdir(validationDirectory, { recursive: true });

  if (assets.length === 0) {
    const report = emptyReport(resolvedDestination, "no_optimized_background_assets");
    report.packReportPath = relativeReportPath(resolvedDestination, packPath);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { ...report, reportPath };
  }
  if (typeof runAssetc !== "function") {
    throw new Error("materializeBackgroundValidation precisa de runAssetc.");
  }

  const results = [];
  for (const asset of assets) {
    const assetId = requiredString(asset, "id", "Asset BG");
    const png = requiredString(asset, "png", `Asset BG '${assetId}'`);
    const symbol = requiredString(asset, "symbol", `Asset BG '${assetId}'`);
    const inputPath = destinationPath(resolvedDestination, png);
    if (!(await pathExists(inputPath))) {
      throw new Error(`PNG do asset BG '${assetId}' nao foi materializado: ${inputPath}`);
    }
    const tileBudget = integerOrDefault(asset, "background_tile_budget", 1024, `Asset BG '${assetId}'`);
    const paletteBanks = integerOrDefault(asset, "background_palette_banks", 16, `Asset BG '${assetId}'`);
    if (tileBudget > 1024) {
      throw new Error(`Asset BG '${assetId}' excede o limite de 1024 tiles.`);
    }
    if (paletteBanks > 16) {
      throw new Error(`Asset BG '${assetId}' excede o limite de 16 bancos de paleta.`);
    }

    const stem = assetId.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const preparationOutput = path.join(validationDirectory, `${stem}.prepared.png`);
    const preparationReportPath = path.join(validationDirectory, `${stem}.preparation.json`);
    const tileHeaderPath = path.join(validationDirectory, `${stem}.hpp`);
    const tileReportPath = path.join(validationDirectory, `${stem}.tiles.json`);

    await runAssetc([
      inputPath,
      "-o",
      preparationOutput,
      "-n",
      symbol,
      "--background-bpp",
      "4",
      "--prepare-background-4bpp",
      "--background-report",
      preparationReportPath,
      "--background-palette-banks",
      String(paletteBanks)
    ]);
    await runAssetc([
      inputPath,
      "-o",
      tileHeaderPath,
      "-n",
      symbol,
      "--background-bpp",
      "4",
      "--optimize-background-tiles",
      "--background-tile-budget",
      String(tileBudget),
      "--background-tile-report",
      tileReportPath,
      "--background-palette-banks",
      String(paletteBanks)
    ]);

    const preparationReport = JSON.parse(await readFile(preparationReportPath, "utf8"));
    const tileReport = JSON.parse(await readFile(tileReportPath, "utf8"));
    const validation = validateBackgroundEvidence({
      preparationReport,
      tileReport,
      packReport,
      assetId,
      tileBudget,
      paletteBanks
    });
    results.push({
      assetId,
      inputPath: relativeReportPath(resolvedDestination, inputPath),
      preparationReportPath: relativeReportPath(resolvedDestination, preparationReportPath),
      tileReportPath: relativeReportPath(resolvedDestination, tileReportPath),
      status: validation.status,
      ready: validation.ready,
      warnings: validation.warnings,
      errors: validation.errors,
      metrics: validation.metrics
    });
  }

  const report = {
    schema: reportSchema,
    kind: "GBAStudioBackgroundValidationReport",
    destination: resolvedDestination,
    packReportPath: relativeReportPath(resolvedDestination, packPath),
    ready: results.every((result) => result.ready),
    status: overallStatus(results),
    warnings: results.flatMap((result) => result.warnings.map((warning) => `${result.assetId}:${warning}`)),
    errors: results.flatMap((result) => result.errors.map((error) => `${result.assetId}:${error}`)),
    assets: results
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportPath };
}
