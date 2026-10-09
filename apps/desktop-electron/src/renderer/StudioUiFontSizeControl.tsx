import { useEffect, useState } from "react";

import {
  applyStudioUiFontSize,
  readStudioUiFontSize,
  writeStudioUiFontSize,
  type StudioUiFontSize
} from "../shared/studioUiFontSize";

const fontSizeOptions: Array<{ value: StudioUiFontSize; label: string }> = [
  { value: "compact", label: "Compacta" },
  { value: "default", label: "Padrão" },
  { value: "large", label: "Ampliada" }
];

export function StudioUiFontSizeControl(): React.ReactElement {
  const [fontSize, setFontSize] = useState<StudioUiFontSize>(() => readStudioUiFontSize());

  useEffect(() => {
    applyStudioUiFontSize(fontSize);
  }, [fontSize]);

  function updateFontSize(nextFontSize: StudioUiFontSize): void {
    writeStudioUiFontSize(nextFontSize);
    setFontSize(nextFontSize);
  }

  return (
    <fieldset className="settings-ui-font-size-control">
      <legend id="settings-ui-font-size-label">Tamanho da interface</legend>
      <p>Altera a leitura do editor neste dispositivo.</p>
      <div aria-labelledby="settings-ui-font-size-label" role="radiogroup">
        {fontSizeOptions.map((option) => (
          <label key={option.value}>
            <input
              checked={fontSize === option.value}
              name="studio-ui-font-size"
              onChange={() => updateFontSize(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
