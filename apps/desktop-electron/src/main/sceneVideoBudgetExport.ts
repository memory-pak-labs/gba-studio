import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildAssetPackVideoBudget, type AssetPackVideoBudgetReport } from "../shared/assetPackVideoBudget.js";
import { projectBudgetSceneGroupName } from "../shared/projectBudget.js";
import { writeFileIfChanged } from "./stableBuildFiles.js";

const labels = { bgVram: "VRAM BG", objVram: "VRAM OBJ", screenblocks: "screenblocks", bgPalette: "paleta BG", objPalette: "paleta OBJ", oam: "OAM", romAssets: "assets na ROM" };

export class SceneVideoBudgetExportError extends Error {
  constructor(readonly report: AssetPackVideoBudgetReport) {
    const errors = report.scenes.flatMap(scene => scene.diagnostics.filter(d => d.status === "blocked").map(d =>
      `${scene.scene}: ${d.resource ? labels[d.resource] : d.code}${d.used !== undefined ? ` ${d.used}/${d.capacity}` : ""}`));
    if (report.linkedRom?.status === "blocked") errors.push(`ROM ${report.linkedRom.bytes}/${report.linkedRom.capacity} bytes`);
    super(`Exportação bloqueada pelo orçamento de vídeo. ${errors.join("; ")}`);
    this.name = "SceneVideoBudgetExportError";
  }
}

/** Called after assetc and on trusted cache hits. Never trust a cached derived
 * verdict, and never swallow a validation failure as an optional report error. */
export async function writeSceneVideoBudgetReport(destination: string, scenes: readonly { name: string }[]): Promise<AssetPackVideoBudgetReport> {
  const raw: unknown = JSON.parse(await readFile(path.join(destination, "asset_pack_report.json"), "utf8"));
  const report = buildAssetPackVideoBudget(scenes.map(scene => ({ name: scene.name, bankGroup: projectBudgetSceneGroupName(scene.name) })), raw);
  await writeFileIfChanged(path.join(destination, "scene_video_budget.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (report.blocked) throw new SceneVideoBudgetExportError(report);
  return report;
}

/** Link-time file measurement is deliberately project-wide. A linker map may
 * share or discard assets, so these bytes must not be distributed among scenes. */
export async function finalizeSceneVideoBudgetReport(options: {
  projectDir: string;
  romPath: string;
  engineVersion?: string | null;
}): Promise<AssetPackVideoBudgetReport | undefined> {
  let text: string;
  try { text = await readFile(path.join(options.projectDir, "export_project.json"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const contract: unknown = JSON.parse(text);
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) throw new Error("Contrato de exportação inválido para medir a ROM.");
  const exported = contract as { asset_pack?: unknown; scene_contracts?: { name: string }[] };
  if (!exported.asset_pack) return undefined;
  if (!Array.isArray(exported.scene_contracts) || exported.scene_contracts.some(scene => !scene || typeof scene.name !== "string")) {
    throw new Error("Cenas ausentes no contrato de exportação da ROM.");
  }
  // Recompute the compiler verdict; a previous derived report is not evidence.
  const report = await writeSceneVideoBudgetReport(options.projectDir, exported.scene_contracts);
  const rom = await readFile(options.romPath);
  const bytes = rom.byteLength;
  const capacity = 32 * 1024 * 1024;
  const status = bytes > capacity ? "blocked" : bytes >= capacity * 0.95 ? "not_recommended" : bytes >= capacity * 0.8 ? "attention" : "ok";
  report.linkedRomBytes = bytes;
  report.linkedRom = { bytes, sha256: createHash("sha256").update(rom).digest("hex"), capacity, status,
    engineVersion: options.engineVersion ?? null };
  report.blocked ||= status === "blocked";
  await writeFileIfChanged(path.join(options.projectDir, "scene_video_budget.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (report.blocked) throw new SceneVideoBudgetExportError(report);
  return report;
}
