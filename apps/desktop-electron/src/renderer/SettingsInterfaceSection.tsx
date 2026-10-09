import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, Circle, Monitor, RotateCcw, Settings2 } from "lucide-react";
import { applyStudioUiAppearance, DEFAULT_STUDIO_UI_APPEARANCE, readStudioUiAppearance, writeStudioUiAppearance, type StudioUiAppearance } from "../shared/studioUiAppearance";
import { applyStudioUiFontSize, readStudioUiFontSize, writeStudioUiFontSize, type StudioUiFontSize } from "../shared/studioUiFontSize";
import { InspectorRange } from "./InspectorControls";
import { StudioLanguageSwitcher, useStudioI18n } from "./i18n";
import { useStudioTheme } from "./useStudioTheme";
const lightThemeImage = new URL("./assets/settings-theme-light.png", import.meta.url).href;
const darkThemeImage = new URL("./assets/settings-theme-dark.png", import.meta.url).href;

export function SettingsInterfaceSection(): React.ReactElement {
  const { t } = useStudioI18n();
  const { theme, setTheme } = useStudioTheme();
  const [appearance, setAppearance] = useState(() => readStudioUiAppearance());
  const [fontSize, setFontSize] = useState(() => readStudioUiFontSize());
  useEffect(() => { applyStudioUiAppearance(appearance); }, [appearance]);
  useEffect(() => { applyStudioUiFontSize(fontSize); }, [fontSize]);

  const updateAppearance = (patch: Partial<StudioUiAppearance>): void => {
    const next = { ...appearance, ...patch };
    writeStudioUiAppearance(next);
    setAppearance(next);
  };
  const updateFontSize = (next: StudioUiFontSize): void => {
    writeStudioUiFontSize(next);
    setFontSize(next);
  };
  const reset = (): void => {
    setTheme("light");
    updateFontSize("compact");
    writeStudioUiAppearance(DEFAULT_STUDIO_UI_APPEARANCE);
    setAppearance({ ...DEFAULT_STUDIO_UI_APPEARANCE });
  };

  const ranges = [
    { key: "appBackgroundGray", label: "settings.interface.appGray", description: "settings.interface.appGrayHint" },
    { key: "canvasBackgroundGray", label: "settings.interface.canvasGray", description: "settings.interface.canvasGrayHint" },
    { key: "textContrast", label: "settings.interface.textContrast", description: "settings.interface.textContrastHint" },
    { key: "brightness", label: "settings.interface.brightness", description: "settings.interface.brightnessHint" }
  ] as const;

  return <section className="settings-interface-page" id="settings-section-interface" aria-label="Editar Interface">
    <header className="settings-interface-header">
      <div>
        <div className="settings-interface-heading"><h2>{t("settings.interface.title")}</h2><span className="settings-interface-device"><Monitor size={16} aria-hidden="true" />{t("settings.interface.device")}</span></div>
        <p>{t("settings.interface.subtitle")}</p>
      </div>
      <button className="settings-interface-reset" onClick={reset} title={t("settings.interface.resetHint")} type="button"><RotateCcw size={16} aria-hidden="true" />{t("settings.interface.reset")}</button>
    </header>

    <div className="settings-interface-row">
      <div className="settings-interface-copy"><h3>{t("settings.interface.language")}</h3><p>{t("settings.interface.languageHint")}</p></div>
      <StudioLanguageSwitcher className="settings-interface-language" />
    </div>

    <div className="settings-interface-row settings-interface-theme-row">
      <div className="settings-interface-copy"><h3 id="settings-interface-theme-label">{t("settings.interface.theme")}</h3><p>{t("settings.interface.themeHint")}</p></div>
      <div className="settings-interface-themes" role="radiogroup" aria-labelledby="settings-interface-theme-label">
        {([{ value: "light", image: lightThemeImage, key: "settings.interface.light" }, { value: "dark", image: darkThemeImage, key: "settings.interface.dark" }] as const).map(option => <label key={option.value} className="settings-interface-theme-choice">
          <input type="radio" name="settings-interface-theme" value={option.value} checked={theme === option.value} onChange={() => setTheme(option.value)} />
          <span className="settings-interface-theme-image"><img alt="" src={option.image} /><span className="settings-interface-theme-selected" aria-hidden="true">{theme === option.value ? <CheckCircle2 size={22} /> : <Circle size={22} />}</span></span>
          <span>{t(option.key)}</span>
        </label>)}
      </div>
    </div>

    <div className="settings-interface-row">
      <div className="settings-interface-copy"><h3 id="settings-interface-size-label">{t("settings.interface.size")}</h3><p>{t("settings.interface.sizeHint")}</p></div>
      <div className="settings-interface-segments" role="radiogroup" aria-labelledby="settings-interface-size-label">
        {(["compact", "default", "large"] as const).map(value => <label key={value}><input type="radio" name="studio-ui-font-size" value={value} checked={fontSize === value} onChange={() => updateFontSize(value)} /><span>{t(`settings.interface.size.${value}`)}</span></label>)}
      </div>
    </div>

    <div className="settings-interface-row">
      <div className="settings-interface-copy"><h3 id="settings-interface-contrast-label">{t("settings.interface.contrast")}</h3><p>{t("settings.interface.contrastHint")}</p></div>
      <div className="settings-interface-segments" role="radiogroup" aria-labelledby="settings-interface-contrast-label">
        {(["standard", "high"] as const).map(value => <label key={value}><input type="radio" name="studio-ui-contrast" value={value} checked={appearance.contrast === value} onChange={() => updateAppearance({ contrast: value })} /><span>{t(`settings.interface.contrast.${value}`)}</span></label>)}
      </div>
    </div>

    <details className="settings-interface-advanced">
      <summary><Settings2 size={21} aria-hidden="true" /><span><strong>{t("settings.interface.advanced")}</strong><small>{t("settings.interface.advancedHint")}</small></span><ChevronRight className="settings-interface-advanced-chevron" size={20} aria-hidden="true" /></summary>
      <div className="settings-interface-ranges">{ranges.map(range => <InspectorRange key={range.key} className="settings-ui-appearance-range" ariaLabel={t(range.label)} label={t(range.label)} description={t(range.description)} min={0} max={100} showNumber={false} unit="%" value={appearance[range.key]} onChange={value => updateAppearance({ [range.key]: value })} />)}</div>
    </details>
    <p className="settings-interface-autosave" role="note"><Monitor size={20} aria-hidden="true" />{t("settings.interface.savedLocally")}</p>
  </section>;
}
