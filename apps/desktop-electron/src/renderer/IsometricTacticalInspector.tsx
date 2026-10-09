import { useMemo, type ReactElement } from "react";

import {
  ISO_TACTICAL_AUDIO_CUES,
  ISO_TACTICAL_ANIMATION_BINDINGS,
  SCENE_TACTICAL_CAPABILITY_REGISTRY,
  resolveIsometricTacticalCapabilities,
  normalizeIsometricTacticalPresentation,
  type IsoTacticalPresentationConfig,
  type SceneTacticalCapabilityConfig
} from "../shared/isometricTacticalPresentation";

interface IsometricTacticalInspectorProps {
  capabilities?: unknown;
  presentation?: unknown;
  editorTools?: readonly string[];
  onChangeCapabilities(capabilities: SceneTacticalCapabilityConfig[]): void;
  onChangePresentation(presentation: IsoTacticalPresentationConfig): void;
}

const PRESENTATION_FIELDS = [
  ["surfaceAsset", "Asset da superfície BG2"],
  ["gridAsset", "Asset da grade BG1"],
  ["hudLayout", "Layout HUD BG0"],
  ["cursorAsset", "Cursor"],
  ["rangeAsset", "Alcance"],
  ["targetAsset", "Alvo"],
  ["emotesAsset", "Emotes"],
  ["feedbackAsset", "Feedback/impacto"]
] as const;

const CAPABILITY_ASSET_HINTS: Record<string, string> = {
  tactical_surface: "surfaceAsset",
  tactical_grid_overlay: "gridAsset",
  tactical_hud: "hudLayout",
  tactical_units: "units",
  tactical_props: "props",
  tactical_feedback: "cursorAsset · rangeAsset · targetAsset · emotesAsset · feedbackAsset",
  tactical_audio: "audio.music · nove cues"
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function updateStringField(
  presentation: IsoTacticalPresentationConfig,
  field: keyof IsoTacticalPresentationConfig,
  value: string
): IsoTacticalPresentationConfig {
  return { ...presentation, [field]: value };
}

function updateAnimationField(
  presentation: IsoTacticalPresentationConfig,
  unitIndex: number,
  binding: (typeof ISO_TACTICAL_ANIMATION_BINDINGS)[number],
  value: string
): IsoTacticalPresentationConfig {
  return {
    ...presentation,
    units: presentation.units.map((unit, index) => {
      if (index !== unitIndex) return unit;
      const animations = { ...(unit.animations ?? {}) };
      if (value.trim()) animations[binding] = value;
      else delete animations[binding];
      return { ...unit, animations };
    })
  };
}

function updateSurfacePageField(
  presentation: IsoTacticalPresentationConfig,
  pageIndex: number,
  field: "asset" | "bankGroup",
  value: string
): IsoTacticalPresentationConfig {
  return {
    ...presentation,
    surfacePages: (presentation.surfacePages ?? []).map((page, index) => (
      index === pageIndex ? { ...page, [field]: value } : page
    ))
  };
}

export function IsometricTacticalInspector({
  capabilities: capabilityValue,
  presentation: presentationValue,
  editorTools = [],
  onChangeCapabilities,
  onChangePresentation
}: IsometricTacticalInspectorProps): ReactElement {
  const resolution = useMemo(
    () => resolveIsometricTacticalCapabilities("isometric", capabilityValue, editorTools),
    [capabilityValue, editorTools]
  );
  const presentation = useMemo(
    () => normalizeIsometricTacticalPresentation(presentationValue),
    [presentationValue]
  );
  const enabledCount = resolution.capabilities.filter((capability) => capability.enabled).length;

  function toggleCapability(id: SceneTacticalCapabilityConfig["id"], enabled: boolean): void {
    const existing = resolution.capabilities.find((capability) => capability.id === id);
    const next = existing
      ? resolution.capabilities.map((capability) => capability.id === id ? { ...capability, enabled } : capability)
      : enabled
        ? [...resolution.capabilities, { id, enabled: true, settings: {} }]
        : resolution.capabilities;
    onChangeCapabilities(next);
  }

  function updatePresentation(next: IsoTacticalPresentationConfig): void {
    onChangePresentation(next);
  }

  function updateUnit(index: number, field: "actorId" | "sheet", value: string): void {
    updatePresentation({
      ...presentation,
      units: presentation.units.map((unit, unitIndex) => unitIndex === index ? { ...unit, [field]: value } : unit)
    });
  }

  function updateUnitAnimation(index: number, binding: (typeof ISO_TACTICAL_ANIMATION_BINDINGS)[number], value: string): void {
    updatePresentation(updateAnimationField(presentation, index, binding, value));
  }

  function addUnit(): void {
    updatePresentation({ ...presentation, units: [...presentation.units, { actorId: "", sheet: "" }] });
  }

  function removeUnit(index: number): void {
    updatePresentation({ ...presentation, units: presentation.units.filter((_, unitIndex) => unitIndex !== index) });
  }

  function updateProp(index: number, field: "id" | "asset" | "kind", value: string): void {
    updatePresentation({
      ...presentation,
      props: presentation.props.map((prop, propIndex) => propIndex === index ? { ...prop, [field]: value } : prop)
    });
  }

  function addProp(): void {
    updatePresentation({ ...presentation, props: [...presentation.props, { id: "", asset: "", kind: "cover" }] });
  }

  function removeProp(index: number): void {
    updatePresentation({ ...presentation, props: presentation.props.filter((_, propIndex) => propIndex !== index) });
  }

  function updateAudioCue(cue: typeof ISO_TACTICAL_AUDIO_CUES[number], value: string): void {
    updatePresentation({
      ...presentation,
      audio: {
        music: presentation.audio?.music ?? "",
        cues: { ...(presentation.audio?.cues ?? {}), [cue]: value }
      }
    });
  }

  return (
    <section aria-label="Autoria tática isométrica" className="room-detail-section room-detail-editor-span-2 isometric-tactical-inspector">
      <div className="scene-feature-modules-heading">
        <div>
          <h5>Autoria tática isométrica</h5>
          <p className="room-detail-section-help">BG2, grade BG1, HUD BG0, unidades, props, feedback e áudio são opt-in independentes.</p>
        </div>
        <strong>{enabledCount}/{SCENE_TACTICAL_CAPABILITY_REGISTRY.length} ativos</strong>
      </div>

      <div className="scene-feature-modules-grid isometric-tactical-capability-grid">
        {SCENE_TACTICAL_CAPABILITY_REGISTRY.map((definition) => {
          const configured = resolution.capabilities.find((capability) => capability.id === definition.id);
          const enabled = configured?.enabled === true;
          const missingTools = definition.editorTools.filter((tool) => !editorTools.includes(tool));
          return (
            <fieldset className={`scene-feature-module-card scene-feature-advanced-card${enabled ? " is-enabled" : ""}`} key={definition.id}>
              <label className="scene-feature-module-toggle">
                <input
                  aria-label={`Ativar capability ${definition.label}`}
                  checked={enabled}
                  onChange={(event) => toggleCapability(definition.id as SceneTacticalCapabilityConfig["id"], event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>{definition.label}</strong>
                  <small>
                    {definition.available ? "Disponível" : "Indisponível"} · {enabled ? "Ativa nesta cena" : "Opt-in desativado"} · {configured?.required ? "Required" : "Opcional"} · {definition.verified ? "Verificada" : "Sem evidência"}
                  </small>
                </span>
              </label>
              <small>{definition.assets[0]?.kind ?? "sem asset"} · {CAPABILITY_ASSET_HINTS[definition.id]}</small>
              <small>{definition.budget.bgTiles} BG · {definition.budget.objTiles} OBJ · {definition.budget.oam} OAM</small>
              {missingTools.length > 0 ? <small className="scene-feature-advanced-fallback">Ferramentas ausentes: {missingTools.join(", ")}</small> : null}
            </fieldset>
          );
        })}
      </div>

      <div className="isometric-tactical-presentation-fields">
        <div className="scene-feature-modules-heading scene-feature-modules-advanced-heading">
          <div>
            <h6>Bindings de apresentação</h6>
            <p className="room-detail-section-help">Informe IDs/caminhos de assets já existentes. O editor não gera nem substitui arte.</p>
          </div>
          <small>{presentation.schema === 1 ? "schema 1 declarado" : "schema ainda não declarado"}</small>
        </div>
        <div className="scene-feature-module-settings">
          {PRESENTATION_FIELDS.map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input
                aria-label={label}
                onChange={(event) => updatePresentation(updateStringField(presentation, field, event.currentTarget.value))}
                placeholder="ID ou caminho do asset"
                value={textValue(presentation[field])}
              />
            </label>
          ))}
        </div>
        {presentation.surfacePages?.length ? (
          <fieldset className="isometric-tactical-residency">
            <legend>Páginas BG2 e residência</legend>
            <small>Catálogo: {presentation.surfacePages.length} páginas · residentes simultâneos: {presentation.surfaceResidency?.maxResidentGroups ?? "—"}</small>
            {presentation.surfacePages.map((page, index) => (
              <div className="isometric-tactical-row" key={page.id || index}>
                <input aria-label={`Asset da página BG2 ${index + 1}`} onChange={(event) => updatePresentation(updateSurfacePageField(presentation, index, "asset", event.currentTarget.value))} placeholder="asset da página" value={page.asset} />
                <input aria-label={`Bank group da página BG2 ${index + 1}`} onChange={(event) => updatePresentation(updateSurfacePageField(presentation, index, "bankGroup", event.currentTarget.value))} placeholder="bank group" value={page.bankGroup} />
                <span>{page.world.x},{page.world.y} · {page.world.width}×{page.world.height}</span>
              </div>
            ))}
          </fieldset>
        ) : null}
      </div>

      <div className="isometric-tactical-collections">
        <fieldset>
          <legend>Unidades OBJ</legend>
          {presentation.units.map((unit, index) => (
            <div className="isometric-tactical-row" key={`${unit.actorId}-${index}`}>
              <input aria-label={`Actor ID da unidade ${index + 1}`} onChange={(event) => updateUnit(index, "actorId", event.currentTarget.value)} placeholder="actorId" value={unit.actorId} />
              <input aria-label={`Sheet da unidade ${index + 1}`} onChange={(event) => updateUnit(index, "sheet", event.currentTarget.value)} placeholder="sheet" value={unit.sheet} />
              <button onClick={() => removeUnit(index)} type="button">Remover</button>
              <div className="isometric-tactical-animation-grid">
                {ISO_TACTICAL_ANIMATION_BINDINGS.map((binding) => (
                  <label key={binding}>
                    <span>{binding}</span>
                    <input
                      aria-label={`Animação ${binding} da unidade ${index + 1}`}
                      onChange={(event) => updateUnitAnimation(index, binding, event.currentTarget.value)}
                      placeholder="binding"
                      value={unit.animations?.[binding] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addUnit} type="button">Adicionar unidade</button>
        </fieldset>
        <fieldset>
          <legend>Props OBJ/BG</legend>
          {presentation.props.map((prop, index) => (
            <div className="isometric-tactical-row" key={`${prop.id}-${index}`}>
              <input aria-label={`ID do prop ${index + 1}`} onChange={(event) => updateProp(index, "id", event.currentTarget.value)} placeholder="id" value={prop.id} />
              <input aria-label={`Asset do prop ${index + 1}`} onChange={(event) => updateProp(index, "asset", event.currentTarget.value)} placeholder="asset" value={prop.asset} />
              <select aria-label={`Tipo do prop ${index + 1}`} onChange={(event) => updateProp(index, "kind", event.currentTarget.value)} value={prop.kind}>
                <option value="objective">Objetivo</option>
                <option value="cover">Cover</option>
                <option value="elevation">Elevação</option>
              </select>
              <button onClick={() => removeProp(index)} type="button">Remover</button>
            </div>
          ))}
          <button onClick={addProp} type="button">Adicionar prop</button>
        </fieldset>
      </div>

      <fieldset className="isometric-tactical-audio">
        <legend>Áudio tático COMPOSED</legend>
        <label><span>Música</span><input aria-label="Música tática" onChange={(event) => updatePresentation({ ...presentation, audio: { music: event.currentTarget.value, cues: { ...(presentation.audio?.cues ?? {}) } } })} placeholder="music id" value={presentation.audio?.music ?? ""} /></label>
        <div className="scene-feature-module-settings">
          {ISO_TACTICAL_AUDIO_CUES.map((cue) => (
            <label key={cue}>
              <span>{cue}</span>
              <input aria-label={`Cue ${cue}`} onChange={(event) => updateAudioCue(cue, event.currentTarget.value)} placeholder="cue id" value={presentation.audio?.cues[cue] ?? ""} />
            </label>
          ))}
        </div>
      </fieldset>

      {resolution.issues.length > 0 ? (
        <ul className="scene-feature-modules-issues">
          {resolution.issues.map((item, index) => <li key={`${item.code}-${item.module ?? "scene"}-${index}`}>{item.message}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
