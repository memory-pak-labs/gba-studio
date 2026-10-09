import { describe, expect, it } from "vitest";
import { validateBackgroundEvidence } from "./background-validator.mjs";

function preparationReport(overrides = {}) {
  return {
    schema_version: 1,
    runtime_bpp: 4,
    width: 240,
    height: 160,
    tile_count: 600,
    bank_count: 2,
    total_color_error: 0,
    status: "safe",
    ...overrides,
  };
}

function tileReport(overrides = {}) {
  return {
    schema_version: 1,
    runtime_bpp: 4,
    optimization_enabled: true,
    tile_budget: 800,
    tile_count_before: 720,
    tile_count_after: 720,
    merged_tile_count: 0,
    total_mapping_error: 0,
    ...overrides,
  };
}

function packReport(overrides = {}) {
  return {
    schema: 11,
    kind: "GBAStudioAssetPackReport",
    ok: true,
    budgets: {
      bg_tiles: 896,
      bg_palette_colors: 256,
    },
    budget_summary: {
      bg_tiles: { used: 720, capacity: 896, remaining: 176, percent_used: 80 },
      bg_palette_colors: { used: 32, capacity: 256, remaining: 224, percent_used: 12.5 },
    },
    production_summary: {
      blocking_overflow_count: 0,
      ready_for_large_project: true,
    },
    errors: [],
    asset_reports: [
      {
        id: "scene_background",
        kind: "bg",
        ok: true,
        resources: {
          bg_tiles: 720,
          bg_palette_colors: 16,
          tilemap_entries: 600,
        },
      },
    ],
    ...overrides,
  };
}

describe("validateBackgroundEvidence", () => {
  it("não promove uma preparação 4bpp sem pack e classifica como palette-prepared", () => {
    const result = validateBackgroundEvidence({
      preparationReport: preparationReport(),
    });

    expect(result.status).toBe("palette-prepared");
    expect(result.ready).toBe(false);
    expect(result.checks.preparation.status).toBe("passed");
    expect(result.warnings).toContain("pack_report_missing");
  });

  it("classifica pack, tiles e orçamento válidos como pack-validated", () => {
    const result = validateBackgroundEvidence({
      preparationReport: preparationReport(),
      tileReport: tileReport(),
      packReport: packReport(),
      assetId: "scene_background",
      paletteBanks: 2,
    });

    expect(result.status).toBe("pack-validated");
    expect(result.ready).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.checks.tileOptimization.status).toBe("passed");
    expect(result.checks.globalPack.status).toBe("passed");
  });

  it("rebaixa a evidência para attention quando há erro de remapeamento", () => {
    const result = validateBackgroundEvidence({
      preparationReport: preparationReport({ total_color_error: 42, status: "attention" }),
      tileReport: tileReport({ tile_count_before: 900, total_mapping_error: 128, merged_tile_count: 180, tile_count_after: 720 }),
      packReport: packReport(),
      assetId: "scene_background",
    });

    expect(result.status).toBe("attention");
    expect(result.ready).toBe(false);
    expect(result.warnings).toContain("mapping_error_present");
    expect(result.warnings).toContain("color_error_present");
  });

  it("bloqueia pack com overflow ou relatório explicitamente inválido", () => {
    const result = validateBackgroundEvidence({
      tileReport: tileReport({ tile_count_after: 900 }),
      packReport: packReport({
        ok: false,
        production_summary: { blocking_overflow_count: 1, ready_for_large_project: false },
        errors: [{ code: "BG_TILES_OVERFLOW" }],
      }),
      assetId: "scene_background",
      tileBudget: 800,
    });

    expect(result.status).toBe("impossible");
    expect(result.ready).toBe(false);
    expect(result.errors).toContain("pack_report_not_ok");
    expect(result.errors).toContain("tile_budget_exceeded");
    expect(result.errors).toContain("blocking_overflow");
  });
});
