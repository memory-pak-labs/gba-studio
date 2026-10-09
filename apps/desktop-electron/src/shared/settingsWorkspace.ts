import type { GBAProjectData } from "./projectFile.js";
import type { SettingsPathValidationTarget } from "./ipc.js";
import { isEditableSettingsField, isSettingsInformationField, isSupportedSettingsField } from "./settingsFieldPolicy.js";
import { resolveProjectRelativePath } from "./engineRomPipeline.js";
import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";
import {
  backgroundReferenceOptions,
  sceneReferenceOptions,
  validateSceneProfileReferences,
  worldMapTargetOptions
} from "./sceneProfileReferences.js";
import { deriveDialogueCharacterSound } from "./dialoguesWorkspace.js";
import { formatRoomEditorShortcut, ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS } from "./roomEditorShortcuts.js";
import {
  SCENE_TRANSITION_STYLES,
  sceneTransitionDisplayName,
  sceneTransitionFromProjectSettings
} from "./sceneTransition.js";
import {
  deriveProjectAffineCapabilityUsage,
  type ProjectAffineCapabilityUsage
} from "./runtimeCapabilities.js";
import {
  formatGBAKeyboardBindings,
  GBA_CONTROL_BINDING_DEFINITIONS
} from "./gbaControls.js";

export type SettingsWorkspaceTone = "default" | "ok" | "warning" | "muted";
export type SettingsSectionID =
  | "general"
  | "shortcuts"
  | "credits"
  | "build"
  | "hardware"
  | "controls"
  | "sceneTypes"
  | "topdown"
  | "platformer"
  | "isometric"
  | "dungeonCrawler"
  | "racing"
  | "battleRpg"
  | "luta"
  | "worldMap"
  | "visualNovel"
  | "cutscene"
  | "shmup"
  | "pointAndClick"
  | "sprites"
  | "backgrounds"
  | "uiDialogs"
  | "audio"
  | "save"
  | "runtimeCapabilities"
  | "transitions"
  | "projectiles"
  | "preview"
  | "debug"
  | "mcp";
export type SettingsSectionGroup = "Aplicativo" | "Projeto" | "Cenas" | "Assets e Conteudo" | "Sistemas" | "Exportacao" | "Avancado";
export type SettingsWorkspaceScope = "all" | "global" | "scene" | "export";
export type SettingsEditableFieldType = "text" | "number" | "boolean";
export type SettingsEditableValue = string | number | boolean;
export type SettingsPathPickerMode = "directory" | "file";

export interface SettingsWorkspaceDiagnostic {
  id: string;
  label: string;
  detail: string;
  tone: SettingsWorkspaceTone;
}

export interface SettingsWorkspaceItem {
  label: string;
  value: string;
  tone: SettingsWorkspaceTone;
}

export interface SettingsSectionIntentOption {
  id: string;
  title: string;
  detail: string;
  fieldCount: number;
  applied: boolean;
  changes: Array<{ fieldKey: string; value: SettingsEditableValue }>;
}

export interface SettingsSectionIntentGroup {
  title: string;
  options: SettingsSectionIntentOption[];
}

export interface SettingsEditableField {
  description?: string;
  key: string;
  label: string;
  maximum?: number;
  minimum?: number;
  range?: boolean;
  step?: number;
  type: SettingsEditableFieldType;
  unit?: string;
  readOnly?: boolean;
  value: SettingsEditableValue;
  defaultValue: SettingsEditableValue;
  pathPicker?: SettingsPathPickerMode;
  options?: SettingsEditableFieldOption[];
}

export interface SettingsEditableFieldOption {
  value: string | number;
  label: string;
}

export type SettingsExportScope = "preview-only" | "play-only" | "export" | "both" | "editor-only";

export interface SettingsWorkspaceSection {
  id: SettingsSectionID;
  group: SettingsSectionGroup;
  title: string;
  detail: string;
  exportScope: SettingsExportScope;
  items: SettingsWorkspaceItem[];
  editableFields: SettingsEditableField[];
  intentGroups: SettingsSectionIntentGroup[];
  runtimeCapabilityUsage?: ProjectAffineCapabilityUsage;
}

const BATTLE_HUD_PRESENTATION_FIELD_KEYS = new Set(["showExperienceBar", "showHealthBars"]);

const SETTINGS_SECTION_EXPORT_SCOPE: Record<SettingsSectionID, SettingsExportScope> = {
  general: "both",
  shortcuts: "editor-only",
  credits: "editor-only",
  build: "export",
  hardware: "both",
  controls: "play-only",
  sceneTypes: "editor-only",
  topdown: "export",
  platformer: "export",
  isometric: "both",
  dungeonCrawler: "both",
  racing: "both",
  battleRpg: "both",
  luta: "both",
  worldMap: "both",
  visualNovel: "both",
  cutscene: "both",
  shmup: "both",
  pointAndClick: "both",
  sprites: "both",
  backgrounds: "both",
  uiDialogs: "export",
  audio: "export",
  save: "export",
  runtimeCapabilities: "both",
  transitions: "both",
  projectiles: "both",
  preview: "preview-only",
  debug: "editor-only",
  mcp: "editor-only"
};

function sectionDetailWithExportScope(detail: string, exportScope: SettingsExportScope): string {
  if (exportScope === "play-only") return `${detail} · So Play`;
  if (exportScope === "preview-only") return `${detail} · So preview`;
  if (exportScope === "export") return `${detail} · Export ROM`;
  if (exportScope === "editor-only") return `${detail} · So editor`;
  return detail;
}

export interface SettingsGameplayPreset {
  id: string;
  title: string;
  detail: string;
  changes: Array<{
    sectionID: SettingsSectionID;
    fieldKey: string;
    value: SettingsEditableValue;
  }>;
}

export interface SettingsWorkspaceSummary {
  hasSettings: boolean;
  sectionCount: number;
  configuredPathCount: number;
  availableSceneTypeCount: number;
  enabledPreviewOverlayCount: number;
  enabledDebugFlagCount: number;
  engineBackend: string;
  audioMode: string;
  startScene: string;
  exportFolder: string;
  diagnosticWarningCount: number;
  warnings: string[];
}

export interface SettingsWorkspacePresentation {
  sections: SettingsWorkspaceSection[];
  diagnostics: SettingsWorkspaceDiagnostic[];
  gameplayPresets: SettingsGameplayPreset[];
  summary: SettingsWorkspaceSummary;
}

export interface SettingsWorkspaceSearchResult {
  sectionID: SettingsSectionID;
  title: string;
  detail: string;
  matchCount: number;
}

export interface SettingsSectionChangeSummary {
  changedCount: number;
  changedFields: string[];
}

interface SettingsFieldDefinition {
  description?: string;
  key: string;
  label: string;
  maximum?: number;
  minimum?: number;
  range?: boolean;
  step?: number;
  type: SettingsEditableFieldType;
  unit?: string;
  readOnly?: boolean;
  defaultValue: SettingsEditableValue;
  pathPicker?: SettingsPathPickerMode;
}

type SceneFieldMetadata = Pick<SettingsFieldDefinition, "description" | "maximum" | "minimum" | "range" | "readOnly" | "step" | "unit">;

interface SettingsSectionIntentOptionDefinition {
  id: string;
  title: string;
  detail: string;
  conditions: Array<{
    fieldKey: string;
    value: SettingsEditableValue;
  }>;
}

interface SettingsSectionIntentGroupDefinition {
  title: string;
  options: SettingsSectionIntentOptionDefinition[];
}

const SETTINGS_FIELD_DEFINITIONS: Record<SettingsSectionID, SettingsFieldDefinition[]> = {
  general: [
    { key: "gameTitle", label: "Titulo", type: "text", defaultValue: "" },
    { key: "author", label: "Autor", type: "text", defaultValue: "" },
    { key: "version", label: "Versao", type: "text", defaultValue: "0.1.0" },
    { key: "startScene", label: "Cena inicial", type: "text", defaultValue: "" },
    { key: "startSceneType", label: "Tipo inicial", type: "text", defaultValue: "topdown" },
    { key: "startPlayer", label: "Player inicial", type: "text", defaultValue: "Player" },
    { key: "defaultLanguage", label: "Idioma", type: "text", defaultValue: "pt-BR" },
    { key: "exportFolder", label: "Export", type: "text", defaultValue: "build", pathPicker: "directory" }
  ],
  shortcuts: ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.map((binding) => ({
    description: binding.description,
    key: binding.fieldKey,
    label: binding.label,
    type: "text" as const,
    defaultValue: binding.defaultKey
  })),
  credits: [],
  build: [
    { key: "romFileName", label: "ROM", type: "text", defaultValue: "game.gba" },
    { key: "gameCode", label: "Código do jogo", type: "text", defaultValue: "GBS0" },
    { key: "makerCode", label: "Código do fabricante", type: "text", defaultValue: "00" },
    { key: "romVersion", label: "Revisão da ROM", type: "number", defaultValue: 0, minimum: 0, maximum: 255, step: 1 },
    { key: "exportFormat", label: "Formato", type: "text", defaultValue: "gba_rom" },
    { key: "engineBackend", label: "Backend", type: "text", defaultValue: "gbastudio_engine" },
    { key: "enginePackPath", label: "Engine Pack", type: "text", defaultValue: "", pathPicker: "directory" },
    { key: "toolchain", label: "Toolchain", type: "text", defaultValue: "devkitARM" },
    { key: "compilerPath", label: "Compiler", type: "text", defaultValue: "", pathPicker: "directory" },
    { key: "generateDebugFiles", label: "Debug files", type: "boolean", defaultValue: false },
    { key: "runEmulatorAfterBuild", label: "Rodar emulador", type: "boolean", defaultValue: false },
    { key: "splitProjectResources", label: "Salvar projeto multi-arquivo (.gbares)", type: "boolean", defaultValue: false },
    { key: "compactTilemaps", label: "Compactar tilemaps e colisões ao salvar", type: "boolean", defaultValue: true },
    { key: "persistentBuildCache", label: "Cache incremental persistente", type: "boolean", defaultValue: true }
  ],
  hardware: [
    { key: "graphicsMode", label: "Modo grafico", type: "text", defaultValue: "Mode 0 - Tilemaps" },
    { key: "resolution", label: "Resolucao", type: "text", defaultValue: "240 x 160" },
    { key: "tileSize", label: "Tile", type: "text", defaultValue: "8 px" },
    { key: "spritesPerScene", label: "Sprites por cena", type: "number", defaultValue: 128, minimum: 1, maximum: 128, step: 1 },
    { key: "vramBudget", label: "VRAM", type: "text", defaultValue: "96 KB" },
    { key: "profile", label: "Perfil", type: "text", defaultValue: "GBA padrao" }
  ],
  controls: [
    ...GBA_CONTROL_BINDING_DEFINITIONS.map((definition) => ({
      key: definition.settingKey,
      label: definition.label,
      type: "text" as const,
      defaultValue: formatGBAKeyboardBindings(definition.defaultKeys),
      description: "Separe várias teclas por vírgulas."
    })),
    { key: "preset", label: "Preset", type: "text", defaultValue: "GBA classico" }
  ],
  sceneTypes: [
    ...SCENE_TYPE_OPTIONS.map((option) => ({
      key: `defaultPlayerSprites.${option.id}`,
      label: `Player padrão · ${option.label}`,
      type: "text" as const,
      defaultValue: ""
    })),
    ...[...SCENE_TYPE_OPTIONS, { id: "isometricTactical", label: "Isométrico tático" },
      { id: "racingPerspective", label: "Corrida em perspectiva" }].map(option => ({
      key: `defaultBackgrounds.${option.id}`, label: `Background padrão · ${option.label}`,
      type: "text" as const, defaultValue: ""
    }))
  ],
  topdown: [
    { key: "interactButton", label: "Botao interacao", type: "text", defaultValue: "A" },
    { key: "movementType", label: "Tipo movimento", type: "text", defaultValue: "8 direcoes" },
    { key: "movementBehavior", label: "Comportamento", type: "text", defaultValue: "Continuo" },
    { key: "directionalAnimation", label: "Animacao direcional", type: "text", defaultValue: "4-way animation" },
    { key: "gridSize", label: "Tamanho da grade", type: "text", defaultValue: "8 px" },
    { key: "walkSpeed", label: "Velocidade caminhada", type: "number", defaultValue: 1 },
    { key: "allowDiagonal", label: "Permitir diagonal", type: "boolean", defaultValue: true },
    { key: "normalizeDiagonal", label: "Normalizar diagonal", type: "boolean", defaultValue: true },
    { key: "turnActorOnMove", label: "Virar ator ao mover", type: "boolean", defaultValue: true },
    { key: "runEnabled", label: "Habilitar correr", type: "boolean", defaultValue: true },
    { key: "runButton", label: "Botao de correr", type: "text", defaultValue: "B" },
    { key: "runSpeed", label: "Velocidade de corrida", type: "number", defaultValue: 1.75 },
    { key: "acceleration", label: "Aceleracao", type: "number", defaultValue: 0.25 },
    { key: "deceleration", label: "Desaceleracao", type: "number", defaultValue: 0.25 },
    { key: "repulsion", label: "Repulsao", type: "boolean", defaultValue: true }
  ],
  platformer: [
    { key: "interactButton", label: "Botao interacao", type: "text", defaultValue: "A" },
    { key: "jumpButton", label: "Botao de pulo", type: "text", defaultValue: "A" },
    { key: "runButton", label: "Botao de correr", type: "text", defaultValue: "B" },
    { key: "walkSpeed", label: "Velocidade caminhada", type: "number", defaultValue: 1.56 },
    { key: "gravity", label: "Gravidade", type: "number", defaultValue: 0.44 },
    { key: "maxFallSpeed", label: "Velocidade maxima de queda", type: "number", defaultValue: 4.88 },
    { key: "airControl", label: "Controle no ar", type: "boolean", defaultValue: true },
    { key: "changeDirectionInAir", label: "Virar no ar", type: "boolean", defaultValue: true },
    { key: "runEnabled", label: "Habilitar correr", type: "boolean", defaultValue: true },
    { key: "jumpEnabled", label: "Habilitar pulo", type: "boolean", defaultValue: true },
    { key: "jumpMinHeight", label: "Altura minima do salto", type: "number", defaultValue: 0 },
    { key: "jumpFrames", label: "Frames segurando salto", type: "number", defaultValue: 1 },
    { key: "coyoteTime", label: "Coyote time", type: "number", defaultValue: 6 },
    { key: "jumpBuffer", label: "Buffer de pulo", type: "number", defaultValue: 6 },
    { key: "doubleJump", label: "Pulo duplo", type: "boolean", defaultValue: false },
    { key: "wallJump", label: "Pulo na parede", type: "boolean", defaultValue: false },
    { key: "wallSlide", label: "Deslizar na parede", type: "boolean", defaultValue: true },
    { key: "ladders", label: "Escadas", type: "boolean", defaultValue: true },
    { key: "dropThrough", label: "Drop-through", type: "text", defaultValue: "off" },
    { key: "cameraDeadzoneX", label: "Deadzone X da camera", type: "number", defaultValue: 0 },
    { key: "dashStyle", label: "Estilo do dash", type: "text", defaultValue: "both" },
    { key: "dash", label: "Habilitar dash", type: "boolean", defaultValue: false },
    { key: "dashRechargeFrames", label: "Recarga do dash", type: "number", defaultValue: 0 },
    { key: "ramps", label: "Rampas", type: "boolean", defaultValue: true },
    { key: "acceleration", label: "Aceleracao", type: "number", defaultValue: 0.04 }
  ],
  isometric: [
    { key: "tileWidth", label: "Largura do tile", type: "text", defaultValue: "16 px" },
    { key: "tileHeight", label: "Altura do tile", type: "text", defaultValue: "8 px" },
    { key: "heightStep", label: "Passo de altura", type: "text", defaultValue: "4 px" },
    { key: "maxHeight", label: "Altura maxima", type: "number", defaultValue: 7 },
    { key: "movement", label: "Movimento", type: "text", defaultValue: "4 direcoes projetadas" },
    { key: "behavior", label: "Comportamento", type: "text", defaultValue: "Continuo" },
    { key: "camera", label: "Camera", type: "text", defaultValue: "Seguir player projetado" },
    { key: "ramps", label: "Rampas", type: "text", defaultValue: "1 nivel com rampa" },
    { key: "walkSpeed", label: "Velocidade de caminhada", type: "number", defaultValue: 1 },
    { key: "depthSort", label: "Ordenar por profundidade", type: "boolean", defaultValue: true },
    { key: "acceleration", label: "Aceleracao", type: "number", defaultValue: 0.25 },
    { key: "deceleration", label: "Desaceleracao", type: "number", defaultValue: 0.25 }
  ],
  dungeonCrawler: [
    { key: "stepDurationMs", label: "Duração do passo", type: "number", defaultValue: 180 },
    { key: "turnDurationMs", label: "Duração do giro", type: "number", defaultValue: 120 },
    { key: "allowBackstep", label: "Permitir passo para trás", type: "boolean", defaultValue: true },
    { key: "viewDistance", label: "Distância de visão", type: "number", defaultValue: 5 }
  ],
  racing: [
    { key: "maxSpeed", label: "Velocidade máxima", type: "number", defaultValue: 4 },
    { key: "acceleration", label: "Aceleração", type: "number", defaultValue: 8 },
    { key: "brakePower", label: "Força do freio", type: "number", defaultValue: 12 },
    { key: "steeringSpeed", label: "Velocidade de direção", type: "number", defaultValue: 2 }
  ],
  battleRpg: [
    { key: "maxPartySize", label: "Máximo no grupo", type: "number", defaultValue: 6 },
    { key: "maxEnemies", label: "Máximo de inimigos", type: "number", defaultValue: 1 },
    { key: "turnDelayFrames", label: "Intervalo entre turnos", type: "number", defaultValue: 30 },
    { key: "escapeEnabled", label: "Permitir fuga", type: "boolean", defaultValue: true },
    { key: "experienceMultiplier", label: "Multiplicador de XP", type: "number", defaultValue: 1 },
    { key: "typeEffectivenessEnabled", label: "Tipos elementais", type: "boolean", defaultValue: true },
    { key: "criticalHitEnabled", label: "Golpes críticos", type: "boolean", defaultValue: true },
    { key: "statusConditionsEnabled", label: "Condições de status", type: "boolean", defaultValue: true },
    { key: "abilitiesEnabled", label: "Habilidades", type: "boolean", defaultValue: true },
    { key: "showExperienceBar", label: "Barra de experiência", type: "boolean", defaultValue: true },
    { key: "showHealthBars", label: "Barras de HP", type: "boolean", defaultValue: true },
    { key: "rewardGold", label: "Ouro da vitória", type: "number", defaultValue: 100 },
    { key: "rewardExperience", label: "Experiência da vitória", type: "number", defaultValue: 50 }
  ],
  luta: [
    { key: "roundTime", label: "Tempo por round", type: "number", defaultValue: 99 },
    { key: "roundsToWin", label: "Rounds para vitória", type: "number", defaultValue: 2 },
    { key: "maxSuperGauge", label: "Medidor de super máximo", type: "number", defaultValue: 100 },
    { key: "superGaugeGainOnHit", label: "Ganho de super ao acertar", type: "number", defaultValue: 8 },
    { key: "superGaugeGainOnReceive", label: "Ganho de super ao receber", type: "number", defaultValue: 4 },
    { key: "guardPowerRecovery", label: "Recuperação de guarda", type: "number", defaultValue: 2 },
    { key: "chipDamageEnabled", label: "Dano de chip", type: "boolean", defaultValue: true },
    { key: "airBlockingEnabled", label: "Bloqueio aéreo", type: "boolean", defaultValue: true },
    { key: "alphaCounterEnabled", label: "Alpha Counter", type: "boolean", defaultValue: true },
    { key: "throwEscapeWindow", label: "Janela de escape de agarrão", type: "number", defaultValue: 8 },
    { key: "parryWindow", label: "Janela de parry", type: "number", defaultValue: 4 },
    { key: "hitstunDecay", label: "Decaimento de hitstun", type: "number", defaultValue: 0.85 },
    { key: "comboLimit", label: "Limite de combo", type: "number", defaultValue: 60 },
    { key: "vismCustomComboGauge", label: "Medidor V-ISM", type: "number", defaultValue: 100 },
    { key: "defaultStyle", label: "Estilo padrão", type: "text", defaultValue: "a-ism" }
  ],
  worldMap: [
    { key: "unlocked", label: "Nós desbloqueados", type: "boolean", defaultValue: true },
    { key: "hideWhenLocked", label: "Ocultar quando bloqueado", type: "boolean", defaultValue: false },
    { key: "requiredVariable", label: "Variável exigida", type: "number", defaultValue: -1 },
    { key: "requiredValue", label: "Valor exigido", type: "number", defaultValue: 0 },
    { key: "targetLevel", label: "Nível de destino", type: "number", defaultValue: -1 }
  ],
  visualNovel: [
    { key: "autoAdvance", label: "Avanço automático", type: "boolean", defaultValue: false },
    { key: "nextSceneIndex", label: "Próxima cena", type: "number", defaultValue: -1 },
    { key: "backgroundIndex", label: "Índice do fundo", type: "number", defaultValue: -1 }
  ],
  cutscene: [
    { key: "stepDurationFrames", label: "Duração dos passos", type: "number", defaultValue: 8 },
    { key: "autoAdvance", label: "Avanço automático", type: "boolean", defaultValue: true },
    { key: "nextSceneIndex", label: "Próxima cena", type: "number", defaultValue: -1 },
    { key: "backgroundIndex", label: "Índice do fundo", type: "number", defaultValue: -1 }
  ],
  shmup: [
    { key: "movementType", label: "Tipo movimento", type: "text", defaultValue: "Preso a tela" },
    { key: "scrollDirection", label: "Direcao rolagem", type: "text", defaultValue: "Direita" },
    { key: "scrollSpeed", label: "Velocidade scroll", type: "number", defaultValue: 1 },
    { key: "playerSpeed", label: "Velocidade player", type: "number", defaultValue: 2 },
    { key: "movement", label: "Movimento", type: "text", defaultValue: "8 direcoes" },
    { key: "clampPlayerToScreen", label: "Prender player na tela", type: "boolean", defaultValue: true },
    { key: "shootButton", label: "Botao tiro", type: "text", defaultValue: "A" },
    { key: "autoFire", label: "Disparo automatico", type: "boolean", defaultValue: true },
    { key: "fireRate", label: "Taxa de disparo", type: "number", defaultValue: 10 },
    { key: "defaultProjectile", label: "Projetil padrao", type: "text", defaultValue: "player_bullet" },
    { key: "defaultDamage", label: "Dano padrao", type: "number", defaultValue: 1 },
    { key: "playerHealth", label: "Vida do player", type: "number", defaultValue: 3 }
  ],
  pointAndClick: [
    { key: "font", label: "Fonte padrao", type: "text", defaultValue: "gba_variable_width" },
    { key: "cursor", label: "Cursor", type: "text", defaultValue: "cursor" },
    { key: "cursorImage", label: "Imagem cursor", type: "text", defaultValue: "cursor" },
    { key: "frameImage", label: "Imagem quadro", type: "text", defaultValue: "ui/dialogue_box.png" },
    { key: "cursorSpeed", label: "Velocidade cursor", type: "number", defaultValue: 1.5 },
    { key: "moveWithDpad", label: "Mover com D-pad", type: "boolean", defaultValue: true },
    { key: "interactButton", label: "Interagir", type: "text", defaultValue: "A" },
    { key: "snapHotspots", label: "Snap hotspots", type: "boolean", defaultValue: false },
    { key: "highlightInteractives", label: "Destacar interativos", type: "boolean", defaultValue: true },
    { key: "showObjectName", label: "Mostrar nome do objeto", type: "boolean", defaultValue: true },
    { key: "actorClick", label: "Clique em ator", type: "boolean", defaultValue: true },
    { key: "triggerClick", label: "Clique em trigger", type: "boolean", defaultValue: true },
    { key: "itemClick", label: "Clique em item", type: "boolean", defaultValue: true },
    { key: "cancelButton", label: "Cancelar", type: "text", defaultValue: "B" },
    { key: "hotspotPadding", label: "Padding hotspot", type: "number", defaultValue: 4 }
  ],
  sprites: [
    { key: "defaultSize", label: "Tamanho padrao", type: "text", defaultValue: "16x16" },
    { key: "defaultPivot", label: "Pivot padrao", type: "text", defaultValue: "Centro inferior" },
    { key: "spritesPerScene", label: "Sprites por cena", type: "number", defaultValue: 128 },
    { key: "warnSpriteLimit", label: "Avisar limite sprites", type: "boolean", defaultValue: true },
    { key: "warnScanlineLimit", label: "Avisar limite scanline", type: "boolean", defaultValue: true },
    { key: "autoGenerateAnimations", label: "Gerar animacoes automaticamente", type: "boolean", defaultValue: false },
    { key: "importPngAs", label: "Importar PNG como", type: "text", defaultValue: "Sprite sheet" },
    { key: "hitboxMode", label: "Hitbox padrao", type: "text", defaultValue: "Automatica" },
    { key: "colorMode", label: "Modo de cor", type: "text", defaultValue: "4bpp / 16 cores" },
    { key: "palette", label: "Paleta", type: "text", defaultValue: "auto" },
    { key: "compression", label: "Compressao", type: "text", defaultValue: "Sem compressao" },
    { key: "showOamUsage", label: "Mostrar uso de OAM", type: "boolean", defaultValue: true }
  ],
  backgrounds: [
    { key: "tileSize", label: "Tamanho do tile", type: "text", defaultValue: "8 px" },
    { key: "defaultMapSize", label: "Mapa padrao", type: "text", defaultValue: "32x32" },
    { key: "graphicsMode", label: "Modo grafico", type: "text", defaultValue: "Mode 0 - Tilemaps" },
    { key: "parallax", label: "Paralaxe", type: "boolean", defaultValue: true },
    { key: "scrolling", label: "Scrolling", type: "boolean", defaultValue: true },
    { key: "collisionLayer", label: "Camada colisao", type: "text", defaultValue: "collision" },
    { key: "bg0", label: "BG0", type: "text", defaultValue: "ui" },
    { key: "bg1", label: "BG1", type: "text", defaultValue: "foreground" },
    { key: "bg2", label: "BG2", type: "text", defaultValue: "mainMap" },
    { key: "bg3", label: "BG3", type: "text", defaultValue: "parallax" },
    { key: "colorMode", label: "Modo de cor", type: "text", defaultValue: "4bpp / 16 cores" },
    { key: "mapCompression", label: "Compressao mapa", type: "text", defaultValue: "LZ77" },
    { key: "affineLayer", label: "Camada affine", type: "text", defaultValue: "BG2" },
    { key: "affineAsset", label: "Imagem affine", type: "text", defaultValue: "" },
    { key: "affineRotation", label: "Rotacao affine", type: "number", defaultValue: 0 },
    { key: "affineScaleX", label: "Escala affine X", type: "number", defaultValue: 1 },
    { key: "affineScaleY", label: "Escala affine Y", type: "number", defaultValue: 1 },
    { key: "affineOriginX", label: "Origem affine X", type: "number", defaultValue: 120 },
    { key: "affineOriginY", label: "Origem affine Y", type: "number", defaultValue: 80 },
    { key: "affineWrap", label: "Repetir camada affine", type: "boolean", defaultValue: true },
    { key: "bitmapAsset", label: "Imagem bitmap", type: "text", defaultValue: "" },
    { key: "bitmapPage", label: "Pagina bitmap", type: "number", defaultValue: 0 }
  ],
  uiDialogs: [
    { key: "font", label: "Fonte padrao", type: "text", defaultValue: "GBA padrao" },
    { key: "textSpeed", label: "Velocidade texto", type: "text", defaultValue: "Normal" },
    { key: "characterSound", label: "Som caractere", type: "text", defaultValue: "" },
    { key: "selectorImage", label: "Imagem seletor", type: "text", defaultValue: "ui/dialogue_cursor.png" },
    { key: "boxImage", label: "Imagem caixa", type: "text", defaultValue: "ui/dialogue_box.png" },
    { key: "startMenuTitle", label: "Titulo menu Start", type: "text", defaultValue: "Menu" },
    { key: "startMenuShowInventory", label: "Exibir Itens no Start", type: "boolean", defaultValue: false },
    { key: "startMenuShowMap", label: "Exibir Mapa no Start", type: "boolean", defaultValue: false },
    { key: "boxPosition", label: "Posicao caixa", type: "text", defaultValue: "Inferior" },
    { key: "boxWidth", label: "Largura caixa", type: "number", defaultValue: 224, minimum: 24, maximum: 232, step: 8, unit: "px" },
    { key: "boxHeight", label: "Altura caixa", type: "number", defaultValue: 40, minimum: 24, maximum: 128, step: 8, unit: "px" },
    { key: "fontColor", label: "Cor da fonte", type: "text", defaultValue: "#FFFFFF" },
    { key: "showPortrait", label: "Mostrar retrato", type: "boolean", defaultValue: true },
    { key: "portraitPosition", label: "Posicao retrato", type: "text", defaultValue: "Esquerda" },
    { key: "showCharacterName", label: "Mostrar nome personagem", type: "boolean", defaultValue: true },
    { key: "choiceStyle", label: "Estilo escolhas", type: "text", defaultValue: "Lista vertical" },
    { key: "autoAdvance", label: "Avanco automatico", type: "boolean", defaultValue: false },
    { key: "advanceButton", label: "Avancar", type: "text", defaultValue: "A" },
    { key: "cancelButton", label: "Cancelar", type: "text", defaultValue: "B" }
  ],
  preview: [
    { key: "defaultMode", label: "Modo", type: "text", defaultValue: "quick_preview" },
    { key: "scale", label: "Escala", type: "number", defaultValue: 3, minimum: 1, maximum: 6, step: 1, range: true, unit: "x" },
    { key: "showCollisions", label: "Colisoes", type: "boolean", defaultValue: false },
    { key: "showTriggers", label: "Triggers", type: "boolean", defaultValue: false },
    { key: "showHitboxes", label: "Hitboxes", type: "boolean", defaultValue: false },
    { key: "showGrid", label: "Grid", type: "boolean", defaultValue: false },
    { key: "showFps", label: "FPS", type: "boolean", defaultValue: false },
    { key: "showVariables", label: "Variaveis", type: "boolean", defaultValue: false },
    { key: "showEventLog", label: "Event log", type: "boolean", defaultValue: false },
    { key: "emulator", label: "Emulador", type: "text", defaultValue: "mgba" },
    { key: "emulatorPath", label: "Emulador path", type: "text", defaultValue: "", pathPicker: "file" },
    { key: "runAfterBuild", label: "Rodar apos build", type: "boolean", defaultValue: false },
    { key: "muteRoomAudio", label: "Mutar audio room", type: "boolean", defaultValue: false }
  ],
  audio: [
    { key: "audioEngine", label: "Engine", type: "text", defaultValue: "gbastudio_engine_audio" },
    { key: "audioMode", label: "Modo", type: "text", defaultValue: "chiptune_pcm" },
    { key: "defaultMusicFormat", label: "Formato musica", type: "text", defaultValue: "gba_studio_chiptune" },
    { key: "sampleRate", label: "Sample rate", type: "number", defaultValue: 0 },
    { key: "masterVolume", label: "Master", type: "number", defaultValue: 100, minimum: 0, maximum: 127, step: 1, range: true, unit: "nível" },
    { key: "musicVolume", label: "Musica", type: "number", defaultValue: 80, minimum: 0, maximum: 127, step: 1, range: true, unit: "nível" },
    { key: "sfxVolume", label: "SFX", type: "number", defaultValue: 90, minimum: 0, maximum: 127, step: 1, range: true, unit: "nível" },
    { key: "enablePsgChannels", label: "PSG", type: "boolean", defaultValue: true },
    { key: "enableDirectSoundA", label: "Direct A", type: "boolean", defaultValue: true },
    { key: "enableDirectSoundB", label: "Direct B", type: "boolean", defaultValue: true },
    { key: "keepMusicBetweenScenes", label: "Manter entre cenas", type: "boolean", defaultValue: true }
  ],
  save: [
    { key: "saveType", label: "Memória de save", type: "text", defaultValue: "sram" },
    { key: "slots", label: "Slots", type: "number", defaultValue: 3, minimum: 1, maximum: 8, step: 1 },
    { key: "autoSave", label: "Auto save", type: "boolean", defaultValue: true },
    { key: "manualSave", label: "Manual save", type: "boolean", defaultValue: true },
    { key: "resetSaveInDebug", label: "Reset debug", type: "boolean", defaultValue: false },
    { key: "selectedSlot", label: "Slot selecionado", type: "number", defaultValue: 1, minimum: 1, maximum: 8, step: 1 },
    { key: "continueLabel", label: "Texto Continuar", type: "text", defaultValue: "Continuar" },
    { key: "loadLabel", label: "Texto Carregar", type: "text", defaultValue: "Carregar" },
    { key: "deleteLabel", label: "Texto Apagar", type: "text", defaultValue: "Apagar" },
    { key: "menuLayout", label: "Layout do menu", type: "text", defaultValue: "cards" },
    { key: "confirmDelete", label: "Confirmar antes de apagar", type: "boolean", defaultValue: true },
    { key: "showPlayerName", label: "Mostrar nome", type: "boolean", defaultValue: true },
    { key: "showPlayTime", label: "Mostrar tempo jogado", type: "boolean", defaultValue: true },
    { key: "showLocation", label: "Mostrar local", type: "boolean", defaultValue: true }
  ],
  runtimeCapabilities: [
    { key: "rtc.enabled", label: "Relógio em tempo real (RTC)", type: "boolean", defaultValue: false },
    { key: "link.enabled", label: "Link cable / multiplayer", type: "boolean", defaultValue: false }
  ],
  transitions: [
    { key: "style", label: "Estilo padrão", type: "text", defaultValue: "cut" },
    { key: "durationFrames", label: "Duração", type: "number", defaultValue: 30 },
    { key: "fadeOut", label: "Aplicar ao sair", type: "boolean", defaultValue: true },
    { key: "fadeIn", label: "Aplicar ao entrar", type: "boolean", defaultValue: true }
  ],
  projectiles: [
    { key: "activeProjectiles", label: "Projeteis ativos", type: "number", defaultValue: 32, minimum: 0, maximum: 128, step: 1 },
    { key: "usePool", label: "Usar pool", type: "boolean", defaultValue: true },
    { key: "destroyOffscreen", label: "Destruir fora da tela", type: "boolean", defaultValue: true },
    { key: "destroyOnCollision", label: "Destruir em colisao", type: "boolean", defaultValue: true },
    { key: "defaultDamage", label: "Dano padrao", type: "number", defaultValue: 1 },
    { key: "defaultSpeed", label: "Velocidade padrao", type: "number", defaultValue: 2 },
    { key: "defaultSprite", label: "Sprite padrao", type: "text", defaultValue: "bullet_small" },
    { key: "shootSfx", label: "SFX de disparo", type: "text", defaultValue: "shoot_01" },
    { key: "impactSfx", label: "SFX de impacto", type: "text", defaultValue: "hit_01" },
    { key: "collisionDistribution", label: "Distribuicao colisao", type: "text", defaultValue: "Ao longo de 4 frames" },
    { key: "collisionGroup", label: "Grupo de colisao", type: "text", defaultValue: "default" }
  ],
  debug: [
    { key: "showCpuUsage", label: "CPU", type: "boolean", defaultValue: false },
    { key: "showVramUsage", label: "VRAM", type: "boolean", defaultValue: false },
    { key: "showOamUsage", label: "OAM", type: "boolean", defaultValue: false },
    { key: "showPaletteUsage", label: "Palette", type: "boolean", defaultValue: false },
    { key: "showRomUsage", label: "ROM", type: "boolean", defaultValue: false },
    { key: "showRamUsage", label: "RAM", type: "boolean", defaultValue: false },
    { key: "enableEventLogs", label: "Eventos log", type: "boolean", defaultValue: false },
    { key: "enableAudioLogs", label: "Audio log", type: "boolean", defaultValue: false },
    { key: "enableCollisionLogs", label: "Collision log", type: "boolean", defaultValue: false },
    { key: "preserveTempFiles", label: "Preservar temp", type: "boolean", defaultValue: false },
    { key: "developerMode", label: "Developer mode", type: "boolean", defaultValue: false }
  ],
  mcp: [
    { key: "enabled", label: "Ativar MCP local", type: "boolean", defaultValue: false }
  ]
};

const SCENE_FIELD_METADATA: Record<string, SceneFieldMetadata> = {
  "topdown.walkSpeed": { description: "Velocidade em tiles por frame.", maximum: 16, minimum: 0, range: true, step: 0.05, unit: "tiles/frame" },
  "topdown.runSpeed": { description: "Velocidade em tiles por frame.", maximum: 16, minimum: 0, range: true, step: 0.05, unit: "tiles/frame" },
  "topdown.acceleration": { description: "Quanto a velocidade muda por frame.", maximum: 16, minimum: 0, range: true, step: 0.01, unit: "tiles/frame²" },
  "topdown.deceleration": { description: "Quanto a velocidade reduz por frame.", maximum: 16, minimum: 0, range: true, step: 0.01, unit: "tiles/frame²" },
  "platformer.walkSpeed": { description: "Velocidade horizontal em tiles por frame.", maximum: 16, minimum: 0, range: true, step: 0.05, unit: "tiles/frame" },
  "platformer.gravity": { description: "Aceleração vertical aplicada a cada frame.", maximum: 16, minimum: 0, range: true, step: 0.01, unit: "px/frame²" },
  "platformer.maxFallSpeed": { description: "Limite da velocidade vertical.", maximum: 32, minimum: 0, range: true, step: 0.05, unit: "px/frame" },
  "platformer.jumpMinHeight": { description: "Altura mínima antes de soltar o botão.", maximum: 32, minimum: 0, range: true, step: 0.05, unit: "px" },
  "platformer.jumpFrames": { description: "Janela de sustentação do pulo.", maximum: 255, minimum: 0, range: true, step: 1, unit: "frames" },
  "platformer.coyoteTime": { description: "Tolerância após sair da plataforma.", maximum: 255, minimum: 0, range: true, step: 1, unit: "frames" },
  "platformer.jumpBuffer": { description: "Tolerância antes de tocar a plataforma.", maximum: 255, minimum: 0, range: true, step: 1, unit: "frames" },
  "platformer.cameraDeadzoneX": { description: "Faixa horizontal sem mover a câmera.", maximum: 240, minimum: 0, range: true, step: 1, unit: "px" },
  "platformer.dashRechargeFrames": { description: "Tempo para recuperar o dash.", maximum: 255, minimum: 0, range: true, step: 1, unit: "frames" },
  "platformer.acceleration": { description: "Resposta horizontal no chão e no ar.", maximum: 16, minimum: 0, range: true, step: 0.01, unit: "px/frame²" },
  "isometric.tileHeight": { description: "Derivada automaticamente da largura do losango.", readOnly: true, unit: "px" },
  "isometric.maxHeight": { description: "Número máximo de níveis verticais.", maximum: 64, minimum: 0, range: true, step: 1, unit: "níveis" },
  "isometric.walkSpeed": { description: "Velocidade projetada em tiles por frame.", maximum: 16, minimum: 0, range: true, step: 0.05, unit: "tiles/frame" },
  "isometric.acceleration": { description: "Aceleração do movimento projetado.", maximum: 16, minimum: 0, range: true, step: 0.01, unit: "tiles/frame²" },
  "isometric.deceleration": { description: "Desaceleração do movimento projetado.", maximum: 16, minimum: 0, range: true, step: 0.01, unit: "tiles/frame²" },
  "dungeonCrawler.stepDurationMs": { description: "Duração de cada avanço em grade.", maximum: 1000, minimum: 40, range: true, step: 10, unit: "ms" },
  "dungeonCrawler.turnDurationMs": { description: "Duração do giro de 90 graus.", maximum: 1000, minimum: 40, range: true, step: 10, unit: "ms" },
  "dungeonCrawler.viewDistance": { description: "Quantidade de células visíveis à frente.", maximum: 12, minimum: 1, range: true, step: 1, unit: "células" },
  "racing.maxSpeed": { description: "Velocidade máxima do veículo.", maximum: 16, minimum: 0, range: true, step: 0.05, unit: "px/frame" },
  "racing.acceleration": { description: "Força de aceleração.", maximum: 32, minimum: 0, range: true, step: 0.05, unit: "px/frame²" },
  "racing.brakePower": { description: "Força de frenagem.", maximum: 32, minimum: 0, range: true, step: 0.05, unit: "px/frame²" },
  "racing.steeringSpeed": { description: "Velocidade de resposta da direção.", maximum: 16, minimum: 0.125, range: true, step: 0.05, unit: "graus/frame" },
  "battleRpg.maxPartySize": { description: "Quantidade máxima de personagens aliados.", maximum: 6, minimum: 1, range: true, step: 1, unit: "atores" },
  "battleRpg.maxEnemies": { description: "Quantidade máxima de inimigos simultâneos.", maximum: 6, minimum: 1, range: true, step: 1, unit: "atores" },
  "battleRpg.turnDelayFrames": { description: "Espera entre turnos.", maximum: 255, minimum: 0, range: true, step: 1, unit: "frames" },
  "battleRpg.experienceMultiplier": { description: "Multiplicador aplicado à experiência.", maximum: 10, minimum: 0.1, range: true, step: 0.1, unit: "×" },
  "battleRpg.rewardGold": { description: "Ouro entregue ao vencer.", maximum: 65535, minimum: 0, range: true, step: 1, unit: "pontos" },
  "battleRpg.rewardExperience": { description: "Experiência entregue ao vencer.", maximum: 65535, minimum: 0, range: true, step: 1, unit: "pontos" },
  "luta.roundTime": { description: "Tempo disponível em cada round.", maximum: 300, minimum: 30, range: true, step: 1, unit: "s" },
  "luta.roundsToWin": { description: "Rounds necessários para vencer.", maximum: 5, minimum: 1, range: true, step: 1, unit: "rounds" },
  "luta.maxSuperGauge": { description: "Capacidade do medidor de super.", maximum: 300, minimum: 50, range: true, step: 1, unit: "pontos" },
  "luta.superGaugeGainOnHit": { description: "Ganho ao acertar um golpe.", maximum: 50, minimum: 0, range: true, step: 1, unit: "pontos" },
  "luta.superGaugeGainOnReceive": { description: "Ganho ao receber um golpe.", maximum: 50, minimum: 0, range: true, step: 1, unit: "pontos" },
  "luta.guardPowerRecovery": { description: "Recuperação de guarda por frame.", maximum: 10, minimum: 0, range: true, step: 1, unit: "pontos" },
  "luta.throwEscapeWindow": { description: "Janela para escapar de agarrões.", maximum: 20, minimum: 0, range: true, step: 1, unit: "frames" },
  "luta.parryWindow": { description: "Janela para executar parry.", maximum: 20, minimum: 0, range: true, step: 1, unit: "frames" },
  "luta.hitstunDecay": { description: "Fator de redução do hitstun.", maximum: 1, minimum: 0.5, range: true, step: 0.01, unit: "fator" },
  "luta.comboLimit": { description: "Quantidade máxima de acertos no combo.", maximum: 120, minimum: 10, range: true, step: 1, unit: "acertos" },
  "luta.vismCustomComboGauge": { description: "Capacidade do medidor V-ISM.", maximum: 300, minimum: 50, range: true, step: 1, unit: "pontos" },
  "worldMap.requiredVariable": { description: "Use -1 quando o nó não exigir variável.", maximum: 15, minimum: -1, range: true, step: 1, unit: "índice" },
  "worldMap.requiredValue": { description: "Valor comparado com a variável exigida.", maximum: 32767, minimum: -32768, range: true, step: 1, unit: "valor" },
  "worldMap.targetLevel": { description: "Use -1 para seguir o índice do nó.", maximum: 32767, minimum: -1, range: true, step: 1, unit: "índice" },
  "visualNovel.nextSceneIndex": { description: "Use Sequencial para seguir a ordem do projeto.", maximum: 255, minimum: -1, step: 1, unit: "índice" },
  "visualNovel.backgroundIndex": { description: "Use Sem fundo quando a cena não tiver imagem.", maximum: 255, minimum: -1, step: 1, unit: "índice" },
  "cutscene.stepDurationFrames": { description: "Duração padrão de cada passo.", maximum: 255, minimum: 0, range: true, step: 1, unit: "frames" },
  "cutscene.nextSceneIndex": { description: "Use Sequencial para seguir a ordem do projeto.", maximum: 255, minimum: -1, step: 1, unit: "índice" },
  "cutscene.backgroundIndex": { description: "Use Sem fundo quando a cena não tiver imagem.", maximum: 255, minimum: -1, step: 1, unit: "índice" },
  "shmup.scrollSpeed": { description: "Velocidade do deslocamento do cenário.", maximum: 16, minimum: 0, range: true, step: 0.05, unit: "px/frame" },
  "shmup.playerSpeed": { description: "Velocidade de movimento do jogador.", maximum: 16, minimum: 0.125, range: true, step: 0.05, unit: "px/frame" },
  "shmup.fireRate": { description: "Intervalo entre disparos.", maximum: 255, minimum: 1, range: true, step: 1, unit: "frames" },
  "shmup.defaultDamage": { description: "Dano de cada projétil padrão.", maximum: 255, minimum: 0, range: true, step: 1, unit: "pontos" },
  "shmup.playerHealth": { description: "Vida inicial do jogador.", maximum: 255, minimum: 1, range: true, step: 1, unit: "pontos" },
  "pointAndClick.cursorSpeed": { description: "Velocidade de deslocamento do cursor.", maximum: 16, minimum: 0.125, range: true, step: 0.05, unit: "px/frame" },
  "pointAndClick.hotspotPadding": { description: "Margem adicional dos hotspots.", maximum: 32, minimum: 0, range: true, step: 1, unit: "px" },
  "transitions.durationFrames": { description: "Duração usada pelo padrão do projeto.", maximum: 600, minimum: 0, range: true, step: 1, unit: "frames" }
};

const SETTINGS_GAMEPLAY_PRESETS: SettingsGameplayPreset[] = [
  {
    id: "topdown",
    title: "Topdown",
    detail: "Configura preview e player para RPG/aventura com colisao visivel.",
    changes: [
      { sectionID: "general", fieldKey: "startSceneType", value: "topdown" },
      { sectionID: "general", fieldKey: "startPlayer", value: "Player" },
      { sectionID: "preview", fieldKey: "scale", value: 3 },
      { sectionID: "preview", fieldKey: "showCollisions", value: true },
      { sectionID: "preview", fieldKey: "showTriggers", value: true },
      { sectionID: "preview", fieldKey: "showGrid", value: true },
      { sectionID: "preview", fieldKey: "showFps", value: false }
    ]
  },
  {
    id: "platformer",
    title: "Platformer",
    detail: "Ativa hitboxes e debug visual para testar movimento lateral.",
    changes: [
      { sectionID: "general", fieldKey: "startSceneType", value: "platformer" },
      { sectionID: "general", fieldKey: "startPlayer", value: "Player" },
      { sectionID: "preview", fieldKey: "scale", value: 3 },
      { sectionID: "preview", fieldKey: "showCollisions", value: true },
      { sectionID: "preview", fieldKey: "showTriggers", value: false },
      { sectionID: "preview", fieldKey: "showHitboxes", value: true },
      { sectionID: "preview", fieldKey: "showGrid", value: true }
    ]
  },
  {
    id: "debug",
    title: "Debug",
    detail: "Liga overlays, logs e contadores para auditoria de runtime.",
    changes: [
      { sectionID: "preview", fieldKey: "showCollisions", value: true },
      { sectionID: "preview", fieldKey: "showTriggers", value: true },
      { sectionID: "preview", fieldKey: "showHitboxes", value: true },
      { sectionID: "preview", fieldKey: "showFps", value: true },
      { sectionID: "preview", fieldKey: "showVariables", value: true },
      { sectionID: "preview", fieldKey: "showEventLog", value: true },
      { sectionID: "debug", fieldKey: "showCpuUsage", value: true },
      { sectionID: "debug", fieldKey: "showVramUsage", value: true },
      { sectionID: "debug", fieldKey: "enableEventLogs", value: true },
      { sectionID: "debug", fieldKey: "developerMode", value: true }
    ]
  }
];

const SETTINGS_SECTION_INTENT_GROUPS: Partial<Record<SettingsSectionID, SettingsSectionIntentGroupDefinition[]>> = {
  topdown: [
    {
      title: "Ritmo",
      options: [
        {
          id: "topdown.rhythm.calm",
          title: "Calmo",
          detail: "Movimento mais lento e leitura segura para aventura.",
          conditions: [
            { fieldKey: "walkSpeed", value: 0.75 },
            { fieldKey: "runSpeed", value: 1.25 },
            { fieldKey: "acceleration", value: 0.12 },
            { fieldKey: "deceleration", value: 0.4 },
            { fieldKey: "runEnabled", value: false }
          ]
        },
        {
          id: "topdown.rhythm.normal",
          title: "Normal",
          detail: "Ritmo padrao para exploracao e dialogos.",
          conditions: [
            { fieldKey: "walkSpeed", value: 1 },
            { fieldKey: "runSpeed", value: 1.75 },
            { fieldKey: "acceleration", value: 0.25 },
            { fieldKey: "deceleration", value: 0.25 },
            { fieldKey: "runEnabled", value: true }
          ]
        },
        {
          id: "topdown.rhythm.fast",
          title: "Rapido",
          detail: "Resposta mais agil para combate e desvio.",
          conditions: [
            { fieldKey: "walkSpeed", value: 1.25 },
            { fieldKey: "runSpeed", value: 2.25 },
            { fieldKey: "acceleration", value: 0.4 },
            { fieldKey: "deceleration", value: 0.18 },
            { fieldKey: "runEnabled", value: true }
          ]
        }
      ]
    },
    {
      title: "Direcao",
      options: [
        {
          id: "topdown.direction.four",
          title: "4 direcoes",
          detail: "Controle ortogonal classico.",
          conditions: [
            { fieldKey: "movementType", value: "4 direcoes" },
            { fieldKey: "allowDiagonal", value: false },
            { fieldKey: "normalizeDiagonal", value: false }
          ]
        },
        {
          id: "topdown.direction.eight",
          title: "8 direcoes",
          detail: "Movimento diagonal completo.",
          conditions: [
            { fieldKey: "movementType", value: "8 direcoes" },
            { fieldKey: "allowDiagonal", value: true },
            { fieldKey: "normalizeDiagonal", value: true }
          ]
        },
        {
          id: "topdown.direction.animated",
          title: "8 animado",
          detail: "Movimento livre com direcao visual.",
          conditions: [
            { fieldKey: "movementType", value: "8 direcoes" },
            { fieldKey: "allowDiagonal", value: true },
            { fieldKey: "directionalAnimation", value: "8-way animation" }
          ]
        }
      ]
    },
    {
      title: "Resposta",
      options: [
        {
          id: "topdown.response.tile",
          title: "Por tile",
          detail: "Passos por grade previsiveis.",
          conditions: [
            { fieldKey: "movementBehavior", value: "Por tile" },
            { fieldKey: "gridSize", value: "8 px" },
            { fieldKey: "repulsion", value: false }
          ]
        },
        {
          id: "topdown.response.continuous",
          title: "Continua",
          detail: "Resposta fluida para aventura.",
          conditions: [
            { fieldKey: "movementBehavior", value: "Continuo" },
            { fieldKey: "turnActorOnMove", value: true },
            { fieldKey: "repulsion", value: true }
          ]
        },
        {
          id: "topdown.response.action",
          title: "Acao",
          detail: "Mais firme para colisao e combate.",
          conditions: [
            { fieldKey: "movementBehavior", value: "Continuo" },
            { fieldKey: "turnActorOnMove", value: true },
            { fieldKey: "repulsion", value: false }
          ]
        }
      ]
    }
  ],
  platformer: [
    {
      title: "Sensacao do pulo",
      options: [
        { id: "platformer.jump.heavy", title: "Pesado", detail: "Queda firme e janela menor.", conditions: [{ fieldKey: "gravity", value: 0.62 }, { fieldKey: "maxFallSpeed", value: 5.5 }, { fieldKey: "jumpEnabled", value: true }, { fieldKey: "doubleJump", value: false }, { fieldKey: "wallJump", value: false }] },
        { id: "platformer.jump.normal", title: "Normal", detail: "Pulo tolerante e fisica equilibrada.", conditions: [{ fieldKey: "gravity", value: 0.44 }, { fieldKey: "maxFallSpeed", value: 4.88 }, { fieldKey: "jumpEnabled", value: true }, { fieldKey: "doubleJump", value: false }, { fieldKey: "wallJump", value: false }] },
        { id: "platformer.jump.float", title: "Flutuante", detail: "Pulo mais alto e controle permissivo.", conditions: [{ fieldKey: "gravity", value: 0.32 }, { fieldKey: "maxFallSpeed", value: 4 }, { fieldKey: "jumpEnabled", value: true }, { fieldKey: "doubleJump", value: true }, { fieldKey: "airControl", value: true }] }
      ]
    },
    {
      title: "Controle no ar",
      options: [
        { id: "platformer.air.low", title: "Baixo", detail: "Arco mais comprometido.", conditions: [{ fieldKey: "airControl", value: false }, { fieldKey: "acceleration", value: 0.02 }] },
        { id: "platformer.air.medium", title: "Medio", detail: "Controle padrao no ar.", conditions: [{ fieldKey: "airControl", value: true }, { fieldKey: "acceleration", value: 0.04 }] },
        { id: "platformer.air.high", title: "Alto", detail: "Controle permissivo durante salto.", conditions: [{ fieldKey: "airControl", value: true }, { fieldKey: "acceleration", value: 0.08 }] }
      ]
    },
    {
      title: "Tolerancia do pulo",
      options: [
        { id: "platformer.tolerance.strict", title: "Rigida", detail: "Janelas curtas de entrada.", conditions: [{ fieldKey: "coyoteTime", value: 2 }, { fieldKey: "jumpBuffer", value: 2 }] },
        { id: "platformer.tolerance.comfort", title: "Confortavel", detail: "Coyote time e buffer padrao.", conditions: [{ fieldKey: "coyoteTime", value: 6 }, { fieldKey: "jumpBuffer", value: 6 }] },
        { id: "platformer.tolerance.generous", title: "Generosa", detail: "Entrada mais perdoavel.", conditions: [{ fieldKey: "coyoteTime", value: 10 }, { fieldKey: "jumpBuffer", value: 10 }] }
      ]
    }
  ],
  isometric: [
    {
      title: "Grade",
      options: [
        { id: "isometric.grid.compact", title: "Compacta", detail: "Tiles estreitos para mapas densos.", conditions: [{ fieldKey: "tileWidth", value: "12 px" }, { fieldKey: "tileHeight", value: "6 px" }, { fieldKey: "heightStep", value: "2 px" }, { fieldKey: "maxHeight", value: 5 }] },
        { id: "isometric.grid.standard", title: "Padrao", detail: "Projecao GBA comum e movimento fluido.", conditions: [{ fieldKey: "tileWidth", value: "16 px" }, { fieldKey: "tileHeight", value: "8 px" }, { fieldKey: "heightStep", value: "4 px" }, { fieldKey: "maxHeight", value: 7 }] },
        { id: "isometric.grid.tactical", title: "Tatica", detail: "Passos maiores para puzzles.", conditions: [{ fieldKey: "tileWidth", value: "24 px" }, { fieldKey: "tileHeight", value: "12 px" }, { fieldKey: "heightStep", value: "6 px" }, { fieldKey: "maxHeight", value: 9 }] }
      ]
    },
    {
      title: "Movimento",
      options: [
        { id: "isometric.move.tile", title: "Por tile", detail: "Passos por tile e controle rigido.", conditions: [{ fieldKey: "behavior", value: "Por tile" }, { fieldKey: "movement", value: "4 direcoes projetadas" }, { fieldKey: "walkSpeed", value: 0.75 }] },
        { id: "isometric.move.continuous", title: "Continuo", detail: "Movimento projetado fluido.", conditions: [{ fieldKey: "behavior", value: "Continuo" }, { fieldKey: "movement", value: "4 direcoes projetadas" }, { fieldKey: "walkSpeed", value: 1 }] },
        { id: "isometric.move.fast", title: "Rapido", detail: "Travessia solta em mapas amplos.", conditions: [{ fieldKey: "behavior", value: "Continuo" }, { fieldKey: "movement", value: "8 direcoes projetadas" }, { fieldKey: "walkSpeed", value: 1.35 }] }
      ]
    },
    {
      title: "Altura",
      options: [
        { id: "isometric.height.low", title: "Baixa", detail: "Poucas camadas verticais.", conditions: [{ fieldKey: "maxHeight", value: 4 }, { fieldKey: "ramps", value: "Sem rampas" }] },
        { id: "isometric.height.medium", title: "Media", detail: "Altura padrao com rampas simples.", conditions: [{ fieldKey: "maxHeight", value: 7 }, { fieldKey: "ramps", value: "1 nivel com rampa" }] },
        { id: "isometric.height.high", title: "Alta", detail: "Mais niveis para mapas altos.", conditions: [{ fieldKey: "maxHeight", value: 10 }, { fieldKey: "ramps", value: "Multiplos niveis" }] }
      ]
    }
  ],
  shmup: [
    {
      title: "Ritmo do scroll",
      options: [
        { id: "shmup.scroll.stopped", title: "Parado", detail: "Arena sem scroll forcado.", conditions: [{ fieldKey: "movementType", value: "Livre" }, { fieldKey: "scrollSpeed", value: 0 }, { fieldKey: "clampPlayerToScreen", value: true }] },
        { id: "shmup.scroll.classic", title: "Classico", detail: "Scroll lateral padrao.", conditions: [{ fieldKey: "movementType", value: "Preso a tela" }, { fieldKey: "scrollSpeed", value: 1 }, { fieldKey: "scrollDirection", value: "Direita" }] },
        { id: "shmup.scroll.fast", title: "Rapido", detail: "Cadencia maior para reflexo.", conditions: [{ fieldKey: "movementType", value: "Preso a tela" }, { fieldKey: "scrollSpeed", value: 2 }, { fieldKey: "scrollDirection", value: "Direita" }] }
      ]
    },
    {
      title: "Agilidade",
      options: [
        { id: "shmup.agility.low", title: "Baixa", detail: "Nave mais pesada.", conditions: [{ fieldKey: "playerSpeed", value: 1.4 }] },
        { id: "shmup.agility.medium", title: "Media", detail: "Movimento equilibrado.", conditions: [{ fieldKey: "playerSpeed", value: 2 }] },
        { id: "shmup.agility.high", title: "Alta", detail: "Movimento mais responsivo.", conditions: [{ fieldKey: "playerSpeed", value: 2.8 }] }
      ]
    },
    {
      title: "Disparo",
      options: [
        { id: "shmup.fire.manual", title: "Lento", detail: "Intervalo de 14 frames entre disparos.", conditions: [{ fieldKey: "fireRate", value: 14 }] },
        { id: "shmup.fire.classic", title: "Classico", detail: "Intervalo de 10 frames entre disparos.", conditions: [{ fieldKey: "fireRate", value: 10 }] },
        { id: "shmup.fire.intense", title: "Intenso", detail: "Disparo frequente.", conditions: [{ fieldKey: "autoFire", value: true }, { fieldKey: "fireRate", value: 6 }] }
      ]
    }
  ],
  pointAndClick: [
    {
      title: "Cursor",
      options: [
        { id: "point.cursor.calm", title: "Calmo", detail: "Cursor moderado e preciso.", conditions: [{ fieldKey: "cursorSpeed", value: 1 }] },
        { id: "point.cursor.normal", title: "Normal", detail: "Velocidade padrao.", conditions: [{ fieldKey: "cursorSpeed", value: 1.5 }] },
        { id: "point.cursor.fast", title: "Rapido", detail: "Cursor mais veloz.", conditions: [{ fieldKey: "cursorSpeed", value: 2 }] }
      ]
    },
    {
      title: "Ajuda visual",
      options: [
        { id: "point.visual.clean", title: "Limpa", detail: "Poucos indicadores visuais.", conditions: [{ fieldKey: "highlightInteractives", value: false }, { fieldKey: "showObjectName", value: false }] },
        { id: "point.visual.classic", title: "Classica", detail: "Nomes e destaques visiveis.", conditions: [{ fieldKey: "highlightInteractives", value: true }, { fieldKey: "showObjectName", value: true }] },
        { id: "point.visual.accessible", title: "Acessivel", detail: "Alvo mais generoso.", conditions: [{ fieldKey: "highlightInteractives", value: true }, { fieldKey: "showObjectName", value: true }, { fieldKey: "hotspotPadding", value: 8 }] }
      ]
    },
    {
      title: "Hotspot",
      options: [
        { id: "point.hotspot.precise", title: "Preciso", detail: "Clique mais estrito.", conditions: [{ fieldKey: "hotspotPadding", value: 2 }, { fieldKey: "snapHotspots", value: false }] },
        { id: "point.hotspot.normal", title: "Normal", detail: "Padding padrao.", conditions: [{ fieldKey: "hotspotPadding", value: 4 }, { fieldKey: "snapHotspots", value: false }] },
        { id: "point.hotspot.generous", title: "Generoso", detail: "Clique mais tolerante.", conditions: [{ fieldKey: "hotspotPadding", value: 8 }, { fieldKey: "snapHotspots", value: true }] }
      ]
    }
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function stringField(source: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const value = source?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function numberField(source: Record<string, unknown> | undefined, key: string): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanField(source: Record<string, unknown> | undefined, key: string, fallback = false): boolean {
  const value = source?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function yesNo(value: boolean): string {
  return value ? "sim" : "nao";
}

function item(label: string, value: string | number | boolean | null, tone: SettingsWorkspaceTone = "default"): SettingsWorkspaceItem {
  const normalized = value === null ? "Nao definido" : typeof value === "boolean" ? yesNo(value) : String(value);
  return { label, value: normalized, tone };
}

function countEnabled(values: boolean[]): number {
  return values.filter(Boolean).length;
}

function configuredPathCount(paths: string[]): number {
  return paths.filter((path) => {
    const trimmed = path.trim();
    return trimmed.length > 0 && trimmed !== "Nao definido" && !trimmed.startsWith("~");
  }).length;
}

function settingsRecord(data: GBAProjectData): Record<string, unknown> | undefined {
  return isRecord(data.settings) ? data.settings : undefined;
}

function child(settings: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  return isRecord(settings?.[key]) ? settings[key] : undefined;
}

function fieldPath(key: string): string[] {
  return key.split(".").filter(Boolean);
}

function nestedValue(source: Record<string, unknown> | undefined, key: string): unknown {
  let current: unknown = source;
  for (const part of fieldPath(key)) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }

  return current;
}

function assignNestedValue(target: Record<string, unknown>, key: string, value: SettingsEditableValue): void {
  const path = fieldPath(key);
  if (path.length === 0) return;

  let current = target;
  for (const part of path.slice(0, -1)) {
    const childValue = current[part];
    if (!isRecord(childValue)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}

function editableValue(source: Record<string, unknown> | undefined, definition: SettingsFieldDefinition): SettingsEditableValue {
  const value = nestedValue(source, definition.key);
  if (definition.type === "boolean") {
    return typeof value === "boolean" ? value : definition.defaultValue;
  }

  if (definition.type === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : definition.defaultValue;
  }

  return typeof value === "string" ? value : definition.defaultValue;
}

function spriteAssetReferenceOptions(data: GBAProjectData): SettingsEditableFieldOption[] {
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const names = assets.flatMap((asset): string[] => {
    if (!isRecord(asset) || asset.kind !== "Sprite") return [];
    const name = typeof asset.name === "string" ? asset.name.trim() : "";
    return name ? [name] : [];
  });
  return [
    { value: "", label: "Sem player automático" },
    ...Array.from(new Set(names))
      .sort((left, right) => left.localeCompare(right, "pt-BR"))
      .map((name) => ({ value: name, label: name }))
  ];
}

function editableFieldOptions(sectionID: SettingsSectionID, key: string, data: GBAProjectData): SettingsEditableFieldOption[] | undefined {
  if (sectionID === "sceneTypes" && key.startsWith("defaultBackgrounds.")) {
    const names = (Array.isArray(data.assets) ? data.assets : []).flatMap(asset =>
      isRecord(asset) && ["Background", "TileSet", "Tileset"].includes(String(asset.kind))
        && typeof asset.name === "string" && asset.name.trim() ? [asset.name.trim()] : []);
    return [{ value: "", label: "Sem background automático" }, ...Array.from(new Set(names))
      .sort((left, right) => left.localeCompare(right, "pt-BR")).map(name => ({ value: name, label: name }))];
  }
  if (sectionID === "save" && key === "saveType") {
    return [
      { value: "sram", label: "SRAM / FRAM · ChisFlash V1.0V e V1.2" },
      { value: "flash1m", label: "Flash 1 Mbit · ChisFlash V1.1 RTC" }
    ];
  }
  if ((sectionID === "hardware" || sectionID === "backgrounds") && key === "graphicsMode") {
    return [
      { value: "Mode 0 - Tilemaps", label: "Modo 0 · 4 tilemaps" },
      { value: "Mode 1 - Affine", label: "Modo 1 · 2 tilemaps + affine" },
      { value: "Mode 2 - Affine", label: "Modo 2 · 2 camadas affine" },
      { value: "Mode 3 - Bitmap", label: "Modo 3 · bitmap 15bpp" },
      { value: "Mode 4 - 8bpp Bitmap", label: "Modo 4 · bitmap 8bpp" },
      { value: "Mode 5 - Bitmap 160x128", label: "Modo 5 · bitmap 160×128" }
    ];
  }
  if (sectionID === "backgrounds" && key === "defaultMapSize") {
    return [
      { value: "32x32", label: "32×32 tiles · 256×256 px" },
      { value: "64x32", label: "64×32 tiles · 512×256 px" },
      { value: "32x64", label: "32×64 tiles · 256×512 px" },
      { value: "64x64", label: "64×64 tiles · 512×512 px" }
    ];
  }
  if (sectionID === "sprites" && key === "defaultSize") {
    return [
      { value: "8x8", label: "8×8 px · OBJ" },
      { value: "16x16", label: "16×16 px · OBJ" },
      { value: "32x32", label: "32×32 px · OBJ" },
      { value: "64x64", label: "64×64 px · OBJ" }
    ];
  }
  if (sectionID === "sprites" && key === "colorMode") {
    return [{ value: "4bpp / 16 cores", label: "4bpp · até 16 cores por banco" }];
  }
  if (sectionID === "sceneTypes" && key === "defaultSceneType") {
    return SCENE_TYPE_OPTIONS.map((option) => ({ value: option.id, label: option.label }));
  }
  if (sectionID === "sceneTypes" && key.startsWith("defaultPlayerSprites.")) {
    return spriteAssetReferenceOptions(data);
  }
  if (sectionID === "topdown" && key === "movementType") {
    return [
      { value: "4 direcoes", label: "4 direções" },
      { value: "8 direcoes", label: "8 direções" }
    ];
  }
  if (sectionID === "topdown" && key === "movementBehavior") {
    return [
      { value: "Tile", label: "Por tile" },
      { value: "Por tile", label: "Por tile" },
      { value: "Continuo", label: "Contínuo" }
    ];
  }
  if (sectionID === "topdown" && key === "directionalAnimation") {
    return [
      { value: "none", label: "Sem animação direcional" },
      { value: "4-way animation", label: "4 direções" },
      { value: "8-way animation", label: "8 direções" }
    ];
  }
  if (sectionID === "topdown" && key === "gridSize") {
    return [
      { value: "8 px", label: "8 px · compacto" },
      { value: "16 px", label: "16 px · padrão GBA" }
    ];
  }
  if (sectionID === "platformer" && key === "dropThrough") {
    return [
      { value: "off", label: "Desativado" },
      { value: "down_hold", label: "Baixo pressionado" },
      { value: "down_tap", label: "Baixo tocado" },
      { value: "down_jump_hold", label: "Baixo + pulo pressionado" },
      { value: "down_jump_tap", label: "Baixo + pulo tocado" }
    ];
  }
  if (sectionID === "platformer" && key === "dashStyle") {
    return [
      { value: "ground", label: "Somente no chão" },
      { value: "air", label: "Somente no ar" },
      { value: "both", label: "Chão e ar" }
    ];
  }
  if (sectionID === "isometric" && key === "tileWidth") {
    return [
      { value: "12 px", label: "12 px · compacto" },
      { value: "16 px", label: "16 px · padrão GBA" },
      { value: "24 px", label: "24 px · tático" },
      { value: "32 px", label: "32 px · amplo" }
    ];
  }
  if (sectionID === "isometric" && key === "heightStep") {
    return [
      { value: "3 px", label: "3 px · compacto" },
      { value: "4 px", label: "4 px · padrão" },
      { value: "6 px", label: "6 px · tático" },
      { value: "8 px", label: "8 px · amplo" }
    ];
  }
  if (sectionID === "isometric" && key === "movement") {
    return [
      { value: "4 direcoes projetadas", label: "4 direções projetadas" },
      { value: "8 direcoes projetadas", label: "8 direções projetadas" }
    ];
  }
  if (sectionID === "isometric" && key === "behavior") {
    return [
      { value: "Por tile", label: "Por tile" },
      { value: "Continuo", label: "Contínuo" }
    ];
  }
  if (sectionID === "isometric" && key === "ramps") {
    return [
      { value: "Sem rampas", label: "Sem rampas" },
      { value: "1 nivel com rampa", label: "1 nível com rampa" },
      { value: "Multiplos niveis", label: "Múltiplos níveis" }
    ];
  }
  if (sectionID === "shmup" && key === "movementType") {
    return [
      { value: "Livre", label: "Livre" },
      { value: "Preso a tela", label: "Preso à tela" }
    ];
  }
  if (sectionID === "shmup" && key === "scrollDirection") {
    return [
      { value: "Direita", label: "Direita" },
      { value: "Esquerda", label: "Esquerda" },
      { value: "Cima", label: "Cima" },
      { value: "Baixo", label: "Baixo" }
    ];
  }
  if (sectionID === "shmup" && key === "movement") {
    return [
      { value: "4 direcoes", label: "4 direções" },
      { value: "8 direcoes", label: "8 direções" }
    ];
  }
  if (sectionID === "luta" && key === "defaultStyle") {
    return [
      { value: "a-ism", label: "A-ISM · equilibrado" },
      { value: "x-ism", label: "X-ISM · ofensivo" },
      { value: "v-ism", label: "V-ISM · combo" }
    ];
  }
  if (sectionID === "transitions" && key === "style") {
    return SCENE_TRANSITION_STYLES.map((style) => ({ value: style, label: sceneTransitionDisplayName(style) }));
  }
  if (sectionID === "visualNovel" && key === "nextSceneIndex") {
    return [{ value: -1, label: "Sequencial" }, ...sceneReferenceOptions(data, "visualNovel")];
  }
  if (sectionID === "cutscene" && key === "nextSceneIndex") {
    return [{ value: -1, label: "Sequencial" }, ...sceneReferenceOptions(data, "cutscene")];
  }
  if ((sectionID === "visualNovel" || sectionID === "cutscene") && key === "backgroundIndex") {
    return [{ value: -1, label: "Sem fundo" }, ...backgroundReferenceOptions(data)];
  }
  if (sectionID === "audio" && key === "sampleRate") {
    const savedRate = nestedValue(child(settingsRecord(data), "audio"), "sampleRate");
    return [
      { value: 0, label: "Automático" },
      { value: 11025, label: "11.025 Hz" },
      { value: 16000, label: "16.000 Hz" },
      { value: 22050, label: "22.050 Hz" },
      { value: 32000, label: "32.000 Hz" },
      { value: 32768, label: "32.768 Hz" },
      ...(typeof savedRate === "number" && Number.isInteger(savedRate) && savedRate >= 4000 && savedRate <= 32768
        && ![11025, 16000, 22050, 32000, 32768].includes(savedRate)
        ? [{ value: savedRate, label: `${savedRate.toLocaleString("pt-BR")} Hz · taxa do projeto` }] : [])
    ];
  }
  if (sectionID === "worldMap" && key === "targetLevel") {
    return [{ value: -1, label: "Mesmo índice do nó" }, ...worldMapTargetOptions(data)];
  }
  return undefined;
}

function editableFields(sectionID: SettingsSectionID, source: Record<string, unknown> | undefined, data: GBAProjectData): SettingsEditableField[] {
  const presentationSource = sectionID === "transitions"
    ? { ...sceneTransitionFromProjectSettings(source) }
    : source;
  const definitions = SETTINGS_FIELD_DEFINITIONS[sectionID].filter((definition) => (
    isSupportedSettingsField(sectionID, definition.key)
    && (sectionID !== "battleRpg" || !BATTLE_HUD_PRESENTATION_FIELD_KEYS.has(definition.key))
  ));
  return definitions.map((definition) => {
    const metadata = SCENE_FIELD_METADATA[`${sectionID}.${definition.key}`] ?? {};
    const fieldDefinition = { ...definition, ...metadata, readOnly: isSettingsInformationField(sectionID, definition.key) || metadata.readOnly || definition.readOnly };
    const value = sectionID === "isometric" && definition.key === "tileHeight"
      ? `${Math.max(2, Math.round((Number.parseInt(String(nestedValue(source, "tileWidth") ?? "16"), 10) || 16) / 2))} px`
      : sectionID === "build" && definition.key === "compilerPath"
        ? "Automático via devkitARM"
      : fieldDefinition.readOnly && (sectionID === "hardware" || sectionID === "build")
        ? definition.defaultValue
      : sectionID === "uiDialogs" && definition.key === "characterSound" && nestedValue(source, definition.key) === undefined
        ? deriveDialogueCharacterSound(data)
        : editableValue(presentationSource, fieldDefinition);
    return {
      description: fieldDefinition.description,
      key: fieldDefinition.key,
      label: fieldDefinition.label,
      maximum: fieldDefinition.maximum,
      minimum: fieldDefinition.minimum,
      range: fieldDefinition.range,
      readOnly: fieldDefinition.readOnly,
      step: fieldDefinition.step,
      type: fieldDefinition.type,
      unit: fieldDefinition.unit,
      value,
      defaultValue: fieldDefinition.defaultValue,
      pathPicker: fieldDefinition.readOnly ? undefined : fieldDefinition.pathPicker,
      options: editableFieldOptions(sectionID, fieldDefinition.key, data)
    };
  });
}

function settingsValueMatches(currentValue: SettingsEditableValue, expectedValue: SettingsEditableValue): boolean {
  return typeof currentValue === "number" && typeof expectedValue === "number"
    ? Math.abs(currentValue - expectedValue) < 0.0001
    : currentValue === expectedValue;
}

function currentEditableValue(
  sectionID: SettingsSectionID,
  source: Record<string, unknown> | undefined,
  fieldKey: string
): SettingsEditableValue | null {
  const definition = SETTINGS_FIELD_DEFINITIONS[sectionID].find((item) => item.key === fieldKey);
  return definition ? editableValue(source, definition) : null;
}

function sectionIntentGroups(sectionID: SettingsSectionID, source: Record<string, unknown> | undefined): SettingsSectionIntentGroup[] {
  return (SETTINGS_SECTION_INTENT_GROUPS[sectionID] ?? []).map((group) => ({
    title: group.title,
    options: group.options.map((option) => {
      const conditions = option.conditions.filter(condition => isEditableSettingsField(sectionID, condition.fieldKey));
      return {
      id: option.id,
      title: option.title,
      detail: option.detail,
      fieldCount: conditions.length,
      changes: conditions.map((condition) => ({
        fieldKey: condition.fieldKey,
        value: condition.value
      })),
      applied: conditions.every((condition) => {
        const currentValue = currentEditableValue(sectionID, source, condition.fieldKey);
        return currentValue !== null && settingsValueMatches(currentValue, condition.value);
      })
    }; }).filter(option => option.changes.length > 0)
  })).filter(group => group.options.length > 1);
}

function normalizedSettingsSearchValue(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function deriveSettingsWorkspaceSearchResults(
  presentation: SettingsWorkspacePresentation,
  query: string
): SettingsWorkspaceSearchResult[] {
  const tokens = normalizedSettingsSearchValue(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  return presentation.sections.flatMap((section): SettingsWorkspaceSearchResult[] => {
    if (section.id !== "credits" && section.editableFields.length === 0) return [];
    const values = [
      section.title,
      section.detail,
      section.group,
      ...section.editableFields.flatMap((field) => [field.label, field.key, field.description ?? "", String(field.value)]),
      ...(section.id === "credits" ? section.items.flatMap((item) => [item.label, item.value]) : []),
      ...section.intentGroups.flatMap((group) => [
        group.title,
        ...group.options.flatMap((option) => [option.title, option.detail])
      ])
    ].map(normalizedSettingsSearchValue);
    const haystack = values.join(" ");
    if (!tokens.every((token) => haystack.includes(token))) return [];

    return [{
      sectionID: section.id,
      title: section.title,
      detail: section.detail,
      matchCount: tokens.filter((token) => haystack.includes(token)).length
    }];
  });
}

const SCENE_TYPE_SECTION_IDS = new Set<SettingsSectionID>(
  SCENE_TYPE_OPTIONS.map((option) => option.id as SettingsSectionID)
);

const SCENE_SETTINGS_SECTION_IDS = new Set<SettingsSectionID>([
  "sceneTypes",
  ...SCENE_TYPE_SECTION_IDS,
  "backgrounds",
  "transitions"
]);

const DIALOGUE_SETTINGS_SECTION_IDS = new Set<SettingsSectionID>(["uiDialogs"]);
// These settings describe the export pipeline, runtime contract, preview
// environment and technical asset budgets. They belong beside ROM generation
// and project health instead of the daily editor preferences.
const EXPORT_SETTINGS_SECTION_IDS = new Set<SettingsSectionID>([
  "general",
  "build",
  "hardware",
  "audio",
  "save",
  "runtimeCapabilities",
  "debug"
]);

export function deriveSettingsSectionsForScope(
  presentation: SettingsWorkspacePresentation,
  scope: SettingsWorkspaceScope
): SettingsWorkspaceSection[] {
  return presentation.sections.filter((section) => {
    if (section.editableFields.length === 0 && section.id !== "credits") return false;
    const isSceneSection = SCENE_SETTINGS_SECTION_IDS.has(section.id);
    const isDialogueSection = DIALOGUE_SETTINGS_SECTION_IDS.has(section.id);
    if (scope === "scene") {
      return isSceneSection;
    }
    if (scope === "export") return EXPORT_SETTINGS_SECTION_IDS.has(section.id);
    if (scope === "global") return !isSceneSection && !isDialogueSection && !EXPORT_SETTINGS_SECTION_IDS.has(section.id);
    return true;
  });
}

export function deriveVisibleSettingsSections(
  presentation: SettingsWorkspacePresentation
): SettingsWorkspaceSection[] {
  return deriveSettingsSectionsForScope(presentation, "all");
}

export function deriveSettingsSectionChangeSummary(
  section: SettingsWorkspaceSection | null
): SettingsSectionChangeSummary {
  const changedFields = section?.editableFields
    .filter((field) => !field.readOnly && !settingsValueMatches(field.value, field.defaultValue))
    .map((field) => field.label) ?? [];
  return { changedCount: changedFields.length, changedFields };
}

function sectionDefaults(sectionID: SettingsSectionID): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const definition of SETTINGS_FIELD_DEFINITIONS[sectionID]) {
    assignNestedValue(defaults, definition.key, definition.defaultValue);
  }

  return defaults;
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;

  const rooms = projectArray(data, "rooms");
  return rooms.length > 0 ? rooms : [];
}

function diagnostic(id: string, label: string, detail: string, tone: SettingsWorkspaceTone): SettingsWorkspaceDiagnostic {
  return { id, label, detail, tone };
}

function settingsDiagnostics(options: {
  data: GBAProjectData;
  engineBackend: string;
  enginePackPath: string;
  exportFolder: string;
  startScene: string;
}): SettingsWorkspaceDiagnostic[] {
  const roomNames = new Set(projectRooms(options.data).map((room) => stringField(room, "name", "")));
  const diagnostics: SettingsWorkspaceDiagnostic[] = [];

  if (!options.startScene || options.startScene === "Nao definida") {
    diagnostics.push(diagnostic("start-scene", "Cena inicial", "Cena inicial nao definida.", "warning"));
  } else if (roomNames.size > 0 && !roomNames.has(options.startScene)) {
    diagnostics.push(diagnostic("start-scene", "Cena inicial", `Cena inicial não existe no projeto: ${options.startScene}.`, "warning"));
  } else {
    diagnostics.push(diagnostic("start-scene", "Cena inicial", `Cena inicial pronta: ${options.startScene}.`, "ok"));
  }

  if (options.engineBackend.includes("engine")) {
    diagnostics.push(diagnostic("engine-backend", "Backend", `Backend GBAStudioEngine configurado: ${options.engineBackend}.`, "ok"));
  } else {
    diagnostics.push(diagnostic("engine-backend", "Backend", `Backend atual nao aponta para GBAStudioEngine: ${options.engineBackend}.`, "warning"));
  }

  if (options.engineBackend.includes("engine") && options.enginePackPath.trim().length === 0) {
    diagnostics.push(diagnostic("engine-pack", "Engine Pack", "Engine Pack usa detecção automática; confirme o pack detectado no diagnóstico.", "muted"));
  } else if (options.enginePackPath.trim().length > 0) {
    diagnostics.push(diagnostic("engine-pack", "Engine Pack", `Engine Pack solicitado: ${options.enginePackPath}. Valide o caminho e confira o pack detectado.`, "muted"));
  } else {
    diagnostics.push(diagnostic("engine-pack", "Engine Pack", "Engine Pack nao exigido pelo backend atual.", "muted"));
  }

  if (options.exportFolder.trim().length > 0 && options.exportFolder !== "Nao definido") {
    diagnostics.push(diagnostic("export-folder", "Export", `Pasta de exportacao: ${options.exportFolder}.`, "ok"));
  } else {
    diagnostics.push(diagnostic("export-folder", "Export", "Pasta de exportacao nao definida.", "warning"));
  }

  const pcmRate = nestedValue(child(settingsRecord(options.data), "audio"), "sampleRate");
  if (pcmRate !== undefined && pcmRate !== 0 && (typeof pcmRate !== "number" || !Number.isInteger(pcmRate) || pcmRate < 4000 || pcmRate > 32768)) {
    diagnostics.push(diagnostic("pcm-rate", "Áudio PCM", "Taxa PCM inválida: selecione Automático ou uma taxa entre 4.000 e 32.768 Hz.", "warning"));
  }

  return diagnostics;
}

export function updateSettingsFieldInProject(
  data: GBAProjectData,
  sectionID: SettingsSectionID,
  fieldKey: string,
  value: SettingsEditableValue
): GBAProjectData {
  const knownField = SETTINGS_FIELD_DEFINITIONS[sectionID].find((definition) => definition.key === fieldKey);
  if (!knownField || !isEditableSettingsField(sectionID, fieldKey)) return data;
  if (sectionID === "audio" && fieldKey === "sampleRate"
    && (typeof value !== "number" || !Number.isInteger(value) || (value !== 0 && (value < 4000 || value > 32768)))) return data;

  const next = cloneProjectData(data);
  const settings = isRecord(next.settings) ? next.settings : {};
  next.settings = settings;

  const section = isRecord(settings[sectionID]) ? settings[sectionID] : {};
  settings[sectionID] = section;

  const metadata = SCENE_FIELD_METADATA[`${sectionID}.${fieldKey}`];
  const minimum = metadata?.minimum ?? knownField.minimum;
  const maximum = metadata?.maximum ?? knownField.maximum;
  const normalizedValue = knownField.type === "number" && typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum ?? value, Math.min(maximum ?? value, value))
    : value;
  assignNestedValue(section, fieldKey, normalizedValue);
  return next;
}

export function resetSettingsSectionInProject(data: GBAProjectData, sectionID: SettingsSectionID): GBAProjectData {
  const next = cloneProjectData(data);
  const settings = isRecord(next.settings) ? next.settings : {};
  next.settings = settings;

  const currentSection = isRecord(settings[sectionID]) ? settings[sectionID] : {};
  const section = cloneProjectData(currentSection);
  for (const definition of SETTINGS_FIELD_DEFINITIONS[sectionID]) {
    if (!isEditableSettingsField(sectionID, definition.key)) continue;
    assignNestedValue(section, definition.key, definition.defaultValue);
  }
  settings[sectionID] = section;

  return next;
}

export function applySettingsGameplayPresetInProject(data: GBAProjectData, presetID: string): GBAProjectData {
  const preset = SETTINGS_GAMEPLAY_PRESETS.find((item) => item.id === presetID.trim());
  if (!preset) return data;

  const next = cloneProjectData(data);
  const settings = isRecord(next.settings) ? next.settings : {};
  next.settings = settings;

  for (const change of preset.changes) {
    const knownField = SETTINGS_FIELD_DEFINITIONS[change.sectionID].find((definition) => definition.key === change.fieldKey);
    if (!knownField || !isEditableSettingsField(change.sectionID, change.fieldKey)) continue;

    const existingSection = settings[change.sectionID];
    const section: Record<string, unknown> = isRecord(existingSection) ? existingSection : {};
    settings[change.sectionID] = section;
    assignNestedValue(section, change.fieldKey, change.value);
  }

  return next;
}

export function deriveSettingsPathValidationTargets(
  presentation: SettingsWorkspacePresentation,
  scope: SettingsWorkspaceScope = "all",
  options: { enginePackFallbackPath?: string; projectPath?: string } = {}
): SettingsPathValidationTarget[] {
  return deriveSettingsSectionsForScope(presentation, scope).flatMap((section) =>
    section.editableFields.flatMap((field): SettingsPathValidationTarget[] => {
      if (!field.pathPicker || typeof field.value !== "string" || field.value.trim().length === 0) {
        return [];
      }

      const validationPath = field.key === "enginePackPath" && options.enginePackFallbackPath?.trim()
        ? options.enginePackFallbackPath.trim()
        : options.projectPath && field.key === "exportFolder"
          ? resolveProjectRelativePath(options.projectPath, field.value.trim())
        : undefined;
      return [
        {
          id: `${section.id}.${field.key}`,
          label: field.label,
          path: field.value.trim(),
          ...(validationPath && validationPath !== field.value.trim() ? { validationPath } : {}),
          mode: field.pathPicker,
          ...(field.key === "exportFolder" ? { allowCreate: true } : {}),
          expectedTools: field.key === "enginePackPath" ? ["assetc", "gbsdoctor", "gbsbuild"] : undefined,
          expectedFiles: field.key === "enginePackPath"
            ? ["enginepack.json", "schemas/gbastudio_project.schema.json", "templates/Makefile.gba", "lib/libgbastudio_engine.a"]
            : undefined
        }
      ];
    })
  );
}

export function deriveSettingsWorkspacePresentation(data: GBAProjectData): SettingsWorkspacePresentation {
  const settings = settingsRecord(data);
  const general = child(settings, "general");
  const shortcuts = child(settings, "shortcuts");
  const credits = child(settings, "credits");
  const build = child(settings, "build");
  const hardware = child(settings, "hardware");
  const controls = child(settings, "controls");
  const sceneTypes = child(settings, "sceneTypes");
  const topdown = child(settings, "topdown");
  const platformer = child(settings, "platformer");
  const isometric = child(settings, "isometric");
  const dungeonCrawler = child(settings, "dungeonCrawler");
  const racing = child(settings, "racing");
  const battleRpg = child(settings, "battleRpg");
  const luta = child(settings, "luta");
  const worldMap = child(settings, "worldMap");
  const visualNovel = child(settings, "visualNovel");
  const cutscene = child(settings, "cutscene");
  const shmup = child(settings, "shmup");
  const pointAndClick = child(settings, "pointAndClick");
  const sprites = child(settings, "sprites");
  const backgrounds = child(settings, "backgrounds");
  const uiDialogs = child(settings, "uiDialogs");
  const preview = child(settings, "preview");
  const audio = child(settings, "audio");
  const save = child(settings, "save");
  const runtimeCapabilities = child(settings, "runtimeCapabilities");
  const transitions = child(settings, "transitions");
  const projectiles = child(settings, "projectiles");
  const debug = child(settings, "debug");
  const mcp = child(settings, "mcp");

  const exportFolder = stringField(general, "exportFolder", "Nao definido");
  const compilerPath = stringField(build, "compilerPath", "");
  const enginePackPath = stringField(build, "enginePackPath", "");
  const emulatorPath = stringField(preview, "emulatorPath", "");
  const runAfterBuild = booleanField(build, "runEmulatorAfterBuild") || booleanField(preview, "runAfterBuild");
  const affineCapabilityUsage = deriveProjectAffineCapabilityUsage(data);

  const previewOverlays = [
    booleanField(preview, "showCollisions"),
    booleanField(preview, "showTriggers"),
    booleanField(preview, "showHitboxes"),
    booleanField(preview, "showGrid"),
    booleanField(preview, "showFps"),
    booleanField(preview, "showVariables"),
    booleanField(preview, "showEventLog")
  ];
  const enabledPreviewOverlayCount = countEnabled(previewOverlays);

  const debugFlags = [
    booleanField(debug, "showCpuUsage"),
    booleanField(debug, "showVramUsage"),
    booleanField(debug, "showOamUsage"),
    booleanField(debug, "showPaletteUsage"),
    booleanField(debug, "showRomUsage"),
    booleanField(debug, "showRamUsage")
  ];
  const enabledDebugFlagCount = countEnabled(debugFlags);
  const engineBackend = stringField(build, "engineBackend", "Nao definido");
  const startScene = stringField(general, "startScene", "Nao definida");
  const audioMode = stringField(audio, "audioMode", "Nao definido");

  const audioChannels = [
    booleanField(audio, "enablePsgChannels") ? "PSG" : null,
    booleanField(audio, "enableDirectSoundA") ? "Direct A" : null,
    booleanField(audio, "enableDirectSoundB") ? "Direct B" : null
  ].filter((value): value is string => Boolean(value));

  const makeSection = (
    id: SettingsSectionID,
    group: SettingsSectionGroup,
    title: string,
    detail: string,
    source: Record<string, unknown> | undefined,
    items: SettingsWorkspaceItem[],
    runtimeCapabilityUsage?: ProjectAffineCapabilityUsage
  ): SettingsWorkspaceSection => {
    const exportScope = SETTINGS_SECTION_EXPORT_SCOPE[id];
    return {
      id,
      group,
      title,
      detail: sectionDetailWithExportScope(detail, exportScope),
      exportScope,
      editableFields: editableFields(id, source, data),
      intentGroups: sectionIntentGroups(id, source),
      items,
      ...(runtimeCapabilityUsage ? { runtimeCapabilityUsage } : {})
    };
  };

  const sections: SettingsWorkspaceSection[] = [
    makeSection(
      "general",
      "Projeto",
      "Geral",
      "Identificacao e cena inicial",
      general,
      [
        item("Titulo", stringField(general, "gameTitle", "Nao definido")),
        item("Autor", stringField(general, "author", "Nao definido")),
        item("Versao", stringField(general, "version", "Nao definida")),
        item("Cena inicial", stringField(general, "startScene", "Nao definida")),
        item("Tipo inicial", stringField(general, "startSceneType", "Nao definido")),
        item("Player inicial", stringField(general, "startPlayer", "Nao definido")),
        item("Idioma", stringField(general, "defaultLanguage", "Nao definido")),
        item("Export", exportFolder)
      ]
    ),
    makeSection(
      "shortcuts",
      "Projeto",
      "Atalhos",
      "Atalhos do editor salvos neste projeto",
      shortcuts,
      [
        item("Ferramentas", ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.map((binding) => `${binding.label}: ${formatRoomEditorShortcut(stringField(shortcuts, binding.fieldKey, binding.defaultKey))}`).join(" · "), "ok"),
        item("Gestos", "Alt captura · botão direito apaga · Shift amplia", "ok"),
        item("Ações", "Setas movem · Ctrl/Cmd+D duplica · Esc cancela", "ok")
      ]
    ),
    makeSection(
      "credits",
      "Aplicativo",
      "Créditos",
      "Autoria, referências e tecnologias que tornaram o projeto possível",
      credits,
      []
    ),
    makeSection(
      "build",
      "Projeto",
      "Build",
      "ROM, Engine Pack e exportacao",
      build,
      [
        item("ROM", stringField(build, "romFileName", "Nao definido")),
        item("Formato", stringField(build, "exportFormat", "Nao definido")),
        item("Backend", stringField(build, "engineBackend", "Nao definido"), stringField(build, "engineBackend", "").includes("engine") ? "ok" : "warning"),
        item("Engine Pack", enginePackPath || "Nao definido", enginePackPath ? "default" : engineBackend.includes("engine") ? "warning" : "muted"),
        item("Toolchain", stringField(build, "toolchain", "Nao definido")),
        item("Compiler", compilerPath || "Nao definido", compilerPath ? "default" : "muted"),
        item("Debug files", booleanField(build, "generateDebugFiles"), booleanField(build, "generateDebugFiles") ? "ok" : "muted"),
        item("Rodar emulador", runAfterBuild, runAfterBuild ? "ok" : "muted")
      ]
    ),
    makeSection("hardware", "Projeto", "Hardware GBA", "Limites físicos fixos", hardware, [
      item("Modo grafico", stringField(hardware, "graphicsMode", "Mode 0 - Tilemaps")),
      item("Resolucao", stringField(hardware, "resolution", "240 x 160")),
      item("Tile", stringField(hardware, "tileSize", "8 px")),
      item("Sprites por cena", numberField(hardware, "spritesPerScene") ?? 128),
      item("VRAM", stringField(hardware, "vramBudget", "96 KB")),
      item("Perfil", stringField(hardware, "profile", "GBA padrao"), "ok")
    ]),
    makeSection("controls", "Projeto", "Controles", "Teclado do Play integrado", controls, [
      ...GBA_CONTROL_BINDING_DEFINITIONS.map((definition) => (
        item(definition.label, stringField(controls, definition.settingKey, formatGBAKeyboardBindings(definition.defaultKeys)))
      ))
    ]),
    makeSection("sceneTypes", "Cenas", "Players e backgrounds", "Padrões visuais para novas cenas por tipo", sceneTypes, [
      item("Players configuráveis", `${SCENE_TYPE_OPTIONS.length} tipos de cena`, "ok"),
      item("Backgrounds configuráveis", "16 tipos e variações", "ok")
    ]),
    makeSection("topdown", "Cenas", "Top-down", "Movimento de aventura", topdown, [
      item("Botao interacao", stringField(topdown, "interactButton", "A")),
      item("Tipo movimento", stringField(topdown, "movementType", "8 direcoes")),
      item("Comportamento", stringField(topdown, "movementBehavior", "Continuo")),
      item("Animacao direcional", stringField(topdown, "directionalAnimation", "4-way animation")),
      item("Tamanho da grade", stringField(topdown, "gridSize", "8 px")),
      item("Permitir diagonal", booleanField(topdown, "allowDiagonal", true), booleanField(topdown, "allowDiagonal", true) ? "ok" : "muted"),
      item("Velocidade caminhada", numberField(topdown, "walkSpeed") ?? 1)
    ]),
    makeSection("platformer", "Cenas", "Plataforma", "Fisica lateral", platformer, [
      item("Botao pulo", stringField(platformer, "jumpButton", "A")),
      item("Botao correr", stringField(platformer, "runButton", "B")),
      item("Gravidade", numberField(platformer, "gravity") ?? 0.44),
      item("Queda maxima", numberField(platformer, "maxFallSpeed") ?? 4.88),
      item("Controle no ar", booleanField(platformer, "airControl", true), "ok"),
      item("Virar no ar", booleanField(platformer, "changeDirectionInAir", true), "ok"),
      item("Altura minima do salto", numberField(platformer, "jumpMinHeight") ?? 0),
      item("Frames segurando salto", numberField(platformer, "jumpFrames") ?? 1),
      item("Pulo duplo", booleanField(platformer, "doubleJump"), booleanField(platformer, "doubleJump") ? "ok" : "muted"),
      item("Drop-through", stringField(platformer, "dropThrough", "off")),
      item("Deadzone X da camera", numberField(platformer, "cameraDeadzoneX") ?? 0),
      item("Estilo do dash", stringField(platformer, "dashStyle", "both")),
      item("Rampas", booleanField(platformer, "ramps", true), "ok")
    ]),
    makeSection("isometric", "Cenas", "Isometrico", "Projeção e altura da grade", isometric, [
      item("Largura do tile", stringField(isometric, "tileWidth", "16 px")),
      item("Altura do tile", stringField(isometric, "tileHeight", "8 px")),
      item("Passo de altura", stringField(isometric, "heightStep", "4 px")),
      item("Altura maxima", numberField(isometric, "maxHeight") ?? 7),
      item("Movimento", stringField(isometric, "movement", "4 direcoes projetadas")),
      item("Rampas", stringField(isometric, "ramps", "1 nivel com rampa")),
      item("Profundidade", booleanField(isometric, "depthSort", true), "ok")
    ]),
    makeSection("dungeonCrawler", "Cenas", "Dungeon Crawler", "Passos em grade e giros de 90 graus", dungeonCrawler, [
      item("Duração do passo", numberField(dungeonCrawler, "stepDurationMs") ?? 180),
      item("Duração do giro", numberField(dungeonCrawler, "turnDurationMs") ?? 120),
      item("Passo para trás", booleanField(dungeonCrawler, "allowBackstep", true), "ok"),
      item("Distância de visão", numberField(dungeonCrawler, "viewDistance") ?? 5)
    ]),
    makeSection("racing", "Cenas", "Corrida", "Velocidade, aceleração, freio e direção", racing, [
      item("Velocidade máxima", numberField(racing, "maxSpeed") ?? 4),
      item("Aceleração", numberField(racing, "acceleration") ?? 8),
      item("Força do freio", numberField(racing, "brakePower") ?? 12),
      item("Velocidade de direção", numberField(racing, "steeringSpeed") ?? 2)
    ]),
    makeSection("battleRpg", "Cenas", "Batalha RPG", "Grupo, inimigos e ritmo dos turnos", battleRpg, [
      item("Máximo no grupo", numberField(battleRpg, "maxPartySize") ?? 6),
      item("Máximo de inimigos", numberField(battleRpg, "maxEnemies") ?? 1),
      item("Intervalo entre turnos", numberField(battleRpg, "turnDelayFrames") ?? 30),
      item("Multiplicador de XP", numberField(battleRpg, "experienceMultiplier") ?? 1),
      item("Regras da batalha", "5 mecânicas configuráveis", "default"),
      item("HUD da batalha", "Configurada no editor de HUD", "muted"),
      item("Ouro da vitória", numberField(battleRpg, "rewardGold") ?? 100),
      item("Experiência da vitória", numberField(battleRpg, "rewardExperience") ?? 50)
    ]),
    makeSection("luta", "Cenas", "Luta", "Combate estilo luta (Street Fighter Alpha 3)", luta, [
      item("Tempo por round", numberField(luta, "roundTime") ?? 99),
      item("Rounds para vitória", numberField(luta, "roundsToWin") ?? 2),
      item("Medidor de super máximo", numberField(luta, "maxSuperGauge") ?? 100),
      item("Ganho de super ao acertar", numberField(luta, "superGaugeGainOnHit") ?? 8),
      item("Ganho de super ao receber", numberField(luta, "superGaugeGainOnReceive") ?? 4),
      item("Recuperação de guarda", numberField(luta, "guardPowerRecovery") ?? 2),
      item("Dano de chip", booleanField(luta, "chipDamageEnabled", true), "ok"),
      item("Bloqueio aéreo", booleanField(luta, "airBlockingEnabled", true), "ok"),
      item("Alpha Counter", booleanField(luta, "alphaCounterEnabled", true), "ok"),
      item("Janela de escape de agarrão", numberField(luta, "throwEscapeWindow") ?? 8),
      item("Janela de parry", numberField(luta, "parryWindow") ?? 4),
      item("Decaimento de hitstun", numberField(luta, "hitstunDecay") ?? 0.85),
      item("Limite de combo", numberField(luta, "comboLimit") ?? 60),
      item("Medidor V-ISM", numberField(luta, "vismCustomComboGauge") ?? 100),
      item("Estilo padrão", stringField(luta, "defaultStyle", "a-ism"))
    ]),
    makeSection("worldMap", "Cenas", "Mapa Mundial", "Desbloqueio e destino dos nós", worldMap, [
      item("Nós desbloqueados", booleanField(worldMap, "unlocked", true), "ok"),
      item("Ocultar bloqueados", booleanField(worldMap, "hideWhenLocked")),
      item("Variável exigida", numberField(worldMap, "requiredVariable") ?? -1),
      item("Valor exigido", numberField(worldMap, "requiredValue") ?? 0),
      item("Nível de destino", numberField(worldMap, "targetLevel") ?? -1)
    ]),
    makeSection("visualNovel", "Cenas", "Visual Novel", "Fluxo nativo das cenas", visualNovel, [
      item("Avanço automático", booleanField(visualNovel, "autoAdvance")),
      item("Próxima cena", numberField(visualNovel, "nextSceneIndex") ?? -1),
      item("Índice do fundo", numberField(visualNovel, "backgroundIndex") ?? -1)
    ]),
    makeSection("cutscene", "Cenas", "Cutscene", "Ritmo e fluxo nativos das cenas", cutscene, [
      item("Duração dos passos", numberField(cutscene, "stepDurationFrames") ?? 8),
      item("Avanço automático", booleanField(cutscene, "autoAdvance", true), "ok"),
      item("Próxima cena", numberField(cutscene, "nextSceneIndex") ?? -1),
      item("Índice do fundo", numberField(cutscene, "backgroundIndex") ?? -1)
    ]),
    makeSection("shmup", "Cenas", "Shoot em Up", "Scrolling shooter", shmup, [
      item("Tipo movimento", stringField(shmup, "movementType", "Preso a tela")),
      item("Direcao rolagem", stringField(shmup, "scrollDirection", "Direita")),
      item("Velocidade scroll", numberField(shmup, "scrollSpeed") ?? 1),
      item("Botao tiro", stringField(shmup, "shootButton", "A")),
      item("Disparo automatico", booleanField(shmup, "autoFire", true), "ok"),
      item("Projetil", stringField(shmup, "defaultProjectile", "player_bullet"))
    ]),
    makeSection("pointAndClick", "Cenas", "Apontar e Clicar", "Cursor e hotspots", pointAndClick, [
      item("Fonte padrao", stringField(pointAndClick, "font", "gba_variable_width")),
      item("Cursor", stringField(pointAndClick, "cursor", "cursor")),
      item("Imagem cursor", stringField(pointAndClick, "cursorImage", "cursor")),
      item("Velocidade cursor", numberField(pointAndClick, "cursorSpeed") ?? 1.5),
      item("Snap hotspots", booleanField(pointAndClick, "snapHotspots"), booleanField(pointAndClick, "snapHotspots") ? "ok" : "muted"),
      item("Interagir", stringField(pointAndClick, "interactButton", "A"))
    ]),
    makeSection("sprites", "Exportacao", "Sprites", "Empacotamento, paleta e OAM", sprites, [
      item("Tamanho padrao", stringField(sprites, "defaultSize", "16x16")),
      item("Pivot padrao", stringField(sprites, "defaultPivot", "Centro inferior")),
      item("Sprites por cena", numberField(sprites, "spritesPerScene") ?? 128),
      item("Avisar OAM", booleanField(sprites, "warnSpriteLimit", true), "ok"),
      item("Modo de cor", stringField(sprites, "colorMode", "4bpp / 16 cores")),
      item("Compressao", stringField(sprites, "compression", "Sem compressao"))
    ]),
    makeSection("backgrounds", "Cenas", "Backgrounds", "Padrões gráficos e composição", backgrounds, [
      item("Tamanho do tile", stringField(backgrounds, "tileSize", "8 px")),
      item("Mapa padrao", stringField(backgrounds, "defaultMapSize", "32x32")),
      item("Modo grafico", stringField(backgrounds, "graphicsMode", "Mode 0 - Tilemaps")),
      item("Paralaxe", booleanField(backgrounds, "parallax", true), "ok"),
      item("Camada colisao", stringField(backgrounds, "collisionLayer", "collision")),
      item("Compressao mapa", stringField(backgrounds, "mapCompression", "LZ77"))
    ]),
    makeSection("uiDialogs", "Assets e Conteudo", "UI / Dialogos", "Texto e caixas de dialogo", uiDialogs, [
      item("Fonte padrao", stringField(uiDialogs, "font", "GBA padrao")),
      item("Velocidade texto", stringField(uiDialogs, "textSpeed", "Normal")),
      item("Som caractere", stringField(uiDialogs, "characterSound", deriveDialogueCharacterSound(data))),
      item("Imagem seletor", stringField(uiDialogs, "selectorImage", "ui/dialogue_cursor.png")),
      item("Imagem caixa", stringField(uiDialogs, "boxImage", "ui/dialogue_box.png")),
      item("Titulo menu Start", stringField(uiDialogs, "startMenuTitle", "Menu")),
      item("Exibir Itens no Start", booleanField(uiDialogs, "startMenuShowInventory")),
      item("Exibir Mapa no Start", booleanField(uiDialogs, "startMenuShowMap")),
      item("Posicao caixa", stringField(uiDialogs, "boxPosition", "Inferior"))
    ]),
    makeSection(
      "audio",
      "Assets e Conteudo",
      "Audio",
      "Taxa de conversão PCM; música e SFX no workspace Áudio",
      audio,
      [
        item("Engine", stringField(audio, "audioEngine", "Nao definido"), stringField(audio, "audioEngine", "").includes("engine") ? "ok" : "muted"),
        item("Modo", stringField(audio, "audioMode", "Nao definido")),
        item("Formato musica", stringField(audio, "defaultMusicFormat", "Nao definido")),
        item("Sample rate", numberField(audio, "sampleRate")),
        item("Master", numberField(audio, "masterVolume")),
        item("Musica", numberField(audio, "musicVolume")),
        item("SFX", numberField(audio, "sfxVolume")),
        item("Canais", audioChannels.length > 0 ? audioChannels.join(", ") : "Nenhum", audioChannels.length > 0 ? "ok" : "warning"),
        item("Manter entre cenas", booleanField(audio, "keepMusicBetweenScenes"), booleanField(audio, "keepMusicBetweenScenes") ? "ok" : "muted")
      ]
    ),
    makeSection(
      "save",
      "Sistemas",
      "Save Data",
      "Persistencia no cartucho",
      save,
      [
        item("Tipo", stringField(save, "saveType", "Nao definido")),
        item("Slots", numberField(save, "slots")),
        item("Auto save", booleanField(save, "autoSave"), booleanField(save, "autoSave") ? "ok" : "muted"),
        item("Manual save", booleanField(save, "manualSave"), booleanField(save, "manualSave") ? "ok" : "muted"),
        item("Checksum", "Ativo (obrigatório)", "ok"),
        item("Reset debug", booleanField(save, "resetSaveInDebug"), booleanField(save, "resetSaveInDebug") ? "warning" : "muted")
      ]
    ),
    makeSection(
      "runtimeCapabilities",
      "Exportacao",
      "Runtime Universal",
      "Servicos globais e capacidades derivadas das cenas",
      runtimeCapabilities,
      [
        item("RTC", booleanField(runtimeCapabilities, "rtc.enabled"), booleanField(runtimeCapabilities, "rtc.enabled") ? "ok" : "muted"),
        item("Link cable", booleanField(runtimeCapabilities, "link.enabled"), booleanField(runtimeCapabilities, "link.enabled") ? "ok" : "muted"),
        item(
          "Affine",
          affineCapabilityUsage.projectDefault && affineCapabilityUsage.sceneCount > 0
            ? `Padrao do projeto + ${affineCapabilityUsage.sceneCount} ${affineCapabilityUsage.sceneCount === 1 ? "cena" : "cenas"}`
            : affineCapabilityUsage.projectDefault
              ? "Padrao do projeto"
              : affineCapabilityUsage.sceneCount > 0
                ? `Usada por ${affineCapabilityUsage.sceneCount} ${affineCapabilityUsage.sceneCount === 1 ? "cena" : "cenas"}`
                : "Nao utilizada",
          affineCapabilityUsage.enabled ? "ok" : "muted"
        )
      ],
      affineCapabilityUsage
    ),
    makeSection("transitions", "Cenas", "Transicoes", "Padrões do projeto para trocas de cena", transitions, (() => {
      const transitionDefaults = sceneTransitionFromProjectSettings(transitions);
      return [
        item("Estilo", sceneTransitionDisplayName(transitionDefaults.style)),
        item("Duracao", transitionDefaults.durationFrames, transitionDefaults.durationFrames > 0 ? "ok" : "muted"),
        item("Ao sair", transitionDefaults.fadeOut, transitionDefaults.fadeOut ? "ok" : "muted"),
        item("Ao entrar", transitionDefaults.fadeIn, transitionDefaults.fadeIn ? "ok" : "muted")
      ];
    })()),
    makeSection("projectiles", "Exportacao", "Projeteis", "Pool, colisoes e orçamento", projectiles, [
      item("Projeteis ativos", numberField(projectiles, "activeProjectiles") ?? 32),
      item("Usar pool", booleanField(projectiles, "usePool", true), "ok"),
      item("Destruir fora da tela", booleanField(projectiles, "destroyOffscreen", true), "ok"),
      item("Destruir em colisao", booleanField(projectiles, "destroyOnCollision", true), "ok"),
      item("Dano padrao", numberField(projectiles, "defaultDamage") ?? 1),
      item("Velocidade padrao", numberField(projectiles, "defaultSpeed") ?? 2),
      item("Sprite padrao", stringField(projectiles, "defaultSprite", "bullet_small")),
      item("SFX de disparo", stringField(projectiles, "shootSfx", "shoot_01"))
    ]),
    makeSection(
      "preview",
      "Exportacao",
      "Preview",
      "Playtest e emulador",
      preview,
      [
        item("Modo", stringField(preview, "defaultMode", "Nao definido")),
        item("Escala", numberField(preview, "scale")),
        item("Overlays", `${enabledPreviewOverlayCount} ativos`, enabledPreviewOverlayCount > 0 ? "ok" : "muted"),
        item("Emulador", stringField(preview, "emulator", "Nao definido")),
        item("Emulador path", emulatorPath || "Nao definido", emulatorPath ? "default" : "muted"),
        item("Rodar apos build", runAfterBuild, runAfterBuild ? "ok" : "muted"),
        item("Mutar audio room", booleanField(preview, "muteRoomAudio"), booleanField(preview, "muteRoomAudio") ? "warning" : "ok")
      ]
    ),
    makeSection(
      "debug",
      "Exportacao",
      "Orçamentos",
      "Métricas do editor e Play",
      debug,
      [
        item("Flags debug", `${enabledDebugFlagCount} ativas`, enabledDebugFlagCount > 0 ? "warning" : "muted"),
        item("CPU", booleanField(debug, "showCpuUsage"), booleanField(debug, "showCpuUsage") ? "ok" : "muted"),
        item("VRAM", booleanField(debug, "showVramUsage"), booleanField(debug, "showVramUsage") ? "ok" : "muted"),
        item("Eventos log", booleanField(debug, "enableEventLogs"), booleanField(debug, "enableEventLogs") ? "warning" : "muted"),
        item("Audio log", booleanField(debug, "enableAudioLogs"), booleanField(debug, "enableAudioLogs") ? "warning" : "muted"),
        item("Preservar temp", booleanField(debug, "preserveTempFiles"), booleanField(debug, "preserveTempFiles") ? "warning" : "muted"),
        item("Developer mode", booleanField(debug, "developerMode"), booleanField(debug, "developerMode") ? "warning" : "muted")
      ]
    ),
    makeSection(
      "mcp",
      "Avancado",
      "MCP local",
      "Cliente local e acesso somente leitura",
      mcp,
      [
        item("Ativo", booleanField(mcp, "enabled"), booleanField(mcp, "enabled") ? "ok" : "muted"),
        item("Transporte", "stdio local", "ok"),
        item("Permissões", "Somente leitura", "ok")
      ]
    )
  ];

  const hasNestedGroups = Boolean(general || build || preview || audio || save || runtimeCapabilities || debug || mcp || sceneTypes);
  const warnings = settings && !hasNestedGroups ? ["Settings incompletos: alguns grupos serao exibidos com fallbacks."] : [];
  const diagnostics = settingsDiagnostics({
    data,
    engineBackend,
    enginePackPath,
    exportFolder,
    startScene
  });
  diagnostics.push(...validateSceneProfileReferences(data).map((issue, index) => diagnostic(
    `scene-profile-reference-${index}`,
    "Referência de cena",
    issue.message,
    "warning"
  )));

  return {
    sections,
    diagnostics,
    gameplayPresets: SETTINGS_GAMEPLAY_PRESETS.map((preset) => ({
      ...preset,
      changes: preset.changes.filter((change) => isEditableSettingsField(change.sectionID, change.fieldKey))
    })).filter((preset) => preset.changes.length > 0),
    summary: {
      hasSettings: Boolean(settings),
      sectionCount: sections.filter((section) => section.editableFields.length > 0 || section.id === "credits").length,
      configuredPathCount: configuredPathCount([exportFolder, enginePackPath]),
      availableSceneTypeCount: SCENE_TYPE_OPTIONS.length,
      enabledPreviewOverlayCount: 0,
      enabledDebugFlagCount,
      engineBackend,
      audioMode,
      startScene,
      exportFolder,
      diagnosticWarningCount: diagnostics.filter((entry) => entry.tone === "warning").length,
      warnings
    }
  };
}
