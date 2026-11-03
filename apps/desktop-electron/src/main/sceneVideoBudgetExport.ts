import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildAssetPackVideoBudget, type AssetPackVideoBudgetReport } from "../shared/assetPackVideoBudget.js";
import { projectBudgetSceneGroupName } from "../shared/projectBudget.js";
import { writeFileIfChanged } from "./stableBuildFiles.js";

const labels = { bgVram: "VRAM BG", objVram: "VRAM OBJ", screenblocks: "screenblocks", bgPalette: "paleta BG", objPalette: "paleta OBJ", oam: "OAM", romAssets: "assets na ROM" };

export class SceneVideoBudgetExportError extends Error {
  constructor(readonly report: AssetPackVideoBudgetReport) {
    const errors = report.scenes.flatMap(scene => scene.diagnostics.filter(d => d.status === "blocked").map(d =>
      `${scene.scene}: ${d.resource ? labels[d.resource] : d.code}${d.used !== undefined ? ` ${d.used}/${d.capacity}` : ""}`));
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
