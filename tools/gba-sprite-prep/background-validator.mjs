const MAX_BG_PALETTE_BANKS = 16;
const MAX_BG_TILES = 1024;
const GLOBAL_NEAR_LIMIT_PERCENT = 95;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberField(value, name, { integer = false, min = 0 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < min) {
    return `${name}_invalid`;
  }
  return null;
}

function normalizeAssetReports(assetReports) {
  if (Array.isArray(assetReports)) {
    return assetReports.filter(isObject);
  }
  if (!isObject(assetReports)) {
    return [];
  }
  return Object.entries(assetReports)
    .filter(([, value]) => isObject(value))
    .map(([id, value]) => ({ id, ...value }));
}

function checkPreparation(report, expected = {}) {
  if (!isObject(report)) {
    return {
      status: "missing",
      errors: ["preparation_report_missing"],
      warnings: [],
    };
  }

  const errors = [];
  const warnings = [];
  if (report.schema_version !== 1) errors.push("preparation_schema_invalid");
  if (report.runtime_bpp !== 4) errors.push("preparation_bpp_invalid");
  for (const field of ["width", "height", "tile_count", "bank_count"]) {
    const error = numberField(report[field], field, { integer: true, min: 1 });
    if (error) errors.push(error);
  }
  if (report.width % 8 !== 0 || report.height % 8 !== 0) {
    errors.push("background_dimensions_not_tile_aligned");
  }
  if (report.bank_count > MAX_BG_PALETTE_BANKS) {
    errors.push("palette_bank_limit_exceeded");
  }
  if (expected.paletteBanks !== undefined && report.bank_count > expected.paletteBanks) {
    errors.push("palette_bank_budget_exceeded");
  }
  if (expected.width !== undefined && report.width !== expected.width) {
    errors.push("expected_width_mismatch");
  }
  if (expected.height !== undefined && report.height !== expected.height) {
    errors.push("expected_height_mismatch");
  }
  if (numberField(report.total_color_error, "total_color_error")) {
    errors.push("total_color_error_invalid");
  } else if (report.total_color_error > 0 || report.status === "attention") {
    warnings.push("color_error_present");
  }

  return {
    status: errors.length > 0 ? "failed" : "passed",
    errors,
    warnings,
    width: report.width,
    height: report.height,
    bankCount: report.bank_count,
    tileCount: report.tile_count,
  };
}

function checkTileOptimization(report, expected = {}) {
  if (!isObject(report)) {
    return {
      status: "missing",
      errors: [],
      warnings: ["tile_report_missing"],
    };
  }

  const errors = [];
  const warnings = [];
  if (report.schema_version !== 1) errors.push("tile_report_schema_invalid");
  if (report.runtime_bpp !== 4) errors.push("tile_report_bpp_invalid");
  if (report.optimization_enabled !== true) errors.push("tile_optimization_disabled");
  for (const field of ["tile_budget", "tile_count_before", "tile_count_after", "merged_tile_count"]) {
    const error = numberField(report[field], field, { integer: true, min: 0 });
    if (error) errors.push(error);
  }
  if (numberField(report.total_mapping_error, "total_mapping_error")) {
    errors.push("total_mapping_error_invalid");
  }
  const tileBudget = expected.tileBudget ?? report.tile_budget;
  if (numberField(tileBudget, "tile_budget", { integer: true, min: 1 })) {
    errors.push("tile_budget_invalid");
  } else {
    if (tileBudget > MAX_BG_TILES) errors.push("tile_budget_limit_exceeded");
    if (report.tile_count_after > tileBudget) errors.push("tile_budget_exceeded");
    if (expected.tileBudget !== undefined && report.tile_budget !== expected.tileBudget) {
      errors.push("tile_budget_mismatch");
    }
  }
  if (report.tile_count_after > report.tile_count_before) errors.push("tile_count_increased");
  if (report.merged_tile_count > report.tile_count_before) errors.push("merged_tile_count_invalid");

  const maxMappingError = expected.maxMappingError ?? 0;
  if (numberField(maxMappingError, "max_mapping_error", { min: 0 })) {
    errors.push("max_mapping_error_invalid");
  } else if (report.total_mapping_error > maxMappingError) {
    warnings.push("mapping_error_present");
  }

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "attention" : "passed",
    errors,
    warnings,
    tileBudget,
    tileCountBefore: report.tile_count_before,
    tileCountAfter: report.tile_count_after,
    totalMappingError: report.total_mapping_error,
  };
}

function resourceSummary(packReport, resource) {
  const summary = isObject(packReport?.budget_summary?.[resource])
    ? packReport.budget_summary[resource]
    : null;
  const capacity = summary?.capacity ?? packReport?.budgets?.[resource];
  const used = summary?.used;
  const percentUsed = summary?.percent_used ?? (
    typeof used === "number" && typeof capacity === "number" && capacity > 0
      ? (used / capacity) * 100
      : undefined
  );
  return { used, capacity, percentUsed };
}

function checkGlobalPack(packReport, expected = {}) {
  if (!isObject(packReport)) {
    return {
      status: "missing",
      errors: [],
      warnings: ["pack_report_missing"],
    };
  }

  const errors = [];
  const warnings = [];
  if (packReport.schema !== 11 || packReport.kind !== "GBAStudioAssetPackReport") {
    errors.push("pack_report_schema_invalid");
  }
  if (packReport.ok !== true) errors.push("pack_report_not_ok");
  if ((packReport.production_summary?.blocking_overflow_count ?? 0) > 0) {
    errors.push("blocking_overflow");
  }
  if (Array.isArray(packReport.errors) && packReport.errors.length > 0) {
    warnings.push("pack_report_errors_present");
  }

  const tileResources = resourceSummary(packReport, "bg_tiles");
  const paletteResources = resourceSummary(packReport, "bg_palette_colors");
  for (const [resource, summary] of [["bg_tiles", tileResources], ["bg_palette_colors", paletteResources]]) {
    if (numberField(summary.capacity, `${resource}_capacity`, { integer: true, min: 1 })) {
      errors.push(`${resource}_capacity_missing`);
    }
    if (numberField(summary.used, `${resource}_used`, { integer: true, min: 0 })) {
      errors.push(`${resource}_used_missing`);
    } else if (summary.used > summary.capacity) {
      errors.push(`${resource}_overflow`);
    } else if (summary.percentUsed >= GLOBAL_NEAR_LIMIT_PERCENT) {
      warnings.push(`${resource}_near_limit`);
    }
  }

  const assets = normalizeAssetReports(packReport.asset_reports);
  let targetAsset = null;
  if (expected.assetId) {
    targetAsset = assets.find((asset) => asset.id === expected.assetId || asset.name === expected.assetId);
    if (!targetAsset) errors.push("asset_missing_in_pack");
  } else if (assets.length === 1) {
    targetAsset = assets[0];
  }
  if (targetAsset) {
    if (!targetAsset.kind || !["bg", "affine_bg"].includes(targetAsset.kind)) {
      errors.push("asset_kind_not_background");
    }
    const resources = targetAsset.resources;
    if (!isObject(resources)) {
      errors.push("asset_resources_missing");
    } else {
      if (expected.tileBudget !== undefined && resources.bg_tiles > expected.tileBudget) {
        errors.push("tile_budget_exceeded");
      }
      if (typeof resources.bg_tiles !== "number") {
        errors.push("asset_bg_tiles_missing");
      }
    }
  } else if (!expected.assetId) {
    warnings.push("asset_id_not_selected");
  }

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "attention" : "passed",
    errors,
    warnings,
    tileResources,
    paletteResources,
    assetCount: assets.length,
    targetAssetId: targetAsset?.id,
    targetTileCount: targetAsset?.resources?.bg_tiles,
  };
}

export function validateBackgroundEvidence({
  preparationReport,
  tileReport,
  packReport,
  assetId,
  width,
  height,
  tileBudget,
  paletteBanks,
  maxMappingError = 0,
} = {}) {
  const expected = { assetId, width, height, tileBudget, paletteBanks, maxMappingError };
  const preparation = checkPreparation(preparationReport, expected);
  const tileOptimization = checkTileOptimization(tileReport, expected);
  const globalPack = checkGlobalPack(packReport, expected);
  const errors = [...preparation.errors, ...tileOptimization.errors, ...globalPack.errors];
  const warnings = [...preparation.warnings, ...tileOptimization.warnings, ...globalPack.warnings];
  if (
    tileOptimization.tileCountAfter !== undefined
    && globalPack.targetTileCount !== undefined
    && tileOptimization.tileCountAfter !== globalPack.targetTileCount
  ) {
    errors.push("pack_tile_count_mismatch");
  }
  const hasAnyEvidence = Boolean(preparationReport || tileReport || packReport);
  const hasFullPackEvidence = Boolean(preparationReport && tileReport && packReport);

  let status = "candidate";
  if (!hasAnyEvidence) {
    warnings.push("evidence_missing");
  } else if (errors.length > 0) {
    status = "impossible";
  } else if (preparationReport && !tileReport && !packReport) {
    status = warnings.includes("color_error_present") ? "attention" : "palette-prepared";
  } else if (warnings.length > 0) {
    status = "attention";
  } else if (hasFullPackEvidence) {
    status = "pack-validated";
  } else {
    status = "attention";
    warnings.push("full_pack_evidence_missing");
  }

  return {
    schemaVersion: 1,
    consumer: "background",
    status,
    ready: status === "pack-validated",
    checks: {
      preparation,
      tileOptimization,
      globalPack,
    },
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}
