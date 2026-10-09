export interface SceneTypeOption {
  id: string;
  label: string;
}

export const SCENE_TYPE_OPTIONS: SceneTypeOption[] = [
  { id: "topdown", label: "Aventura / Top-down" },
  { id: "platformer", label: "Plataforma" },
  { id: "isometric", label: "Isométrico" },
  { id: "dungeonCrawler", label: "Dungeon Crawler" },
  { id: "racing", label: "Corrida" },
  { id: "pointAndClick", label: "Apontar e clicar" },
  { id: "shmup", label: "Shoot em Up" },
  { id: "visualNovel", label: "Visual Novel" },
  { id: "menu", label: "Menu / UI" },
  { id: "cutscene", label: "Cutscene" },
  { id: "worldMap", label: "Mapa mundial" },
  { id: "battleRpg", label: "Batalha RPG" },
  { id: "luta", label: "Luta" },
  { id: "custom", label: "Custom" }
];

const SCENE_TYPE_ALIASES: Record<string, string> = {
  "aventura / top-down": "topdown",
  "aventura/top-down": "topdown",
  topdown: "topdown",
  top_down: "topdown",
  "top-down": "topdown",
  plataforma: "platformer",
  platformer: "platformer",
  isometrico: "isometric",
  isométrico: "isometric",
  isometric: "isometric",
  isometricadventure: "isometric",
  isometrictactical: "isometric",
  "isometrica · aventura": "isometric",
  "isometrica · batalha tatica rpg": "isometric",
  "dungeon crawler": "dungeonCrawler",
  dungeoncrawler: "dungeonCrawler",
  corrida: "racing",
  racing: "racing",
  "apontar e clicar": "pointAndClick",
  "point and click": "pointAndClick",
  pointandclick: "pointAndClick",
  "point-and-click": "pointAndClick",
  shmup: "shmup",
  "shoot em up": "shmup",
  "shoot 'em up": "shmup",
  "visual novel": "visualNovel",
  visualnovel: "visualNovel",
  "menu / ui": "menu",
  menu: "menu",
  cutscene: "cutscene",
  "mapa mundial": "worldMap",
  worldmap: "worldMap",
  "batalha rpg": "battleRpg",
  battlerpg: "battleRpg",
  luta: "luta",
  fight: "luta",
  fighting: "luta",
  custom: "custom"
};

function normalizedSceneTypeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeSceneTypeId(sceneType: string | null | undefined, fallback = "topdown"): string {
  const raw = typeof sceneType === "string" ? sceneType.trim() : "";
  if (!raw) return fallback;

  const byId = SCENE_TYPE_OPTIONS.find((option) => option.id === raw);
  if (byId) return byId.id;

  const byLabel = SCENE_TYPE_OPTIONS.find((option) => option.label === raw);
  if (byLabel) return byLabel.id;

  const alias = SCENE_TYPE_ALIASES[normalizedSceneTypeKey(raw)];
  if (alias) return alias;

  return fallback;
}

export function isometricGameplayModeForSceneTypeChoice(value: string): "adventure" | "tactical" | undefined {
  return value === "isometricAdventure" ? "adventure" : value === "isometricTactical" ? "tactical" : undefined;
}

export function sceneTypeSelectionValue(sceneType: string, gameplayMode?: string): string {
  return normalizeSceneTypeId(sceneType, sceneType) === "isometric"
    ? gameplayMode === "tactical" ? "isometricTactical" : "isometricAdventure"
    : sceneType;
}

export function sceneTypeLabel(sceneType: string, gameplayMode?: string): string {
  const normalized = normalizeSceneTypeId(sceneType, sceneType);
  const mode = isometricGameplayModeForSceneTypeChoice(sceneType) ?? gameplayMode;
  if (normalized === "isometric" && mode) return mode === "tactical" ? "Isométrica · Batalha tática RPG" : "Isométrica · Aventura";
  return SCENE_TYPE_OPTIONS.find((option) => option.id === normalized)?.label ?? sceneType;
}

export function roomInspectorSceneTypeOptions(currentSceneType?: string | null): Array<{ label: string; value: string }> {
  const options = SCENE_TYPE_OPTIONS.flatMap((option) => option.id === "isometric" ? [
    {label: sceneTypeLabel("isometricAdventure"), value: "isometricAdventure"},
    {label: sceneTypeLabel("isometricTactical"), value: "isometricTactical"}
  ] : [{
    label: option.label,
    value: option.id
  }]);

  const current = typeof currentSceneType === "string" ? currentSceneType.trim() : "";
  if (!current) return options;

  const normalized = normalizeSceneTypeId(current, current);
  if (normalized === "isometric") return options;
  if (options.some((option) => option.value === normalized)) {
    return options.map((option) => (
      option.value === normalized
        ? { ...option, label: sceneTypeLabel(normalized) }
        : option
    ));
  }

  return [{ label: current, value: current }, ...options];
}
