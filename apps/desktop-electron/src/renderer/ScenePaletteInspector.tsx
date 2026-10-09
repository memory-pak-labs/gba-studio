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
  return (
    <div className="scene-palette-preview" aria-label={`Paleta ${label}`} role="region">
      <span>{label}</span>
      <div className="scene-palette-swatches" role="list" aria-label={`${label}, 16 cores`}>
        {Array.from({ length: 16 }, (_, index) => (
          <span
            aria-label={`${label} cor ${index + 1}`}
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
  const selectedFamily = families.find((family) => family.id === selectedFamilyID) ?? null;

  return (
    <div className="scene-palette-inspector" aria-label="Paletas da cena" role="region">
      <InspectorSection
        ariaLabel="Família de cores da cena"
        className="scene-inspector-group"
        description="Vincule esta cena a uma família compartilhada no workspace Cores."
        persistKey="rooms.colors.family"
        role="region"
        title="Família de cores"
      >
        <label>
          <span>Família vinculada</span>
          <select
            aria-label="Família de cores da cena"
            onChange={(event) => onChangeFamily(event.currentTarget.value || null)}
            value={selectedFamilyID ?? ""}
          >
            <option value="">Sem família</option>
            {families.map((family) => (
              <option key={family.id} value={family.id}>{family.name}</option>
            ))}
          </select>
        </label>
        {selectedFamily ? (
          <div className="scene-palette-family-card" aria-label={`Família selecionada ${selectedFamily.name}`}>
            <strong>{selectedFamily.name}</strong>
            <PalettePreview colors={selectedFamily.background} label="Fundo" />
            <PalettePreview colors={selectedFamily.objects} label="Sprites / OBJ" />
          </div>
        ) : (
          <p className="room-detail-section-help">Nenhuma família está vinculada a esta cena.</p>
        )}
        {onOpenColorsWorkspace ? (
          <InspectorAction onClick={onOpenColorsWorkspace}>
            {selectedFamily ? "Editar no workspace Cores" : "Abrir workspace Cores"}
          </InspectorAction>
        ) : null}
      </InspectorSection>

      <InspectorSection
        ariaLabel="Bancos de paleta do fundo"
        className="scene-inspector-group"
        description="Define quanto dos bancos BG fica disponível para a cena e para a UI compartilhada."
        persistKey="rooms.colors.bank-policy"
        role="region"
        title="Bancos de paleta BG"
      >
        <label>
          <span>Política de bancos</span>
          <select
            aria-label="Política de bancos BG"
            onChange={(event) => onChangeBankPolicy(event.currentTarget.value as ScenePaletteBankPolicy)}
            value={paletteBankPolicy}
          >
            <option value="shared-ui">UI compartilhada · 14 bancos</option>
            <option value="full-screen">Tela cheia · 16 bancos</option>
          </select>
        </label>
        <p className="room-detail-section-help">
          {paletteBankPolicy === "full-screen"
            ? "Permite usar BG14–BG15 quando a cena não depende do HUD/diálogo compartilhado."
            : "Reserva BG14–BG15 para HUD e diálogo compartilhados da cena."}
        </p>
      </InspectorSection>
    </div>
  );
}
