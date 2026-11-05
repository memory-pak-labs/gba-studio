import type { AssetPackVideoBudgetReport } from "./assetPackVideoBudget.js";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Linked asset objects only. Code, anonymous constants, load images and padding
 * remain in otherBytes; shared bytes must never be summed across scenes. */
export function attachLinkedSceneRomBudget(report: AssetPackVideoBudgetReport, raw: unknown): AssetPackVideoBudgetReport {
  const invalid = () => { throw new Error("Atribuição de ROM por cena inválida."); };
  if (!record(raw) || raw.schema !== 1 || raw.source !== "linked_asset_symbols" ||
    !count(raw.attributedBytes) || !count(raw.otherBytes) || !Array.isArray(raw.scenes) ||
    raw.attributedBytes + raw.otherBytes !== report.linkedRomBytes || raw.scenes.length !== report.scenes.length) return invalid();
  const seen = new Set<string>();
  const rows = raw.scenes.map(row => {
    if (!record(row) || typeof row.scene !== "string" || seen.has(row.scene) ||
      !report.scenes.some(s => s.scene === row.scene) || !count(row.bytes) || !count(row.exclusiveBytes) ||
      !count(row.sharedBytes) || !count(row.assetCount) || row.exclusiveBytes + row.sharedBytes !== row.bytes ||
      row.bytes > (raw.attributedBytes as number)) return invalid();
    seen.add(row.scene);
    return { scene: row.scene, bytes: row.bytes, exclusiveBytes: row.exclusiveBytes, sharedBytes: row.sharedBytes, assetCount: row.assetCount };
  });
  return { ...report, romAssetsSummary: { attributedBytes: raw.attributedBytes, otherBytes: raw.otherBytes },
    scenes: report.scenes.map(scene => {
      const row = rows.find(row => row.scene === scene.scene)!;
      return { ...scene, romAssetBytes: row.bytes, romAssets: { ...row, source: "linked_asset_symbols" as const },
        metrics: scene.metrics.map(metric => metric.resource !== "romAssets" ? metric : {
          ...metric, used: row.bytes, addressEnd: row.bytes, basis: "linked_elf" as const,
          status: row.bytes >= metric.maximumCapacity * 0.95 ? "not_recommended" as const
            : row.bytes >= metric.maximumCapacity * 0.8 ? "attention" as const : "ok" as const
        }) };
    }) };
}
