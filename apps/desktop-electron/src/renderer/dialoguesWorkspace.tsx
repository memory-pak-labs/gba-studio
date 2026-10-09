import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveDialogueExportSummary,
  deriveDialoguesWorkspaceFilterChips,
  deriveDialoguesWorkspaceValidationIssues,
  filterDialoguesWorkspaceDialogues
} from "../shared/dialoguesWorkspace";
import type {
  DialoguesWorkspaceDialogue,
  DialoguesWorkspacePresentation,
  DialoguesWorkspaceStatusFilter,
  UpdateDialogueFields
} from "../shared/dialoguesWorkspace";
import { useStudioI18n } from "./i18n";
import { translateGameText } from "./offlineTranslator";
import type { ProjectLocale } from "../shared/projectLocalization";
import type { GBAProjectData } from "../shared/projectFile";
import { resolveAssetURL } from "../shared/spriteAssetURL";
import { WorkspaceEmptyState } from "./studioUi";
import { dialogueDisplayTitle, dialogueReviewBackground, dialogueReviewScenes } from "./dialoguesWorkspaceReview";
import { resolveSceneDialogueUiSettings } from "../shared/interfaceThemes";
import { MessageSquare, Search, ChevronLeft, ChevronRight, Play, Square, ExternalLink } from "lucide-react";
import { dialoguePreviewLayoutForSettings } from "../shared/sceneRuntimeExport";
import { DialoguePreviewSnapshot, deriveDialoguePreviewPages } from "./dialoguePreviewSnapshot";
import type { DialogueUiSettingsContract } from "../shared/sceneRuntimeExport";

interface DialoguesWorkspaceProps {
  presentation: DialoguesWorkspacePresentation | null;
  projectData?: GBAProjectData;
  projectPath?: string;
  focusedDialogueKey?: string | null;
  focusRequestID?: number | null;
  onEditDialogue?(key: string, sceneID?: string): void;
  onOpenDialogueEvent(eventName: string): void;
  onExportDialogue(key: string): void;
  onUpdateDialogue(key: string, fields: UpdateDialogueFields): void;
}

function projectAssetURL(
  projectData: GBAProjectData | undefined,
  projectPath: string | undefined,
  assetName: string
): string | null {
  const assets = Array.isArray(projectData?.assets) ? projectData.assets : [];
  const asset = assets.find((candidate) => {
    return typeof candidate === "object" && candidate !== null && candidate.name === assetName;
  });
  if (!asset || typeof asset !== "object") return null;
  const metadata = typeof asset.metadata === "object" && asset.metadata !== null
    ? asset.metadata as Record<string, unknown>
    : {};
  const source = typeof metadata.source === "string"
    ? metadata.source
    : typeof asset.relativePath === "string"
      ? asset.relativePath
      : null;
  const bundledDefaultAsset = typeof asset.bundledDefaultAsset === "string"
    ? asset.bundledDefaultAsset
    : typeof metadata.bundledDefaultAsset === "string"
      ? metadata.bundledDefaultAsset
      : null;
  return resolveAssetURL(projectPath, source, bundledDefaultAsset);
}

function projectAssetSpriteFrame(
  projectData: GBAProjectData | undefined,
  assetName: string
): { width: number; height: number } | undefined {
  if (!assetName) return undefined;
  const asset = (Array.isArray(projectData?.assets) ? projectData.assets : []).find((candidate) => {
    return typeof candidate === "object" && candidate !== null && candidate.name === assetName;
  });
  if (!asset || typeof asset !== "object" || typeof asset.metadata !== "object" || asset.metadata === null) {
    return undefined;
  }
  const metadata = asset.metadata as Record<string, unknown>;
  const width = typeof metadata.frameWidth === "number" && Number.isFinite(metadata.frameWidth) && metadata.frameWidth > 0
    ? Math.floor(metadata.frameWidth)
    : undefined;
  const height = typeof metadata.frameHeight === "number" && Number.isFinite(metadata.frameHeight) && metadata.frameHeight > 0
    ? Math.floor(metadata.frameHeight)
    : undefined;
  return width && height ? { width, height } : undefined;
}

function choiceTranslationsText(dialogue: DialoguesWorkspaceDialogue): string {
  return dialogue.choices.map((choice) => choice.translation).join("\n");
}

function dialogueBoxSize(boxSize: string): { width: number; height: number } {
  const match = boxSize.match(/(\d+)\s*x\s*(\d+)/i);
  return {
    width: match ? Number(match[1]) : 224,
    height: match ? Number(match[2]) : 40
  };
}

type StudioTranslate = ReturnType<typeof useStudioI18n>["t"];

function dialogueFilterLabel(status: DialoguesWorkspaceStatusFilter, t: StudioTranslate): string {
  const labels = {
    all: "dialogues.filter.all",
    choices: "dialogues.filter.choices",
    unused: "dialogues.filter.unused",
    used: "dialogues.filter.used",
    warning: "dialogues.filter.warning"
  } as const;

  return t(labels[status]);
}

function projectLocaleLabel(locale: string): string {
  return {
    "pt-BR": "Português (Brasil)",
    en: "English",
    es: "Español",
    fr: "Français",
    hi: "हिन्दी",
    "zh-CN": "中文 (简体)",
    ar: "العربية",
    ru: "Русский",
    de: "Deutsch",
    ja: "日本語",
    ko: "한국어",
    it: "Italiano",
    pl: "Polski",
    nl: "Nederlands"
  }[locale] ?? locale;
}

export function DialoguesWorkspace({
  presentation,
  projectData,
  projectPath,
  focusedDialogueKey,
  focusRequestID,
  onOpenDialogueEvent,
  onEditDialogue,
  onExportDialogue,
  onUpdateDialogue,
}: DialoguesWorkspaceProps): React.ReactElement {
  const { t } = useStudioI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DialoguesWorkspaceStatusFilter>("all");
  const [characterFilter, setCharacterFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const appliedFocusRequest = useRef<string | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [authoringMode, setAuthoringMode] = useState<"review" | "translation">("review");
  const [translationBusyKey, setTranslationBusyKey] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState("");
  const [previewLocale, setPreviewLocale] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [previewZoom, setPreviewZoom] = useState<"fit" | "1" | "2">("fit");
  const [testingText, setTestingText] = useState(false);
  const [visibleCharacters, setVisibleCharacters] = useState<number | undefined>();
  const [previewSceneID, setPreviewSceneID] = useState<string | null>(null);
  const scenes = useMemo(() => dialogueReviewScenes(projectData), [projectData]);
  const visibleDialogues = useMemo(() => {
    const dialogues = presentation?.dialogues ?? [];
    return filterDialoguesWorkspaceDialogues(dialogues, {
      query: searchQuery,
      status: statusFilter,
      character: characterFilter
    });
  }, [presentation?.dialogues, searchQuery, statusFilter, characterFilter]);
  const filterChips = useMemo(
    () => (presentation ? deriveDialoguesWorkspaceFilterChips(presentation, statusFilter) : []),
    [presentation, statusFilter]
  );
  useEffect(() => {
    if (!presentation || !focusedDialogueKey) return;
    const dialogue = presentation.dialogues.find((item) => item.key === focusedDialogueKey);
    if (!dialogue) return;
    const request = `${focusRequestID ?? "none"}:${focusedDialogueKey}`;
    if (appliedFocusRequest.current === request) return;
    appliedFocusRequest.current = request;
    setSearchQuery("");
    setStatusFilter("all");
    setCharacterFilter("");
    setSelectedKey(dialogue.key);
  }, [focusedDialogueKey, focusRequestID, presentation]);
  const activeDialogue =
    visibleDialogues.find((dialogue) => dialogue.key === selectedKey) ??
    visibleDialogues[0] ?? null;
  const linkedScenes = scenes.filter(scene => activeDialogue && scene.usages.has(activeDialogue.key));
  const activeScene = linkedScenes.find(scene => scene.id === previewSceneID) ?? linkedScenes[0];
  const sourceLocale = presentation?.localization.sourceLocale ?? "pt-BR";
  const language = presentation?.localization.enabledLocales.includes(previewLocale as ProjectLocale) ? previewLocale! : presentation?.localization.defaultLocale ?? sourceLocale;
  const shownText = activeDialogue ? (language === sourceLocale ? activeDialogue.text : activeDialogue.translations[language as ProjectLocale] || activeDialogue.text) : "";
  const shownChoices = activeDialogue?.choices.map((choice, index) => language === sourceLocale ? choice.label
    : activeDialogue.choiceTranslationsByLocale[language as ProjectLocale]?.[index] || choice.label) ?? [];
  const backgroundURL = projectAssetURL(projectData, projectPath, dialogueReviewBackground(activeScene, activeDialogue?.key ?? ""));
  const groups = new Map<string, { title: string; dialogues: DialoguesWorkspaceDialogue[] }>();
  for (const dialogue of visibleDialogues) {
    const scene = scenes.find(scene => scene.usages.has(dialogue.key));
    const groupKey = scene?.id ?? (dialogue.usages.length ? "events" : "unused");
    const group = groups.get(groupKey) ?? { title: scene?.title ?? t(dialogue.usages.length ? "dialogues.review.events" : "dialogues.filter.unused"), dialogues: [] };
    group.dialogues.push(dialogue); groups.set(groupKey, group);
  }
  const validationIssues = useMemo(
    () => (presentation ? deriveDialoguesWorkspaceValidationIssues(presentation) : []),
    [presentation]
  );
  const exportSummary = deriveDialogueExportSummary(activeDialogue);
  const preview = activeDialogue
    ? {
        speaker: activeDialogue.character,
        portrait: activeDialogue.portrait,
        portraitSlot: activeDialogue.portraitSlot,
        emote: activeDialogue.emote,
        text: shownText,
        choices: shownChoices
      }
    : presentation?.preview;
  const boxSize = presentation ? dialogueBoxSize(presentation.boxPanel.boxSize) : { width: 224, height: 40 };
  const dialoguePortraitURL = presentation
    ? projectAssetURL(projectData, projectPath, preview?.portrait ?? "")
    : null;
  const dialoguePortraitFrame = presentation
    ? projectAssetSpriteFrame(projectData, preview?.portrait ?? "")
    : undefined;
  const dialogueEmoteURL = presentation
    ? projectAssetURL(projectData, projectPath, preview?.emote ?? "")
    : null;
  const previewSpeaker = preview?.speaker?.trim() || t("dialogues.preview.noCharacter");
  const defaultPortraitSlot = presentation?.chromePanel.portraitPosition === "Direita"
    ? "Direita"
    : "Esquerda";
  const previewPortraitSlot = preview?.portraitSlot === "Direita" || preview?.portraitSlot === "Esquerda"
    ? preview.portraitSlot
    : defaultPortraitSlot;
  const defaultDialogueSettings = useMemo<DialogueUiSettingsContract>(() => ({
    boxImage: presentation?.boxPanel.boxImage ?? "ui/dialogue_box.png",
    selectorImage: presentation?.boxPanel.selectorImage ?? "ui/dialogue_cursor.png",
    font: presentation?.fontPanel.font ?? "GBA padrao",
    boxPosition: presentation?.boxPanel.boxPosition ?? "Inferior",
    boxWidth: boxSize.width,
    boxHeight: boxSize.height,
    showPortrait: presentation?.chromePanel.showPortrait ?? true,
    showCharacterName: presentation?.chromePanel.showCharacterName ?? true,
    portraitPosition: presentation?.chromePanel.portraitPosition ?? "Esquerda",
    portraitLayout: presentation?.chromePanel.portraitLayout ?? "inline",
    nameLabelMode: presentation?.chromePanel.nameLabelMode ?? "inline",
    textSpeed: presentation?.fontPanel.textSpeed ?? "Normal"
  }), [
    boxSize.height,
    boxSize.width,
    presentation?.boxPanel.boxImage,
    presentation?.boxPanel.boxPosition,
    presentation?.boxPanel.selectorImage,
    presentation?.chromePanel.nameLabelMode,
    presentation?.chromePanel.portraitLayout,
    presentation?.chromePanel.portraitPosition,
    presentation?.chromePanel.showCharacterName,
    presentation?.chromePanel.showPortrait,
    presentation?.fontPanel.font,
    presentation?.fontPanel.textSpeed
  ]);

  const dialogueSettings = useMemo(() => projectData && activeScene
    ? resolveSceneDialogueUiSettings(projectData, activeScene.id) : defaultDialogueSettings,
    [projectData, activeScene?.id, defaultDialogueSettings]);
  const previewPages = useMemo(() => deriveDialoguePreviewPages(dialogueSettings,
    dialoguePreviewLayoutForSettings(dialogueSettings, previewSpeaker, previewPortraitSlot, Boolean(dialoguePortraitURL), dialoguePortraitFrame),
    previewSpeaker, shownText, shownChoices,
    dialogueSettings.showPortrait && dialogueSettings.portraitLayout === "inline" && dialoguePortraitURL ? Math.ceil((dialoguePortraitFrame?.width ?? 32) / 8) : 0),
    [dialogueSettings, previewSpeaker, previewPortraitSlot, dialoguePortraitURL, dialoguePortraitFrame?.width, dialoguePortraitFrame?.height, shownText, shownChoices.join("\n")]);
  const currentPage = Math.min(pageIndex, previewPages.length - 1);
  const page = previewPages[currentPage];
  useEffect(() => {
    setPageIndex(0); setTestingText(false); setVisibleCharacters(undefined);
  }, [activeDialogue?.key, language, shownText, dialogueSettings, previewSceneID]);
  useEffect(() => {
    if (!testingText) return;
    const total = page.lines.reduce((sum, line) => sum + Array.from(line).length, 0);
    let count = 0;
    const delay = /lento|slow/i.test(dialogueSettings.textSpeed) ? 65 : /rapido|rápido|fast/i.test(dialogueSettings.textSpeed) ? 16 : 32;
    const timer = window.setInterval(() => {
      count += 1; setVisibleCharacters(count);
      if (count >= total) { setTestingText(false); setVisibleCharacters(undefined); }
    }, delay);
    return () => window.clearInterval(timer);
  }, [testingText, currentPage, page.lines.join("\n"), dialogueSettings.textSpeed]);
  const selectPage = (index: number): void => { setPageIndex(index); setTestingText(false); setVisibleCharacters(undefined); };
  const navigateTabs = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const mode = event.key === "Home" ? "review" : event.key === "End" ? "translation"
      : authoringMode === "review" ? "translation" : "review";
    setAuthoringMode(mode);
    event.currentTarget.querySelector<HTMLButtonElement>(`#dialogues-authoring-tab-${mode}`)?.focus();
  };

  const translateDialogueOffline = async (dialogue: DialoguesWorkspaceDialogue): Promise<void> => {
    setTranslationBusyKey(dialogue.key);
    setTranslationError("");
    try {
      const [translation, ...choiceTranslations] = await Promise.all([
        translateGameText({
          text: dialogue.text,
          from: presentation!.localization.sourceLocale,
          to: dialogue.translationLanguageCode as ProjectLocale
        }),
        ...dialogue.choices.map((choice) => translateGameText({
          text: choice.label,
          from: presentation!.localization.sourceLocale,
          to: dialogue.translationLanguageCode as ProjectLocale
        }))
      ]);
      onUpdateDialogue(dialogue.key, {
        translationLanguageCode: dialogue.translationLanguageCode,
        translation,
        choiceTranslations,
        translationStatus: "draft-ai"
      });
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : t("dialogues.error.offlineTranslation"));
    } finally {
      setTranslationBusyKey(null);
    }
  };

  if (!presentation) {
    return (
      <WorkspaceEmptyState
        title={t("dialogues.empty.title")}
        description={t("dialogues.empty.description")}
      />
    );
  }
  const resolvedPresentation = presentation;
  return (
    <section aria-label={t("dialogues.workspaceAria")} className="dialogues-workspace">
      <div className="dialogues-layout dialogues-review-layout">
        <aside className="dialogues-rail" aria-label={t("dialogues.library")}>
          <div className="dialogues-panel-title"><h3>{t("workspace.dialogues")}</h3><span>{presentation.dialogues.length}</span></div>
          <label className="dialogues-search dialogues-review-search"><Search aria-hidden="true" size={16}/><input aria-label={t("dialogues.search")} onChange={event => setSearchQuery(event.currentTarget.value)} placeholder={t("dialogues.searchPlaceholder")} type="search" value={searchQuery}/></label>
          <select className="dialogues-character-filter" aria-label={t("dialogues.filter.character")} onChange={event => setCharacterFilter(event.currentTarget.value)} value={characterFilter}>
            <option value="">{t("dialogues.filter.allCharacters")}</option>
            {presentation.characters.map(character => <option key={character.name} value={character.name}>{character.name} ({character.dialogueCount})</option>)}
          </select>
          <div className="dialogues-usage-filter" aria-label={t("dialogues.filter.status")}>
            {filterChips.filter(chip => ["all", "used", "unused"].includes(chip.value)).map(chip => <button aria-label={t("dialogues.filter.chip", { label: dialogueFilterLabel(chip.value, t) })} aria-pressed={chip.isActive} key={chip.id} onClick={() => setStatusFilter(chip.value)} type="button">{dialogueFilterLabel(chip.value, t)}</button>)}
          </div>
          <details className="dialogues-additional-filters"><summary>{t("dialogues.review.moreFilters")}</summary>{filterChips.filter(chip => ["warning", "choices"].includes(chip.value)).map(chip => <button aria-pressed={chip.isActive} key={chip.id} onClick={() => setStatusFilter(chip.value)} type="button">{dialogueFilterLabel(chip.value, t)} ({chip.count})</button>)}</details>
          <div className="dialogues-list" role="list" aria-label={t("dialogues.list")}>
            {visibleDialogues.length ? [...groups.entries()].map(([id, group]) => <section className="dialogues-scene-group" key={id}>
              <h4>{group.title}</h4>
              {group.dialogues.map(dialogue => <button aria-label={`${dialogue.key} · ${dialogue.character}`} aria-pressed={activeDialogue?.key === dialogue.key} className={activeDialogue?.key === dialogue.key ? "dialogue-row active" : "dialogue-row"} key={dialogue.key} onClick={() => setSelectedKey(dialogue.key)} title={dialogue.key} type="button">
                <span className="dialogues-row-icon">{projectAssetURL(projectData, projectPath, dialogue.portrait) ? <img src={projectAssetURL(projectData, projectPath, dialogue.portrait)!} alt=""/> : <MessageSquare aria-hidden="true" size={18}/>}</span>
                <span className="dialogues-row-copy"><strong>{dialogueDisplayTitle(dialogue.key, scenes.find(scene => scene.usages.has(dialogue.key)))}</strong><span>{dialogue.character}</span><small>{dialogue.text || t("dialogues.preview.noDialogue")}</small>{dialogue.warnings.length ? <em>{t("dialogues.warningCount", { count: dialogue.warnings.length })}</em> : null}</span>
              </button>)}
            </section>) : <p className="muted">{t("dialogues.noMatches")}</p>}
          </div>
          <div className="dialogues-library-status">{t("dialogues.filter.summary", { visible: visibleDialogues.length, total: presentation.dialogues.length })} · {t("dialogues.translationComplete", { completion: presentation.summary.translationCompletion })}</div>
        </aside>
        <section className="dialogues-editor" aria-label={t("dialogues.editor")}>
          <header className="dialogues-review-header">
            <div><h2>{activeDialogue ? dialogueDisplayTitle(activeDialogue.key, activeScene) : t("workspace.dialogues")}</h2><p>{activeDialogue?.key ?? t("dialogues.selectToEdit")}</p></div>
            {activeDialogue ? <span className="dialogues-speaker-chip"><MessageSquare aria-hidden="true" size={16}/>{activeDialogue.character}</span> : null}
            <div className="dialogues-editor-actions"><button aria-expanded={validationOpen} onClick={() => setValidationOpen(open => !open)} type="button">{t("dialogues.review.verify")}{validationIssues.some(issue => issue.severity !== "info") ? ` (${validationIssues.filter(issue => issue.severity !== "info").length})` : ""}</button><button className="dialogues-primary-action" disabled={!activeDialogue || !onEditDialogue} onClick={() => activeDialogue && (activeScene ? onEditDialogue?.(activeDialogue.key, activeScene.id) : onEditDialogue?.(activeDialogue.key))} type="button">{t("dialogues.review.editScene")}</button></div>
          </header>
          <div className="dialogues-review-tabbar">
            <div className="dialogues-authoring-tabs" role="tablist" aria-label={t("dialogues.review.tabs")} onKeyDown={navigateTabs}>
              <button id="dialogues-authoring-tab-review" aria-controls="dialogues-authoring-panel-review" aria-selected={authoringMode === "review"} tabIndex={authoringMode === "review" ? 0 : -1} onClick={() => setAuthoringMode("review")} role="tab" type="button">{t("dialogues.review.textTab")}</button>
              <button id="dialogues-authoring-tab-translation" aria-controls="dialogues-authoring-panel-translation" aria-selected={authoringMode === "translation"} tabIndex={authoringMode === "translation" ? 0 : -1} onClick={() => setAuthoringMode("translation")} role="tab" type="button">{t("dialogues.authoring.translation")}</button>
            </div>
            <select aria-label={t("dialogues.review.previewLanguage")} onChange={event => setPreviewLocale(event.currentTarget.value)} value={language}>{presentation.localization.enabledLocales.map(locale => <option key={locale} value={locale}>{projectLocaleLabel(locale)}</option>)}</select>
          </div>
          {validationOpen ? <div className="dialogues-validation-panel" aria-label={t("dialogues.diagnostics")}>{validationIssues.map(issue => <button className={issue.severity === "error" ? "danger-chip" : issue.severity === "warning" ? "warning-chip" : ""} key={issue.id} onClick={() => { if (issue.dialogueKey) { setSearchQuery(""); setStatusFilter("all"); setCharacterFilter(""); setSelectedKey(issue.dialogueKey); } }} type="button">{issue.message}</button>)}</div> : null}
          <div className="dialogues-review-content">
          {activeDialogue && authoringMode === "review" ? (
            <section id="dialogues-authoring-panel-review" role="tabpanel" aria-labelledby="dialogues-authoring-tab-review" className="dialogues-text-panel">
              <h3>{t("dialogues.review.textTitle")}</h3>
              <p className="dialogues-script-text">{shownText || "—"}</p>
              {language !== sourceLocale && !activeDialogue.translations[language as ProjectLocale] ? <p role="status" className="muted">{t("dialogues.review.translationFallback")}</p> : null}
              <div className="dialogues-pages-heading"><h3>{t("dialogues.review.pages")}</h3><span>{t("dialogues.review.pageCount", { count: previewPages.length })}</span></div>
              <div className="dialogues-page-list" aria-label={t("dialogues.review.pages")}>{previewPages.map((item, index) => <button aria-pressed={currentPage === index} aria-label={t("dialogues.review.page", { page: index + 1 })} key={index} onClick={() => selectPage(index)} type="button"><strong>{index + 1}</strong><span>{item.lines.join(" ") || "—"}</span></button>)}</div>
              <div className="dialogues-choices-summary">{activeDialogue.choices.length ? <><h3>{t("dialogues.field.choices")}</h3><ol>{shownChoices.map((choice, index) => <li key={index}>{choice}</li>)}</ol></> : <span>{t("dialogues.review.noChoices")}</span>}</div>
              {activeDialogue.warnings.length ? <p role="alert">{activeDialogue.warnings.join(" · ")}</p> : null}
              <section className="dialogues-review-usages" aria-label={t("dialogues.usedBy")}><h3>{t("dialogues.usedBy")}</h3>
                {activeDialogue.usages.length ? activeDialogue.usages.map((usage, index) => <div className="dialogues-usage-entry" key={`${usage.eventID}-${index}`}><MessageSquare aria-hidden="true" size={20}/><span><strong>{usage.eventName}</strong><small>{usage.command}</small></span><button disabled={usage.verb === "scene_dialogue" && !onEditDialogue} onClick={() => usage.verb === "scene_dialogue" ? onEditDialogue?.(activeDialogue.key, usage.eventID) : onOpenDialogueEvent(usage.eventName)} type="button"><ExternalLink aria-hidden="true" size={14}/>{t(usage.verb === "scene_dialogue" ? "dialogues.review.openScene" : "dialogues.actions.openEvent")}</button></div>) : <p className="muted">{t("dialogues.review.noUsage")}</p>}
              </section>
            </section>
          ) : activeDialogue ? (
            <section
              aria-labelledby="dialogues-authoring-tab-translation"
              aria-label={t("dialogues.authoring.translation")}
              className="dialogues-translation-table"
              id="dialogues-authoring-panel-translation"
              role="tabpanel"
              tabIndex={0}
            >
              <header className="dialogues-translation-heading">
                <h4>{t("dialogues.translation")}</h4>
                <span>{visibleDialogues.length} diálogo(s) visível(is) · {t("dialogues.translationComplete", { completion: presentation.summary.translationCompletion })}</span>
              </header>
              {translationError ? <p role="alert">{translationError}</p> : null}
              {visibleDialogues.map((dialogue) => (
                <details
                  className="dialogues-translation-row"
                  key={dialogue.key}
                  open={dialogue.key === activeDialogue?.key}
                >
                  <summary className="dialogues-translation-row-summary">
                    <strong>{dialogue.key}</strong>
                    <span>{dialogue.character} · {projectLocaleLabel(dialogue.translationLanguageCode)}</span>
                  </summary>
                  <div className="dialogues-translation-row-body">
                    <div className="dialogues-translation-source">
                      <span>{t("dialogues.field.text")}</span>
                      <p>{dialogue.text}</p>
                    </div>
                    <label>
                      <span>{t("dialogues.field.translation")}</span>
                      <textarea
                        aria-label={`Tradução de ${dialogue.key}`}
                        onChange={(event) => onUpdateDialogue(dialogue.key, { translationLanguageCode: dialogue.translationLanguageCode, translation: event.currentTarget.value })}
                        rows={3}
                        value={dialogue.translation}
                      />
                    </label>
                    {dialogue.choices.length ? <label><span>{t("dialogues.field.choiceTranslations")}</span><textarea aria-label={`Tradução das escolhas de ${dialogue.key}`} rows={3} value={choiceTranslationsText(dialogue)} onChange={event => onUpdateDialogue(dialogue.key, { translationLanguageCode: dialogue.translationLanguageCode, choiceTranslations: event.currentTarget.value.split("\n") })} /></label> : null}
                    <div className="dialogues-translation-actions">
                      <label>
                        <span>{t("dialogues.field.translationLanguage")}</span>
                        <select
                          aria-label={`Idioma de ${dialogue.key}`}
                          onChange={(event) => onUpdateDialogue(dialogue.key, { translationLanguageCode: event.currentTarget.value })}
                          value={dialogue.translationLanguageCode}
                        >
                          {resolvedPresentation.localization.enabledLocales
                            .filter((locale) => locale !== resolvedPresentation.localization.sourceLocale)
                            .map((locale) => <option key={locale} value={locale}>{projectLocaleLabel(locale)}</option>)}
                        </select>
                      </label>
                      <button type="button" onClick={() => onUpdateDialogue(dialogue.key, { translationLanguageCode: dialogue.translationLanguageCode, translationStatus: "approved" })}>Marcar tradução como revisada</button>
                      <button type="button" disabled={!onEditDialogue} onClick={() => onEditDialogue?.(dialogue.key)}>Editar origem no Editor</button>
                      <button
                        aria-label={t("dialogues.translation.offlineAria", { key: dialogue.key })}
                        disabled={translationBusyKey !== null || !dialogue.text.trim()}
                        onClick={() => void translateDialogueOffline(dialogue)}
                        type="button"
                      >
                        {translationBusyKey === dialogue.key ? t("dialogues.translation.translating") : t("dialogues.translation.offline")}
                      </button>
                    </div>
                  </div>
                </details>
              ))}
            </section>
          ) : (
            <p className="muted">{t(presentation.dialogues.length ? "dialogues.noMatches" : "dialogues.noDialogues")}</p>
          )}

          {activeDialogue ? <section className="dialogues-preview-panel dialogues-review-preview" aria-label={t("dialogues.preview.title")}>
            <div className="dialogues-preview-title"><h3>{t("dialogues.preview.title")}</h3><span>240 × 160 px</span><div className="dialogues-preview-zoom" aria-label={t("dialogues.review.zoom")}>{(["1", "2", "fit"] as const).map(zoom => <button aria-pressed={previewZoom === zoom} key={zoom} onClick={() => setPreviewZoom(zoom)} type="button">{zoom === "fit" ? t("files.preview.fit") : `${zoom}×`}</button>)}</div></div>
            {linkedScenes.length > 1 ? <select aria-label={t("dialogues.review.previewScene")} value={activeScene?.id ?? ""} onChange={event => setPreviewSceneID(event.currentTarget.value)}>{linkedScenes.map(scene => <option key={scene.id} value={scene.id}>{scene.title}</option>)}</select> : null}
            <div className="dialogues-preview-viewport" data-zoom={previewZoom}>
              <div className="dialogues-preview-stage" style={previewZoom === "fit" ? undefined : { width: 240 * Number(previewZoom), height: 160 * Number(previewZoom) }}>
                {backgroundURL ? <img className="dialogues-preview-background" alt={t("dialogues.review.sceneBackground", { scene: activeScene?.title ?? "" })} src={backgroundURL}/> : null}
                <DialoguePreviewSnapshot
                  boxImageURL={projectAssetURL(projectData, projectPath, dialogueSettings.boxImage)} boxSource={projectAssetURL(projectData, projectPath, dialogueSettings.boxImage)}
                  choices={shownChoices} emoteAlt={t("dialogues.field.emote")} emoteImageURL={dialogueEmoteURL}
                  fontImageURL={projectAssetURL(projectData, projectPath, dialogueSettings.font)} noDialogueLabel={t("dialogues.review.previewText", { character: previewSpeaker, text: shownText })}
                  overflowLabel={t("dialogues.preview.overflow")} portraitAlt={t("dialogues.field.portrait")}
                  portraitImageURL={dialoguePortraitURL} portraitFrameWidth={dialoguePortraitFrame?.width} portraitFrameHeight={dialoguePortraitFrame?.height}
                  portraitSlot={previewPortraitSlot} selectorImageURL={projectAssetURL(projectData, projectPath, dialogueSettings.selectorImage)} settings={dialogueSettings}
                  speaker={previewSpeaker} text={shownText} transparentBackground={Boolean(backgroundURL)} pageIndex={currentPage} visibleCharacters={visibleCharacters}/>
              </div>
            </div>
            <div className="dialogues-preview-pagination"><button aria-label={t("dialogues.review.previousPage")} disabled={currentPage === 0} onClick={() => selectPage(currentPage - 1)} type="button"><ChevronLeft aria-hidden="true" size={18}/></button><span aria-live="polite">{t("dialogues.review.pageOf", { page: currentPage + 1, count: previewPages.length })}</span><button aria-label={t("dialogues.review.nextPage")} disabled={currentPage >= previewPages.length - 1} onClick={() => selectPage(currentPage + 1)} type="button"><ChevronRight aria-hidden="true" size={18}/></button><button className="dialogues-test-text" aria-pressed={testingText} onClick={() => { setVisibleCharacters(testingText ? undefined : 0); setTestingText(!testingText); }} type="button">{testingText ? <Square aria-hidden="true" size={16}/> : <Play aria-hidden="true" size={16}/>} {t(testingText ? "dialogues.review.stopTest" : "dialogues.review.testText")}</button></div>
            <p className="dialogues-preview-caption">{t("dialogues.review.frozenPreview")}</p>
            <details className="dialogues-preview-details"><summary>{t("dialogues.review.appearanceSound")}</summary><dl><div><dt>{t("dialogues.field.textSound")}</dt><dd>{activeDialogue.textSound || "—"}</dd></div><div><dt>{t("dialogues.field.confirmSound")}</dt><dd>{activeDialogue.confirmSound || "—"}</dd></div><div><dt>{t("dialogues.field.portrait")}</dt><dd>{activeDialogue.portrait || "—"}</dd></div><div><dt>{t("dialogues.review.box")}</dt><dd>{dialogueSettings.boxImage} · {dialogueSettings.boxWidth} × {dialogueSettings.boxHeight}</dd></div></dl><p className="muted">{t("dialogues.review.editHint")}</p></details>
            {exportSummary ? <details className="dialogues-preview-details"><summary>{t("dialogues.review.exportDetails")}</summary><p>{exportSummary.fileName} · {exportSummary.usageCount} {t("dialogues.health.usages")}</p><button onClick={() => onExportDialogue(activeDialogue.key)} type="button">{t("dialogues.actions.exportJson")}</button></details> : null}
          </section> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
