import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useEffect, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { deriveAudioPianoPitchRows, type AudioWorkspaceItem } from "../shared/audioWorkspace.js";

export interface GrooveCell { audioID: string; channelID: string; stepIndex: number }
export const grooveTrackName = (label: string, type: string): string => {
  if (!/^(pulse\s?[12]|wave|noise)$/i.test(label)) return label;
  return /pulse2/i.test(type) ? "Harmonia" : /wave/i.test(type) ? "Baixo" : /noise/i.test(type) ? "Ritmo" : "Melodia";
};
export const grooveTrackTone = (type: string): string => /noise|sfx/i.test(type) ? "noise" : /wave/i.test(type) ? "wave" : /pulse2/i.test(type) ? "pulse2" : "pulse1";
export const grooveHardwareLabel = (type: string): string => /noise|sfx/i.test(type) ? "Noise" : /wave/i.test(type) ? "Wave" : /pulse2/i.test(type) ? "Pulse 2" : "Pulse 1";
const percussionLabel = (pitch: string): string => pitch === "H" ? "Chimbal" : pitch === "S" ? "Caixa" : pitch === "K" ? "Bumbo" : pitch;

const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiPitch = (note: string): number | null => {
  const match = /^([A-G]#?)([2-7])$/.exec(note);
  return match ? (Number(match[2]) + 1) * 12 + pitchNames.indexOf(match[1]) : null;
};
export function groovePitchRows(type: string, notes: Array<string | null>): string[] {
  if (/noise|sfx/i.test(type)) return deriveAudioPianoPitchRows(type, notes);
  const values = notes.flatMap(note => { const value = midiPitch(note ?? ""); return value === null ? [] : [value]; });
  if (!values.length) return deriveAudioPianoPitchRows(type);
  const lowest = Math.min(...values), highest = Math.max(...values);
  const low = Math.max(36, Math.min(lowest - 1, highest - 12));
  const high = Math.min(107, Math.max(low + 12, highest + 1));
  return Array.from({ length: high - low + 1 }, (_, index) => {
    const value = high - index; return `${pitchNames[value % 12]}${Math.floor(value / 12) - 1}`;
  });
}

interface Props {
  item: AudioWorkspaceItem;
  selectedCell: GrooveCell | null;
  selectedChannelID: string | null;
  playbackStep: number | null;
  onSelectCell(cell: GrooveCell): void;
  onUpdateChannel(channelID: string, fields: { muted?: boolean; solo?: boolean }): void;
  onSetNote(channelID: string, stepIndex: number, note: string): void;
}
export function AudioGroovePiano({ item, selectedCell, selectedChannelID, playbackStep, onSelectCell, onUpdateChannel, onSetNote }: Props): React.ReactElement {
  const ui = useStudioUiText();
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [item.id, item.activePatternID]);
  const pageSize = 16;
  const pages = Math.max(1, Math.ceil(item.stepCount / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const firstStep = currentPage * pageSize;
  const count = Math.max(1, Math.min(pageSize, item.stepCount - firstStep));
  const steps = Array.from({ length: count }, (_, i) => firstStep + i);
  const selectedStep = selectedCell?.audioID === item.id ? selectedCell.stepIndex : null;
  const timelineStyle = { "--groove-steps": count, "--groove-lanes": Math.max(1, item.previewRows.length) } as CSSProperties;
  return <div className="audio-groove-piano" aria-label={ui("Piano roll de {0}", { 0: item.name })} style={timelineStyle}>
    <div className="audio-groove-ruler">
      <div className="audio-groove-page-controls">
        <button aria-label={ui("Passos anteriores")} title={ui("Passos anteriores")} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} type="button"><ChevronLeft size={16} /></button>
        <span>{firstStep + 1}–{firstStep + count}</span>
        <button aria-label={ui("Próximos passos")} title={ui("Próximos passos")} disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} type="button"><ChevronRight size={16} /></button>
      </div>
      <div className="audio-groove-step-pads" role="toolbar" aria-label={ui("Passos do piano roll")}>
        {steps.map(step => <button key={step} aria-label={ui("Selecionar passo {0}", { 0: step + 1 })} aria-pressed={selectedStep === step}
          className={[selectedStep === step ? "active" : "", playbackStep === step ? "playing" : ""].join(" ")}
          onClick={() => selectedChannelID && onSelectCell({ audioID: item.id, channelID: selectedChannelID, stepIndex: step })} type="button">{step + 1}</button>)}
      </div>
    </div>
    <div className="audio-groove-lanes">
      {item.previewRows.map(row => {
        const pitches = groovePitchRows(row.type, row.cells.map(cell => cell.note));
        const cells = row.cells.slice(firstStep, firstStep + count);
        const selected = selectedChannelID === row.id;
        const style = { "--groove-pitches": pitches.length } as CSSProperties;
        const name = grooveTrackName(row.label, row.type);
        return <section key={row.id} style={style} aria-label={ui("Faixa {0}", { 0: name })}
          className={`audio-groove-lane groove-${grooveTrackTone(row.type)} ${selected ? "selected" : ""} ${row.isMuted ? "muted" : ""}`}>
          <div className="audio-groove-track">
            <button className="audio-groove-track-select" aria-label={ui("Selecionar canal {0}", { 0: row.label })} aria-pressed={selected}
              onClick={() => onSelectCell({ audioID: item.id, channelID: row.id, stepIndex: selectedStep ?? firstStep })} type="button">
              <span className="audio-groove-track-dot" aria-hidden="true" /><span><strong>{name}</strong><small>{grooveHardwareLabel(row.type)}</small></span>
            </button>
            <div className="audio-groove-track-switches">
              <button aria-label={ui("Silenciar {0}", { 0: row.label })} title={ui("Silenciar {0}", { 0: row.label })} aria-pressed={row.isMuted} onClick={() => onUpdateChannel(row.id, { muted: !row.isMuted })} type="button">M</button>
              <button aria-label={ui("Solo de {0}", { 0: row.label })} title={ui("Solo afeta apenas a prévia")} aria-pressed={row.isSolo} onClick={() => onUpdateChannel(row.id, { solo: !row.isSolo })} type="button">S</button>
            </div>
          </div>
          <div className="audio-groove-keys" aria-hidden="true">
            {pitches.map(pitch => <span key={pitch} className={pitch.includes("#") ? "black" : "white"}>{/noise|sfx/i.test(row.type) ? ui(percussionLabel(pitch)) : pitch.startsWith("C") && !pitch.includes("#") ? pitch : ""}</span>)}
          </div>
          <div className="audio-groove-grid" aria-label={ui("{0} notas em {1}", { 0: row.activeNoteCount, 1: row.label })}>
            {pitches.flatMap((pitch, pitchIndex) => cells.map(cell => {
              const note = cell.note === pitch;
              const isSelected = note && selectedCell?.audioID === item.id && selectedCell.channelID === row.id && selectedCell.stepIndex === cell.index;
              return <button key={`${pitch}-${cell.index}`} type="button"
                aria-label={ui("{0} no passo {1} de {2}", { 0: note ? ui("Selecionar {0}", { 0: cell.note }) : cell.isActive ? ui("Substituir {0} por {1}", { 0: cell.note, 1: pitch }) : ui("Adicionar {0}", { 0: pitch }), 1: cell.index + 1, 2: row.label })}
                aria-pressed={isSelected}
                className={`audio-groove-cell ${note ? "has-note" : ""} ${isSelected ? "selected-note" : ""} ${playbackStep === cell.index ? "playing" : ""} ${cell.index % 4 === 0 ? "beat" : ""}`}
                style={{ gridColumn: cell.index - firstStep + 1, gridRow: pitchIndex + 1 }}
                onClick={() => { onSelectCell({ audioID: item.id, channelID: row.id, stepIndex: cell.index }); if (!note) onSetNote(row.id, cell.index, pitch); }}
                title={ui("{0} · passo {1}", { 0: ui(percussionLabel(pitch)), 1: cell.index + 1 })}>
                {note ? <span aria-hidden="true" /> : null}
              </button>;
            }))}
          </div>
        </section>;
      })}
    </div>
    {pages > 1 ? <span className="audio-groove-page-hint">{ui("Página ")}{currentPage + 1} {ui(" de ")}{pages} · {item.stepCount} {ui(" passos")}</span> : null}
  </div>;
}
