import { uiText as ui, useStudioUiText } from "./studioUiText";
import {
  AFFINE_SCENE_LIMITS,
  normalizeAffineScenePresentation,
  type AffineScenePresentation
} from "../shared/affineScene.js";
import {
  InspectorNumber,
  InspectorRange,
  InspectorSection,
  InspectorSelect,
  InspectorToggle
} from "./InspectorControls";

export interface AffineSceneInspectorProps {
  assetOptions: Array<{ label: string; value: string }>;
  onChange: (value: AffineScenePresentation) => void;
  value: AffineScenePresentation;
}

function optionsWithCurrent(
  options: Array<{ label: string; value: string }>,
  currentValue: string
): Array<{ label: string; value: string }> {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ label: `${currentValue} · não catalogado`, value: currentValue }, ...options];
}

export function AffineSceneInspector({ assetOptions, onChange, value }: AffineSceneInspectorProps): React.ReactElement {
  const ui = useStudioUiText();
  const normalized = normalizeAffineScenePresentation(value);
  const availableAssets = optionsWithCurrent(assetOptions, normalized.assetId);
  const selectOptions = availableAssets.length > 0
    ? [{ label: "Selecionar asset affine", value: "" }, ...availableAssets]
    : [{ label: "Nenhum asset affine disponível", value: "" }];
  const update = (changes: Partial<AffineScenePresentation>): void => {
    onChange(normalizeAffineScenePresentation({ ...normalized, ...changes }));
  };

  return (
    <InspectorSection
      className="affine-scene-inspector room-detail-editor-span-2"
      description={ui("Prévia decorativa opcional para rotação e escala. O tilemap e a colisão da cena continuam sendo a fonte de gameplay.")}
      title={ui("Camada Affine")}
    >
      <InspectorToggle
        checked={normalized.enabled}
        description={ui("Renderiza uma camada congelada no modo Foco e no Preview quando houver um asset configurado.")}
        label={ui("Ativar camada Affine")}
        onChange={(enabled) => update({ enabled })}
      />
      {normalized.enabled ? (
        <>
          <InspectorSelect
            ariaLabel={ui("Asset Affine")}
            description={availableAssets.length > 0
              ? ui("Use um asset preparado como affine_bg; ele não substitui o fundo jogável.")
              : ui("Importe ou prepare um asset com kind affine_bg para visualizar esta camada.")}
            disabled={availableAssets.length === 0}
            label={ui("Asset Affine")}
            onChange={(assetId) => update({ assetId })}
            options={selectOptions}
            value={normalized.assetId}
          />
          <div className="affine-scene-inspector-grid">
            <InspectorSelect
              ariaLabel={ui("Camada Affine")}
              label={ui("Camada de vídeo")}
              onChange={(layer) => update({ layer: layer === "BG3" ? "BG3" : "BG2" })}
              options={[{ label: "BG2", value: "BG2" }, { label: "BG3", value: "BG3" }]}
              value={normalized.layer}
            />
            <InspectorToggle
              checked={normalized.wrap}
              label={ui("Repetir bordas (wrap)")}
              onChange={(wrap) => update({ wrap })}
            />
          </div>
          <div className="affine-scene-inspector-grid">
            <InspectorRange
              ariaLabel={ui("Escala X")}
              label={ui("Escala X")}
              max={AFFINE_SCENE_LIMITS.scaleMaximum}
              min={AFFINE_SCENE_LIMITS.scaleMinimum}
              onChange={(scaleX) => update({ scaleX })}
              step={0.0625}
              value={normalized.scaleX}
            />
            <InspectorRange
              ariaLabel={ui("Escala Y")}
              label={ui("Escala Y")}
              max={AFFINE_SCENE_LIMITS.scaleMaximum}
              min={AFFINE_SCENE_LIMITS.scaleMinimum}
              onChange={(scaleY) => update({ scaleY })}
              step={0.0625}
              value={normalized.scaleY}
            />
          </div>
          <InspectorRange
            ariaLabel={ui("Rotação")}
            label={ui("Rotação")}
            max={AFFINE_SCENE_LIMITS.rotationMaximum}
            min={AFFINE_SCENE_LIMITS.rotationMinimum}
            onChange={(rotationDegrees) => update({ rotationDegrees })}
            value={normalized.rotationDegrees}
            unit="°"
          />
          <fieldset className="affine-scene-inspector-pivot">
            <legend>{ui("Pivô no viewport GBA")}</legend>
            <InspectorNumber
              label={ui("Pivô X")}
              max={AFFINE_SCENE_LIMITS.pivotXMaximum}
              min={AFFINE_SCENE_LIMITS.pivotXMinimum}
              onChange={(pivotX) => update({ pivotX })}
              unit="px"
              value={normalized.pivotX}
            />
            <InspectorNumber
              label={ui("Pivô Y")}
              max={AFFINE_SCENE_LIMITS.pivotYMaximum}
              min={AFFINE_SCENE_LIMITS.pivotYMinimum}
              onChange={(pivotY) => update({ pivotY })}
              unit="px"
              value={normalized.pivotY}
            />
          </fieldset>
          <p className="affine-scene-inspector-note" role="status">
            {ui("Camada decorativa · não altera colisão ou tilemap")}</p>
        </>
      ) : null}
    </InspectorSection>
  );
}
