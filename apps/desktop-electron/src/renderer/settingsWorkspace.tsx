import { uiText as ui, useStudioUiText } from "./studioUiText";
import type { SceneActionHandler, SceneActionAuditEntry } from "../shared/sceneActionRouting.js";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AudioLines,
  Bug,
  Cable,
  Clock3,
  ClipboardCopy,
  CirclePlay,
  Cpu,
  Crosshair,
  Files,
  Folder,
  Footprints,
  Gamepad2,
  Grid3X3,
  Hammer,
  Info,
  Keyboard,
  Languages,
  Layers,
  LockKeyhole,
  MessageSquare,
  MousePointerClick,
  Monitor,
  Move,
  Network,
  PersonStanding,
  PlaySquare,
  Puzzle,
  Save,
  ScanLine,
  Search,
  ShieldCheck,
  Send,
  Sparkles,
  SlidersHorizontal,
  Shuffle,
  Swords,
  Type
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  EnginePackBuildDryRunResult,
  EnginePackDoctorResult,
  EnginePackStatus,
  SettingsPathValidationItem,
  ValidateSettingsPathsResult
} from "../shared/ipc";
import type { AssetPackBudgetReport } from "../shared/projectBudget";
import type { GBAProjectData } from "../shared/projectFile";
import type { RoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import type {
  SettingsEditableField,
  SettingsEditableValue,
  SettingsSectionGroup,
  SettingsSectionID,
  SettingsWorkspaceScope,
  SettingsWorkspacePresentation,
  SettingsWorkspaceSection
} from "../shared/settingsWorkspace";
import type { ProjectDiagnostic, ProjectHealthReport } from "../shared/projectHealth";
import { InspectorNumber, InspectorRange } from "./InspectorControls";
import { deriveAdvancedVideoComposition } from "../shared/advancedVideoComposition";
import { deriveSaveMenuBuilder, saveMenuSlotCards } from "../shared/saveMenuBuilder";
import {
  deriveSettingsSectionChangeSummary,
  deriveSettingsSectionsForScope,
  deriveSettingsWorkspaceSearchResults
} from "../shared/settingsWorkspace";
import {
  ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS,
  formatRoomEditorShortcut,
  roomEditorReservedShortcutLabel,
  roomEditorShortcutAriaKey,
  roomEditorShortcutFromKeyboardEvent,
  roomEditorShortcutIssues
} from "../shared/roomEditorShortcuts";
import { WorkspaceEmptyState } from "./studioUi";
import { SettingsInterfaceSection } from "./SettingsInterfaceSection";
import { SceneDefaultsSection } from "./SceneDefaultsSection";
import { ExportProjectSection, ExportRomActions, ExportSettingsHeader } from "./ExportProjectSection";
import { deriveExportSettingsSections, exportSettingsFieldSection, exportStartReferenceOptions } from "../shared/exportSettingsLayout";
import { ProjectHealthWorkspace } from "./projectHealthWorkspace";
import { TranslationPacksPanel } from "./TranslationPacksPanel";
import { CreditsContent } from "./CreditsContent";
import { mcpRegistrationEnginePackPath } from "../shared/mcpSettings";
import { readStoredLocale } from "./i18n";

interface SettingsWorkspaceProps {
  scope?: Exclude<SettingsWorkspaceScope, "all">;
  title?: string;
  advancedTools?: ReactNode;
  presentation: SettingsWorkspacePresentation | null;
  pathValidation: ValidateSettingsPathsResult | null;
  pathValidationRunning: boolean;
  engineStatus: EnginePackStatus | null;
  doctorResult: EnginePackDoctorResult | null;
  doctorRunning: boolean;
  buildDryRunResult: EnginePackBuildDryRunResult | null;
  buildDryRunRunning: boolean;
  hasEngineAssetc: boolean;
  hasEngineBuild: boolean;
  hasCurrentEngineExport?: boolean;
  focusedSectionID?: string | null;
  focusRequestID?: number | null;
  projectPath?: string;
  enginePackPath?: string;
  getMcpServerRegistration?(request: { projectPath: string; enginePackPath?: string }): Promise<string>;
  getCodexMcpServerRegistration?(request: { projectPath: string; enginePackPath?: string }): Promise<string>;
  onUpdateSetting(sectionID: SettingsSectionID, fieldKey: string, value: SettingsEditableValue): void;
  onApplySettingsPreset?(sectionID: SettingsSectionID, changes: Array<{ fieldKey: string; value: SettingsEditableValue }>): void;
  onSelectPath(sectionID: SettingsSectionID, field: SettingsEditableField): void;
  onValidatePaths(): void;
  onResetSection(sectionID: SettingsSectionID): void;
  onRunEngineDoctor(): void;
  onRunEngineBuildDryRun(): void;
  onGenerateRom?(): void;
  generateRomDisabled?: boolean;
  romRunning?: boolean;
  onPlayProject?(): void;
  onOpenPluginCatalog?(): void;
  playProjectDisabled?: boolean;
  projectData?: GBAProjectData | null;
  roomsPresentation?: RoomsWorkspacePresentation | null;
  assetPackReport?: AssetPackBudgetReport | null;
  projectHealthReport?: ProjectHealthReport | null;
  onOpenProjectDiagnostic?(diagnostic: ProjectDiagnostic): void;
  onSceneAction?: SceneActionHandler;
  sceneActionHistory?: readonly SceneActionAuditEntry[];
}

type SettingsNavigationSectionID = SettingsSectionID | "interface" | "translationPacks" | "plugins" | "health";

const DEVICE_SETTINGS_SECTIONS = [
  { sectionID: "interface" as const, title: "Interface", detail: "Aparência e idioma do aplicativo neste dispositivo", keywords: "tamanho compacta padrão ampliada cinza brilho contraste fonte leitura idioma linguagem tema claro escuro", icon: Monitor },
  { sectionID: "translationPacks" as const, title: "Tradução offline", detail: "Pacotes de idiomas instalados neste dispositivo", keywords: "Bergamot modelos download baixar remover cache português inglês espanhol francês", icon: Languages }
];
const PLUGINS_SETTINGS_SECTION = { sectionID: "plugins" as const, title: "Plugins", detail: "Catálogo e instalação no projeto", keywords: "extensões repositório pacotes", icon: Puzzle };
type LocalSettingsSection = (typeof DEVICE_SETTINGS_SECTIONS)[number] | typeof PLUGINS_SETTINGS_SECTION;

function LocalSettingsNavigation({ sections, selectedSectionID, onNavigate }: {
  sections: readonly LocalSettingsSection[];
  selectedSectionID: SettingsNavigationSectionID;
  onNavigate(sectionID: SettingsNavigationSectionID): void;
}): React.ReactElement {
  const ui = useStudioUiText();
  return <>{sections.map(section => {
    const Icon = section.icon;
    return <button
      aria-label={section.sectionID === "interface" ? ui("Seção de ajustes da interface") : ui("{0} seção de ajustes", { 0: ui(section.title) })}
      aria-pressed={selectedSectionID === section.sectionID}
      className={sectionNavClassName(selectedSectionID === section.sectionID)}
      key={section.sectionID}
      onClick={() => onNavigate(section.sectionID)}
      type="button"
    >
      <span className="settings-nav-icon" aria-hidden="true"><Icon size={15} strokeWidth={2.2} /></span>
      <span className="settings-nav-copy"><strong>{ui(section.title)}</strong><span>{ui(section.detail)}</span></span>
    </button>;
  })}</>;
}

function diagnosticClassName(tone: string): string {
  return tone === "default" ? "settings-diagnostic-card" : `settings-diagnostic-card ${tone}`;
}

function validationItemClassName(item: SettingsPathValidationItem): string {
  return item.ok ? "settings-path-validation-row ok" : "settings-path-validation-row warning";
}

function validationItemDetail(item: SettingsPathValidationItem): string {
  if (item.error) return item.error;
  if (item.creatable) return "Pasta de saída será criada na exportação.";
  if (!item.exists) return "Caminho não encontrado.";
  if (item.kind !== item.mode) {
    return item.mode === "directory" ? "Esperava pasta, mas encontrou arquivo." : "Esperava arquivo, mas encontrou pasta.";
  }
  if (item.missingTools.length > 0 || item.missingFiles.length > 0) {
    return [
      item.missingTools.length > 0 ? `Ferramentas ausentes: ${item.missingTools.join(", ")}` : null,
      item.missingFiles.length > 0 ? `Arquivos ausentes: ${item.missingFiles.join(", ")}` : null
    ].filter(Boolean).join(". ") + ".";
  }
  if (item.resolvedPath && item.resolvedPath !== item.path) {
    return item.id === "build.enginePackPath"
      ? "Engine Pack detectado automaticamente."
      : "Caminho resolvido na pasta do projeto.";
  }
  return item.mode === "directory" ? "Pasta valida." : "Arquivo valido.";
}

function sectionNavClassName(isActive: boolean): string {
  return isActive ? "settings-nav-item active" : "settings-nav-item";
}

function polishSettingsText(value: string): string {
  const localized = ui(value);
  if (localized !== value || readStoredLocale() !== "pt-BR") return localized;
  const replacements: Array<[string, string]> = [
    ["Isometrico", "Isométrico"],
    ["Identificacao", "Identificação"],
    ["identificacao", "identificação"],
    ["Titulo", "Título"],
    ["titulo", "título"],
    ["Versao", "Versão"],
    ["versao", "versão"],
    ["grafico", "gráfico"],
    ["Grafico", "Gráfico"],
    ["Resolucao", "Resolução"],
    ["resolucao", "resolução"],
    ["padrao", "padrão"],
    ["Padrao", "Padrão"],
    ["classico", "clássico"],
    ["Classico", "Clássico"],
    ["Botao", "Botão"],
    ["botao", "botão"],
    ["Botoes", "Botões"],
    ["botoes", "botões"],
    ["direcoes", "direções"],
    ["Direcoes", "Direções"],
    ["Direcao", "Direção"],
    ["direcao", "direção"],
    ["Animacao", "Animação"],
    ["animacao", "animação"],
    ["Classica", "Clássica"],
    ["classica", "clássica"],
    ["Acessivel", "Acessível"],
    ["acessivel", "acessível"],
    ["Fisica", "Física"],
    ["fisica", "física"],
    ["Sensacao", "Sensação"],
    ["sensacao", "sensação"],
    ["Tolerancia", "Tolerância"],
    ["tolerancia", "tolerância"],
    ["Confortavel", "Confortável"],
    ["confortavel", "confortável"],
    ["Projecao", "Projeção"],
    ["projecao", "projeção"],
    ["animacoes", "animações"],
    ["Aceleracao", "Aceleração"],
    ["aceleracao", "aceleração"],
    ["Rapido", "Rápido"],
    ["rapido", "rápido"],
    ["Medio", "Médio"],
    ["medio", "médio"],
    ["Rigida", "Rígida"],
    ["rigida", "rígida"],
    ["perdoavel", "perdoável"],
    ["Perdoavel", "Perdoável"],
    ["previsiveis", "previsíveis"],
    ["Previsiveis", "Previsíveis"],
    ["visiveis", "visíveis"],
    ["Visiveis", "Visíveis"],
    ["exploracao", "exploração"],
    ["Exploracao", "Exploração"],
    ["agil", "ágil"],
    ["Agil", "Ágil"],
    ["Desaceleracao", "Desaceleração"],
    ["desaceleracao", "desaceleração"],
    ["Repulsao", "Repulsão"],
    ["repulsao", "repulsão"],
    ["maxima", "máxima"],
    ["Maxima", "Máxima"],
    ["Camera", "Câmera"],
    ["camera", "câmera"],
    ["nivel", "nível"],
    ["Nivel", "Nível"],
    ["Projetil", "Projétil"],
    ["projetil", "projétil"],
    ["Projeteis", "Projéteis"],
    ["projeteis", "projéteis"],
    ["automatico", "automático"],
    ["Automatico", "Automático"],
    ["Importacao", "Importação"],
    ["importacao", "importação"],
    ["Compressao", "Compressão"],
    ["compressao", "compressão"],
    ["Colisoes", "Colisões"],
    ["colisoes", "colisões"],
    ["Colisao", "Colisão"],
    ["colisao", "colisão"],
    ["Variaveis", "Variáveis"],
    ["variaveis", "variáveis"],
    ["Musica", "Música"],
    ["musica", "música"],
    ["Audio", "Áudio"],
    ["audio", "áudio"],
    ["Dialogos", "Diálogos"],
    ["dialogos", "diálogos"],
    ["Dialogo", "Diálogo"],
    ["dialogo", "diálogo"],
    ["Transicoes", "Transições"],
    ["transicoes", "transições"],
    ["Duracao", "Duração"],
    ["duracao", "duração"],
    ["Posicao", "Posição"],
    ["posicao", "posição"],
    ["Rotacao", "Rotação"],
    ["rotacao", "rotação"],
    ["Pagina", "Página"],
    ["pagina", "página"],
    ["Avancado", "Avançado"],
    ["avancado", "avançado"],
    ["Avanco", "Avanço"],
    ["avanco", "avanço"],
    ["Avancar", "Avançar"],
    ["avancar", "avançar"],
    ["Acao", "Ação"],
    ["acao", "ação"],
    ["interacao", "interação"],
    ["Interacao", "Interação"],
    ["orcamentos", "orçamentos"],
    ["Orcamentos", "Orçamentos"],
    ["diagnosticos", "diagnósticos"],
    ["Diagnosticos", "Diagnósticos"],
    ["Persistencia", "Persistência"],
    ["persistencia", "persistência"],
    ["Exportacao", "Exportação"],
    ["exportacao", "exportação"],
    ["So ", "Só "],
    ["Apos", "Após"],
    ["apos", "após"],
    ["nao", "não"],
    ["Nao", "Não"]
  ];
  return replacements.reduce((result, [from, to]) => result.replaceAll(from, to), value);
}

function settingsSectionDetailForWorkspace(section: SettingsWorkspaceSection): string {
  const detail = section.detail.replace(/ · (So preview|So Play|Export ROM|So editor)$/, "");
  return polishSettingsText(detail);
}

const SETTINGS_GROUP_ORDER: SettingsSectionGroup[] = [
  "Aplicativo",
  "Projeto",
  "Cenas",
  "Assets e Conteudo",
  "Sistemas",
  "Exportacao",
  "Avancado"
];

const SETTINGS_SECTION_ICONS: Record<SettingsSectionID, LucideIcon> = {
  general: Info,
  shortcuts: Keyboard,
  credits: Sparkles,
  build: Hammer,
  hardware: Cpu,
  controls: Gamepad2,
  sceneTypes: PersonStanding,
  topdown: Move,
  platformer: Footprints,
  isometric: Layers,
  dungeonCrawler: Grid3X3,
  racing: Move,
  battleRpg: Crosshair,
  luta: Swords,
  worldMap: Grid3X3,
  visualNovel: MessageSquare,
  cutscene: CirclePlay,
  shmup: Send,
  pointAndClick: MousePointerClick,
  sprites: PersonStanding,
  backgrounds: Grid3X3,
  uiDialogs: MessageSquare,
  audio: AudioLines,
  save: Save,
  runtimeCapabilities: ScanLine,
  transitions: Shuffle,
  projectiles: Crosshair,
  preview: PlaySquare,
  debug: Bug,
  mcp: ShieldCheck
};

const SCENE_WORKSPACE_SECTION_IDS = new Set<SettingsSectionID>([
  "sceneTypes",
  "topdown",
  "platformer",
  "isometric",
  "dungeonCrawler",
  "racing",
  "battleRpg",
  "luta",
  "worldMap",
  "visualNovel",
  "cutscene",
  "shmup",
  "pointAndClick",
  "transitions"
]);

const SCENE_ADVANCED_FIELD_KEYS: Partial<Record<SettingsSectionID, ReadonlySet<string>>> = {
  topdown: new Set(["walkSpeed", "runSpeed", "acceleration", "deceleration"]),
  platformer: new Set(["walkSpeed", "gravity", "maxFallSpeed", "jumpMinHeight", "jumpFrames", "coyoteTime", "jumpBuffer", "cameraDeadzoneX", "dashRechargeFrames", "acceleration"]),
  isometric: new Set(["tileWidth", "tileHeight", "heightStep", "maxHeight", "walkSpeed", "acceleration", "deceleration"]),
  dungeonCrawler: new Set(["stepDurationMs", "turnDurationMs", "viewDistance"]),
  racing: new Set(["maxSpeed", "acceleration", "brakePower", "steeringSpeed"]),
  battleRpg: new Set(["maxPartySize", "maxEnemies", "turnDelayFrames", "experienceMultiplier", "rewardGold", "rewardExperience"]),
  luta: new Set(["roundTime", "roundsToWin", "maxSuperGauge", "superGaugeGainOnHit", "superGaugeGainOnReceive", "guardPowerRecovery", "throwEscapeWindow", "parryWindow", "hitstunDecay", "comboLimit", "vismCustomComboGauge"]),
  worldMap: new Set(["requiredVariable", "requiredValue", "targetLevel"]),
  visualNovel: new Set(["nextSceneIndex", "backgroundIndex"]),
  cutscene: new Set(["stepDurationFrames", "nextSceneIndex", "backgroundIndex"]),
  shmup: new Set(["scrollSpeed", "playerSpeed", "fireRate", "defaultDamage", "playerHealth"]),
  pointAndClick: new Set(["cursorSpeed", "hotspotPadding"]),
  transitions: new Set(["durationFrames"])
};

const BATTLE_RULE_FIELD_KEYS = new Set([
  "escapeEnabled",
  "typeEffectivenessEnabled",
  "criticalHitEnabled",
  "statusConditionsEnabled",
  "abilitiesEnabled"
]);

function isSceneAdvancedField(sectionID: SettingsSectionID, fieldKey: string): boolean {
  return SCENE_ADVANCED_FIELD_KEYS[sectionID]?.has(fieldKey) ?? false;
}

function sceneAdvancedSummary(sectionID: SettingsSectionID): { title: string; detail: string } {
  if (sectionID === "transitions") {
    return {
      title: "Personalizar duração",
      detail: "O estilo e as fases ficam visíveis; a duração detalhada fica aqui. Conexões personalizadas são ajustadas no Inspetor."
    };
  }
  return {
    title: "Personalizar valores técnicos",
    detail: "Use os sliders para ajustar rapidamente e o valor exato para refinar quando o preset não for suficiente."
  };
}

function settingControl(
  sectionID: SettingsSectionID,
  field: SettingsEditableField,
  onUpdateSetting: SettingsWorkspaceProps["onUpdateSetting"],
  onSelectPath: SettingsWorkspaceProps["onSelectPath"]
): React.ReactElement {
  if (field.readOnly) {
    return (
      <div className="settings-edit-row" key={field.key} data-setting-key={field.key} data-setting-section={sectionID}>
        <span>{polishSettingsText(field.label)}</span>
        <output aria-label={polishSettingsText(field.label)}>{String(field.value)}</output>
      </div>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="settings-edit-row boolean" key={field.key} data-setting-key={field.key} data-setting-section={sectionID}>
        <span>{polishSettingsText(field.label)}</span>
        <input
          checked={field.value === true}
          onChange={(event) => onUpdateSetting(sectionID, field.key, event.currentTarget.checked)}
          type="checkbox"
        />
      </label>
    );
  }

  if (field.options) {
    const options = field.options.some((option) => option.value === field.value)
      ? field.options
      : [...field.options, { value: String(field.value), label: `Referência inválida (${field.value})` }];
    return (
      <label className="settings-edit-row" key={field.key} data-setting-key={field.key} data-setting-section={sectionID}>
        <span>{polishSettingsText(field.label)}</span>
        <select
          disabled={field.readOnly}
          onChange={(event) => onUpdateSetting(
            sectionID,
            field.key,
            field.type === "number" ? Number(event.currentTarget.value) : event.currentTarget.value
          )}
          value={String(field.value)}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{
            (field.key === "startScene" || field.key === "startPlayer" || /^default(PlayerSprites|Backgrounds)\./.test(field.key)) && option.value && option.label === option.value
              ? option.label : polishSettingsText(option.label)
          }</option>)}
        </select>
      </label>
    );
  }

  if (field.type === "number") {
    const label = polishSettingsText(field.label);
    const commonProps = {
      className: "settings-edit-row settings-edit-number",
      defaultValue: typeof field.defaultValue === "number" ? field.defaultValue : undefined,
      description: field.description,
      disabled: field.readOnly,
      label,
      max: field.maximum,
      min: field.minimum,
      onChange: (nextValue: number) => onUpdateSetting(sectionID, field.key, nextValue),
      step: field.step,
      unit: field.unit,
      value: Number(field.value)
    };
    return field.range && field.minimum !== undefined && field.maximum !== undefined
      ? <InspectorRange {...commonProps} key={field.key} />
      : <InspectorNumber {...commonProps} key={field.key} />;
  }

  return (
    <label className="settings-edit-row" key={field.key} data-setting-key={field.key} data-setting-section={sectionID}>
      <span>{polishSettingsText(field.label)}</span>
      <div className={field.pathPicker ? "settings-path-control" : "settings-text-control"}>
        <input
          onChange={(event) => onUpdateSetting(sectionID, field.key, event.currentTarget.value)}
          inputMode={sectionID === "shortcuts" ? "text" : undefined}
          maxLength={sectionID === "shortcuts" ? 1 : undefined}
          readOnly={field.readOnly}
          type="text"
          value={String(field.value)}
        />
        {field.pathPicker ? (
          <button aria-label={ui("Escolher {0}", { 0: polishSettingsText(field.label) })} type="button" onClick={() => onSelectPath(sectionID, field)}><Folder size={18} aria-hidden="true" />{ui("Escolher")}</button>
        ) : null}
      </div>
    </label>
  );
}

function ShortcutSettingsPanel({
  section,
  onUpdateSetting
}: Pick<SettingsSectionPanelProps, "section" | "onUpdateSetting">): React.ReactElement {
  const ui = useStudioUiText();
  const [capturingFieldKey, setCapturingFieldKey] = useState<string | null>(null);
  const [captureFeedback, setCaptureFeedback] = useState<Record<string, string>>({});
  const fieldsByKey = new Map(section.editableFields.map((field) => [field.key, field]));
  const fieldValues = Object.fromEntries(section.editableFields.map((field) => [field.key, field.value]));
  const shortcutIssues = roomEditorShortcutIssues(fieldValues);
  const issueFieldCount = Object.keys(shortcutIssues).length;
  const changedFields = section.editableFields.filter((field) => field.value !== field.defaultValue);
  const statusMessage = issueFieldCount > 0
    ? `${issueFieldCount} ${issueFieldCount === 1 ? "atalho precisa" : "atalhos precisam"} de atenção.`
      : changedFields.length > 0
        ? `${changedFields.length} ${changedFields.length === 1 ? "atalho personalizado" : "atalhos personalizados"}.`
        : "Todos os atalhos usam o padrão.";

  function handleCaptureKeyDown(event: React.KeyboardEvent<HTMLDivElement>, fieldKey: string): void {
    if (capturingFieldKey !== fieldKey) return;
    if (event.key === "Tab") {
      setCapturingFieldKey(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setCapturingFieldKey(null);
      setCaptureFeedback((current) => {
        const next = { ...current };
        delete next[fieldKey];
        return next;
      });
      return;
    }

    const shortcut = roomEditorShortcutFromKeyboardEvent(event.nativeEvent);
    if (!shortcut) {
      setCaptureFeedback((current) => ({
        ...current,
        [fieldKey]: "Use uma letra ou número, com no máximo Shift, Ctrl/Cmd ou Alt."
      }));
      return;
    }

    const reservedLabel = roomEditorReservedShortcutLabel(shortcut);
    if (reservedLabel) {
      setCaptureFeedback((current) => ({
        ...current,
        [fieldKey]: `Esse atalho é reservado para ${reservedLabel}.`
      }));
      return;
    }

    onUpdateSetting(section.id, fieldKey, shortcut);
    setCapturingFieldKey(null);
    setCaptureFeedback((current) => {
      const next = { ...current };
      delete next[fieldKey];
      return next;
    });
  }

  return (
    <section aria-label={ui("Configuração dos atalhos do editor")} className="settings-shortcut-panel">
      <div className="settings-shortcut-intro">
        <div>
          <strong>{ui("Atalhos das ferramentas")}</strong>
          <span>{ui("Clique em Capturar e pressione uma letra ou número, com Shift, Ctrl/Cmd ou Alt.")}</span>
          <span>{ui("Alt+clique captura colisão, botão direito apaga, Shift+setas move em passos de 8 tiles, Ctrl/Cmd+D duplica e Escape cancela ou sai do foco.")}</span>
        </div>
        <span className={issueFieldCount > 0 ? "settings-shortcut-status warning" : "settings-shortcut-status ok"} role="status" aria-live="polite">
          {statusMessage}
        </span>
      </div>

      <div className="settings-shortcut-list">
        {ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.map((binding) => {
          const field = fieldsByKey.get(binding.fieldKey);
          if (!field) return null;
          const issues = shortcutIssues[field.key] ?? [];
          const feedback = captureFeedback[field.key];
          const hasIssue = issues.length > 0 || Boolean(feedback);
          const descriptionID = `settings-shortcut-${field.key}-description`;
          const issueID = `settings-shortcut-${field.key}-issue`;
          const describedBy = hasIssue ? `${descriptionID} ${issueID}` : descriptionID;
          const isDefault = field.value === field.defaultValue;
          return (
            <div
              className={hasIssue ? "settings-shortcut-row has-issue" : "settings-shortcut-row"}
              key={field.key}
              onKeyDown={(event) => handleCaptureKeyDown(event, field.key)}
            >
              <div className="settings-shortcut-copy">
                <label htmlFor={`settings-shortcut-${field.key}`}>{polishSettingsText(field.label)}</label>
                <small id={descriptionID}>{polishSettingsText(field.description ?? binding.description)}</small>
              </div>
              <div className="settings-shortcut-edit">
                <input
                  aria-keyshortcuts={roomEditorShortcutAriaKey(field.value)}
                  aria-describedby={describedBy}
                  aria-invalid={hasIssue}
                  id={`settings-shortcut-${field.key}`}
                  readOnly
                  type="text"
                  value={formatRoomEditorShortcut(field.value)}
                />
                <button
                  aria-label={ui("{0} atalho de {1}", { 0: capturingFieldKey === field.key ? "Pressione…" : "Capturar", 1: polishSettingsText(field.label) })}
                  aria-pressed={capturingFieldKey === field.key}
                  className={capturingFieldKey === field.key ? "active" : ""}
                  onClick={() => {
                    setCapturingFieldKey(field.key);
                    setCaptureFeedback((current) => {
                      const next = { ...current };
                      delete next[field.key];
                      return next;
                    });
                  }}
                  type="button"
                >
                  {capturingFieldKey === field.key ? ui("Pressione…") : ui("Capturar")}
                </button>
                <button
                  aria-label={ui("Restaurar atalho padrão de {0}", { 0: polishSettingsText(field.label) })}
                  disabled={isDefault}
                  onClick={() => onUpdateSetting(section.id, field.key, field.defaultValue)}
                  title={ui("Restaurar para {0}", { 0: formatRoomEditorShortcut(binding.defaultKey) })}
                  type="button"
                >
                  {ui("Padrão")}</button>
              </div>
              {hasIssue ? (
                <span className="settings-shortcut-issue" id={issueID} role="alert">
                  {[...issues.map((issue) => issue.message), feedback].filter(Boolean).join(" ")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="settings-shortcut-actions">
        <span>{ui("Use “Padrão” para restaurar uma tecla ou “Restaurar padrão” no cabeçalho para restaurar a seção.")}</span>
      </div>
    </section>
  );
}

const RUNTIME_CAPABILITY_ROWS: Array<{
  key: string;
  label: string;
  detail: string;
  icon: LucideIcon;
}> = [
  {
    key: "rtc.enabled",
    label: "Relógio em tempo real (RTC)",
    detail: "Preview usa relógio falso; a ROM usa o provider de RTC do GBA.",
    icon: Clock3
  },
  {
    key: "link.enabled",
    label: "Link cable / multiplayer",
    detail: "Habilita o transporte físico; o preview usa loopback para testes locais.",
    icon: Cable
  }
];

function RuntimeCapabilitiesPanel({
  section,
  onUpdateSetting
}: Pick<SettingsSectionPanelProps, "section" | "onUpdateSetting">): React.ReactElement {
  const ui = useStudioUiText();
  const fields = new Map(section.editableFields.map((field) => [field.key, field]));
  const enabledCount = RUNTIME_CAPABILITY_ROWS.filter((row) => fields.get(row.key)?.value === true).length;
  const affineUsage = section.runtimeCapabilityUsage ?? { enabled: false, projectDefault: false, sceneCount: 0 };
  const affineStatus = affineUsage.projectDefault && affineUsage.sceneCount > 0
    ? `Padrão do projeto + ${affineUsage.sceneCount} ${affineUsage.sceneCount === 1 ? "cena" : "cenas"}`
    : affineUsage.projectDefault
      ? "Padrão do projeto"
      : affineUsage.sceneCount > 0
        ? `Usada por ${affineUsage.sceneCount} ${affineUsage.sceneCount === 1 ? "cena" : "cenas"}`
        : "Não utilizada";

  return (
    <section aria-label={ui("Capacidades universais do runtime")} className="settings-runtime-capabilities">
      <header className="settings-runtime-capabilities-header">
        <div>
          <strong>{ui("Capacidades do projeto")}</strong>
          <span>{ui("Serviços globais são configuráveis; Affine é derivado do uso real nas cenas.")}</span>
        </div>
        <b>{enabledCount} {ui(" de ")}{RUNTIME_CAPABILITY_ROWS.length} {ui(" ativas")}</b>
      </header>
      <div className="settings-runtime-capability-list">
        {RUNTIME_CAPABILITY_ROWS.map((row) => {
          const Icon = row.icon;
          const enabled = fields.get(row.key)?.value === true;
          return (
            <label className={enabled ? "settings-runtime-capability-row enabled" : "settings-runtime-capability-row"} key={row.key}>
              <span className="settings-runtime-capability-icon" aria-hidden="true"><Icon size={19} strokeWidth={2.1} /></span>
              <span className="settings-runtime-capability-copy">
                <strong>{ui(row.label)}</strong>
                <small>{ui(row.detail)}</small>
              </span>
              <span className="settings-runtime-capability-status">{enabled ? ui("Ativa") : ui("Desativada")}</span>
              <input
                aria-label={ui(row.label)}
                checked={enabled}
                onChange={(event) => onUpdateSetting("runtimeCapabilities", row.key, event.currentTarget.checked)}
                type="checkbox"
              />
            </label>
          );
        })}
        <div className={affineUsage.enabled ? "settings-runtime-capability-derived enabled" : "settings-runtime-capability-derived"} role="status">
          <span className="settings-runtime-capability-icon" aria-hidden="true"><ScanLine size={19} strokeWidth={2.1} /></span>
          <span className="settings-runtime-capability-copy">
            <strong>{ui("Composição Affine")}</strong>
            <small>{ui("Capability automática a partir do padrão de Backgrounds ou do opt-in no Inspetor da cena.")}</small>
          </span>
          <span className="settings-runtime-capability-status">{affineStatus}</span>
        </div>
      </div>
      <p className="settings-runtime-capabilities-note">{ui("Save Data é configurado na seção própria. Affine é derivado dos padrões gráficos em Cenas ou da composição própria no Inspetor.")}</p>
    </section>
  );
}

const ADVANCED_BUILD_FIELD_KEYS = new Set([
  "exportFormat",
  "engineBackend",
  "enginePackPath",
  "toolchain",
  "compilerPath"
]);

function scrollToSettingsSection(sectionID: SettingsNavigationSectionID): void {
  const target = document.getElementById(`settings-section-${sectionID}`) as (HTMLElement & {
    scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
  }) | null;
  if (!target) return;

  const panel = target.closest<HTMLElement>(".settings-main-panel");
  if (panel) {
    const offset = target.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12;
    panel.scrollBy({ top: offset, behavior: "smooth" });
    return;
  }

  target.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

interface SettingsSectionPanelProps {
  section: SettingsWorkspaceSection;
  isExportWorkspace?: boolean;
  isSceneWorkspace?: boolean;
  playerField?: SettingsEditableField;
  backgroundFields?: SettingsEditableField[];
  resetConfirmationSectionID: SettingsSectionID | null;
  onUpdateSetting: SettingsWorkspaceProps["onUpdateSetting"];
  onApplySettingsPreset?: SettingsWorkspaceProps["onApplySettingsPreset"];
  onSelectPath: SettingsWorkspaceProps["onSelectPath"];
  projectPath?: string;
  enginePackPath?: string;
  getMcpServerRegistration?: SettingsWorkspaceProps["getMcpServerRegistration"];
  getCodexMcpServerRegistration?: SettingsWorkspaceProps["getCodexMcpServerRegistration"];
  onRequestReset(sectionID: SettingsSectionID): void;
  onCancelReset(): void;
  onConfirmReset(sectionID: SettingsSectionID): void;
}

function sectionFieldValues(section: SettingsWorkspaceSection): Record<string, SettingsEditableValue> {
  return Object.fromEntries(section.editableFields.map((field) => [field.key, field.value]));
}

function AdvancedVideoComposer({
  section
}: Pick<SettingsSectionPanelProps, "section">): React.ReactElement {
  const ui = useStudioUiText();
  const composition = deriveAdvancedVideoComposition(sectionFieldValues(section));
  const affineEnabled = composition.mode === 1 || composition.mode === 2;
  const bitmapEnabled = composition.mode >= 3;
  return (
    <section aria-label={ui("Padrão de vídeo dos backgrounds")} className="settings-visual-builder settings-video-composer">
      <header><div><strong>{ui("Padrão de vídeo dos backgrounds")}</strong><span>{ui("Fallback do projeto para cenas sem composição própria")}</span></div><b>{ui("Modo ")}{composition.mode}</b></header>
      <p className="settings-video-composer-note">{ui("Use este modo como base do pipeline. Para uma cena específica, configure o Compositor da cena no Inspetor; o opt-in da cena tem prioridade.")}</p>
      <div className="settings-video-builder-body">
        <div className="settings-video-preview">
          <strong>{ui("Prévia da transformação")}</strong>
          <div className={bitmapEnabled ? "bitmap" : "affine"}>
            <span style={affineEnabled ? {
              transform: `rotate(${composition.affine.rotationDegrees}deg) scale(${composition.affine.scaleX}, ${composition.affine.scaleY})`
            } : undefined}>{bitmapEnabled ? composition.bitmapAsset || ui("Selecione uma imagem") : composition.affine.asset || composition.affine.layer}</span>
          </div>
        </div>
        <dl>
          <div><dt>{ui("Camada")}</dt><dd>{affineEnabled ? composition.affine.layer : bitmapEnabled ? ui("Framebuffer") : ui("Tilemaps")}</dd></div>
          <div><dt>{ui("Rotação")}</dt><dd>{composition.affine.rotationDegrees}°</dd></div>
          <div><dt>{ui("Escala")}</dt><dd>{composition.affine.scaleX} × {composition.affine.scaleY}</dd></div>
          <div><dt>{ui("Origem")}</dt><dd>{composition.affine.originX}, {composition.affine.originY}</dd></div>
          <div><dt>{ui("Página")}</dt><dd>{composition.bitmapPage}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function SaveMenuVisualBuilder({
  section,
  onUpdateSetting
}: Pick<SettingsSectionPanelProps, "section" | "onUpdateSetting">): React.ReactElement {
  const ui = useStudioUiText();
  const config = deriveSaveMenuBuilder(sectionFieldValues(section));
  const cards = saveMenuSlotCards(config, [{
    slot: config.selectedSlot,
    present: true,
    playerName: "Jogador",
    playTimeFrames: 221400,
    location: "Cena atual"
  }]);
  return (
    <section aria-label={ui("Construtor visual de saves")} className="settings-visual-builder settings-save-builder">
      <header><div><strong>{ui("Construtor visual de saves")}</strong><span>{ui("A tela usa os metadados gravados pela engine")}</span></div><b>{config.slotCount} {ui(" slots")}</b></header>
      <div className={`settings-save-slots ${config.layout}`}>
        {cards.map((card) => (
          <button
            aria-label={ui("Selecionar slot {0}", { 0: card.slot })}
            aria-pressed={card.selected}
            key={card.slot}
            onClick={() => onUpdateSetting("save", "selectedSlot", card.slot)}
            type="button"
          >
            <small>{ui("SLOT ")}{card.slot}</small>
            {config.metadata.playerName ? <strong>{card.playerName}</strong> : null}
            {config.metadata.playTime ? <span>{card.playTime}</span> : null}
            {config.metadata.location ? <em>{card.location}</em> : null}
          </button>
        ))}
      </div>
      <div className="settings-save-actions" aria-label={ui("Prévia das ações do menu de saves")}>
        <button disabled type="button">{config.actions.continue}</button>
        <button disabled type="button">{config.actions.load}</button>
        <button disabled type="button">{config.actions.delete}</button>
      </div>
    </section>
  );
}

function McpScopeRow({
  icon: Icon,
  title,
  detail,
  status,
  tone = "blocked"
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  status: string;
  tone?: "allowed" | "blocked" | "warning";
}): React.ReactElement {
  const ui = useStudioUiText();
  return (
    <div className="settings-mcp-scope-row">
      <span className="settings-mcp-scope-icon" aria-hidden="true"><Icon size={18} strokeWidth={2.1} /></span>
      <div>
        <strong>{title}</strong>
        <span>{ui(detail)}</span>
      </div>
      <small className={`settings-mcp-status ${tone}`}>{ui(status)}</small>
    </div>
  );
}

function McpSettingsPanel({
  section,
  onUpdateSetting,
  projectPath,
  enginePackPath,
  getMcpServerRegistration,
  getCodexMcpServerRegistration
}: Pick<SettingsSectionPanelProps, "section" | "onUpdateSetting" | "projectPath" | "enginePackPath" | "getMcpServerRegistration" | "getCodexMcpServerRegistration">): React.ReactElement {
  const ui = useStudioUiText();
  const enabledField = section.editableFields.find((field) => field.key === "enabled");
  const enabled = enabledField?.value === true;
  const [registration, setRegistration] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [codexRegistration, setCodexRegistration] = useState<string | null>(null);
  const [codexRegistrationError, setCodexRegistrationError] = useState<string | null>(null);
  const [codexCopyFeedback, setCodexCopyFeedback] = useState<string | null>(null);
  const registeredEnginePackPath = mcpRegistrationEnginePackPath(registration);

  useEffect(() => {
    let active = true;
    setCopyFeedback(null);
    setCodexCopyFeedback(null);
    if (!projectPath) {
      setRegistration(null);
      setCodexRegistration(null);
      setRegistrationError("Salve o projeto para gerar a configuração de conexão.");
      setCodexRegistrationError("Salve o projeto para gerar a configuração do Codex.");
      return () => { active = false; };
    }

    setRegistration(null);
    setRegistrationError(null);
    setCodexRegistration(null);
    setCodexRegistrationError(null);
    const getRegistration = getMcpServerRegistration ?? window.gbaStudio.getMcpServerRegistration;
    void getRegistration({ projectPath, enginePackPath }).then(
      (nextRegistration) => {
        if (active) setRegistration(nextRegistration);
      },
      (error: unknown) => {
        if (!active) return;
        setRegistrationError(error instanceof Error ? error.message : "Não foi possível gerar a configuração de conexão.");
      }
    );
    const getCodexRegistration = getCodexMcpServerRegistration ?? window.gbaStudio.getCodexMcpServerRegistration;
    void getCodexRegistration({ projectPath, enginePackPath }).then(
      (nextRegistration) => {
        if (active) setCodexRegistration(nextRegistration);
      },
      (error: unknown) => {
        if (!active) return;
        setCodexRegistrationError(error instanceof Error ? error.message : "Não foi possível gerar a configuração do Codex.");
      }
    );
    return () => { active = false; };
  }, [enginePackPath, getCodexMcpServerRegistration, getMcpServerRegistration, projectPath]);

  async function copyRegistration(): Promise<void> {
    if (!registration) return;
    try {
      await navigator.clipboard.writeText(registration);
      setCopyFeedback("Configuração copiada.");
    } catch {
      setCopyFeedback("Não foi possível copiar. Selecione o texto para copiar manualmente.");
    }
  }

  async function copyCodexRegistration(): Promise<void> {
    if (!codexRegistration) return;
    try {
      await navigator.clipboard.writeText(codexRegistration);
      setCodexCopyFeedback("Configuração do Codex copiada.");
    } catch {
      setCodexCopyFeedback("Não foi possível copiar. Selecione o texto para copiar manualmente.");
    }
  }

  return (
    <section className="settings-continuous-section settings-mcp-section" id={`settings-section-${section.id}`}>
      <header className="settings-section-hero settings-mcp-hero">
        <span className="settings-section-badge" aria-hidden="true"><ShieldCheck size={20} strokeWidth={2.2} /></span>
        <div className="settings-section-hero-copy">
          <strong>{ui("MCP local")}</strong>
          <span>{ui("Conecte clientes de IA ao projeto atual com limites explícitos.")}</span>
        </div>
        <div className="settings-section-status">
          <span>{ui("Somente leitura")}</span>
          <strong>{ui("stdio local")}</strong>
        </div>
      </header>

      <article className="settings-mcp-card" role="region" aria-label={ui("Editar MCP local")}>
        <label className="settings-mcp-primary-row">
          <span className="settings-mcp-primary-icon" aria-hidden="true"><ShieldCheck size={22} strokeWidth={2.2} /></span>
          <span>
            <strong>{ui("Ativar MCP local")}</strong>
            <small>{ui("Permite que clientes MCP leiam informações deste projeto. Salve o projeto após alterar esta autorização.")}</small>
          </span>
          <input
            aria-label={ui("Ativar MCP local")}
            checked={enabled}
            onChange={(event) => onUpdateSetting("mcp", "enabled", event.currentTarget.checked)}
            type="checkbox"
          />
        </label>

        <div className="settings-mcp-scope-list" aria-label={ui("Escopo das permissões MCP")}>
          <McpScopeRow
            icon={Files}
            title={ui("Ler dados e assets deste projeto")}
            detail="Resumo, diagnósticos e metadados de assets permanecem dentro da pasta do projeto."
            status={enabled ? "Permitido quando conectado" : "Desativado"}
            tone={enabled ? "allowed" : "blocked"}
          />
          <McpScopeRow
            icon={LockKeyhole}
            title={ui("Alterar arquivos do projeto")}
            detail="Nenhuma ferramenta MCP cria, edita, move ou salva arquivos."
            status="Bloqueado · somente leitura"
          />
          <McpScopeRow
            icon={LockKeyhole}
            title={ui("Acessar arquivos fora do projeto")}
            detail="Caminhos absolutos, saídas da pasta e links simbólicos externos são recusados."
            status="Bloqueado · projeto atual"
          />
          <McpScopeRow
            icon={Network}
            title={ui("Usar rede")}
            detail="A conexão usa stdin/stdout no computador local e não abre portas de rede."
            status="Bloqueado · stdio local"
          />
          <McpScopeRow
            icon={ClipboardCopy}
            title={ui("Analisar orçamento da ROM")}
            detail="Disponibiliza o diagnóstico de orçamento sem gravar a ROM nem o projeto."
            status={registeredEnginePackPath ? "Configuração inclui Engine Pack" : "Requer Engine Pack"}
            tone={registeredEnginePackPath ? "allowed" : "warning"}
          />
        </div>

        <section className="settings-mcp-connection" aria-label={ui("Configuração de conexão MCP")}>
          <div>
            <strong>{ui("Configuração para clientes MCP")}</strong>
            <span>{ui("Registro JSON genérico para clientes que aceitam configuração MCP nesse formato.")}</span>
          </div>
          {registration ? (
            <textarea aria-label={ui("Configuração MCP para copiar")} readOnly value={registration} />
          ) : (
            <p>{registrationError ?? ui("Gerando configuração de conexão…")}</p>
          )}
          <div className="settings-mcp-connection-actions">
            <button disabled={!registration} onClick={() => void copyRegistration()} type="button">
              <ClipboardCopy size={15} strokeWidth={2.1} />
              {ui("Copiar configuração")}</button>
            {copyFeedback ? <span role="status">{copyFeedback}</span> : null}
          </div>
        </section>

        <section className="settings-mcp-connection" aria-label={ui("Configuração de conexão do Codex")}>
          <div>
            <strong>{ui("Configuração para Codex")}</strong>
            <span>{ui("Cole este bloco em ")}<code>{"~/.codex/config.toml"}</code> {ui(" ou adicione-o pelos servidores MCP do Codex. Reinicie o Codex após salvar.")}</span>
          </div>
          {codexRegistration ? (
            <textarea aria-label={ui("Configuração TOML do Codex para copiar")} readOnly value={codexRegistration} />
          ) : (
            <p>{codexRegistrationError ?? ui("Gerando configuração do Codex…")}</p>
          )}
          <div className="settings-mcp-connection-actions">
            <button disabled={!codexRegistration} onClick={() => void copyCodexRegistration()} type="button">
              <ClipboardCopy size={15} strokeWidth={2.1} />
              {ui("Copiar para Codex")}</button>
            {codexCopyFeedback ? <span role="status">{codexCopyFeedback}</span> : null}
          </div>
        </section>
      </article>
    </section>
  );
}

function SettingsTranslationSection(): React.ReactElement {
  const ui = useStudioUiText();
  return <section className="settings-continuous-section" id="settings-section-translationPacks">
    <div className="settings-section-hero">
      <span className="settings-section-badge" aria-hidden="true"><Languages size={20} strokeWidth={2.2} /></span>
      <div className="settings-section-hero-copy"><strong>{ui("Tradução offline")}</strong><span>{ui("Pacotes de idiomas instalados neste dispositivo")}</span></div>
      <div className="settings-section-status"><span>{ui("Neste dispositivo")}</span></div>
    </div>
    <article className="settings-section-card active" role="region" aria-label={ui("Gerenciar tradução offline")}><TranslationPacksPanel /></article>
  </section>;
}

function SettingsPluginsSection({ projectPath, onOpenPluginCatalog }: Pick<SettingsWorkspaceProps, "projectPath" | "onOpenPluginCatalog">): React.ReactElement {
  const ui = useStudioUiText();
  return <section className="settings-continuous-section" id="settings-section-plugins">
    <div className="settings-section-hero">
      <span className="settings-section-badge" aria-hidden="true"><Puzzle size={20} strokeWidth={2.2} /></span>
      <div className="settings-section-hero-copy"><strong>{ui("Plugins")}</strong><span>{ui("Catálogo e instalação no projeto")}</span></div>
      <div className="settings-section-status"><span>{ui("Neste projeto")}</span></div>
    </div>
    <article className="settings-section-card settings-plugins-card active" role="region" aria-label={ui("Plugins do projeto")}>
      <div className="settings-plugins-copy">
        <p>{ui("Esta área está preparada para plugins criados para o GBA Studio. Ainda não há um catálogo padrão.")}</p>
        <p>{ui("Instale por pasta ou ZIP no menu Projeto ou abra um futuro catálogo da comunidade.")}</p>
        {!projectPath ? <p>{ui("Salve o projeto para abrir o catálogo.")}</p> : null}
      </div>
      <button disabled={!projectPath || !onOpenPluginCatalog} onClick={onOpenPluginCatalog} type="button">
        <Puzzle aria-hidden="true" size={15} strokeWidth={2.1} />
        {ui("Abrir catálogo de plugins")}</button>
    </article>
  </section>;
}

function SettingsSectionPanel({
  section,
  isExportWorkspace = false,
  isSceneWorkspace = false,
  playerField,
  backgroundFields,
  resetConfirmationSectionID,
  onUpdateSetting,
  onApplySettingsPreset,
  onSelectPath,
  projectPath,
  enginePackPath,
  getMcpServerRegistration,
  getCodexMcpServerRegistration,
  onRequestReset,
  onCancelReset,
  onConfirmReset
}: SettingsSectionPanelProps): React.ReactElement {
  const ui = useStudioUiText();
  if (section.id === "mcp") {
    return <McpSettingsPanel
      section={section}
      onUpdateSetting={onUpdateSetting}
      projectPath={projectPath}
      enginePackPath={enginePackPath}
      getMcpServerRegistration={getMcpServerRegistration}
      getCodexMcpServerRegistration={getCodexMcpServerRegistration}
    />;
  }

  const SectionIcon = SETTINGS_SECTION_ICONS[section.id];
  const changeSummary = deriveSettingsSectionChangeSummary(section);
  const isSceneSection = SCENE_WORKSPACE_SECTION_IDS.has(section.id);
  const isBattleRuleField = (field: SettingsEditableField): boolean => (
    section.id === "battleRpg" && BATTLE_RULE_FIELD_KEYS.has(field.key)
  );
  const primaryFields = section.id === "build"
    ? section.editableFields.filter((field) => !ADVANCED_BUILD_FIELD_KEYS.has(field.key))
    : isSceneSection
      ? section.editableFields.filter((field) => !isSceneAdvancedField(section.id, field.key) && !isBattleRuleField(field))
      : section.editableFields;
  const advancedFields = section.id === "build"
    ? section.editableFields.filter((field) => ADVANCED_BUILD_FIELD_KEYS.has(field.key))
    : isSceneSection
      ? section.editableFields.filter((field) => isSceneAdvancedField(section.id, field.key))
      : [];
  const battleRuleFields = section.id === "battleRpg"
    ? section.editableFields.filter((field) => BATTLE_RULE_FIELD_KEYS.has(field.key))
    : [];
  const sceneAdvancedCopy = sceneAdvancedSummary(section.id);
  const sectionTitle = polishSettingsText(section.title);
  const sectionDetail = settingsSectionDetailForWorkspace(section);

  if (isSceneWorkspace) {
    return <SceneDefaultsSection
      section={section} title={sectionTitle} detail={sectionDetail} icon={SectionIcon}
      primaryFields={primaryFields} advancedFields={advancedFields} playerField={playerField} backgroundFields={backgroundFields}
      polish={polishSettingsText}
      renderField={field => settingControl(section.id, field, onUpdateSetting, onSelectPath)}
      onUpdateSetting={onUpdateSetting}
      resetPending={resetConfirmationSectionID === section.id}
      onApplySettingsPreset={onApplySettingsPreset}
      onRequestReset={() => onRequestReset(section.id)} onCancelReset={onCancelReset}
      onConfirmReset={() => onConfirmReset(section.id)}
      extraContent={section.id === "backgrounds" ? <AdvancedVideoComposer section={section} /> : section.id === "battleRpg" ? <>
        <section className="scene-defaults-battle-rules"><h3>{ui("Regras da batalha")}</h3><div className="scene-defaults-switches">{battleRuleFields.map(field => settingControl(section.id, field, onUpdateSetting, onSelectPath))}</div></section>
        <p className="settings-battle-hud-note">{ui("A visibilidade das barras de HP e experiência é configurada em Editor → HUD → Aparência, junto da apresentação do combate.")}</p>
      </> : null}
    />;
  }

  return (
    <section className={isExportWorkspace ? "settings-continuous-section export-settings-page" : "settings-continuous-section"} id={`settings-section-${section.id}`}>
      {isExportWorkspace ? <ExportSettingsHeader section={{ ...section, title: sectionTitle, detail: sectionDetail }} resetPending={resetConfirmationSectionID === section.id} onRequestReset={() => onRequestReset(section.id)} onCancelReset={onCancelReset} onConfirmReset={() => onConfirmReset(section.id)} /> : <>
      <div className="settings-section-hero">
        <span className="settings-section-badge" aria-hidden="true">
          <SectionIcon size={20} strokeWidth={2.2} />
        </span>
        <div className="settings-section-hero-copy">
          <strong>{ui(sectionTitle)}</strong>
          <span>{sectionDetail}</span>
        </div>
        {section.id === "credits" || section.editableFields.every((field) => field.readOnly) ? (
          <div className="settings-section-status">
            <span>{ui("Informação")}</span>
            <strong>{section.id === "hardware" ? ui("Limites fixos") : section.id === "credits" ? ui("GBA Studio") : ui("Projeto")}</strong>
          </div>
        ) : (
          <>
            <div className="settings-section-status">
              <span>{section.id === "build" ? ui("Build + salvamento") : section.exportScope === "play-only" ? ui("Só Play") : section.exportScope === "preview-only" ? ui("Só preview") : section.exportScope === "export" ? ui("Exporta na ROM") : section.exportScope === "editor-only" ? ui("Só editor") : ui("Preview + ROM")}</span>
              <strong>{changeSummary.changedCount} {changeSummary.changedCount === 1 ? ui("alteração") : ui("alterações")}</strong>
            </div>
            <button
              aria-label={ui("Restaurar padrão de {0}", { 0: ui(sectionTitle) })}
              type="button"
              onClick={() => onRequestReset(section.id)}
            >
              {ui("Restaurar padrão")}</button>
          </>
        )}
      </div>

      {resetConfirmationSectionID === section.id ? (
        <section className="settings-reset-confirmation" aria-label={ui("Confirmar restauração dos ajustes")}>
          <strong>{ui("Restaurar ")}{ui(sectionTitle)}?</strong>
          <p>
            {changeSummary.changedCount > 0
              ? polishSettingsText(changeSummary.changedFields.join(", "))
              : ui("Esta seção já usa os valores padrão.")}
          </p>
          <div>
            <button onClick={onCancelReset} type="button">{ui("Cancelar")}</button>
            <button aria-label={ui("Confirmar restauração")} onClick={() => onConfirmReset(section.id)} type="button">
              {ui("Restaurar")}</button>
          </div>
        </section>
      ) : null}

      </>}

      {section.intentGroups.length > 0 ? (
        <section className="settings-intent-panel" aria-label={ui("Ajustes por intenção de {0}", { 0: ui(sectionTitle) })}>
          <div className="settings-intent-header">
            <div>
              <strong>{ui("Ajustes rápidos")}</strong>
              <span>{ui("Combinações prontas para este perfil")}</span>
            </div>
            <span>{section.intentGroups.length} {ui(" grupos")}</span>
          </div>
          <div className="settings-intent-groups">
            {section.intentGroups.map((group) => (
              <div className="settings-intent-group" key={group.title}>
                <h4>{polishSettingsText(group.title)}</h4>
                <div className="settings-intent-options">
                  {group.options.map((option) => (
                    <button
                      aria-label={ui("Aplicar {0} em {1}", { 0: polishSettingsText(option.title), 1: ui(sectionTitle) })}
                      aria-pressed={option.applied}
                      className={option.applied ? "settings-intent-card applied" : "settings-intent-card"}
                      key={option.id}
                      onClick={() => onApplySettingsPreset ? onApplySettingsPreset(section.id, option.changes) : option.changes.forEach((change) => (
                        onUpdateSetting(section.id, change.fieldKey, change.value)
                      ))}
                      title={polishSettingsText(option.detail)}
                      type="button"
                    >
                      <span className="settings-intent-card-title">
                        <strong>{polishSettingsText(option.title)}</strong>
                        <small>{option.applied ? ui("Aplicado") : ui("{0} campos", { 0: option.fieldCount })}</small>
                      </span>
                      <span className="settings-intent-card-detail">{polishSettingsText(option.detail)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <article className="settings-section-card active" role="region" aria-label={ui("Editar {0}", { 0: ui(sectionTitle) })}>
        {section.id === "credits" ? <CreditsContent className="settings-credits-content" /> : <>
        {isSceneSection && advancedFields.length > 0 ? (
          <details className="settings-advanced-fields settings-scene-advanced-fields">
            <summary>
              <span className="settings-scene-advanced-summary">
                <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2.2} />
                <span>{ui(sceneAdvancedCopy.title)}</span>
              </span>
              <small>{advancedFields.length} {advancedFields.length === 1 ? ui("campo") : ui("campos")}</small>
            </summary>
            <p>{ui(sceneAdvancedCopy.detail)}</p>
            <div className="settings-edit-list">
              {advancedFields.map((field) => settingControl(section.id, field, onUpdateSetting, onSelectPath))}
            </div>
          </details>
        ) : null}
        {section.id === "battleRpg" && battleRuleFields.length > 0 ? (
          <details className="settings-advanced-fields settings-battle-rules-fields" open>
            <summary>
              <span className="settings-scene-advanced-summary">
                <ShieldCheck aria-hidden="true" size={16} strokeWidth={2.2} />
                <span>{ui("Regras da batalha")}</span>
              </span>
              <small>{battleRuleFields.length} {ui(" regras")}</small>
            </summary>
            <p>{ui("Defina as mecânicas padrão do combate. A entrada, a vitória, a derrota e a fuga continuam sendo montadas na aba Eventos.")}</p>
            <div className="settings-edit-list">
              {battleRuleFields.map((field) => settingControl(section.id, field, onUpdateSetting, onSelectPath))}
            </div>
          </details>
        ) : null}
        {section.id === "battleRpg" ? (
          <div className="settings-battle-hud-note" role="note">
            <strong>{ui("HUD da batalha")}</strong>
            <span>{ui("A visibilidade das barras de HP e experiência é configurada em Editor → HUD → Aparência, junto da apresentação do combate.")}</span>
          </div>
        ) : null}
        {section.id === "controls" ? (
          <div className="settings-controls-note" role="note">
            <strong>{ui("Várias teclas por ação")}</strong>
            <span>{ui("Separe várias teclas por vírgulas")}</span>
            <span>{ui("Exemplo: ")}<code>{"ArrowUp,w"}</code></span>
            <span>{ui("Mapeia o teclado no Play integrado. Os botões físicos do GBA e as ações de cada perfil são configurados em Cenas e no Inspetor.")}</span>
          </div>
        ) : null}
        {section.id === "shortcuts" ? <p className="settings-controls-note">{ui("Estes atalhos são salvos neste projeto. Aparência, idioma do aplicativo e pacotes offline são preferências deste dispositivo.")}</p> : null}
        {section.id === "shortcuts" ? (
          <ShortcutSettingsPanel section={section} onUpdateSetting={onUpdateSetting} />
        ) : null}
        {section.id === "backgrounds" ? <AdvancedVideoComposer section={section} /> : null}
        {section.id === "save" ? <SaveMenuVisualBuilder section={section} onUpdateSetting={onUpdateSetting} /> : null}
        {section.id === "runtimeCapabilities" ? <RuntimeCapabilitiesPanel section={section} onUpdateSetting={onUpdateSetting} /> : (
          section.id === "shortcuts" ? null : (
            <div className="settings-edit-list" aria-label={ui("Editar {0}", { 0: ui(sectionTitle) })}>
              {primaryFields.map((field) => settingControl(section.id, field, onUpdateSetting, onSelectPath))}
            </div>
          )
        )}
        {advancedFields.length > 0 && !isSceneSection ? (
          <details className="settings-advanced-fields">
            <summary>
              <span>{ui("Toolchain e caminhos avançados")}</span>
              <small>{advancedFields.length} {advancedFields.length === 1 ? ui("campo") : ui("campos")}</small>
            </summary>
            <p>{ui("Escolha um Engine Pack compatível. A toolchain e o compilador são detectados automaticamente.")}</p>
            <div className="settings-edit-list">
              {advancedFields.map((field) => settingControl(section.id, field, onUpdateSetting, onSelectPath))}
            </div>
          </details>
        ) : null}
        </>}
      </article>
    </section>
  );
}

export function SettingsWorkspace({
  scope = "global",
  title,
  advancedTools,
  presentation,
  pathValidation,
  pathValidationRunning,
  engineStatus,
  doctorResult,
  doctorRunning,
  buildDryRunResult,
  buildDryRunRunning,
  hasEngineAssetc,
  hasEngineBuild,
  hasCurrentEngineExport = false,
  focusedSectionID,
  focusRequestID,
  projectPath,
  enginePackPath,
  getMcpServerRegistration,
  getCodexMcpServerRegistration,
  onUpdateSetting,
  onApplySettingsPreset,
  onSelectPath,
  onValidatePaths,
  onResetSection,
  onRunEngineDoctor,
  onRunEngineBuildDryRun,
  onGenerateRom,
  generateRomDisabled = false,
  romRunning = false,
  onPlayProject,
  onOpenPluginCatalog,
  playProjectDisabled = false,
  projectData = null,
  roomsPresentation = null,
  assetPackReport = null,
  projectHealthReport = null,
  onOpenProjectDiagnostic,
  onSceneAction,
  sceneActionHistory
}: SettingsWorkspaceProps): React.ReactElement {
  const ui = useStudioUiText();
  const workspaceTitle = title ?? (scope === "scene" ? "Cenas" : scope === "export" ? "Exportar" : "Ajustes");
  const isGlobalWorkspace = scope === "global";
  const isExportWorkspace = scope === "export";
  const isSceneWorkspace = scope === "scene";
  const isDiscreteWorkspace = isGlobalWorkspace || isSceneWorkspace || isExportWorkspace;
  const workspaceClassName = `settings-workspace${isGlobalWorkspace ? " settings-workspace-global" : isSceneWorkspace ? " settings-workspace-scene" : isExportWorkspace ? " settings-workspace-export" : ""}`;
  const [selectedSectionID, setSelectedSectionID] = useState<SettingsNavigationSectionID>(isSceneWorkspace ? "topdown" : isExportWorkspace ? "general" : "interface");
  const appliedExportFocus = useRef("");
  const [searchQuery, setSearchQuery] = useState("");
  const [resetConfirmationSectionID, setResetConfirmationSectionID] = useState<SettingsSectionID | null>(null);
  const visibleSections = useMemo(
    () => presentation ? isExportWorkspace ? deriveExportSettingsSections(presentation) : deriveSettingsSectionsForScope(presentation, scope) : [],
    [presentation, scope, isExportWorkspace]
  );
  const buildSection = presentation?.sections.find((section) => section.id === "build") ?? null;
  const enginePackField = buildSection?.editableFields.find((field) => field.key === "enginePackPath") ?? null;
  const hasPluginsSection = isGlobalWorkspace && Boolean(onOpenPluginCatalog) && Boolean(presentation);
  const initialSectionID: SettingsNavigationSectionID = isGlobalWorkspace ? "interface" : isSceneWorkspace ? visibleSections.find(section => section.id === "topdown")?.id ?? visibleSections[0]?.id ?? "sceneTypes" : visibleSections[0]?.id ?? "general";
  const searchResults = useMemo(() => {
    const searchPresentation = presentation ? {
      ...presentation,
      sections: (isExportWorkspace ? visibleSections : presentation.sections).map(section => ({
        ...section, title: ui(section.title), detail: ui(section.detail),
        editableFields: section.editableFields.map(field => ({ ...field, label: ui(field.label), description: ui(field.description) })),
        intentGroups: section.intentGroups.map(group => ({ ...group, title: ui(group.title),
          options: group.options.map(option => ({ ...option, title: ui(option.title), detail: ui(option.detail) })) }))
      }))
    } : null;
    const projectResults = presentation
      ? deriveSettingsWorkspaceSearchResults(searchPresentation!, searchQuery)
        .filter((result) => visibleSections.some((section) => section.id === result.sectionID))
      : [];
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const tokens = normalize(searchQuery).split(/\s+/).filter(Boolean);
    const localSections = isGlobalWorkspace ? [...DEVICE_SETTINGS_SECTIONS, ...(hasPluginsSection ? [PLUGINS_SETTINGS_SECTION] : [])] : [];
    const localResults = tokens.length ? localSections.filter((section) => {
      const text = normalize(`${ui(section.title)} ${ui(section.detail)} ${section.keywords}`);
      return tokens.every(token => text.includes(token));
    }) : [];
    const healthResults = isExportWorkspace && tokens.length && tokens.every(token => normalize(`${ui("Saúde do projeto")} ${ui("Preflight do projeto e da ROM")}`).includes(token))
      ? [{ sectionID: "health" as const, title: "Saúde do projeto", detail: "Preflight do projeto e da ROM" }] : [];
    return [...localResults, ...projectResults, ...healthResults];
  }, [hasPluginsSection, isGlobalWorkspace, isExportWorkspace, presentation, searchQuery, visibleSections, ui]);
  useEffect(() => {
    setSearchQuery("");
    setResetConfirmationSectionID(null);
    setSelectedSectionID(initialSectionID);
  }, [initialSectionID, projectPath, scope]);
  useEffect(() => {
    if (!presentation || !focusedSectionID) return;
    const focusKey = `${projectPath ?? ""}:${focusedSectionID}:${focusRequestID ?? 0}`;
    if (isExportWorkspace && appliedExportFocus.current === focusKey) return;
    if (isExportWorkspace && focusedSectionID === "health") {
      appliedExportFocus.current = focusKey;
      setSelectedSectionID("health");
      scrollToSettingsSection("health");
      return;
    }
    if (isGlobalWorkspace && [...DEVICE_SETTINGS_SECTIONS, ...(hasPluginsSection ? [PLUGINS_SETTINGS_SECTION] : [])].some(section => section.sectionID === focusedSectionID)) {
      setSelectedSectionID(focusedSectionID as SettingsNavigationSectionID);
      scrollToSettingsSection(focusedSectionID as SettingsNavigationSectionID);
      return;
    }
    const section = visibleSections.find((item) => item.id === focusedSectionID);
    if (!section) return;
    if (isExportWorkspace) appliedExportFocus.current = focusKey;
    setSelectedSectionID(section.id);
    scrollToSettingsSection(section.id);
  }, [focusedSectionID, focusRequestID, hasPluginsSection, isExportWorkspace, isGlobalWorkspace, presentation, projectPath, visibleSections]);
  const groupedSections = useMemo(() => {
    if (!presentation) return [];
    if (isSceneWorkspace) {
      const generalIDs = new Set<SettingsSectionID>(["sceneTypes", "backgrounds", "transitions"]);
      return [
        { group: "Tipos de cena", sections: visibleSections.filter(section => !generalIDs.has(section.id)) },
        { group: "Padrões gerais", sections: visibleSections.filter(section => generalIDs.has(section.id)) }
      ].filter(group => group.sections.length > 0);
    }

    if (isExportWorkspace) return [
      { group: "Projeto", sections: visibleSections.filter(section => ["general", "build", "hardware"].includes(section.id)) },
      { group: "Conteúdo", sections: visibleSections.filter(section => section.id === "audio") },
      { group: "Sistemas", sections: visibleSections.filter(section => section.id === "save") },
      { group: "Avançado", sections: visibleSections.filter(section => ["runtimeCapabilities", "debug"].includes(section.id)) }
    ];
    return SETTINGS_GROUP_ORDER
      .map((group) => ({
        group,
        sections: visibleSections.filter((section) => section.group === group)
      }))
      .filter((entry) => entry.sections.length > 0);
  }, [isSceneWorkspace, isExportWorkspace, presentation, visibleSections]);

  const navigateToSection = (sectionID: SettingsNavigationSectionID): void => {
    setSelectedSectionID(sectionID);
    setResetConfirmationSectionID(null);
    if (!isDiscreteWorkspace) scrollToSettingsSection(sectionID);
  };

  useEffect(() => {
    if (isDiscreteWorkspace) {
      const panel = document.querySelector<HTMLElement>(`.${isSceneWorkspace ? "settings-workspace-scene" : isExportWorkspace ? "settings-workspace-export" : "settings-workspace-global"} .settings-main-panel`);
      if (panel) panel.scrollTop = 0;
    }
  }, [isDiscreteWorkspace, isSceneWorkspace, isExportWorkspace, selectedSectionID]);

  const updateActiveSectionFromScroll = (panel: HTMLElement): void => {
    if (isDiscreteWorkspace) return;
    // A short final section cannot align with the panel's top at maximum scroll.
    const maxScrollTop = panel.scrollHeight - panel.clientHeight;
    if (hasPluginsSection && maxScrollTop > 0 && panel.scrollTop >= maxScrollTop - 1) {
      setSelectedSectionID("plugins");
      return;
    }
    const panelTop = panel.getBoundingClientRect().top;
    const sectionIDs = (isGlobalWorkspace
      ? [...DEVICE_SETTINGS_SECTIONS.map(section => section.sectionID), ...visibleSections.map((section) => section.id), ...(hasPluginsSection ? ["plugins"] : [])]
      : isExportWorkspace
        ? [...visibleSections.map((section) => section.id), "health"]
        : visibleSections.map((section) => section.id)) as SettingsNavigationSectionID[];
    let nextSectionID: SettingsNavigationSectionID | undefined = sectionIDs[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const sectionID of sectionIDs) {
      const element = document.getElementById(`settings-section-${sectionID}`);
      if (!element) continue;
      const distance = Math.abs(element.getBoundingClientRect().top - panelTop - 12);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nextSectionID = sectionID;
      }
    }
    if (nextSectionID && nextSectionID !== selectedSectionID) {
      setSelectedSectionID(nextSectionID);
    }
  };

  const searchControls = (
    <div className="settings-search">
      <label>
        <span>{ui("Buscar ajustes")}</span>
        {isDiscreteWorkspace ? <Search className="settings-search-icon" size={17} aria-hidden="true" /> : null}
        <input
          aria-label={ui("Buscar ajustes")}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder={isGlobalWorkspace ? ui("Buscar ajuste...") : isSceneWorkspace || isExportWorkspace ? ui("Buscar configuração...") : ui("Campo, seção ou intenção")}
          type="search"
          value={searchQuery}
        />
      </label>
      {searchQuery.trim() ? (
        <div className="settings-search-results" aria-label={ui("Resultados da busca de ajustes")}>
          {searchResults.length > 0 ? searchResults.map((result) => (
            <button
              aria-label={ui("Abrir {0}", { 0: ui(result.title) })}
              key={result.sectionID}
              onClick={() => navigateToSection(result.sectionID)}
              type="button"
            >
              <strong>{polishSettingsText(result.title)}</strong>
              <span>{polishSettingsText(result.detail)}</span>
            </button>
          )) : <p>{ui("Nenhum ajuste encontrado.")}</p>}
        </div>
      ) : null}
    </div>
  );

  if (!presentation) {
    return (
      <section className={workspaceClassName} aria-label={ui("Workspace {0}", { 0: ui(workspaceTitle) })}>
        <h3 className="studio-visually-hidden">{ui(workspaceTitle)}</h3>
        <div className="settings-layout">
          <aside className="settings-nav" aria-label={ui("Seções de {0}", { 0: workspaceTitle.toLocaleLowerCase("pt-BR") })}>
            <div className="settings-nav-title">
              <strong>{ui(workspaceTitle)}</strong>
              <span>{isGlobalWorkspace ? ui("2 seções") : ui("Sem projeto")}</span>
            </div>
            {isGlobalWorkspace ? searchControls : null}
            <div className="settings-nav-list" role="list">
              {isGlobalWorkspace ? (
                <section className="settings-nav-group" aria-label={ui("Aplicativo")}>
                  <h4>{ui("Aplicativo")}</h4>
                  <div className="settings-nav-group-list">
                    <LocalSettingsNavigation sections={DEVICE_SETTINGS_SECTIONS} selectedSectionID={selectedSectionID} onNavigate={navigateToSection} />
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
          <main className="settings-main-panel" onScroll={(event) => updateActiveSectionFromScroll(event.currentTarget)}>
            {isGlobalWorkspace ? <div className="settings-continuous-page">
              {selectedSectionID === "interface" ? <SettingsInterfaceSection /> : null}
              {selectedSectionID === "translationPacks" ? <SettingsTranslationSection /> : null}
            </div> : null}
            {!isGlobalWorkspace ? <WorkspaceEmptyState
              title={ui("Projeto não aberto")}
              description={scope === "scene"
                ? ui("Abra um projeto para visualizar os tipos e perfis de cena.")
                : scope === "export"
                  ? ui("Abra um projeto para configurar, validar e gerar a ROM do Game Boy Advance.")
                  : ui("Abra um projeto para configurar atalhos, controles do Play e permissões MCP. As preferências deste dispositivo continuam disponíveis acima.")}
            /> : null}
          </main>
        </div>
      </section>
    );
  }

  return (
    <section className={workspaceClassName} aria-label={ui("Workspace {0}", { 0: ui(workspaceTitle) })}>
      <h3 className="studio-visually-hidden">{ui(workspaceTitle)}</h3>

      <div className="settings-layout">
        <aside className="settings-nav" aria-label={ui("Seções de {0}", { 0: workspaceTitle.toLocaleLowerCase("pt-BR") })}>
          <div className="settings-nav-title">
            <strong>{ui(workspaceTitle)}</strong>
            <span>{isGlobalWorkspace ? ui("{0} seções", { 0: visibleSections.length + DEVICE_SETTINGS_SECTIONS.length + (hasPluginsSection ? 1 : 0) }) : isExportWorkspace ? ui("{0} seções", { 0: visibleSections.length + 1 }) : ui("{0} seções", { 0: visibleSections.length })}</span>
          </div>
          {searchControls}
          <div className="settings-nav-list" role="list">
            {groupedSections.map((group) => (
              <section className="settings-nav-group" key={group.group} aria-label={polishSettingsText(group.group)}>
                <h4>{polishSettingsText(group.group)}</h4>
                <div className="settings-nav-group-list">
                  {isGlobalWorkspace && group.group === "Aplicativo" ? (
                    <LocalSettingsNavigation sections={DEVICE_SETTINGS_SECTIONS} selectedSectionID={selectedSectionID} onNavigate={navigateToSection} />
                  ) : null}
                  {group.sections.map((section) => {
                    const SectionIcon = SETTINGS_SECTION_ICONS[section.id];
                    return (
                      <Fragment key={section.id}>
                        <button
                          aria-label={ui("{0} seção de ajustes", { 0: polishSettingsText(section.title) })}
                          aria-pressed={selectedSectionID === section.id}
                          className={sectionNavClassName(selectedSectionID === section.id)}
                          onClick={() => navigateToSection(section.id)}
                          type="button"
                        >
                          <span className="settings-nav-icon" aria-hidden="true">
                            <SectionIcon size={15} strokeWidth={2.2} />
                          </span>
                          <span className="settings-nav-copy">
                            <strong>{polishSettingsText(section.title)}</strong>
                            <span>{settingsSectionDetailForWorkspace(section)}</span>
                          </span>
                        </button>
                      </Fragment>
                    );
                  })}
                  {isExportWorkspace && group.group === "Avançado" ? <button aria-label={ui("Saúde seção de exportação")} aria-pressed={selectedSectionID === "health"} className={sectionNavClassName(selectedSectionID === "health")} onClick={() => navigateToSection("health")} type="button"><span className="settings-nav-icon" aria-hidden="true"><ShieldCheck size={18} /></span><span className="settings-nav-copy"><strong>{ui("Saúde do projeto")}</strong><span>{ui("Preflight do projeto e da ROM")}</span></span></button> : null}
                  {hasPluginsSection && group.group === "Projeto" ? <LocalSettingsNavigation sections={[PLUGINS_SETTINGS_SECTION]} selectedSectionID={selectedSectionID} onNavigate={navigateToSection} /> : null}
                </div>
              </section>
            ))}

          </div>

        </aside>

        <main className="settings-main-panel" onScroll={(event) => updateActiveSectionFromScroll(event.currentTarget)}>
          {isExportWorkspace && presentation.summary.warnings.length ? (
              <div className="settings-warning-strip">
                {presentation.summary.warnings.map((warning) => (
                  <p key={warning}>{polishSettingsText(warning)}</p>
                ))}
              </div>
            ) : null}

            <div className="settings-continuous-page">
              {isGlobalWorkspace ? <>
                {selectedSectionID === "interface" ? <SettingsInterfaceSection /> : null}
                {selectedSectionID === "translationPacks" ? <SettingsTranslationSection /> : null}
              </> : null}
              {isExportWorkspace && selectedSectionID === "general" ? (() => {
                const page = visibleSections.find(item => item.id === "general");
                if (!page) return null;
                const section = { ...page, editableFields: page.editableFields.map(field => ({ ...field, label: polishSettingsText(field.label) })) };
                const options = exportStartReferenceOptions(projectData);
                return <ExportProjectSection section={section} projectData={projectData}
                  header={<ExportSettingsHeader section={section} resetPending={resetConfirmationSectionID === "general"} onRequestReset={() => setResetConfirmationSectionID("general")} onCancelReset={() => setResetConfirmationSectionID(null)} onConfirmReset={() => { onResetSection("general"); setResetConfirmationSectionID(null); }} />}
                  renderField={field => settingControl(exportSettingsFieldSection("general", field.key), field.key === "startScene" ? { ...field, options: options.scenes } : field.key === "startPlayer" ? { ...field, options: options.players } : field, onUpdateSetting, onSelectPath)}
                  footer={<ExportRomActions onShowPaths={() => navigateToSection("build")} pathValidation={pathValidation} validating={pathValidationRunning} running={romRunning} onValidatePaths={onValidatePaths} onGenerateRom={onGenerateRom} onPlayProject={onPlayProject} generateDisabled={generateRomDisabled} playDisabled={playProjectDisabled} />}
                />;
              })() : null}
              {visibleSections.filter(section => (!isDiscreteWorkspace || section.id === selectedSectionID) && !(isExportWorkspace && section.id === "general")).map((section) => (
                <Fragment key={section.id}>
                  <SettingsSectionPanel
                    section={section}
                    isExportWorkspace={isExportWorkspace}
                    isSceneWorkspace={isSceneWorkspace}
                    playerField={isSceneWorkspace && section.id !== "sceneTypes" ? presentation.sections.find(item => item.id === "sceneTypes")?.editableFields.find(field => field.key === `defaultPlayerSprites.${section.id}`) : undefined}
                    backgroundFields={isSceneWorkspace && section.id !== "sceneTypes" ? presentation.sections.find(item => item.id === "sceneTypes")?.editableFields.filter(field => field.key === `defaultBackgrounds.${section.id}`
                      || (section.id === "isometric" && field.key === "defaultBackgrounds.isometricTactical")
                      || (section.id === "racing" && field.key === "defaultBackgrounds.racingPerspective")) : undefined}
                    resetConfirmationSectionID={resetConfirmationSectionID}
                    onUpdateSetting={onUpdateSetting}
                    onApplySettingsPreset={onApplySettingsPreset}
                    onSelectPath={onSelectPath}
                    projectPath={projectPath}
                    enginePackPath={enginePackPath}
                    getMcpServerRegistration={getMcpServerRegistration}
                    getCodexMcpServerRegistration={getCodexMcpServerRegistration}
                    onRequestReset={setResetConfirmationSectionID}
                    onCancelReset={() => setResetConfirmationSectionID(null)}
                    onConfirmReset={(sectionID) => {
                      onResetSection(sectionID);
                      setResetConfirmationSectionID(null);
                    }}
                  />
                </Fragment>
              ))}
              {hasPluginsSection && selectedSectionID === "plugins" ? <SettingsPluginsSection projectPath={projectPath} onOpenPluginCatalog={onOpenPluginCatalog} /> : null}
              {isExportWorkspace && selectedSectionID === "health" ? (
                <section className="settings-continuous-section export-settings-page" id="settings-section-health">
                  <ProjectHealthWorkspace
                    assetPackReport={assetPackReport}
                    embedded
                    onOpenDiagnostic={onOpenProjectDiagnostic}
                    onSceneAction={onSceneAction}
                    sceneActionHistory={sceneActionHistory}
                    projectData={projectData}
                    report={projectHealthReport}
                    roomsPresentation={roomsPresentation}
                    projectPath={projectPath}
                  />
                </section>
              ) : null}
            </div>

            {isExportWorkspace && selectedSectionID === "build" ? <div className="settings-support-grid" aria-label={ui("Validação e ferramentas de exportação")}>
            <section className="settings-inspector-card">
              <div className="settings-inspector-header">
                <strong>{ui("Build e paths")}</strong>
                <span>{pathValidationRunning ? ui("Validando") : pathValidation ? pathValidation.ok ? ui("Paths validados") : ui("Revisar paths") : ui("Paths não verificados")}</span>
              </div>
              <div className="settings-path-summary">
                <div>
                  <span>{ui("Backend")}</span>
                  <strong>{polishSettingsText(presentation.summary.engineBackend)}</strong>
                </div>
                <div>
                  <span>{ui("Engine Pack")}</span>
                  <strong>{engineStatus?.selected?.path ?? (enginePackField ? String(enginePackField.value) || "Detecção automática" : "Detecção automática")}</strong>
                </div>
                <div>
                  <span>{ui("Play")}</span>
                  <strong>{ui("mGBA integrado")}</strong>
                </div>
              </div>
            </section>

            <section className="settings-inspector-card">
              <div className="settings-inspector-header">
                <strong>{ui("Diagnóstico")}</strong>
                <span>{presentation.summary.diagnosticWarningCount} {ui(" alerta(s)")}</span>
              </div>
              <div className="settings-diagnostics" aria-label={ui("Diagnóstico de settings")}>
                {presentation.diagnostics.map((diagnostic) => (
                  <div className={diagnosticClassName(diagnostic.tone)} key={diagnostic.id}>
                    <span>{polishSettingsText(diagnostic.label)}</span>
                    <strong>{polishSettingsText(diagnostic.detail)}</strong>
                  </div>
                ))}
              </div>
            </section>

            {pathValidation ? (
              <section className={pathValidation.ok ? "settings-path-validation ok" : "settings-path-validation warning"}>
                <div className="settings-path-validation-header">
                  <strong>{pathValidation.ok ? ui("Paths validados") : ui("Paths com pendências")}</strong>
                  <span>{pathValidation.items.length} {ui(" verificados")}</span>
                </div>
                {pathValidation.items.length > 0 ? (
                  <div className="settings-path-validation-list">
                    {pathValidation.items.map((item) => (
                      <div className={validationItemClassName(item)} key={item.id}>
                        <span>{polishSettingsText(item.label)}</span>
                        <strong>{validationItemDetail(item)}</strong>
                        <small>{item.path}</small>
                        {item.resolvedPath && item.resolvedPath !== item.path ? <small>{ui("Usado: ")}{item.resolvedPath}</small> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>{ui("Nenhum caminho configurado para validar.")}</p>
                )}
              </section>
            ) : null}

            <section className="settings-inspector-card settings-engine-pack-card">
              <div className="settings-inspector-header">
                <strong>{ui("Testar Engine Pack")}</strong>
                <span>{engineStatus?.selected?.path ? ui("Configurado") : ui("Não detectado")}</span>
              </div>
              <div className="settings-engine-pack-actions">
                <button disabled={doctorRunning || !hasEngineAssetc} onClick={onRunEngineDoctor} type="button">
                  {doctorRunning ? ui("Rodando doctor...") : ui("Rodar doctor")}
                </button>
                <button disabled={buildDryRunRunning || !hasEngineBuild || !hasCurrentEngineExport} onClick={onRunEngineBuildDryRun} type="button">
                  {buildDryRunRunning ? ui("Rodando dry-run...") : ui("gbsbuild dry-run")}
                </button>
              </div>
              {!hasCurrentEngineExport ? <p>{ui("Exporte o projeto atual antes de testar a compilação. Após editar o projeto, exporte novamente.")}</p> : null}
              <p>{ui("O doctor verifica o Engine Pack e a toolchain instalada.")}</p>
              {doctorResult?.summary ? (
                <div className={doctorResult.summary.ok ? "settings-engine-pack-result ok" : "settings-engine-pack-result warning"}>
                  <strong>{doctorResult.summary.ok ? ui("Doctor OK") : ui("Doctor com bloqueios")}</strong>
                  <span>
                    {doctorResult.summary.checksPassed}/{doctorResult.summary.checksTotal} {ui(" checks")}{doctorResult.summary.engineVersion ? ` · ${doctorResult.summary.engineVersion}` : ""}
                  </span>
                  {doctorResult.summary.blockers.length > 0 ? (
                    <ul>
                      {doctorResult.summary.blockers.map((blocker) => (
                        <li key={blocker.id}>{ui(blocker.message)}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : doctorResult?.error ? (
                <p className="settings-engine-pack-error">{doctorResult.error}</p>
              ) : null}
              {buildDryRunResult?.summary ? (
                <div className="settings-engine-pack-result">
                  <strong>{ui("Dry-run pronto")}</strong>
                  <span>{ui("Target ")}{buildDryRunResult.summary.target ?? ui("game")} · {buildDryRunResult.summary.projectDir ?? ui("sem projeto")}</span>
                </div>
              ) : buildDryRunResult?.error ? (
                <p className="settings-engine-pack-error">{buildDryRunResult.error}</p>
              ) : null}
            </section>
            </div> : null}
            {isExportWorkspace && selectedSectionID === "build" && advancedTools ? <details className="export-extra-tools"><summary>{ui("Fontes e localização")}</summary>{advancedTools}</details> : null}
            {isExportWorkspace && selectedSectionID !== "general" ? <ExportRomActions onShowPaths={selectedSectionID !== "build" ? () => navigateToSection("build") : undefined} pathValidation={pathValidation} validating={pathValidationRunning} running={romRunning} onValidatePaths={onValidatePaths} onGenerateRom={onGenerateRom} onPlayProject={onPlayProject} generateDisabled={generateRomDisabled} playDisabled={playProjectDisabled} /> : null}

        </main>
      </div>
    </section>
  );
}
