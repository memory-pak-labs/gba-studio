import type { ReactElement } from "react";
import { usesSinglePlaneBackground } from "../shared/eventTransforms";
import { useStudioUiText } from "./studioUiText";

export function SceneBackgroundEffectsHelp({ sceneType }: { sceneType: string }): ReactElement | null {
  const ui = useStudioUiText();
  if (!usesSinglePlaneBackground(sceneType)) return null;
  const profile = sceneType.replace(/[_-]/g, "").toLowerCase();
  return <div data-background-scale-help>
    <p className="inspector-field-description">{ui("Para um fundo de imagem plana, use BG2 no Modo 1: até 512×512 pixels e 224 cores. A interface fica fixa.")}</p>
    {profile.startsWith("isometric") || profile === "dungeoncrawler" ?
      <p className="inspector-field-description">{ui("Neste perfil, a imagem affine plana substitui a vista do terreno e sua oclusão. A grade e a colisão continuam valendo para o jogo.")}</p> : null}
    {profile === "worldmap" ?
      <p className="inspector-field-description">{ui("No Mapa-múndi, os marcadores acompanham a transformação do mapa. Textos e botões mantêm o tamanho.")}</p> : null}
    {profile === "racing" ?
      <p className="inspector-field-description">{ui("Na Corrida em perspectiva, os eventos de BG2 usam o piso da pista e preservam o horizonte. O piso já ocupa essa camada.")}</p> : null}
    {profile === "pointandclick" || profile === "pointclick" ?
      <p className="inspector-field-description">{ui("A escala afeta apenas o fundo. Props, cursor e áreas clicáveis mantêm suas posições. Restaure o fundo antes de devolver o controle após um efeito temporário.")}</p> : null}
  </div>;
}
