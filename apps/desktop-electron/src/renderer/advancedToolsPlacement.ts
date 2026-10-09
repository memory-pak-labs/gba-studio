import type { AdvancedToolID } from "../shared/advancedTools.js";
import { normalizeSceneTypeId } from "../shared/sceneTypes.js";

export type AdvancedToolsSurface =
  | "Editor"
  | "Eventos"
  | "Dialogos"
  | "Arquivos"
  | "Ajustes"
  | "Diagnosticos";

const toolsBySurface: Record<AdvancedToolsSurface, readonly AdvancedToolID[]> = {
  Editor: ["autotile", "particles", "cinematicTimeline", "effectsSequencer"],
  Eventos: ["stateMachines", "gameplayComponents"],
  Dialogos: ["fontEditor", "localization"],
  Arquivos: ["asepriteTsx"],
  Ajustes: ["pluginDev"],
  Diagnosticos: ["inputReplay", "saveLab", "linkCable"]
};

const runtimesByTool: Partial<Record<AdvancedToolID, ReadonlySet<string>>> = {
  autotile: new Set(["topdown", "platformer", "isometric", "dungeonCrawler", "racing", "worldMap"]),
  particles: new Set(["topdown", "platformer", "isometric", "shmup", "racing", "battleRpg"]),
  cinematicTimeline: new Set(["cutscene", "visualNovel"]),
  stateMachines: new Set(["topdown", "platformer", "isometric", "dungeonCrawler", "racing", "shmup", "battleRpg"]),
  gameplayComponents: new Set(["topdown", "platformer", "isometric", "dungeonCrawler", "racing"])
};

export function advancedToolsForSurface(
  surface: AdvancedToolsSurface,
  sceneType?: string | null
): AdvancedToolID[] {
  const tools = toolsBySurface[surface];
  if (!sceneType) return [...tools];
  const runtime = normalizeSceneTypeId(sceneType, "topdown");
  return tools.filter((toolID) => runtimesByTool[toolID]?.has(runtime) ?? true);
}
