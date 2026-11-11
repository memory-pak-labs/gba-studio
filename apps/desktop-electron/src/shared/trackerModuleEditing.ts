import type { GBAProjectData } from "./projectFile.js";
import { audioRecords, audioSourceAsset, audioSourceFormat } from "./audioContract.js";
import { isTrackerModule, trackerNotePeriod, validateTrackerModuleSong, type TrackerModuleSong, type TrackerModuleCell, type TrackerModuleChannel } from "./trackerModule.js";
import { extendedNoteByte } from "./extendedTrackerModule.js";

export interface ReadTrackerModuleRequest { projectPath: string; data: GBAProjectData; audioID: string }
export interface ReadTrackerModuleResult { song?: TrackerModuleSong; error?: string }
export type TrackerModuleEdit =
  | { type: "cell"; patternID: string; channelID: string; row: number; fields: Partial<TrackerModuleCell> & { note?: string; clear?: boolean; clearVolume?: boolean } }
  | { type: "move-cell"; patternID: string; channelID: string; row: number; direction: -1 | 1 }
  | { type: "pattern-select"; patternID: string }
  | { type: "pattern-add"; id: string; name: string; sourcePatternID?: string }
  | { type: "pattern-rename"; patternID: string; name: string }
  | { type: "pattern-remove"; patternID: string }
  | { type: "order"; patternOrder: string[] }
  | { type: "channel-add"; id: string }
  | { type: "channel-remove"; channelID: string; patternID: string };

export function trackerModuleSong(audio: Record<string, unknown>): TrackerModuleSong {
  return audio as unknown as TrackerModuleSong;
}
export function createEditableTrackerCopyInProject(data: GBAProjectData, audioID: string, song: TrackerModuleSong, id: string): GBAProjectData {
  validateTrackerModuleSong(song);
  const source = audioRecords(data.audioItems).find(a => a.id === audioID);
  const asset = source && audioSourceAsset(data, source);
  if (!source || source.kind !== "Musica" || !asset || isTrackerModule(source) || audioSourceFormat(data, source) !== song.format) throw new Error("Selecione uma música MOD, S3M, XM ou IT importada.");
  const items = audioRecords(data.audioItems);
  if (!id.trim() || items.some(a => a.id === id)) throw new Error("Identificador de áudio já usado.");
  const base = `${String(source.name)} (editável)`; let name = base, suffix = 2;
  while (items.some(a => a.name === name)) name = `${base} ${suffix++}`;
  const exportBase = `tracker_edit_${id.replace(/[^a-z0-9_]/gi, "_")}`; let exportID = exportBase, exportSuffix = 2;
  while (items.some(a => a.exportID === exportID)) exportID = `${exportBase}_${exportSuffix++}`;
  const copy = { ...structuredClone(source), ...structuredClone(song), id, name, exportID, sourceAssetID: asset.id, volume: 100 };
  return { ...data, audioItems: [...items, copy] };
}

function emptyChannel(id: string, index: number, rows = 64): TrackerModuleChannel {
  return { id, name: `Canal ${index + 1}`, type: "pcm", notes: Array(rows).fill("---"),
    trackerCells: Array.from({ length: rows }, () => ({ instrument: 0, effect: 0, parameter: 0 })) };
}
function assertNote(note: string, song: TrackerModuleSong): void {
  if (song.trackerModule.format === "MOD") trackerNotePeriod(note);
  else if (song.trackerModule.format === "XM" || song.trackerModule.format === "IT") extendedNoteByte(note, song.trackerModule.format);
  else if (!["---", "OFF"].includes(note) && !/^(?:C#?|D#?|E|F#?|G#?|A#?|B)[0-9]$/.test(note)) throw new Error("Use uma nota de C0 a B9 ou OFF.");
}
function assertInt(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${label} inválido.`);
}
export function editTrackerModuleInProject(data: GBAProjectData, audioID: string, edit: TrackerModuleEdit): GBAProjectData {
  const items = audioRecords(data.audioItems); const index = items.findIndex(a => a.id === audioID);
  if (index < 0 || !isTrackerModule(items[index])) return data;
  const audio = structuredClone(items[index]); const song = trackerModuleSong(audio); const meta = song.trackerModule;
  const pattern = "patternID" in edit ? song.patterns.find(p => p.id === edit.patternID) : undefined;
  if ("patternID" in edit && !pattern) return data;
  switch (edit.type) {
    case "cell": {
      assertInt(edit.row, pattern!.steps - 1, "Linha"); const channel = pattern!.channels.find(c => c.id === edit.channelID); if (!channel) return data;
      const cell = channel.trackerCells[edit.row]; const fields = edit.fields;
      if (fields.clear) { channel.notes[edit.row] = "---"; channel.trackerCells[edit.row] = { instrument: 0, effect: 0, parameter: 0 }; break; }
      if (fields.note !== undefined) {
        const note = fields.note.trim().toUpperCase() || "---"; assertNote(note, song);
        if (!["---", "OFF", "CUT", "FADE"].includes(note) && channel.notes[edit.row] === "---" && !cell.instrument && fields.instrument === undefined) {
          cell.instrument = channel.trackerCells.slice(0, edit.row).reverse().find(c => c.instrument)?.instrument
            ?? meta.instruments.find(instrument => instrument.length > 0)?.number ?? 0;
        }
        channel.notes[edit.row] = note;
      }
      if (fields.instrument !== undefined) { assertInt(fields.instrument, meta.format === "MOD" ? 31 : Math.min(255, meta.instruments.length), "Instrumento"); cell.instrument = fields.instrument; }
      if (fields.volume !== undefined) { if (meta.format === "MOD") throw new Error("MOD controla volume pelo comando Cxx."); assertInt(fields.volume, meta.format === "S3M" ? 64 : 255, "Volume"); cell.volume = fields.volume; }
      if (fields.clearVolume) delete cell.volume;
      if (fields.effect !== undefined) { assertInt(fields.effect, meta.format === "MOD" ? 15 : 255, "Efeito"); cell.effect = fields.effect; }
      if (fields.parameter !== undefined) { assertInt(fields.parameter, 255, "Parâmetro"); cell.parameter = fields.parameter; }
      break;
    }
    case "move-cell": {
      const row = edit.row, target = row + edit.direction; assertInt(row, pattern!.steps - 1, "Linha"); assertInt(target, pattern!.steps - 1, "Destino");
      const channel = pattern!.channels.find(c => c.id === edit.channelID); if (!channel) return data;
      const targetCell = channel.trackerCells[target];
      if (channel.notes[target] !== "---" || targetCell.instrument || targetCell.effect || targetCell.parameter || targetCell.volume !== undefined) return data;
      channel.notes[target] = channel.notes[row]; channel.notes[row] = "---";
      channel.trackerCells[target] = channel.trackerCells[row]; channel.trackerCells[row] = { instrument: 0, effect: 0, parameter: 0 };
      break;
    }
    case "pattern-select": song.activePatternID = edit.patternID; break;
    case "pattern-add": {
      if (song.patterns.length >= (meta.format === "MOD" ? 128 : 256)) throw new Error("Limite de padrões do formato atingido.");
      if (!edit.id || song.patterns.some(p => p.id === edit.id)) return data;
      const source = edit.sourcePatternID ? song.patterns.find(p => p.id === edit.sourcePatternID) : null;
      if (edit.sourcePatternID && !source) return data;
      const next = source ? structuredClone(source) : { id: edit.id, name: edit.name, steps: 64,
        channels: meta.channelMap.map((_, i) => emptyChannel(`${edit.id}-channel-${i + 1}`, i)) };
      next.id = edit.id; next.name = edit.name.trim() || `Padrão ${song.patterns.length + 1}`;
      next.channels.forEach((c, i) => { c.id = `${edit.id}-channel-${i + 1}`; });
      song.patterns.push(next); song.patternOrder.push(next.id); song.activePatternID = next.id; break;
    }
    case "pattern-rename": if (edit.name.trim()) pattern!.name = edit.name.trim(); break;
    case "pattern-remove": {
      song.patterns = song.patterns.filter(p => p.id !== edit.patternID); song.patternOrder = song.patternOrder.filter(id => id !== edit.patternID);
      if (song.activePatternID === edit.patternID) song.activePatternID = song.patterns[0]?.id ?? ""; break;
    }
    case "order": {
      if (edit.patternOrder.length > (meta.format === "MOD" ? 128 : 256) || edit.patternOrder.some(id => !song.patterns.some(p => p.id === id))) throw new Error("Sequência de padrões inválida.");
      song.patternOrder = [...edit.patternOrder]; break;
    }
    case "channel-add": {
      if (meta.channelMap.length >= 16) return data;
      const index = meta.channelMap.length;
      const hidden = new Set(song.patterns.flatMap(pattern => Object.keys(pattern.trackerHiddenChannels ?? {}).map(Number)));
      const physical = Array.from({ length: meta.format === "IT" ? 64 : meta.format === "S3M" ? 32 : 16 }, (_, i) => i).find(i => !meta.channelMap.includes(i) && !hidden.has(i));
      if (physical === undefined) throw new Error("Nenhum canal físico livre sem substituir comandos preservados.");
      meta.channelMap.push(physical); song.patterns.forEach(p => p.channels.push(emptyChannel(`${p.id}-${edit.id}`, index, p.steps))); break;
    }
    case "channel-remove": {
      if (meta.channelMap.length <= 1) return data;
      const index = pattern!.channels.findIndex(c => c.id === edit.channelID); if (index < 0) return data;
      meta.channelMap.splice(index, 1); song.patterns.forEach(p => p.channels.splice(index, 1)); break;
    }
  }
  return { ...data, audioItems: items.map((item, i) => i === index ? audio : item) };
}
