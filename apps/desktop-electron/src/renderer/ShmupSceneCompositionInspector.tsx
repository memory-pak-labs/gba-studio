import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useMemo, type ReactElement } from "react";

import {
  resolveShmupSceneComposition,
  type ShmupSceneCompositionContract,
  type ShmupSceneCompositionResolution
} from "../shared/shmupSceneComposition";
import type { SceneCompositionConfig } from "../shared/sceneComposition";
import { InspectorSection } from "./InspectorControls";

export interface ShmupSceneCompositionInspectorProps {
  capabilityEnabled: boolean;
  composition: SceneCompositionConfig;
  roomHeight: number;
  roomWidth: number;
}

function contractStatus(resolution: ShmupSceneCompositionResolution): string {
  if (resolution.issues.some((issue) => issue.code === "AFFINE_CAPABILITY_REQUIRED")) {
    return "Affine bloqueado · habilite o opt-in";
  }
  if (resolution.config.video.affine !== null) return "Affine BG2 ativo";
  return "Tiled padrão ativo";
}

function planeDetail(contract: ShmupSceneCompositionContract): Array<{ id: string; title: string; detail: string }> {
  return [
    {
      id: "hud",
      title: "HUD",
      detail: `${contract.planes.hud.layer} fixo · não participa da rolagem`
    },
    {
      id: "actors",
      title: "Atores",
      detail: `${contract.planes.actors.layer} · player ${contract.planes.actors.playerSizePixels.x}×${contract.planes.actors.playerSizePixels.y}px`
    },
    {
      id: "obstacles",
      title: "Obstáculos",
      detail: `${contract.planes.obstacles.visualLayer ?? "sem camada visual"} · colisão ${contract.planes.obstacles.collisionSource}`
    },
    {
      id: "background",
      title: "Fundo",
      detail: `${contract.planes.background.layer} · ${contract.planes.background.source === "affine_tiled" ? "Affine tiled" : "Tiled regular"}`
    }
  ];
}

export function ShmupSceneCompositionInspector({
  capabilityEnabled,
  composition,
  roomHeight,
  roomWidth
}: ShmupSceneCompositionInspectorProps): ReactElement {
  const ui = useStudioUiText();
  const resolution = useMemo(
    () => resolveShmupSceneComposition({
      composition,
      capabilities: [{ id: "affine_background", enabled: capabilityEnabled, settings: {} }]
    }, { widthTiles: roomWidth, heightTiles: roomHeight }),
    [capabilityEnabled, composition, roomHeight, roomWidth]
  );
  const affine = resolution.config.video.affine;

  return (
    <InspectorSection
      className="shmup-scene-composition-inspector room-detail-editor-span-2"
      description={ui("A composição SHMUP mantém HUD, atores, obstáculos/colisão e fundo em contratos separados. Affine só entra quando a capability estiver habilitada explicitamente.")}
      title={ui("Composição SHMUP")}
    >
      <div className="shmup-scene-composition-heading">
        <div>
          <strong>{ui("Perfil horizontal · Mode 1")}</strong>
          <small>{contractStatus(resolution)}</small>
        </div>
        <span className={resolution.issues.length > 0 ? "is-warning" : "is-valid"} role="status">
          {resolution.issues.length > 0 ? ui("{0} incompatibilidade(s)", { 0: resolution.issues.length }) : ui("Contrato compatível")}
        </span>
      </div>

      <div className="shmup-scene-composition-planes" aria-label={ui("Planos da cena SHMUP")}>
        {planeDetail(resolution.config).map((plane) => (
          <article className="shmup-scene-composition-plane" data-plane-id={plane.id} key={plane.id}>
            <strong>{ui(plane.title)}</strong>
            <span>{ui(plane.detail)}</span>
          </article>
        ))}
      </div>

      <dl className="shmup-scene-composition-metrics" aria-label={ui("Dimensões físicas do SHMUP")}>
        <div>
          <dt>{ui("Viewport")}</dt>
          <dd>{resolution.config.viewport.widthPixels}×{resolution.config.viewport.heightPixels}{ui("px")}</dd>
        </div>
        <div>
          <dt>{ui("Mundo lógico")}</dt>
          <dd>{resolution.config.world.widthPixels}×{resolution.config.world.heightPixels}{ui("px · ")}{resolution.config.world.widthTiles}×{resolution.config.world.heightTiles} {ui(" tiles")}</dd>
        </div>
        <div>
          <dt>{ui("Mapa Affine físico")}</dt>
          <dd>{resolution.config.world.affineMapWidthTiles}×{resolution.config.world.affineMapHeightTiles} {ui(" tiles · ")}{affine ? ui("{0} bpp", { 0: affine.bpp }) : ui("não carregado")}</dd>
        </div>
        <div>
          <dt>{ui("Asset Affine")}</dt>
          <dd>{affine?.assetId ?? ui("nenhum · fallback tiled")}</dd>
        </div>
      </dl>

      {resolution.issues.length > 0 ? (
        <ul className="shmup-scene-composition-issues" role="status">
          {resolution.issues.map((issue) => <li key={`${issue.code}-${issue.field}`}>{ui(issue.message)}</li>)}
        </ul>
      ) : (
        <p className="shmup-scene-composition-valid" role="status">{ui("HUD, atores, colisão e fundo serão exportados em planos independentes.")}</p>
      )}
    </InspectorSection>
  );
}
