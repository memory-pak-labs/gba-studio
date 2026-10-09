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
  return <InspectorRange
    ariaLabel={label}
    className="settings-ui-appearance-range"
    description={description}
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
          <strong id="settings-ui-appearance-title">Aparência da interface</strong>
          <span>Refine a leitura do editor neste dispositivo.</span>
        </div>
        <button onClick={resetAppearance} type="button">Restaurar</button>
      </header>
      <div className="settings-ui-appearance-ranges">
        <AppearanceRange
          description="Neutraliza o fundo externo do editor."
          label="Nível de cinza do plano de fundo"
          onChange={(value) => updateAppearance({ appBackgroundGray: value })}
          value={appearance.appBackgroundGray}
        />
        <AppearanceRange
          description="Neutraliza o fundo das áreas de trabalho e pranchetas."
          label="Nível de cinza do fundo da prancheta"
          onChange={(value) => updateAppearance({ canvasBackgroundGray: value })}
          value={appearance.canvasBackgroundGray}
        />
        <AppearanceRange
          description="Aumenta ou reduz a definição das informações textuais."
          label="Contraste de texto"
          onChange={(value) => updateAppearance({ textContrast: value })}
          value={appearance.textContrast}
        />
        <AppearanceRange
          description="Ajusta a luminosidade geral da janela do editor."
          label="Brilho da interface"
          onChange={(value) => updateAppearance({ brightness: value })}
          value={appearance.brightness}
        />
      </div>
      <fieldset className="settings-ui-contrast-control">
        <legend>Contraste da UI</legend>
        <div aria-label="Contraste da UI" role="radiogroup">
          {(["standard", "high"] as StudioUiContrast[]).map((value) => (
            <label key={value}>
              <input
                checked={appearance.contrast === value}
                name="studio-ui-contrast"
                onChange={() => updateAppearance({ contrast: value })}
                type="radio"
                value={value}
              />
              <span>{value === "standard" ? "Padrão" : "Alto"}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
