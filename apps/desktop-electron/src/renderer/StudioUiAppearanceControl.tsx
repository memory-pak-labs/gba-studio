import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useEffect, useState } from "react";

import { InspectorRange } from "./InspectorControls";
import {
  applyStudioUiAppearance,
  DEFAULT_STUDIO_UI_APPEARANCE,
  readStudioUiAppearance,
  writeStudioUiAppearance,
  type StudioUiAppearance,
  type StudioUiContrast
} from "../shared/studioUiAppearance";

interface AppearanceRangeProps {
  label: string;
  description: string;
  value: number;
  onChange(value: number): void;
}

function AppearanceRange({ label, description, value, onChange }: AppearanceRangeProps): React.ReactElement {
  const ui = useStudioUiText();
  return <InspectorRange
    ariaLabel={label}
    className="settings-ui-appearance-range"
    description={ui(description)}
    label={label}
    max={100}
    min={0}
    onChange={onChange}
    showNumber={false}
    unit="%"
    value={value}
  />;
}

export function StudioUiAppearanceControl(): React.ReactElement {
  const ui = useStudioUiText();
  const [appearance, setAppearance] = useState<StudioUiAppearance>(() => readStudioUiAppearance());

  useEffect(() => {
    applyStudioUiAppearance(appearance);
  }, [appearance]);

  function updateAppearance(patch: Partial<StudioUiAppearance>): void {
    const nextAppearance = { ...appearance, ...patch };
    writeStudioUiAppearance(nextAppearance);
    setAppearance(nextAppearance);
  }

  function resetAppearance(): void {
    writeStudioUiAppearance(DEFAULT_STUDIO_UI_APPEARANCE);
    setAppearance({ ...DEFAULT_STUDIO_UI_APPEARANCE });
  }

  return (
    <section className="settings-ui-appearance-control" aria-labelledby="settings-ui-appearance-title">
      <header className="settings-ui-appearance-header">
        <div>
          <strong id="settings-ui-appearance-title">{ui("Aparência da interface")}</strong>
          <span>{ui("Refine a leitura do editor neste dispositivo.")}</span>
        </div>
        <button onClick={resetAppearance} type="button">{ui("Restaurar")}</button>
      </header>
      <div className="settings-ui-appearance-ranges">
        <AppearanceRange
          description={ui("Neutraliza o fundo externo do editor.")}
          label={ui("Nível de cinza do plano de fundo")}
          onChange={(value) => updateAppearance({ appBackgroundGray: value })}
          value={appearance.appBackgroundGray}
        />
        <AppearanceRange
          description={ui("Neutraliza o fundo das áreas de trabalho e pranchetas.")}
          label={ui("Nível de cinza do fundo da prancheta")}
          onChange={(value) => updateAppearance({ canvasBackgroundGray: value })}
          value={appearance.canvasBackgroundGray}
        />
        <AppearanceRange
          description={ui("Aumenta ou reduz a definição das informações textuais.")}
          label={ui("Contraste de texto")}
          onChange={(value) => updateAppearance({ textContrast: value })}
          value={appearance.textContrast}
        />
        <AppearanceRange
          description={ui("Ajusta a luminosidade geral da janela do editor.")}
          label={ui("Brilho da interface")}
          onChange={(value) => updateAppearance({ brightness: value })}
          value={appearance.brightness}
        />
      </div>
      <fieldset className="settings-ui-contrast-control">
        <legend>{ui("Contraste da UI")}</legend>
        <div aria-label={ui("Contraste da UI")} role="radiogroup">
          {(["standard", "high"] as StudioUiContrast[]).map((value) => (
            <label key={value}>
              <input
                checked={appearance.contrast === value}
                name="studio-ui-contrast"
                onChange={() => updateAppearance({ contrast: value })}
                type="radio"
                value={value}
              />
              <span>{value === "standard" ? ui("Padrão") : ui("Alto")}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
