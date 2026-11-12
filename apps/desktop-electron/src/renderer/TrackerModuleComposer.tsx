import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AudioGroovePiano, type GrooveCell } from "./AudioGroovePiano.js";
import type { AudioComposerTab, AudioWorkspaceItem } from "../shared/audioWorkspace.js";
import type { TrackerModuleCell } from "../shared/trackerModule.js";
import { trackerNotePeriod } from "../shared/trackerModule.js";
import { extendedNoteByte } from "../shared/extendedTrackerModule.js";
import type { TrackerModuleEdit } from "../shared/trackerModuleEditing.js";
import { useStudioUiText } from "./studioUiText.js";

function CommitField({ label, value, valid, commit, type = "text", maxLength }: {
  label: string; value: string; valid(value: string): boolean; commit(value: string): void; type?: "text" | "number"; maxLength?: number;
}) {
  const ui = useStudioUiText(); const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = draft !== value && !valid(draft);
  return <label><span>{label}</span><input aria-label={label} aria-invalid={invalid || undefined} type={type} value={draft} maxLength={maxLength}
    onChange={event => setDraft(event.currentTarget.value)} onBlur={() => { if (draft !== value && valid(draft)) commit(draft); }}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); setDraft(value); } }} />
    {invalid ? <small role="alert">{ui("Valor inválido")}</small> : null}</label>;
}
const hex = (value: number, width = 2) => value.toString(16).toUpperCase().padStart(width, "0");
export function nativeTrackerEffect(format: string, cell: TrackerModuleCell): string {
  return `${(format === "S3M" || format === "IT") && cell.effect > 0 && cell.effect <= 26 ? String.fromCharCode(64 + cell.effect) : hex(cell.effect, 1)}${hex(cell.parameter)}`;
}
interface Props {
  item: AudioWorkspaceItem; mode: AudioComposerTab; onMode(mode: AudioComposerTab): void;
  selectedCell: GrooveCell | null; onSelect(cell: GrooveCell): void;
  onEdit(edit: TrackerModuleEdit): void; onDetails(): void;
}
export function TrackerModuleComposer({ item, mode, onMode, selectedCell, onSelect, onEdit, onDetails }: Props) {
  const ui = useStudioUiText(); const table = useRef<HTMLDivElement>(null); const meta = item.trackerModule!;
  const patternID = item.activePatternID ?? item.patterns[0]?.id ?? "";
  const selected = selectedCell?.audioID === item.id ? selectedCell : null;
  const row = item.previewRows.find(row => row.id === selected?.channelID) ?? item.previewRows[0];
  const rowIndex = Math.min(item.stepCount - 1, selected?.stepIndex ?? 0);
  const [trackerPage, setTrackerPage] = useState(0);
  const pageCount = Math.ceil(item.stepCount / 64), page = Math.min(trackerPage, pageCount - 1);
  useEffect(() => setTrackerPage(0), [item.id, patternID]);
  useEffect(() => { if (selected) setTrackerPage(Math.floor(rowIndex / 64)); }, [selected?.channelID, selected?.stepIndex, rowIndex]);
  const cell = row?.trackerCells?.[rowIndex]; const note = row?.cells[rowIndex]?.note ?? "---";
  const cellEdit = (fields: Partial<TrackerModuleCell> & { note?: string; clear?: boolean; clearVolume?: boolean }) => {
    if (row) onEdit({ type: "cell", patternID, channelID: row.id, row: rowIndex, fields });
  };
  function addPattern(duplicate = false) {
    const id = `tracker-pattern-${crypto.randomUUID()}`;
    onEdit({ type: "pattern-add", id, name: `${ui("Padrão")} ${item.patterns.length + 1}`, ...(duplicate ? { sourcePatternID: patternID } : {}) });
  }
  const order = item.patternSequence.map(slot => slot.patternID);
  const editOrder = (patternOrder: string[]) => onEdit({ type: "order", patternOrder });
  const emptyValue = (value: string) => value.trim() === "";
  const maxEffect = meta.format === "MOD" ? 15 : 255;
  function noteValid(value: string) {
    const normalized = value.trim().toUpperCase();
    if (meta.format === "MOD") { try { trackerNotePeriod(normalized); return true; } catch { return false; } }
    if (meta.format === "XM" || meta.format === "IT") { try { extendedNoteByte(normalized, meta.format); return true; } catch { return false; } }
    return emptyValue(normalized) || normalized === "---" || normalized === "OFF" || /^(?:C#?|D#?|E|F#?|G#?|A#?|B)[0-9]$/.test(normalized);
  }
  const fields = cell ? <div className="audio-native-cell-editor" aria-label={ui("Editar célula do módulo")}>
    <strong>{row.label} · {ui("Linha {0}", { 0: rowIndex + 1 })}</strong>
    <CommitField label={ui("Nota do passo")} value={note} valid={noteValid} commit={note => cellEdit({ note })} maxLength={4} />
    <label><span>{ui("Instrumento do passo")}</span><select aria-label={ui("Instrumento do passo")} value={cell.instrument} onChange={event => cellEdit({ instrument: Number(event.currentTarget.value) })}>
      <option value={0}>{ui("Herdar instrumento")}</option>
      {meta.instruments.filter(instrument => instrument.number <= 255).map(instrument => <option value={instrument.number} key={instrument.number} disabled={!instrument.length}>
        {hex(instrument.number)} · {instrument.name || ui("Sample vazio")}</option>)}
    </select></label>
    {meta.format === "S3M" ? <CommitField label={ui("Volume do passo")} value={cell.volume === undefined ? "" : String(cell.volume)} type="number"
      valid={value => emptyValue(value) || /^\d+$/.test(value) && Number(value) <= 64}
      commit={value => cellEdit(emptyValue(value) ? { clearVolume: true } : { volume: Number(value) })} /> : null}
    {meta.format === "XM" || meta.format === "IT" ? <CommitField label={ui("Volume/comando (hex)")} value={cell.volume === undefined ? "" : hex(cell.volume)} maxLength={2}
      valid={value => emptyValue(value) || /^[0-9a-f]{1,2}$/i.test(value)}
      commit={value => cellEdit(emptyValue(value) ? { clearVolume: true } : { volume: parseInt(value, 16) })} /> : null}
    <CommitField label={ui("Efeito (hex)")} value={hex(cell.effect, meta.format === "MOD" ? 1 : 2)} maxLength={2}
      valid={value => emptyValue(value) || /^[0-9a-f]{1,2}$/i.test(value) && parseInt(value, 16) <= maxEffect}
      commit={value => cellEdit({ effect: parseInt(value || "0", 16) })} />
    <CommitField label={ui("Parâmetro (hex)")} value={hex(cell.parameter)} maxLength={2}
      valid={value => emptyValue(value) || /^[0-9a-f]{1,2}$/i.test(value)} commit={value => cellEdit({ parameter: parseInt(value || "0", 16) })} />
    <div className="audio-native-cell-actions"><button type="button" onClick={() => cellEdit({ note: "" })}>{ui("Limpar nota")}</button>
      <button type="button" onClick={() => cellEdit({ clear: true })}>{ui("Limpar célula")}</button>
      <button type="button" disabled={rowIndex === 0} onClick={() => { onEdit({ type: "move-cell", patternID, channelID: row.id, row: rowIndex, direction: -1 }); onSelect({ audioID: item.id, channelID: row.id, stepIndex: rowIndex - 1 }); }}>{ui("Mover esquerda")}</button>
      <button type="button" disabled={rowIndex === item.stepCount - 1} onClick={() => { onEdit({ type: "move-cell", patternID, channelID: row.id, row: rowIndex, direction: 1 }); onSelect({ audioID: item.id, channelID: row.id, stepIndex: rowIndex + 1 }); }}>{ui("Mover direita")}</button>
    </div>
  </div> : null;
  return <div className="audio-native-composer" aria-label={ui("Editor de módulo {0}", { 0: item.name })}>
    <div className="audio-groove-patterns">
      {item.patterns.map(pattern => <button type="button" key={pattern.id} aria-pressed={pattern.id === patternID}
        onClick={() => onEdit({ type: "pattern-select", patternID: pattern.id })}>{pattern.name}</button>)}
      <button type="button" onClick={() => addPattern()}>{ui("Criar padrão")}</button>
      <div className="audio-groove-view-modes" role="group" aria-label={ui("Modo do compositor")}>
        {([['piano', 'Piano Roll'], ['tracker', 'Tracker'], ['sequence', 'Sequência']] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => onMode(id)}>{ui(label)}</button>)}
      </div>
    </div>
    <p className="audio-native-source-note">{ui(meta.projectOverlay ? "Edição no projeto · samples e comandos nativos preservados." : "Cópia editável · samples e comandos nativos preservados.")}
      {meta.format === "MOD" ? ` ${ui("No MOD, ajuste Fxx no Tracker para mudar velocidade e andamento.")}` : ""}</p>
    {meta.format === "XM" || meta.format === "IT" ? <p className="audio-native-source-note">{ui("Prévia e ROM: perfil PCM básico. Envelopes e efeitos incompatíveis são informados ao gerar o áudio.")}</p> : null}
    <div className="audio-native-view">
      {!item.patterns.length ? <p>{ui("Crie um padrão para continuar editando o módulo.")}</p> : mode === "piano" ? <AudioGroovePiano item={item} selectedCell={selectedCell} selectedChannelID={row?.id ?? null} playbackStep={null}
        onSelectCell={onSelect} onUpdateChannel={() => {}} onCreateChannel={() => onEdit({ type: "channel-add", id: crypto.randomUUID() })}
        onSetNote={(channelID, stepIndex, note) => onEdit({ type: "cell", patternID, channelID, row: stepIndex, fields: { note } })} /> : null}
      {mode === "tracker" ? <div className="audio-step-tracker audio-native-tracker">
        {pageCount > 1 ? <div className="audio-sequence-toolbar" role="group" aria-label={ui("Páginas do Tracker")}>
          <button type="button" disabled={!page} onClick={() => setTrackerPage(page - 1)}>{ui("Página anterior")}</button>
          <span>{page * 64 + 1}–{Math.min(item.stepCount, (page + 1) * 64)} / {item.stepCount}</span>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setTrackerPage(page + 1)}>{ui("Próxima página")}</button>
        </div> : null}
        <div className="audio-step-table" role="table" aria-label={ui("Notas e comandos do módulo")} ref={table}>
          <div className="audio-step-row header" role="row" style={{ gridTemplateColumns: `48px repeat(${item.previewRows.length}, minmax(140px, 1fr))` } as CSSProperties}>
            <span role="columnheader">#</span>{item.previewRows.map(row => <span key={row.id} role="columnheader">{row.label}</span>)}
          </div>
          {Array.from({ length: Math.min(64, item.stepCount - page * 64) }, (_, offset) => offset + page * 64).map(index => <div className={`audio-step-row ${index % 2 ? "odd" : "even"}`} key={index} role="row"
            style={{ gridTemplateColumns: `48px repeat(${item.previewRows.length}, minmax(140px, 1fr))` } as CSSProperties}>
            <span role="cell">{String(index + 1).padStart(2, "0")}</span>
            {item.previewRows.map((channel, column) => {
              const native = channel.trackerCells?.[index] ?? { instrument: 0, effect: 0, parameter: 0 }; const note = channel.cells[index]?.note ?? "---";
              const effect = nativeTrackerEffect(meta.format, native); const active = channel.id === row?.id && rowIndex === index;
              return <div role="cell" key={channel.id}><button type="button" data-native-row={index} data-native-column={column}
                className={active ? "selected" : ""} aria-pressed={active} tabIndex={active ? 0 : -1}
                aria-label={ui("Linha {0}, {1}: {2}, instrumento {3}, efeito {4}", { 0: index + 1, 1: channel.label, 2: note, 3: hex(native.instrument), 4: effect })}
                onClick={() => onSelect({ audioID: item.id, channelID: channel.id, stepIndex: index })}
                onKeyDown={event => {
                  const directions: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
                  const delta = directions[event.key]; if (!delta) return; event.preventDefault();
                  const targetRow = Math.max(0, Math.min(item.stepCount - 1, index + delta[0])); const targetColumn = Math.max(0, Math.min(item.previewRows.length - 1, column + delta[1]));
                  onSelect({ audioID: item.id, channelID: item.previewRows[targetColumn].id, stepIndex: targetRow });
                  setTrackerPage(Math.floor(targetRow / 64));
                  requestAnimationFrame(() => table.current?.querySelector<HTMLButtonElement>(`[data-native-row="${targetRow}"][data-native-column="${targetColumn}"]`)?.focus());
                }}><strong>{note}</strong><small>{hex(native.instrument)} · {native.volume === undefined ? ".." : meta.format === "XM" || meta.format === "IT" ? hex(native.volume) : native.volume} · {effect}</small></button></div>;
            })}
          </div>)}
        </div>
      </div> : null}
      {mode === "sequence" ? <div className="audio-pattern-sequence">
        <div className="audio-sequence-toolbar"><button type="button" disabled={!patternID} onClick={() => addPattern(true)}>{ui("Duplicar padrão")}</button>
          <button type="button" disabled={!patternID} onClick={() => onEdit({ type: "pattern-remove", patternID })}>{ui("Remover padrão")}</button>
          <button type="button" disabled={!patternID} onClick={() => editOrder([...order, patternID])}>{ui("Adicionar à sequência")}</button>
          <button type="button" disabled={!order.length} onClick={() => editOrder([])}>{ui("Limpar sequência")}</button></div>
        {patternID ? <CommitField label={ui("Nome do padrão")} value={item.activePatternName ?? ""} valid={value => !!value.trim()} commit={name => onEdit({ type: "pattern-rename", patternID, name })} /> : null}
        <div className="audio-native-order" aria-label={ui("Ordem de reprodução")}>
          {item.patternSequence.map((slot, index) => <div key={index}><span>{index + 1}</span>
            <select aria-label={ui("Padrão na posição {0}", { 0: index + 1 })} value={slot.patternID} onChange={event => editOrder(order.map((id, i) => i === index ? event.currentTarget.value : id))}>
              {item.patterns.map(pattern => <option key={pattern.id} value={pattern.id}>{pattern.name}</option>)}
            </select>
            <button type="button" aria-label={ui("Mover posição {0} para cima", { 0: index + 1 })} disabled={!index} onClick={() => { const next = [...order]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; editOrder(next); }}>↑</button>
            <button type="button" aria-label={ui("Remover posição {0}", { 0: index + 1 })} onClick={() => editOrder(order.filter((_, i) => i !== index))}>×</button>
          </div>)}
        </div>
      </div> : null}
    </div>
    {mode !== "sequence" ? fields : null}
    <div className="audio-native-footer"><span>{meta.format} · {item.channelCount}/16 {ui("faixas")} · {item.stepCount} {ui(" passos")}</span>
      {row ? <button type="button" disabled={item.channelCount <= 1} onClick={() => onEdit({ type: "channel-remove", patternID, channelID: row.id })}>{ui("Remover canal")}</button> : null}
      <button type="button" onClick={onDetails}>{ui("Detalhes")}</button></div>
  </div>;
}
