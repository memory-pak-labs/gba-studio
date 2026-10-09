import { ChevronRight, Info, RotateCcw, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import type { SettingsEditableField, SettingsEditableValue, SettingsSectionID, SettingsWorkspaceSection } from "../shared/settingsWorkspace";
import { deriveSettingsSectionChangeSummary } from "../shared/settingsWorkspace";
import { useStudioI18n, type StudioTranslationKey } from "./i18n";

interface SceneDefaultsSectionProps {
  section: SettingsWorkspaceSection;
  title: string;
  detail: string;
  icon: LucideIcon;
  primaryFields: SettingsEditableField[];
  advancedFields: SettingsEditableField[];
  playerField?: SettingsEditableField;
  backgroundFields?: SettingsEditableField[];
  extraContent?: ReactNode;
  resetPending: boolean;
  onRequestReset(): void;
  onCancelReset(): void;
  onConfirmReset(): void;
  onUpdateSetting(sectionID: SettingsSectionID, key: string, value: SettingsEditableValue): void;
  onApplySettingsPreset?(sectionID: SettingsSectionID, changes: Array<{ fieldKey: string; value: SettingsEditableValue }>): void;
  renderField(field: SettingsEditableField): ReactElement;
  polish(value: string): string;
}

const PLATFORM_ABILITIES = ["doubleJump", "wallJump", "wallSlide", "ladders", "changeDirectionInAir", "dash"];
const PLATFORM_DETAILS = new Set(["airControl", "dropThrough", "dashStyle"]);
const BUTTON_LABELS: Record<string, StudioTranslationKey> = {
  interactButton: "settings.scene.interact", jumpButton: "settings.scene.jump", runButton: "settings.scene.run"
};
const GBA_BUTTONS = ["A", "B", "L", "R", "Start", "Select"];
const PLATFORM_PRESET_HINTS: StudioTranslationKey[] = ["settings.scene.presetHint.0", "settings.scene.presetHint.1", "settings.scene.presetHint.2"];

/** Presents existing settings; storage, presets and scene overrides retain their contracts. */
export function SceneDefaultsSection({ section, title, detail, icon: Icon, primaryFields, advancedFields,
  playerField, backgroundFields = [], extraContent, resetPending, onRequestReset, onCancelReset, onConfirmReset,
  onUpdateSetting, onApplySettingsPreset, renderField, polish }: SceneDefaultsSectionProps): ReactElement {
  const { t } = useStudioI18n();
  const isPlatformer = section.id === "platformer";
  const details = [...advancedFields, ...primaryFields.filter(field => isPlatformer && PLATFORM_DETAILS.has(field.key))];
  const buttons = primaryFields.filter(field => field.key in BUTTON_LABELS);
  const abilities = primaryFields.filter(field => field.type === "boolean" && !PLATFORM_DETAILS.has(field.key));
  if (isPlatformer) abilities.sort((a, b) => PLATFORM_ABILITIES.indexOf(a.key) - PLATFORM_ABILITIES.indexOf(b.key));
  const core = primaryFields.filter(field => !buttons.includes(field) && !abilities.includes(field) && !details.includes(field));
  const changeSummary = deriveSettingsSectionChangeSummary(section);

  return <section className="scene-defaults-page" id={`settings-section-${section.id}`} role="region" aria-label={`Editar ${title}`}>
    <header className="scene-defaults-header">
      <span className="scene-defaults-icon" aria-hidden="true"><Icon size={28} /></span>
      <div className="scene-defaults-heading">
        <div><h2>{title}</h2><span className="scene-defaults-scope">{t("settings.scene.scope")}</span></div>
        <p>{isPlatformer ? t("settings.scene.platformerSubtitle") : detail}</p>
      </div>
      <button className="scene-defaults-reset" aria-label={`Restaurar padrão de ${title}`} onClick={onRequestReset} type="button"><RotateCcw size={16} aria-hidden="true" />{t("settings.interface.reset")}</button>
    </header>
    <p className="scene-defaults-note" role="note"><Info size={17} aria-hidden="true" />{t("settings.scene.overrideHint")}</p>
    {resetPending ? <section className="settings-reset-confirmation" aria-label="Confirmar restauração dos ajustes">
      <strong>Restaurar {title}?</strong>
      <p>{changeSummary.changedCount ? polish(changeSummary.changedFields.join(", ")) : "Esta seção já usa os valores padrão."}</p>
      <div><button onClick={onCancelReset} type="button">Cancelar</button><button aria-label="Confirmar restauração" onClick={onConfirmReset} type="button">Restaurar</button></div>
    </section> : null}

    {section.intentGroups.length ? <section className="scene-defaults-presets" aria-label={`Ajustes por intenção de ${title}`}>
      <h3>{t(isPlatformer ? "settings.scene.movement" : "settings.scene.quick")}</h3>
      {section.intentGroups.map((group, index) => {
        const groupID = `scene-preset-${section.id}-${index}`;
        const selected = group.options.find(option => option.applied);
        return <div className="scene-defaults-preset-row" key={group.title}>
          <div className="scene-defaults-copy"><strong id={groupID}>{polish(group.title)}</strong><p>{isPlatformer ? t(PLATFORM_PRESET_HINTS[index] ?? "settings.scene.quick") : selected ? polish(selected.detail) : t("settings.scene.custom")}</p></div>
          <div>
            <div className="scene-defaults-segments" role="group" aria-labelledby={groupID}>
              {group.options.map(option => <button aria-label={`Aplicar ${polish(option.title)} em ${title}`} aria-pressed={option.applied} title={polish(option.detail)} key={option.id} type="button" onClick={() => onApplySettingsPreset ? onApplySettingsPreset(section.id, option.changes) : option.changes.forEach(change => onUpdateSetting(section.id, change.fieldKey, change.value))}>{polish(option.title)}</button>)}
            </div>
            {!selected ? <small className="scene-defaults-custom" role="status">{t("settings.scene.custom")}</small> : null}
          </div>
        </div>;
      })}
    </section> : null}

    {abilities.length ? <section className="scene-defaults-abilities">
      <h3>{t(isPlatformer ? "settings.scene.abilities" : "settings.scene.rules")}</h3>
      <div className="scene-defaults-switches">{abilities.map(field => renderField(field.key === "dash" ? { ...field, label: "Dash" } : field))}</div>
    </section> : null}
    {extraContent}
    {core.length ? <div className="scene-defaults-core settings-edit-list">{core.map(renderField)}</div> : null}

    {buttons.length ? <section className="scene-defaults-controls"><h3>{t("settings.scene.controls")}</h3><div>
      {buttons.map(field => {
        const current = String(field.value);
        const options = GBA_BUTTONS.includes(current) ? GBA_BUTTONS : [current, ...GBA_BUTTONS];
        return <label key={field.key}><span>{t(BUTTON_LABELS[field.key]!)}</span><select aria-label={polish(field.label)} disabled={field.readOnly} value={current} onChange={event => onUpdateSetting(section.id, field.key, event.currentTarget.value)}>{options.map(value => <option value={value} key={value}>{value}</option>)}</select></label>;
      })}
    </div></section> : null}

    {playerField ? <div className="scene-defaults-player"><div className="scene-defaults-copy"><strong>{t("settings.scene.player")}</strong><p>{t("settings.scene.playerHint")}</p></div>
      <select aria-label={polish(playerField.label)} value={String(playerField.value)} onChange={event => onUpdateSetting("sceneTypes", playerField.key, event.currentTarget.value)}>
        {(playerField.options?.some(option => option.value === playerField.value) ? playerField.options : [...(playerField.options ?? []), { value: String(playerField.value), label: `Referência inválida (${playerField.value})` }]).map(option => <option key={option.value} value={option.value}>{polish(option.label)}</option>)}
      </select>
    </div> : null}

    {backgroundFields.map(field => <div className="scene-defaults-player" key={field.key}>
      <div className="scene-defaults-copy"><strong>{backgroundFields.length > 1 ? polish(field.label) : t("settings.scene.background")}</strong><p>{t("settings.scene.backgroundHint")}</p></div>
      <select aria-label={polish(field.label)} value={String(field.value)} onChange={event => onUpdateSetting("sceneTypes", field.key, event.currentTarget.value)}>
        {(field.options?.some(option => option.value === field.value) ? field.options : [...(field.options ?? []), { value: String(field.value), label: `Referência inválida (${field.value})` }]).map(option => <option key={option.value} value={option.value}>{polish(option.label)}</option>)}
      </select>
    </div>)}

    {details.length ? <details className="scene-defaults-advanced">
      <summary><SlidersHorizontal size={21} aria-hidden="true" /><span><strong>{t("settings.scene.technical")}</strong><small>{t(isPlatformer ? "settings.scene.technicalPlatformerHint" : "settings.scene.technicalHint")}</small></span><ChevronRight className="scene-defaults-chevron" size={19} aria-hidden="true" /></summary>
      <div className="settings-edit-list">{details.map(renderField)}</div>
    </details> : null}
  </section>;
}
