import type { ReactElement } from "react";

import {
  defaultSceneMetatileAuthoring,
  resolveSceneMetatileAuthoring,
  SCENE_METATILE_AUTHORING_CONTRACT_ID,
  type SceneMetatileAuthoringConfig,
  type SceneMetatileDefinition
} from "../shared/sceneMetatileContract";
import { ROOM_COLLISION_TYPES, roomCollisionTypeLabel, type RoomCollisionType } from "../shared/roomCollisionTypes";
import { InspectorAction, InspectorNumber, InspectorSection, InspectorSelect, InspectorToggle } from "./InspectorControls";

const PHYSICAL_TILE_LIMIT = 1023;

export interface SceneMetatileInspectorProps {
  capabilityEnabled?: boolean;
  height: number;
  onChange: (value: SceneMetatileAuthoringConfig) => void;
  sceneType?: string;
  value: SceneMetatileAuthoringConfig;
  width: number;
}

function defaultDefinition(index: number): SceneMetatileDefinition {
  return {
    id: `metatile_${index + 1}`,
    label: `Metatile ${index + 1}`,
    tiles: [0, 1, 2, 3],
    semantic: {
      collision: "free",
      terrain: "",
      damage: 0,
      speedPercent: 100,
      animation: "",
      onEnterEvent: "",
      stepSound: "",
      tags: []
    }
  };
}

function logicalDimensions(width: number, height: number): { width: number; height: number } {
  return {
    width: Number.isInteger(width) && width > 0 ? Math.floor(width / 2) : 0,
    height: Number.isInteger(height) && height > 0 ? Math.floor(height / 2) : 0
  };
}

function offsetsForMap(width: number, height: number): number {
  const dimensions = logicalDimensions(width, height);
  return dimensions.width * dimensions.height;
}

export function SceneMetatileInspector({
  height,
  capabilityEnabled,
  onChange,
  sceneType = "topdown",
  value,
  width
}: SceneMetatileInspectorProps): ReactElement {
  const dimensions = logicalDimensions(width, height);
  const resolution = resolveSceneMetatileAuthoring(value, width, height);
  const capabilityAuthoring = capabilityEnabled === true && !resolution.config.enabled;
  const normalized = capabilityAuthoring
    ? resolveSceneMetatileAuthoring({
        ...resolution.config,
        enabled: true,
        logicalWidth: dimensions.width,
        logicalHeight: dimensions.height,
        library: [defaultDefinition(0)],
        map: Array.from({ length: dimensions.width * dimensions.height }, () => 0)
      }, width, height).config
    : resolution.config;
  const issues = capabilityAuthoring ? [] : resolution.issues;

  const update = (changes: Partial<SceneMetatileAuthoringConfig>): void => {
    onChange(resolveSceneMetatileAuthoring({ ...normalized, ...changes }, width, height).config);
  };

  const enableAuthoring = (enabled: boolean): void => {
    if (!enabled) {
      update({ enabled: false });
      return;
    }
    const cellCount = dimensions.width * dimensions.height;
    const library = normalized.library.length > 0 ? normalized.library : [defaultDefinition(0)];
    update({
      enabled: true,
      contract: SCENE_METATILE_AUTHORING_CONTRACT_ID,
      fallback: normalized.fallback,
      logicalWidth: dimensions.width,
      logicalHeight: dimensions.height,
      library,
      map: normalized.map.length === cellCount ? normalized.map : Array.from({ length: cellCount }, () => 0)
    });
  };

  const updateDefinition = (index: number, changes: Partial<SceneMetatileDefinition>): void => {
    update({ library: normalized.library.map((definition, definitionIndex) => definitionIndex === index ? { ...definition, ...changes } : definition) });
  };

  const updateDefinitionSemantic = (index: number, changes: Partial<SceneMetatileDefinition["semantic"]>): void => {
    const definition = normalized.library[index];
    if (!definition) return;
    updateDefinition(index, { semantic: { ...definition.semantic, ...changes } });
  };

  const addDefinition = (): void => {
    update({ library: [...normalized.library, defaultDefinition(normalized.library.length)] });
  };

  const removeDefinition = (index: number): void => {
    const library = normalized.library.filter((_definition, definitionIndex) => definitionIndex !== index);
    const map = normalized.map.map((mapIndex) => mapIndex === index ? 0 : mapIndex > index ? mapIndex - 1 : mapIndex);
    update({ library, map });
  };

  const fillMap = (): void => {
    const cellCount = offsetsForMap(width, height);
    update({ map: Array.from({ length: cellCount }, () => 0) });
  };

  return (
    <InspectorSection
      className="scene-metatile-inspector room-detail-editor-span-2"
      description="Metatiles são uma camada de autoria do GBA Studio: cada bloco 2×2 é expandido para quatro tiles BG no exportador."
      title="Autoria de metatiles"
    >
      {sceneType !== "topdown" ? (
        <p className="room-detail-section-help">Este contrato está habilitado para o perfil Topdown nesta milestone; outras cenas permanecem no fluxo tiled padrão.</p>
      ) : null}
      <InspectorToggle
        checked={normalized.enabled}
        description="Ausência ou desativação mantém o mapa como tiles individuais."
        disabled={sceneType !== "topdown"}
        label="Ativar autoria de metatiles"
        onChange={enableAuthoring}
      />
      {normalized.enabled ? (
        <>
          <div className="scene-metatile-summary" role="status">
            <span>{dimensions.width} × {dimensions.height} blocos lógicos</span>
            <span>2 × 2 tiles BG físicos</span>
            <span>{normalized.library.length} definição(ões)</span>
          </div>
          <div className="scene-metatile-toolbar">
            <InspectorAction onClick={addDefinition}>Adicionar metatile</InspectorAction>
            <InspectorAction disabled={normalized.library.length === 0} onClick={fillMap}>Preencher mapa com o primeiro</InspectorAction>
          </div>
          {normalized.library.map((definition, index) => (
            <fieldset className="scene-metatile-definition" key={`${definition.id}-${index}`}>
              <legend>{definition.label || `Metatile ${index + 1}`}</legend>
              <div className="scene-metatile-definition-header">
                <label>
                  <span>ID</span>
                  <input aria-label={`ID do metatile ${index + 1}`} onChange={(event) => updateDefinition(index, { id: event.currentTarget.value })} type="text" value={definition.id} />
                </label>
                <label>
                  <span>Nome</span>
                  <input aria-label={`Nome do metatile ${index + 1}`} onChange={(event) => updateDefinition(index, { label: event.currentTarget.value })} type="text" value={definition.label} />
                </label>
                <InspectorAction onClick={() => removeDefinition(index)}>Remover</InspectorAction>
              </div>
              <div className="scene-metatile-tile-grid">
                {definition.tiles.map((tile, tileIndex) => (
                  <InspectorNumber
                    ariaLabel={`Tile ${tileIndex + 1} do metatile ${index + 1}`}
                    key={tileIndex}
                    label={`Tile ${tileIndex + 1}`}
                    max={PHYSICAL_TILE_LIMIT}
                    min={0}
                    onChange={(nextTile) => updateDefinition(index, { tiles: definition.tiles.map((entry, entryIndex) => entryIndex === tileIndex ? nextTile : entry) as [number, number, number, number] })}
                    value={tile}
                  />
                ))}
              </div>
              <div className="scene-metatile-definition-header">
                <InspectorSelect
                  label="Colisão"
                  onChange={(collision) => updateDefinitionSemantic(index, { collision: collision as RoomCollisionType })}
                  options={ROOM_COLLISION_TYPES.map((collision) => ({ label: roomCollisionTypeLabel(collision), value: collision }))}
                  value={definition.semantic.collision}
                />
                <InspectorNumber label="Dano" max={255} min={0} onChange={(damage) => updateDefinitionSemantic(index, { damage })} value={definition.semantic.damage} />
                <InspectorNumber label="Velocidade %" max={200} min={0} onChange={(speedPercent) => updateDefinitionSemantic(index, { speedPercent })} value={definition.semantic.speedPercent} />
              </div>
            </fieldset>
          ))}
          <label className="scene-composition-textarea-field">
            <span>Mapa lógico · {dimensions.width * dimensions.height} índices</span>
            <textarea
              aria-label="Mapa lógico de metatiles"
              onChange={(event) => update({ map: event.currentTarget.value.split(",").map((entry) => Number(entry.trim())).filter((entry) => Number.isFinite(entry)) })}
              rows={3}
              value={normalized.map.join(", ")}
            />
            <small>O índice aponta para a definição na biblioteca. O export falha se o tamanho ou os índices não forem válidos.</small>
          </label>
        </>
      ) : null}
      {normalized.enabled && issues.length > 0 ? (
        <ul className="scene-composition-issues" role="status">
          {issues.slice(0, 6).map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
        </ul>
      ) : null}
    </InspectorSection>
  );
}

export function defaultSceneMetatileInspectorValue(): SceneMetatileAuthoringConfig {
  return defaultSceneMetatileAuthoring();
}
