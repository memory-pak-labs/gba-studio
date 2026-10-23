import type {
  AssetPackFragmentationUsage,
  AssetPackResourceBankGroup
} from "./projectBudget.js";
import type {
  RomOccupancyCategory,
  LinkerMapEntry
} from "./romOccupancy.js";

export interface ProjectMemoryReportPool {
  used: number;
  capacity: number;
  remaining: number;
  percent: number;
  severity: string;
}

export interface ProjectMemoryReportBytePool {
  usedBytes: number;
  linkedBytes: number;
  paddingBytes: number;
  reservedBytes: number;
  capacityBytes: number;
  remainingBytes: number;
  percent: number;
  severity: string;
}

export interface ProjectMemoryReport {
  schema: 2;
  generatedAt: string;
  rom: {
    fileBytes: number;
    linkedBytes: number;
    discardedBytes: number;
    capacityBytes: number;
    percent: number;
    categories: RomOccupancyCategory[];
    largestEntries: LinkerMapEntry[];
  };
  ram: {
    ewram: ProjectMemoryReportBytePool;
    iwram: ProjectMemoryReportBytePool & {
      stacks: { systemBytes: number; irqBytes: number; supervisorBytes: number };
    };
    linkedBytes: number;
  };
  resources: Record<string, ProjectMemoryReportPool>;
  peakGroups: Array<{
    name: string;
    assetCount: number;
    peakPercent: number;
    severity: string;
  }>;
  resourceBankGroups: AssetPackResourceBankGroup[];
  fragmentation: Record<string, AssetPackFragmentationUsage>;
  warnings: string[];
}
