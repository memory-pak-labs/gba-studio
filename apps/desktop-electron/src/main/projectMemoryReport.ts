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
  linkedAddressBytes,
  parseGnuLinkerMap,
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

function bytePool(staticBytes: number, linkedBytes: number, capacityBytes: number, reservedBytes = 0): ProjectMemoryReportBytePool {
  const usedBytes = staticBytes + reservedBytes;
  return {
    usedBytes,
    linkedBytes,
    paddingBytes: Math.max(0, staticBytes - linkedBytes),
    reservedBytes,
    capacityBytes,
    remainingBytes: Math.max(0, capacityBytes - usedBytes),
    percent: percent(usedBytes, capacityBytes),
    severity: usedBytes > capacityBytes ? "error" : usedBytes >= capacityBytes * 0.9 ? "warning" : "ok"
  };
}

function linkerSymbol(contents: string, name: string): number {
  const body = contents.slice(Math.max(0, contents.indexOf("Linker script and memory map")));
  const match = body.match(new RegExp(`^\\s+0x([0-9a-fA-F]+)\\s+${name}\\s*=`, "m"));
  if (!match) throw new Error(`Símbolo obrigatório ausente no mapa de memória: ${name}`);
  return Number.parseInt(match[1], 16);
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
  const iwramStart = 0x03000000, iwramEnd = iwramStart + gbaIwramCapacityBytes;
  const bssEnd = linkerSymbol(mapContents, "__bss_end");
  const ewramEnd = linkerSymbol(mapContents, "__ewram_bss_end");
  const stackBottom = linkerSymbol(mapContents, "__stack_bottom");
  const stackTop = linkerSymbol(mapContents, "__stack_top");
  const svcBottom = linkerSymbol(mapContents, "__svc_stack_bottom");
  const svcTop = linkerSymbol(mapContents, "__svc_stack_top");
  const irqBottom = linkerSymbol(mapContents, "__irq_stack_bottom");
  const irqTop = linkerSymbol(mapContents, "__irq_stack_top");
  if (bssEnd < iwramStart || ewramEnd < 0x02000000 || stackBottom < iwramStart
      || stackTop < stackBottom || svcBottom < stackTop || svcTop < svcBottom
      || irqBottom < svcTop || irqTop < irqBottom || irqTop > iwramEnd) {
    throw new Error("Limites de RAM ou reservas de pilha inválidos no mapa de memória.");
  }
  const ewram = bytePool(ewramEnd - 0x02000000,
    linkedAddressBytes(mapEntries, 0x02000000, 0x02040000), gbaEwramCapacityBytes);
  const iwram = {
    ...bytePool(bssEnd - iwramStart, linkedAddressBytes(mapEntries, iwramStart, iwramEnd),
      gbaIwramCapacityBytes, iwramEnd - stackBottom),
    stacks: { systemBytes: stackTop - stackBottom, irqBytes: irqTop - irqBottom, supervisorBytes: svcTop - svcBottom }
  };
  const peakGroups = (assetReport.group_pressure_report ?? [])
    .map((group) => ({
      name: group.name,
      assetCount: group.asset_count,
      peakPercent: peakGroupPercent(group.resources),
      severity: group.severity ?? "ok"
    }))
    .sort((left, right) => right.peakPercent - left.peakPercent);
  const warnings = [
    ...Object.entries({ EWRAM: ewram, IWRAM: iwram })
      .filter(([, usage]) => usage.severity !== "ok")
      .map(([name, usage]) => `${name}: ${usage.remainingBytes} bytes de margem estática; ${usage.percent}% ocupado, incluindo reservas.`),
    ...Object.entries(resources)
      .filter(([, usage]) => usage.severity !== "ok")
      .map(([name, usage]) => `${name}: ${usage.percent}% do limite compilado.`),
    ...peakGroups
      .filter((group) => group.severity !== "ok" || group.peakPercent >= 80)
      .map((group) => `${group.name}: pico de ${group.peakPercent}% em um pool de hardware.`)
  ];
  const report: ProjectMemoryReport = {
    schema: 2,
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
      ewram,
      iwram,
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
