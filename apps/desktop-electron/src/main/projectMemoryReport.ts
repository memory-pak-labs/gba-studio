import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AssetPackBudgetReport,
  AssetPackBudgetUsage
} from "../shared/projectBudget.js";
import type {
  ProjectMemoryReport,
  ProjectMemoryReportBytePool,
  ProjectMemoryReportPool
} from "../shared/projectMemory.js";
import {
  deriveRomOccupancyReport,
  parseGnuLinkerMap,
  type LinkerMapEntry
} from "../shared/romOccupancy.js";

const gbaRomCapacityBytes = 32 * 1024 * 1024;
const gbaEwramCapacityBytes = 256 * 1024;
const gbaIwramCapacityBytes = 32 * 1024;

export interface WriteProjectMemoryReportOptions {
  assetReportPath: string;
  romPath: string;
  outputPath?: string;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function percent(used: number, capacity: number): number {
  return capacity > 0 ? Math.round((used / capacity) * 1000) / 10 : 0;
}

function pool(used: number, capacity: number, severity = "ok"): ProjectMemoryReportPool {
  return {
    used,
    capacity,
    remaining: Math.max(0, capacity - used),
    percent: percent(used, capacity),
    severity: used > capacity ? "error" : severity
  };
}

function bytePool(usedBytes: number, capacityBytes: number): ProjectMemoryReportBytePool {
  return {
    usedBytes,
    capacityBytes,
    remainingBytes: Math.max(0, capacityBytes - usedBytes),
    percent: percent(usedBytes, capacityBytes),
    severity: usedBytes > capacityBytes ? "error" : "ok"
  };
}

function addressExtentBytes(entries: readonly LinkerMapEntry[], start: number, end: number): number {
  const ranges = entries
    .filter((entry) => !entry.discarded && entry.address >= start && entry.address < end)
    .map((entry) => [entry.address, Math.min(end, entry.address + entry.bytes)] as const)
    .filter(([rangeStart, rangeEnd]) => rangeEnd > rangeStart)
    .sort(([leftStart], [rightStart]) => leftStart - rightStart);

  let total = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const [rangeStart, rangeEnd] of ranges) {
    if (currentStart === null) {
      currentStart = rangeStart;
      currentEnd = rangeEnd;
      continue;
    }
    if (rangeStart > currentEnd) {
      total += currentEnd - currentStart;
      currentStart = rangeStart;
      currentEnd = rangeEnd;
      continue;
    }
    currentEnd = Math.max(currentEnd, rangeEnd);
  }
  if (currentStart !== null) total += currentEnd - currentStart;
  return total;
}

function budgetPool(usage: AssetPackBudgetUsage): ProjectMemoryReportPool {
  return pool(
    Math.max(0, finite(usage.used)),
    Math.max(0, finite(usage.capacity)),
    typeof usage.severity === "string" ? usage.severity : "ok"
  );
}

function peakGroupPercent(resources: Record<string, unknown>): number {
  return Math.max(0, ...Object.values(resources).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
    const record = value as Record<string, unknown>;
    return finite(record.percent_of_pool);
  }));
}

export async function writeProjectMemoryReport(
  options: WriteProjectMemoryReportOptions
): Promise<{ path: string; report: ProjectMemoryReport }> {
  const mapPath = options.romPath.replace(/\.gba$/i, ".map");
  const [romInfo, mapContents, assetContents] = await Promise.all([
    stat(options.romPath),
    readFile(mapPath, "utf8"),
    readFile(options.assetReportPath, "utf8")
  ]);
  const mapEntries = parseGnuLinkerMap(mapContents);
  const occupancy = deriveRomOccupancyReport(mapEntries);
  const assetReport = JSON.parse(assetContents) as AssetPackBudgetReport;
  const resources = Object.fromEntries(
    Object.entries(assetReport.budget_summary ?? {}).map(([name, usage]) => [
      name,
      budgetPool(usage)
    ])
  );
  const ewramBytes = addressExtentBytes(mapEntries, 0x02000000, 0x02040000);
  const iwramBytes = addressExtentBytes(mapEntries, 0x03000000, 0x03008000);
  const peakGroups = (assetReport.group_pressure_report ?? [])
    .map((group) => ({
      name: group.name,
      assetCount: group.asset_count,
      peakPercent: peakGroupPercent(group.resources),
      severity: group.severity ?? "ok"
    }))
    .sort((left, right) => right.peakPercent - left.peakPercent);
  const warnings = [
    ...Object.entries(resources)
      .filter(([, usage]) => usage.severity !== "ok")
      .map(([name, usage]) => `${name}: ${usage.percent}% do limite compilado.`),
    ...peakGroups
      .filter((group) => group.severity !== "ok" || group.peakPercent >= 80)
      .map((group) => `${group.name}: pico de ${group.peakPercent}% em um pool de hardware.`)
  ];
  const report: ProjectMemoryReport = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    rom: {
      fileBytes: romInfo.size,
      linkedBytes: occupancy.romBytes,
      discardedBytes: occupancy.discardedBytes,
      capacityBytes: gbaRomCapacityBytes,
      percent: percent(romInfo.size, gbaRomCapacityBytes),
      categories: occupancy.categories,
      largestEntries: occupancy.largestEntries
    },
    ram: {
      ewram: bytePool(ewramBytes, gbaEwramCapacityBytes),
      iwram: bytePool(iwramBytes, gbaIwramCapacityBytes),
      linkedBytes: occupancy.ramBytes
    },
    resources,
    peakGroups,
    resourceBankGroups: assetReport.resource_bank_groups ?? [],
    fragmentation: assetReport.fragmentation_report ?? {},
    warnings
  };
  const outputPath = options.outputPath
    ?? path.join(path.dirname(options.romPath), "memory_report.json");
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { path: outputPath, report };
}
