import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  deriveRomOccupancyReport,
  parseGnuLinkerMap,
  type RomOccupancyReport
} from "../shared/romOccupancy.js";

export async function writeRomOccupancyArtifact(
  romPath: string
): Promise<{ path: string; report: RomOccupancyReport } | null> {
  const mapPath = romPath.replace(/\.gba$/i, ".map");
  try {
    const report = deriveRomOccupancyReport(parseGnuLinkerMap(await readFile(mapPath, "utf8")));
    const reportPath = path.join(path.dirname(romPath), "rom_occupancy.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { path: reportPath, report };
  } catch {
    return null;
  }
}
