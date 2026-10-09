import { InterfaceThemeInspector } from "./InterfaceThemeInspector";
import type { InterfaceThemeChange } from "../shared/interfaceThemes";
import { useMemo } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import { deriveDialoguesWorkspacePresentation, type UpdateDialoguesUiFields } from "../shared/dialoguesWorkspace";
import { deriveFontCatalog } from "../shared/fontCatalog";
import { resolveDialogueUiSettings } from "../shared/sceneRuntimeExport";
import { projectAssetReferenceOptions, projectAudioReferenceOptions } from "../shared/projectReferenceOptions";
import { InspectorInfoTip, InspectorNumber } from "./InspectorControls";
import { ProjectReferencePicker, StudioButton } from "./studioUi";
import { useStudioI18n } from "./i18n";
type StudioTranslate = ReturnType<typeof useStudioI18n>["t"];
function dialogueOptionLabel(value: string, t: StudioTranslate): string {
  const labels: Record<string, Parameters<StudioTranslate>[0]> = {
    "Centro": "dialogues.option.positionCenter",
    "Direita": "dialogues.option.positionRight",
    "Esquerda": "dialogues.option.positionLeft",
    "GBA compacta": "dialogues.option.fontCompact",
    "GBA grande": "dialogues.option.fontLarge",
    "GBA padrao": "dialogues.option.fontDefault",
    "Inferior": "dialogues.option.positionBottom",
    "Instantanea": "dialogues.option.speedInstant",
    "Lenta": "dialogues.option.speedSlow",
    "Normal": "dialogues.option.speedNormal",
    "Rapida": "dialogues.option.speedFast",
    "Superior": "dialogues.option.positionTop"
  };

  return labels[value] ? t(labels[value]) : value;
}

export function DialogueAppearanceInspector({ projectData, projectPath, roomId, onUpdateInterfaceTheme, onUpdateDialoguesUi, onImportAssets }: {
  projectData: GBAProjectData;
  projectPath?: string;
  roomId?: string;
  onUpdateInterfaceTheme?(change: InterfaceThemeChange): void;
  onUpdateDialoguesUi(fields: UpdateDialoguesUiFields): void;
  onImportAssets?(): void | Promise<void>;
}): React.ReactElement {
  const { t } = useStudioI18n();
  const resolvedPresentation = useMemo(() => deriveDialoguesWorkspacePresentation(projectData), [projectData]);
  const fontCatalog = resolvedPresentation.fontCatalog ?? deriveFontCatalog(projectData);
  const referenceOptions = { assets: projectAssetReferenceOptions(projectData), audio: projectAudioReferenceOptions(projectData) };
  const characterSoundMissing = Boolean(resolvedPresentation.interfacePanel.characterSound) && !referenceOptions.audio.some(option => option.value === resolvedPresentation.interfacePanel.characterSound);
  const dialogueInterfaceStatus = characterSoundMissing ? t("dialogues.status.reviewAsset") : resolvedPresentation.fontPanel.status;
  const settings = resolveDialogueUiSettings((projectData.settings as Record<string, any>)?.uiDialogs);
  const boxSize = { width: settings.boxWidth, height: settings.boxHeight };
  return <div className="dialogue-appearance-inspector" aria-label="Aparência dos diálogos do projeto">
    {roomId && onUpdateInterfaceTheme ? <InterfaceThemeInspector projectData={projectData} projectPath={projectPath} roomId={roomId} focus="dialogue" onChange={onUpdateInterfaceTheme} /> : null}
    <div className="hud-scope-notice"><span className="dialogue-appearance-scope-title"><strong>Aparência dos diálogos · Projeto</strong><InspectorInfoTip label="Aparência dos diálogos">Estes ajustes alteram o padrão compartilhado dos diálogos. Retrato, texto e sons da fala selecionada ficam em Fala.</InspectorInfoTip></span></div>
              <details className="dialogue-appearance-group"><summary>Texto e som</summary>
                <div className="dialogues-card-title">
                  <h4>{t("dialogues.font.game")}</h4>
                  <span>{dialogueInterfaceStatus}</span>
                </div>
                <div className="dialogues-ui-fields">
                  <label>
                    <span>{t("dialogues.font.label")}</span>
                    <select
                      aria-label={t("dialogues.font.label")}
                      onChange={(event) => onUpdateDialoguesUi({ font: event.currentTarget.value })}
                      value={resolvedPresentation.fontPanel.font}
                    >
                      {!fontCatalog.fonts.some((font) => font.value === resolvedPresentation.fontPanel.font) ? (
                        <option value={resolvedPresentation.fontPanel.font}>{resolvedPresentation.fontPanel.font}</option>
                      ) : null}
                      {fontCatalog.fonts.map((font) => (
                        <option disabled={!font.ready} key={font.id} value={font.value}>
                          {font.name}{font.ready ? "" : ` · ${t("dialogues.interface.importAtlas")}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="dialogues-font-library-summary">
                    <div>
                      <strong>{t("dialogues.interface.fontLibrary")}</strong>
                      <span>{t("dialogues.interface.fontLibrarySummary", { count: fontCatalog.fonts.filter((font) => font.ready).length })}</span>
                    </div>
                    {onImportAssets ? (
                      <StudioButton onClick={() => onImportAssets?.()} variant="secondary">{t("dialogues.interface.importAtlas")}</StudioButton>
                    ) : null}
                  </div>
                  {fontCatalog.activeFont?.warnings.length ? (
                    <p className="dialogues-hud-warning">{fontCatalog.activeFont.warnings.join(" ")}</p>
                  ) : null}
                  <label>
                    <span>{t("dialogues.font.speed")}</span>
                    <select
                      aria-label={t("dialogues.font.speed")}
                      onChange={(event) => onUpdateDialoguesUi({ textSpeed: event.currentTarget.value })}
                      value={resolvedPresentation.fontPanel.textSpeed}
                    >
                      <option value="Lenta">{dialogueOptionLabel("Lenta", t)}</option>
                      <option value="Normal">{dialogueOptionLabel("Normal", t)}</option>
                      <option value="Rapida">{dialogueOptionLabel("Rapida", t)}</option>
                      <option value="Instantanea">{dialogueOptionLabel("Instantanea", t)}</option>
                    </select>
                  </label>
                  <div className="dialogue-reference-field">
                    <span>{t("dialogues.interface.characterSound")}</span>
                    <ProjectReferencePicker
                      actions={onImportAssets ? [{ label: t("dialogues.actions.importAsset"), run: () => onImportAssets?.() }] : []}
                      ariaLabel={t("dialogues.interface.characterSound")}
                      invalidLabel={t("dialogues.interface.characterSoundMissing")}
                      onChange={(characterSound) => onUpdateDialoguesUi({ characterSound })}
                      options={referenceOptions.audio}
                      value={resolvedPresentation.interfacePanel.characterSound}
                    />
                  </div>
                  <label>
                    <span>{t("dialogues.interface.fontColor")}</span>
                    <input
                      aria-label={t("dialogues.interface.fontColor")}
                      onChange={(event) => onUpdateDialoguesUi({ fontColor: event.currentTarget.value })}
                      type="text"
                      value={resolvedPresentation.interfacePanel.fontColor}
                    />
                  </label>
                </div>
              </details>

              <details className="dialogue-appearance-group" open><summary>Caixa e seletor</summary>
                <div className="dialogues-card-title">
                  <h4>{t("dialogues.box.title")}</h4>
                  <span>{t("dialogues.box.badge")}</span>
                </div>
                <div className="dialogues-ui-fields">
                  {!onUpdateInterfaceTheme ? <>
                  <div className="dialogue-reference-field">
                    <span>{t("dialogues.box.label")}</span>
                    <ProjectReferencePicker
                      actions={onImportAssets ? [{ label: t("dialogues.actions.importAsset"), run: () => onImportAssets?.() }] : []}
                      ariaLabel={t("dialogues.box.label")}
                      invalidLabel={t("dialogues.interface.boxMissing")}
                      onChange={(boxImage) => onUpdateDialoguesUi({ boxImage })}
                      options={referenceOptions.assets}
                      value={resolvedPresentation.boxPanel.boxImage}
                    />
                  </div>
                  </> : null}
                  <div className="dialogue-reference-field">
                    <span>{t("dialogues.box.selector")}</span>
                    <ProjectReferencePicker
                      actions={onImportAssets ? [{ label: t("dialogues.actions.importAsset"), run: () => onImportAssets?.() }] : []}
                      ariaLabel={t("dialogues.box.selector")}
                      invalidLabel={t("dialogues.interface.selectorMissing")}
                      onChange={(selectorImage) => onUpdateDialoguesUi({ selectorImage })}
                      options={referenceOptions.assets}
                      value={resolvedPresentation.boxPanel.selectorImage}
                    />
                  </div>
                  <label>
                    <span>{t("dialogues.box.position")}</span>
                    <select
                      aria-label={t("dialogues.box.position")}
                      onChange={(event) => onUpdateDialoguesUi({ boxPosition: event.currentTarget.value })}
                      value={resolvedPresentation.boxPanel.boxPosition}
                    >
                      <option value="Inferior">{dialogueOptionLabel("Inferior", t)}</option>
                      <option value="Superior">{dialogueOptionLabel("Superior", t)}</option>
                      <option value="Centro">{dialogueOptionLabel("Centro", t)}</option>
                    </select>
                  </label>
                  <div className="dialogues-ui-size-grid">
                    <InspectorNumber
                      ariaLabel={t("dialogues.box.width")}
                      label={t("dialogues.box.width")}
                      max={232}
                      min={24}
                      onChange={(boxWidth) => onUpdateDialoguesUi({ boxWidth })}
                      step={8}
                      unit="px"
                      value={boxSize.width}
                    />
                    <InspectorNumber
                      ariaLabel={t("dialogues.box.height")}
                      label={t("dialogues.box.height")}
                      max={128}
                      min={24}
                      onChange={(boxHeight) => onUpdateDialoguesUi({ boxHeight })}
                      step={8}
                      unit="px"
                      value={boxSize.height}
                    />
                  </div>
                </div>
              </details>

              <details className="dialogue-appearance-group"><summary>Retrato, nome e escolhas</summary>
                <div className="dialogues-card-title">
                  <h4>{t("dialogues.chrome.title")}</h4>
                  <span>{t("dialogues.chrome.badge")}</span>
                </div>
                <div className="dialogues-ui-fields">
                  <label className="dialogues-toggle-field">
                    <input
                      checked={resolvedPresentation.chromePanel.showPortrait}
                      onChange={(event) => onUpdateDialoguesUi({ showPortrait: event.currentTarget.checked })}
                      type="checkbox"
                    />
                    <span>{t("dialogues.chrome.showPortrait")}</span>
                  </label>
                  <label>
                    <span>{t("dialogues.chrome.portraitPosition")}</span>
                    <select
                      aria-label={t("dialogues.chrome.portraitPosition")}
                      disabled={!resolvedPresentation.chromePanel.showPortrait}
                      onChange={(event) => onUpdateDialoguesUi({ portraitPosition: event.currentTarget.value })}
                      value={resolvedPresentation.chromePanel.portraitPosition}
                    >
                      <option value="Esquerda">{dialogueOptionLabel("Esquerda", t)}</option>
                      <option value="Direita">{dialogueOptionLabel("Direita", t)}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("dialogues.chrome.portraitLayout")}</span>
                    <select
                      aria-label={t("dialogues.chrome.portraitLayout")}
                      disabled={!resolvedPresentation.chromePanel.showPortrait}
                      onChange={(event) => onUpdateDialoguesUi({ portraitLayout: event.currentTarget.value as "inline" | "fixed_slots" })}
                      value={resolvedPresentation.chromePanel.portraitLayout}
                    >
                      <option value="inline">{t("dialogues.chrome.portraitLayoutInline")}</option>
                      <option value="fixed_slots">{t("dialogues.chrome.portraitLayoutSlots")}</option>
                    </select>
                    <small>{t("dialogues.chrome.portraitLayoutHint")}</small>
                  </label>
                  <label className="dialogues-toggle-field">
                    <input
                      checked={resolvedPresentation.chromePanel.showCharacterName}
                      onChange={(event) => onUpdateDialoguesUi({ showCharacterName: event.currentTarget.checked })}
                      type="checkbox"
                    />
                    <span>{t("dialogues.chrome.showName")}</span>
                  </label>
                  <label>
                    <span>{t("dialogues.chrome.nameMode")}</span>
                    <select
                      aria-label={t("dialogues.chrome.nameMode")}
                      disabled={!resolvedPresentation.chromePanel.showCharacterName}
                      onChange={(event) => onUpdateDialoguesUi({ nameLabelMode: event.currentTarget.value as "inline" | "above" })}
                      value={resolvedPresentation.chromePanel.nameLabelMode}
                    >
                      <option value="inline">{t("dialogues.chrome.nameModeInline")}</option>
                      <option value="above">{t("dialogues.chrome.nameModeAbove")}</option>
                    </select>
                    <small>{t("dialogues.chrome.nameModeHint")}</small>
                  </label>
                  <label>
                    <span>{t("dialogues.interface.choiceStyle")}</span>
                    <select
                      aria-label={t("dialogues.interface.choiceStyle")}
                      onChange={(event) => onUpdateDialoguesUi({ choiceStyle: event.currentTarget.value })}
                      value={resolvedPresentation.interfacePanel.choiceStyle}
                    >
                      <option value="Lista vertical">{t("dialogues.option.choiceStyleList")}</option>
                      <option value="Janela">{t("dialogues.option.choiceStyleWindow")}</option>
                      <option value="Grade">{t("dialogues.option.choiceStyleGrid")}</option>
                    </select>
                  </label>
                </div>
              </details>
  </div>;
}
