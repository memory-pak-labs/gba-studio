import { useMemo, type ReactElement } from "react";

import {
  normalizeSceneComposition,
  sceneCompositionIssues,
  type SceneCompositionConfig,
  type SceneCompositionLayer,
  type SceneCompositionLayerKind,
  type SceneCompositionMode,
  type SceneCompositionTarget,
  type SceneCompositionWindow
} from "../shared/sceneComposition";
import {
  InspectorAction,
  InspectorNumber,
  InspectorRange,
  InspectorSection,
  InspectorSelect,
  InspectorToggle
} from "./InspectorControls";

const HBLANK_SCANLINE_COUNT = 160;

export interface SceneCompositionAssetOption {
  label: string;
  value: string;
}

export interface SceneCompositionInspectorProps {
  assetOptions: SceneCompositionAssetOption[];
  onChange: (value: SceneCompositionConfig) => void;
  sceneType: string;
  value: SceneCompositionConfig;
}

const MODE_OPTIONS: Array<{ label: string; value: SceneCompositionMode }> = [
  { label: "Tiled padrão · Modo 0", value: "tilemap" },
  { label: "Affine · Modo 1/2", value: "affine" },
  { label: "Bitmap 3 · 15-bit", value: "bitmap3" },
  { label: "Bitmap 4 · 8-bit", value: "bitmap4" },
  { label: "Bitmap 5 · 15-bit 160×128", value: "bitmap5" }
];

const TARGET_OPTIONS: Array<{ label: string; value: SceneCompositionTarget }> = [
  { label: "BG0", value: "BG0" },
  { label: "BG1", value: "BG1" },
  { label: "BG2", value: "BG2" },
  { label: "BG3", value: "BG3" },
  { label: "OBJ", value: "OBJ" },
  { label: "Backdrop", value: "BACKDROP" }
];

const LAYER_KIND_OPTIONS: Array<{ label: string; value: SceneCompositionLayerKind }> = [
  { label: "BG tiled", value: "regular_bg" },
  { label: "BG affine", value: "affine_bg" },
  { label: "Bitmap", value: "bitmap" }
];

function optionsWithCurrent(
  options: SceneCompositionAssetOption[],
  currentValue: string
): SceneCompositionAssetOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ label: `${currentValue} · não catalogado`, value: currentValue }, ...options];
}

function targetListWithToggle(
  targets: SceneCompositionTarget[],
  target: SceneCompositionTarget,
  checked: boolean
): SceneCompositionTarget[] {
  return checked
    ? Array.from(new Set([...targets, target]))
    : targets.filter((entry) => entry !== target);
}

function hblankOffsetsForEditor(offsets: number[]): number[] {
  return Array.from({ length: HBLANK_SCANLINE_COUNT }, (_entry, index) => offsets[index] ?? 0);
}

function defaultLayer(mode: SceneCompositionMode, index: number, assetId: string): SceneCompositionLayer {
  const bitmap = mode.startsWith("bitmap");
  const affine = mode === "affine";
  return {
    id: `${bitmap ? "bitmap" : affine ? "affine" : "bg"}_${index}`,
    kind: bitmap ? "bitmap" : affine ? "affine_bg" : "regular_bg",
    role: bitmap || affine ? "decorative" : "gameplay",
    layer: bitmap ? "BITMAP" : affine ? "BG2" : "BG2",
    enabled: true,
    priority: 2,
    assetId,
    parallax: { x256: 256, y256: 256 },
    scroll: { x: 0, y: 0 },
    ...(affine ? {
      affine: {
        rotationDegrees: 0,
        scaleX: 1,
        scaleY: 1,
        pivotX: 120,
        pivotY: 80,
        wrap: true
      }
    } : {}),
    bitmapPage: 0
  };
}

function updateLayer(
  composition: SceneCompositionConfig,
  layerID: string,
  changes: Partial<SceneCompositionLayer>
): SceneCompositionConfig {
  return {
    ...composition,
    layers: composition.layers.map((layer) => layer.id === layerID ? { ...layer, ...changes } : layer)
  };
}

function updateWindow(
  composition: SceneCompositionConfig,
  windowID: "window0" | "window1",
  changes: Partial<SceneCompositionWindow>
): SceneCompositionConfig {
  return {
    ...composition,
    effects: {
      ...composition.effects,
      [windowID]: { ...composition.effects[windowID], ...changes }
    }
  };
}

function TargetChecklist({
  label,
  onChange,
  targets
}: {
  label: string;
  onChange: (targets: SceneCompositionTarget[]) => void;
  targets: SceneCompositionTarget[];
}): ReactElement {
  return (
    <fieldset className="scene-composition-targets">
      <legend>{label}</legend>
      {TARGET_OPTIONS.map((target) => (
        <label key={target.value}>
          <input
            aria-label={`${label} ${target.label}`}
            checked={targets.includes(target.value)}
            onChange={(event) => onChange(targetListWithToggle(targets, target.value, event.currentTarget.checked))}
            type="checkbox"
          />
          <span>{target.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function WindowEditor({
  composition,
  id,
  onChange
}: {
  composition: SceneCompositionConfig;
  id: "window0" | "window1";
  onChange: (value: SceneCompositionConfig) => void;
}): ReactElement {
  const window = composition.effects[id];
  const update = (changes: Partial<SceneCompositionWindow>): void => onChange(updateWindow(composition, id, changes));
  return (
    <fieldset className="scene-composition-effect-card">
      <legend>{id === "window0" ? "Window 0" : "Window 1"}</legend>
      <InspectorToggle checked={window.enabled} label="Ativar window" onChange={(enabled) => update({ enabled })} />
      <div className="scene-composition-number-grid">
        <InspectorNumber label="Esquerda" max={240} min={0} onChange={(left) => update({ left })} unit="px" value={window.left} />
        <InspectorNumber label="Direita" max={240} min={0} onChange={(right) => update({ right })} unit="px" value={window.right} />
        <InspectorNumber label="Topo" max={160} min={0} onChange={(top) => update({ top })} unit="px" value={window.top} />
        <InspectorNumber label="Base" max={160} min={0} onChange={(bottom) => update({ bottom })} unit="px" value={window.bottom} />
      </div>
      <TargetChecklist label="Alvos internos" onChange={(insideTargets) => update({ insideTargets })} targets={window.insideTargets} />
      <TargetChecklist label="Alvos externos" onChange={(outsideTargets) => update({ outsideTargets })} targets={window.outsideTargets} />
    </fieldset>
  );
}

export function SceneCompositionInspector({
  assetOptions,
  onChange,
  sceneType,
  value
}: SceneCompositionInspectorProps): ReactElement {
  const normalized = normalizeSceneComposition(value);
  const availableAssets = useMemo(
    () => optionsWithCurrent(assetOptions, normalized.layers[0]?.assetId ?? ""),
    [assetOptions, normalized.layers]
  );
  const issues = sceneCompositionIssues(normalized, sceneType);
  const update = (changes: Partial<SceneCompositionConfig>): void => {
    onChange(normalizeSceneComposition({ ...normalized, ...changes }));
  };
  const addLayer = (): void => {
    const nextIndex = normalized.layers.length + 1;
    update({
      layers: [...normalized.layers, defaultLayer(normalized.mode, nextIndex, availableAssets[0]?.value ?? "")]
    });
  };
  const changeMode = (mode: SceneCompositionMode): void => {
    const nextLayers = normalized.layers.length > 0
      ? normalized.layers
      : [defaultLayer(mode, 1, availableAssets[0]?.value ?? "")];
    update({ mode, enabled: true, layers: nextLayers });
  };
  const addHBlankKeyframe = (): void => {
    const currentTimeline = normalized.effects.hblank.timeline ?? [];
    const previousFrame = currentTimeline[currentTimeline.length - 1]?.frame ?? -1;
    const keyframe = {
      frame: Math.min(65535, previousFrame + 1),
      scrollOffsets: hblankOffsetsForEditor(normalized.effects.hblank.scrollOffsets)
    };
    update({
      effects: {
        ...normalized.effects,
        hblank: { ...normalized.effects.hblank, timeline: [...currentTimeline, keyframe] }
      }
    });
  };
  const updateHBlankKeyframe = (index: number, changes: Partial<NonNullable<SceneCompositionConfig["effects"]["hblank"]["timeline"]>[number]>): void => {
    const timeline = normalized.effects.hblank.timeline ?? [];
    update({
      effects: {
        ...normalized.effects,
        hblank: {
          ...normalized.effects.hblank,
          timeline: timeline.map((keyframe, keyframeIndex) => keyframeIndex === index ? { ...keyframe, ...changes } : keyframe)
        }
      }
    });
  };

  return (
    <InspectorSection
      className="scene-composition-inspector room-detail-editor-span-2"
      description="A cena é a fonte de verdade do vídeo. Sem opt-in, permanece no fluxo tiled/Modo 0; o Runtime Universal apenas reflete o uso derivado."
      title="Compositor da cena"
    >
      <InspectorToggle
        checked={normalized.enabled}
        description="Affine, bitmap e efeitos de scanline só entram no export quando esta opção está ativa; a capability é derivada automaticamente."
        label="Ativar composição avançada"
        onChange={(enabled) => update({ enabled })}
      />
      <InspectorSelect
        ariaLabel="Modo de vídeo da cena"
        description="Bitmap e affine são opt-in; o modo tiled é o padrão seguro."
        label="Modo de vídeo"
        onChange={(mode) => changeMode(mode as SceneCompositionMode)}
        options={MODE_OPTIONS}
        value={normalized.mode}
      />
      <InspectorSelect
        ariaLabel="Fallback de incompatibilidade da composição"
        label="Fallback"
        onChange={(fallback) => update({ fallback: fallback as SceneCompositionConfig["fallback"] })}
        options={[
          { label: "Erro de exportação", value: "error" },
          { label: "Voltar para tiled", value: "tiled_default" },
          { label: "Omitir decorativo", value: "omit_decorative" }
        ]}
        value={normalized.fallback}
      />

      <div className="scene-composition-heading">
        <div>
          <strong>Camadas declaradas</strong>
          <small>Gameplay permanece em BG tiled; affine e bitmap são decorativos.</small>
        </div>
        <InspectorAction onClick={addLayer}>Adicionar camada</InspectorAction>
      </div>
      {normalized.layers.map((layer) => {
        const layerAssets = optionsWithCurrent(assetOptions, layer.assetId);
        return (
          <fieldset className={`scene-composition-layer-card${layer.enabled ? " is-enabled" : ""}`} key={layer.id}>
            <legend>{layer.id}</legend>
            <div className="scene-composition-layer-heading">
              <InspectorToggle checked={layer.enabled} label="Camada ativa" onChange={(enabled) => onChange(updateLayer(normalized, layer.id, { enabled }))} />
              <InspectorAction onClick={() => update({ layers: normalized.layers.filter((entry) => entry.id !== layer.id) })}>Remover</InspectorAction>
            </div>
            <div className="scene-composition-number-grid">
              <InspectorSelect
                ariaLabel={`Tipo da camada ${layer.id}`}
                label="Tipo"
                onChange={(kind) => {
                  const nextKind = kind as SceneCompositionLayerKind;
                  onChange(updateLayer(normalized, layer.id, {
                    kind: nextKind,
                    layer: nextKind === "bitmap" ? "BITMAP" : nextKind === "affine_bg" ? "BG2" : layer.layer === "BITMAP" ? "BG2" : layer.layer,
                    role: nextKind === "regular_bg" ? layer.role : "decorative",
                    affine: nextKind === "affine_bg"
                      ? layer.affine ?? defaultLayer("affine", 1, layer.assetId).affine
                      : undefined
                  }));
                }}
                options={LAYER_KIND_OPTIONS}
                value={layer.kind}
              />
              <InspectorSelect
                ariaLabel={`Camada física ${layer.id}`}
                label="Camada GBA"
                onChange={(physicalLayer) => onChange(updateLayer(normalized, layer.id, { layer: physicalLayer as SceneCompositionLayer["layer"] }))}
                options={[
                  { label: "BG0", value: "BG0" },
                  { label: "BG1", value: "BG1" },
                  { label: "BG2", value: "BG2" },
                  { label: "BG3", value: "BG3" },
                  { label: "BITMAP", value: "BITMAP" }
                ]}
                value={layer.layer}
              />
              <InspectorSelect
                ariaLabel={`Papel da camada ${layer.id}`}
                label="Papel"
                onChange={(role) => onChange(updateLayer(normalized, layer.id, { role: role as SceneCompositionLayer["role"] }))}
                options={[{ label: "Gameplay", value: "gameplay" }, { label: "Decorativo", value: "decorative" }]}
                value={layer.role}
              />
              <InspectorRange ariaLabel={`Prioridade da camada ${layer.id}`} label="Prioridade" max={3} min={0} onChange={(priority) => onChange(updateLayer(normalized, layer.id, { priority: priority as SceneCompositionLayer["priority"] }))} value={layer.priority} />
            </div>
            <InspectorSelect
              ariaLabel={`Asset da camada ${layer.id}`}
              description={layer.kind === "affine_bg" ? "Use um asset preparado como affine_bg." : layer.kind === "bitmap" ? "Use um asset bitmap compatível com o modo selecionado." : "Asset tiled usado pela camada BG."}
              disabled={layerAssets.length === 0}
              label="Asset"
              onChange={(assetId) => onChange(updateLayer(normalized, layer.id, { assetId }))}
              options={layerAssets.length > 0 ? [{ label: "Selecionar asset", value: "" }, ...layerAssets] : [{ label: "Nenhum asset disponível", value: "" }]}
              value={layer.assetId}
            />
            <div className="scene-composition-number-grid">
              <InspectorNumber label="Parallax X" max={1024} min={-1024} onChange={(x256) => onChange(updateLayer(normalized, layer.id, { parallax: { ...layer.parallax, x256 } }))} unit="/256" value={layer.parallax.x256} />
              <InspectorNumber label="Parallax Y" max={1024} min={-1024} onChange={(y256) => onChange(updateLayer(normalized, layer.id, { parallax: { ...layer.parallax, y256 } }))} unit="/256" value={layer.parallax.y256} />
              <InspectorNumber label="Scroll X" max={32767} min={-32768} onChange={(x) => onChange(updateLayer(normalized, layer.id, { scroll: { ...layer.scroll, x } }))} unit="px" value={layer.scroll.x} />
              <InspectorNumber label="Scroll Y" max={32767} min={-32768} onChange={(y) => onChange(updateLayer(normalized, layer.id, { scroll: { ...layer.scroll, y } }))} unit="px" value={layer.scroll.y} />
            </div>
            {layer.kind === "affine_bg" && layer.affine ? (
              <div className="scene-composition-affine-controls">
                <InspectorRange ariaLabel={`Rotação da camada ${layer.id}`} label="Rotação" max={360} min={-360} onChange={(rotationDegrees) => onChange(updateLayer(normalized, layer.id, { affine: { ...layer.affine!, rotationDegrees } }))} unit="°" value={layer.affine.rotationDegrees} />
                <InspectorRange ariaLabel={`Escala X da camada ${layer.id}`} label="Escala X" max={16} min={0.0625} onChange={(scaleX) => onChange(updateLayer(normalized, layer.id, { affine: { ...layer.affine!, scaleX } }))} step={0.0625} value={layer.affine.scaleX} />
                <InspectorRange ariaLabel={`Escala Y da camada ${layer.id}`} label="Escala Y" max={16} min={0.0625} onChange={(scaleY) => onChange(updateLayer(normalized, layer.id, { affine: { ...layer.affine!, scaleY } }))} step={0.0625} value={layer.affine.scaleY} />
                <InspectorToggle checked={layer.affine.wrap} label="Wrap affine" onChange={(wrap) => onChange(updateLayer(normalized, layer.id, { affine: { ...layer.affine!, wrap } }))} />
              </div>
            ) : null}
            {layer.kind === "bitmap" ? (
              <InspectorSelect
                ariaLabel={`Página bitmap da camada ${layer.id}`}
                label="Página bitmap"
                onChange={(bitmapPage) => onChange(updateLayer(normalized, layer.id, { bitmapPage: Number(bitmapPage) as 0 | 1 }))}
                options={[{ label: "Página 0", value: "0" }, { label: "Página 1", value: "1" }]}
                value={String(layer.bitmapPage)}
              />
            ) : null}
          </fieldset>
        );
      })}

      <fieldset className="scene-composition-effect-card">
        <legend>Efeitos de vídeo</legend>
        <InspectorToggle checked={normalized.effects.blend.enabled} label="Blending" onChange={(enabled) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, enabled } } })} />
        {normalized.effects.blend.enabled ? (
          <>
            <InspectorSelect ariaLabel="Modo de blending" label="Modo" onChange={(mode) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, mode: mode as typeof normalized.effects.blend.mode } } })} options={[{ label: "Alpha", value: "alpha" }, { label: "Clarear", value: "brighten" }, { label: "Escurecer", value: "darken" }]} value={normalized.effects.blend.mode === "none" ? "alpha" : normalized.effects.blend.mode} />
            <div className="scene-composition-number-grid">
              <InspectorNumber label="EVA" max={16} min={0} onChange={(eva) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, eva } } })} value={normalized.effects.blend.eva} />
              <InspectorNumber label="EVB" max={16} min={0} onChange={(evb) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, evb } } })} value={normalized.effects.blend.evb} />
              <InspectorNumber label="Intensidade" max={16} min={0} onChange={(intensity) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, intensity } } })} value={normalized.effects.blend.intensity} />
            </div>
            <TargetChecklist label="Primeiro alvo" onChange={(firstTargets) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, firstTargets } } })} targets={normalized.effects.blend.firstTargets} />
            <TargetChecklist label="Segundo alvo" onChange={(secondTargets) => update({ effects: { ...normalized.effects, blend: { ...normalized.effects.blend, secondTargets } } })} targets={normalized.effects.blend.secondTargets} />
          </>
        ) : null}
        <InspectorToggle checked={normalized.effects.mosaic.enabled} label="Mosaic" onChange={(enabled) => update({ effects: { ...normalized.effects, mosaic: { ...normalized.effects.mosaic, enabled } } })} />
        {normalized.effects.mosaic.enabled ? (
          <div className="scene-composition-number-grid">
            <InspectorNumber label="Mosaic BG X" max={15} min={0} onChange={(bgX) => update({ effects: { ...normalized.effects, mosaic: { ...normalized.effects.mosaic, bgX } } })} value={normalized.effects.mosaic.bgX} />
            <InspectorNumber label="Mosaic BG Y" max={15} min={0} onChange={(bgY) => update({ effects: { ...normalized.effects, mosaic: { ...normalized.effects.mosaic, bgY } } })} value={normalized.effects.mosaic.bgY} />
            <InspectorNumber label="Mosaic OBJ X" max={15} min={0} onChange={(objX) => update({ effects: { ...normalized.effects, mosaic: { ...normalized.effects.mosaic, objX } } })} value={normalized.effects.mosaic.objX} />
            <InspectorNumber label="Mosaic OBJ Y" max={15} min={0} onChange={(objY) => update({ effects: { ...normalized.effects, mosaic: { ...normalized.effects.mosaic, objY } } })} value={normalized.effects.mosaic.objY} />
          </div>
        ) : null}
      </fieldset>

      <div className="scene-composition-window-grid">
        <WindowEditor composition={normalized} id="window0" onChange={onChange} />
        <WindowEditor composition={normalized} id="window1" onChange={onChange} />
      </div>

      <fieldset className="scene-composition-effect-card">
        <legend>HBlank / HDMA</legend>
        <InspectorToggle checked={normalized.effects.hblank.enabled} label="Ativar tabela por scanline" onChange={(enabled) => update({ effects: { ...normalized.effects, hblank: { ...normalized.effects.hblank, enabled } } })} />
        {normalized.effects.hblank.enabled ? (
          <>
            <div className="scene-composition-number-grid">
              <InspectorSelect ariaLabel="Camada HBlank" label="Camada" onChange={(layer) => update({ effects: { ...normalized.effects, hblank: { ...normalized.effects.hblank, layer: layer as typeof normalized.effects.hblank.layer } } })} options={[{ label: "BG1", value: "BG1" }, { label: "BG2", value: "BG2" }, { label: "BG3", value: "BG3" }]} value={normalized.effects.hblank.layer} />
              <InspectorToggle checked={normalized.effects.hblank.hdma} label="Usar HDMA" onChange={(hdma) => update({ effects: { ...normalized.effects, hblank: { ...normalized.effects.hblank, hdma } } })} />
            </div>
            <label className="scene-composition-textarea-field">
              <span>Offsets de scroll · 160 valores</span>
              <textarea
                aria-label="Offsets HBlank HDMA"
                onChange={(event) => {
                  const scrollOffsets = event.currentTarget.value
                    .split(",")
                    .map((entry) => Number(entry.trim()))
                    .filter((entry) => Number.isFinite(entry))
                    .slice(0, 160);
                  update({ effects: { ...normalized.effects, hblank: { ...normalized.effects.hblank, scrollOffsets } } });
                }}
                rows={3}
                value={normalized.effects.hblank.scrollOffsets.join(", ")}
              />
              <small>O export exige exatamente 160 offsets quando HBlank está ativo.</small>
            </label>
            <div className="scene-composition-timeline-heading">
              <div>
                <strong>Timeline por frame</strong>
                <small>Keyframes substituem a tabela estática no frame informado.</small>
              </div>
              <InspectorAction onClick={addHBlankKeyframe}>Adicionar keyframe</InspectorAction>
            </div>
            {(normalized.effects.hblank.timeline ?? []).map((keyframe, index) => (
              <fieldset className="scene-composition-timeline-card" key={`hblank-keyframe-${index}`}>
                <legend>Keyframe {index + 1}</legend>
                <div className="scene-composition-number-grid">
                  <InspectorNumber
                    label="Frame"
                    max={65535}
                    min={0}
                    onChange={(frame) => updateHBlankKeyframe(index, { frame })}
                    value={keyframe.frame}
                  />
                  <InspectorAction onClick={() => update({
                    effects: {
                      ...normalized.effects,
                      hblank: {
                        ...normalized.effects.hblank,
                        timeline: (normalized.effects.hblank.timeline ?? []).filter((_entry, keyframeIndex) => keyframeIndex !== index)
                      }
                    }
                  })}>Remover</InspectorAction>
                </div>
                <label className="scene-composition-textarea-field">
                  <span>Offsets do keyframe · 160 valores</span>
                  <textarea
                    aria-label={`Offsets HBlank keyframe ${index + 1}`}
                    onChange={(event) => {
                      const scrollOffsets = event.currentTarget.value
                        .split(",")
                        .map((entry) => Number(entry.trim()))
                        .filter((entry) => Number.isFinite(entry))
                        .slice(0, HBLANK_SCANLINE_COUNT);
                      updateHBlankKeyframe(index, { scrollOffsets });
                    }}
                    rows={3}
                    value={keyframe.scrollOffsets.join(", ")}
                  />
                </label>
              </fieldset>
            ))}
          </>
        ) : null}
      </fieldset>

      {issues.length > 0 ? (
        <ul className="scene-composition-issues" role="status">
          {issues.slice(0, 8).map((entry, index) => <li key={`${entry.code}-${entry.layerId ?? "scene"}-${index}`}>{entry.message}</li>)}
        </ul>
      ) : (
        <p className="scene-composition-valid" role="status">Contrato de composição compatível com o perfil {sceneType}.</p>
      )}
    </InspectorSection>
  );
}
