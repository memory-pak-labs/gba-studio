import { MoreHorizontal, Pencil, Play } from "lucide-react";
import type { MouseEvent } from "react";
import { SCENE_DIAGRAM_CARD_SIZE } from "./sceneMapDiagram";
import { useStudioUiText } from "./studioUiText";

interface Props {
  name: string;
  typeLabel: string;
  summary: string;
  isStart: boolean;
  isActive: boolean;
  zoom: number;
  runDisabled: boolean;
  onOpen(): void;
  onRun(): void;
  onContextMenu(event: MouseEvent<HTMLElement>): void;
}

export function SceneDiagramCard({ name, typeLabel, summary, isStart, isActive, zoom, runDisabled, onOpen, onRun, onContextMenu }: Props) {
  const ui = useStudioUiText();
  return <article className={`scene-diagram-card${isActive ? " is-active-room" : ""}`}
    aria-label={ui("Card da cena {0} · organograma", { 0: name })} data-scene-map-mode="diagram" tabIndex={0}
    onDoubleClick={event => { if (!(event.target instanceof Element && event.target.closest("button"))) onOpen(); }}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}
    onContextMenu={onContextMenu}
    onPointerDown={event => { if (event.target instanceof Element && event.target.closest("button")) event.stopPropagation(); }}
    style={{ ...SCENE_DIAGRAM_CARD_SIZE, transform: `scale(${zoom})` }}>
    <div className="scene-diagram-card-heading">
      <strong title={name}>{name}</strong>
      <button type="button" aria-label={ui("Mais opções da cena {0}", { 0: name })} onClick={onContextMenu}><MoreHorizontal size={16} aria-hidden="true" /></button>
    </div>
    <div className="scene-diagram-card-type"><span>{ui(typeLabel)}</span>{isStart ? <em>{ui("Início do jogo")}</em> : null}</div>
    <div className="scene-diagram-card-bottom">
      <span>{summary}</span>
      <div className="scene-diagram-card-actions">
        <button type="button" aria-label={ui("Editar cena {0}", { 0: name })} title={ui("Editar cena")} onClick={onOpen}><Pencil size={14} aria-hidden="true" /></button>
        <button type="button" aria-label={ui("Executar somente a cena {0}", { 0: name })} title={ui("Testar cena")} onClick={onRun} disabled={runDisabled}><Play size={14} aria-hidden="true" /></button>
      </div>
    </div>
  </article>;
}
