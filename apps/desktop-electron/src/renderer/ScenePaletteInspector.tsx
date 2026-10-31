import { uiText as ui, useStudioUiText } from "./studioUiText";
import type { ReactElement } from "react";

import type { PaletteFamilyRecord } from "../shared/colorsWorkspace/core.js";
import type { ScenePaletteBankPolicy } from "../shared/paletteContract.js";
import { InspectorAction, InspectorSection } from "./InspectorControls";

interface ScenePaletteInspectorProps {
  families: PaletteFamilyRecord[];
  selectedFamilyID: string | null;
  paletteBankPolicy: ScenePaletteBankPolicy;
  onChangeFamily(familyID: string | null): void;
  onChangeBankPolicy(policy: ScenePaletteBankPolicy): void;
  onOpenColorsWorkspace?(): void;
}

function paletteColor(rgb555: number): string {
  const r = Math.round((rgb555 & 0x1f) * 255 / 31);
  const g = Math.round(((rgb555 >> 5) & 0x1f) * 255 / 31);
  const b = Math.round(((rgb555 >> 10) & 0x1f) * 255 / 31);
  return `rgb(${r}, ${g}, ${b})`;
}

function PalettePreview({ label, colors }: { label: string; colors: number[] }): ReactElement {
  const ui = useStudioUiText();
  return (
    <div className="scene-palette-preview" aria-label={ui("Paleta {0}", { 0: ui(label) })} role="region">
      <span>{ui(label)}</span>
      <div className="scene-palette-swatches" role="list" aria-label={ui("{0}, 16 cores", { 0: ui(label) })}>
        {Array.from({ length: 16 }, (_, index) => (
          <span
            aria-label={ui("{0} cor {1}", { 0: ui(label), 1: index + 1 })}
            className="scene-palette-swatch"
            key={`${label}-${index}`}
            role="listitem"
            style={{ backgroundColor: paletteColor(colors[index] ?? 0) }}
          />
        ))}
      </div>
    </div>
  );
}

export function ScenePaletteInspector({
  families,
  selectedFamilyID,
  paletteBankPolicy,
  onChangeFamily,
  onChangeBankPolicy,
  onOpenColorsWorkspace
}: ScenePaletteInspectorProps): ReactElement {
  const ui = useStudioUiText();
  const selectedFamily = families.find((family) => family.id === selectedFamilyID) ?? null;

  return (
    <div className="scene-palette-inspector" aria-label={ui("Paletas da cena")} role="region">
      <InspectorSection
        ariaLabel={ui("Família de cores da cena")}
        className="scene-inspector-group"
        description={ui("Vincule esta cena a uma família compartilhada no workspace Cores.")}
        persistKey="rooms.colors.family"
        role="region"
        title={ui("Família de cores")}
      >
        <label>
          <span>{ui("Família vinculada")}</span>
          <select
            aria-label={ui("Família de cores da cena")}
            onChange={(event) => onChangeFamily(event.currentTarget.value || null)}
            value={selectedFamilyID ?? ""}
          >
            <option value="">{ui("Sem família")}</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>{family.name}</option>
            ))}
          </select>
        </label>
        {selectedFamily ? (
          <div className="scene-palette-family-card" aria-label={ui("Família selecionada {0}", { 0: selectedFamily.name })}>
            <strong>{selectedFamily.name}</strong>
            <PalettePreview colors={selectedFamily.background} label={ui("Fundo")} />
            <PalettePreview colors={selectedFamily.objects} label={ui("Sprites / OBJ")} />
          </div>
        ) : (
          <p className="room-detail-section-help">{ui("Nenhuma família está vinculada a esta cena.")}</p>
        )}
        {onOpenColorsWorkspace ? (
          <InspectorAction onClick={onOpenColorsWorkspace}>
            {selectedFamily ? ui("Editar no workspace Cores") : ui("Abrir workspace Cores")}
          </InspectorAction>
        ) : null}
      </InspectorSection>

      <InspectorSection
        ariaLabel={ui("Bancos de paleta do fundo")}
        className="scene-inspector-group"
        description={ui("Define quanto dos bancos BG fica disponível para a cena e para a UI compartilhada.")}
        persistKey="rooms.colors.bank-policy"
        role="region"
        title={ui("Bancos de paleta BG")}
      >
        <label>
          <span>{ui("Política de bancos")}</span>
          <select
            aria-label={ui("Política de bancos BG")}
            onChange={(event) => onChangeBankPolicy(event.currentTarget.value as ScenePaletteBankPolicy)}
            value={paletteBankPolicy}
          >
            <option value="shared-ui">{ui("UI compartilhada · 14 bancos")}</option>
            <option value="full-screen">{ui("Tela cheia · 16 bancos")}</option>
          </select>
        </label>
        <p className="room-detail-section-help">
          {paletteBankPolicy === "full-screen"
            ? ui("Permite usar BG14–BG15 quando a cena não depende do HUD/diálogo compartilhado.")
            : ui("Reserva BG14–BG15 para HUD e diálogo compartilhados da cena.")}
        </p>
      </InspectorSection>
    </div>
  );
}
