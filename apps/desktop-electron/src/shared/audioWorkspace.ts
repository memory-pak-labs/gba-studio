import { audioInstrumentBank, audioInstrumentUsageCount, resolveAudioInstrumentComposition } from "./audioInstruments.js";
import type { GBAProjectData } from "./projectFile.js";
import { audioContractIssues, audioSampleAssets, audioPhysicalChannel, audioSourceAsset, audioSourceFormat } from "./audioContract.js";
import {
  compileComposedMusicaToTracker,
  compileComposedSfxToAssetc,
  deriveAudioEngineExportDiagnostics,
  type AssetcAudioJsonDocument,
  type AudioEngineExportDiagnostic
} from "./engineProjectExport.js";

export type AudioWorkspaceOrigin = "Importado" | "Composto" | "Sem fonte";
export type AudioWorkspaceStatus = "OK" | "Atencao" | "Bloqueado";
export type AudioWorkspaceMode = "basic" | "complete";
export type AudioComposerTab = "piano" | "tracker" | "sequence";

export interface AudioWorkspaceItem {
  id: string;
  name: string;
  kind: string;
  format: string;
  assignedScene: string | null;
  loops: boolean;
  bpm: number | null;
  exportID: string;
  volume: number | null;
  source: string | null;
  origin: AudioWorkspaceOrigin;
  runtimeCommand: string | null;
  usageCount: number;
  usageLabels: string[];
  patternCount: number;
  patternOrderCount: number;
  channelCount: number;
  noteCount: number;
  mutedChannelCount: number;
  soloChannelCount: number;
  patterns: AudioWorkspacePattern[];
  patternSequence: AudioWorkspacePatternSequenceSlot[];
  activePatternID: string | null;
  activePatternName: string | null;
  stepCount: number;
  loopStart: number;
  previewRows: AudioWorkspacePreviewRow[];
  sampleSources?: Record<string, string>;
  compiledTracker: AssetcAudioJsonDocument["tracker"][number] | null;
  compiledSfx: AssetcAudioJsonDocument["sfx"][number] | null;
  status: AudioWorkspaceStatus;
  warnings: string[];
  errors: string[];
}

export interface AudioGbaBudget {
  channelCount: number;
  channelLimit: number;
  channelPercent: number;
  estimatedBytes: number;
  memoryLabel: string;
  status: "ok" | "limit" | "over";
}

export interface AudioNarrativePlacement {
  summary: string;
  locations: string[];
}

export interface AudioWorkspacePattern {
  id: string;
  name: string;
}

export function deriveAudioGbaBudget(item: AudioWorkspaceItem | null): AudioGbaBudget {
  const channelLimit = 4;
  const channelCount = item?.channelCount ?? 0;
  const estimatedBytes = item
    ? channelCount * 32 + item.noteCount * 2 + item.stepCount + item.patternCount * 48
    : 0;
  const memoryLabel = estimatedBytes < 1024
    ? `${estimatedBytes} B`
    : `${(estimatedBytes / 1024).toFixed(1)} KB`;

  return {
    channelCount,
    channelLimit,
    channelPercent: Math.min(100, Math.round((channelCount / channelLimit) * 100)),
    estimatedBytes,
    memoryLabel,
    status: channelCount > channelLimit ? "over" : channelCount === channelLimit ? "limit" : "ok"
  };
}

export function deriveAudioNarrativePlacement(item: AudioWorkspaceItem | null): AudioNarrativePlacement {
  if (!item) return { summary: "Nenhum audio selecionado", locations: [] };

  const locations = item.usageLabels.map((label) => (
    label.startsWith("Room: ") ? `Cena ${label.slice("Room: ".length)}` : label.replace(": ", " ")
  ));
  const assignedScene = item.assignedScene?.trim();
  const referencedScene = locations.find((location) => location.startsWith("Cena "))?.slice("Cena ".length);
  const summary = assignedScene && assignedScene !== "Global"
    ? `Relacionado à cena ${assignedScene}`
    : referencedScene
      ? `Toca na cena ${referencedScene}`
    : locations.length > 0
      ? `Usado em ${locations.length} ponto(s) do jogo`
      : assignedScene === "Global"
        ? "Disponivel globalmente"
        : "Ainda sem uso no jogo";

  return { summary, locations };
}

export interface AudioWorkspacePatternSequenceSlot {
  index: number;
  patternID: string;
  label: string;
  isMissing: boolean;
}

export interface AudioWorkspacePreviewCell {
  index: number;
  note: string | null;
  isActive: boolean;
  pitchClass: string | null;
  octave: number | null;
  pianoLane: number | null;
  isPercussion: boolean;
}

export interface AudioWorkspacePreviewRow {
  instrumentID?: string;
  pan?: number;
  sampleAssetID?: string | null;
  sampleRootNote?: string;
  sampleLoop?: boolean;
  id: string;
  label: string;
  type: string;
  instrument: string | null;
  envelope: string | null;
  volume: number;
  isMuted: boolean;
  isSolo: boolean;
  activeNoteCount: number;
  cells: AudioWorkspacePreviewCell[];
}

const pulsePianoPitchRows = [
  "C5", "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4"
];
const wavePianoPitchRows = [
  "C4", "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3"
];
const noisePianoPitchRows = ["H", "S", "K"];

export function deriveAudioPianoPitchRows(channelType: string, currentNotes: Array<string | null> = []): string[] {
  const normalizedType = channelType.trim().toLowerCase();
  const baseRows = normalizedType.includes("noise") || normalizedType.includes("sfx")
    ? noisePianoPitchRows
    : normalizedType.includes("wave")
      ? wavePianoPitchRows
      : pulsePianoPitchRows;
  const additionalRows = currentNotes
    .map((note) => note?.trim() ?? "")
    .filter((note, index, notes) => note.length > 0 && note !== "---" && !baseRows.includes(note) && notes.indexOf(note) === index);
  return [...baseRows, ...additionalRows];
}

export interface AudioComposerContext {
  modeLabel: string;
  audioName: string;
  bpm: number | null;
  patternName: string | null;
  stepCount: number;
  channelCount: number;
}

export interface AudioChannelMixingState {
  sampleAssetID: string | null;
  sampleRootNote: string;
  sampleLoop: boolean;
  channelID: string | null;
  channelLabel: string | null;
  instrument: string;
  envelope: string;
  volume: number;
  bpm: number | null;
  stepCount: number;
  loopStart: number;
}

export interface AudioWorkspaceCount {
  kind: string;
  count: number;
}

export interface AudioWorkspaceFormatCount {
  format: string;
  count: number;
}

export interface AudioWorkspaceSummary {
  audioCount: number;
  musicCount: number;
  sfxCount: number;
  loopingCount: number;
  importedCount: number;
  composedCount: number;
  unknownOriginCount: number;
  unusedCount: number;
  attentionCount: number;
  totalPatterns: number;
  totalChannels: number;
  totalNotes: number;
}

export interface AudioWorkspaceSummaryCard {
  id: string;
  label: string;
  value: string;
}

export interface AudioWorkspacePresentation {
  instruments?: Array<import("./audioInstruments.js").AudioInstrument & { usageCount: number }>;
  sampleInstruments?: Array<{ id: string; name: string }>;
  items: AudioWorkspaceItem[];
  kindCounts: AudioWorkspaceCount[];
  formatCounts: AudioWorkspaceFormatCount[];
  summary: AudioWorkspaceSummary;
  summaryCards: AudioWorkspaceSummaryCard[];
  exportDiagnostics: AudioEngineExportDiagnostic[];
}

export interface AudioWorkspaceFilterChip<TValue extends string> {
  id: string;
  label: string;
  count: number;
  value: TValue;
  isActive: boolean;
}

export interface AudioWorkspaceFilterChips {
  kind: Array<AudioWorkspaceFilterChip<string>>;
  format: Array<AudioWorkspaceFilterChip<string>>;
  origin: Array<AudioWorkspaceFilterChip<AudioWorkspaceOriginFilter>>;
  status: Array<AudioWorkspaceFilterChip<AudioWorkspaceFilterStatus>>;
}

export type AudioWorkspaceOriginFilter = "" | AudioWorkspaceOrigin;
export type AudioWorkspaceSortOption = "name-asc" | "name-desc" | "kind" | "bpm-desc" | "usage-desc";

export interface AudioWorkspaceModeSummary {
  mode: AudioWorkspaceMode;
  title: string;
  tabs: string[];
  centerLabel: string;
  inspectorPanels: string[];
}

export interface AudioComposerTabSummary {
  tab: AudioComposerTab;
  title: string;
  description: string;
  centerLabel: string;
  metrics: string[];
}

export interface AudioStepSelection {
  audioID: string;
  channelID: string;
  stepIndex: number;
}

export interface AudioStepToolbarState {
  hasSelection: boolean;
  selectedChannelLabel: string | null;
  selectedNote: string | null;
  canClearStep: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}

export type AudioWorkspaceFilterStatus = "" | "attention" | "unused";

export interface AudioWorkspaceFilterOptions {
  query?: string;
  kind?: string;
  format?: string;
  origin?: AudioWorkspaceOriginFilter;
  status?: AudioWorkspaceFilterStatus;
  sort?: AudioWorkspaceSortOption;
}

export interface CreateAudioItemOptions {
  sourceAssetID?: string;
  id: string;
  name: string;
  kind: string;
}

export interface DuplicateAudioItemOptions {
  sourceAudioID: string;
  newAudioID: string;
  newName: string;
}

export interface CreateAudioPatternOptions {
  id: string;
  name: string;
}

export interface CreateAudioChannelOptions {
  id: string;
  name: string;
  type: string;
  patternID?: string;
}

export interface UpdateAudioItemFields {
  kind?: string;
  format?: string;
  assignedScene?: string;
  loops?: boolean;
  bpm?: number;
  volume?: number;
  loopStart?: number;
  activePatternID?: string;
}

export interface DuplicateAudioPatternOptions {
  sourcePatternID: string;
  newPatternID: string;
  newName: string;
}

export interface PreparedAudioExport {
  fileName: string;
  contents: string;
}

export type AudioWorkspacePlaybackBadge = "Compatível" | "Sem pack";

export interface AudioWorkspaceExportSummary {
  exportID: string;
  fileName: string;
  runtimeCommand: string | null;
  origin: AudioWorkspaceOrigin;
  format: string;
  warningCount: number;
  ready: boolean;
  usageCount: number;
  playbackBadge: AudioWorkspacePlaybackBadge;
  playbackLabel: string;
}

export interface UpdateAudioChannelNoteOptions {
  channelID: string;
  stepIndex: number;
  note: string;
}

export interface TransposeAudioChannelNoteOptions {
  channelID: string;
  stepIndex: number;
  deltaSemitones: number;
}

export interface MoveAudioChannelNoteOptions {
  channelID: string;
  stepIndex: number;
  direction: -1 | 1;
}

export interface TransposeAudioChannelOptions {
  channelID: string;
  deltaSemitones: number;
}

export interface UpdateAudioChannelFieldsOptions {
  instrumentID?: string | null;
  pan?: number;
  sampleAssetID?: string | null;
  sampleRootNote?: string;
  sampleLoop?: boolean;
  channelID: string;
  name?: string;
  type?: string;
  muted?: boolean;
  solo?: boolean;
  instrument?: string;
  envelope?: string;
  volume?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integerField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

export function deriveAudioWorkspaceModeSummary(
  mode: AudioWorkspaceMode,
  item: AudioWorkspaceItem | null
): AudioWorkspaceModeSummary {
  if (mode === "complete") {
    return {
      mode,
      title: "Modo completo",
      tabs: ["Piano Roll", "Tracker", "Sequência atual"],
      centerLabel: item ? "Piano roll" : "Selecione uma música ou efeito para compor.",
      inspectorPanels: ["Dados do audio", "Canais e mixagem", "Uso no jogo", "Biblioteca"]
    };
  }

  return {
    mode,
    title: "Modo basico",
    tabs: [],
    centerLabel: item
      ? `Use o transporte para ouvir ${item.name} ou abra o modo completo para editar.`
      : "Selecione uma música ou efeito para compor.",
    inspectorPanels: ["Dados do audio", "Canais e mixagem", "Uso no jogo"]
  };
}

export function deriveAudioComposerTabSummary(
  tab: AudioComposerTab,
  item: AudioWorkspaceItem | null
): AudioComposerTabSummary {
  if (!item) {
    return {
      tab,
      title: tab === "tracker" ? "Tracker por passos" : tab === "sequence" ? "Sequência e padrões" : "Piano Roll",
      description: "Selecione uma música ou efeito para compor.",
      centerLabel: "Sem audio selecionado",
      metrics: []
    };
  }

  if (tab === "tracker") {
    return {
      tab,
      title: "Tracker por passos",
      description: "Edite cada passo como uma tabela musical, sem sair do compositor visual.",
      centerLabel: `${item.patternSequence[0]?.label ?? item.patterns[0]?.name ?? "p1"}`,
      metrics: [`${Math.max(...item.previewRows.flatMap((row) => row.cells.map((cell) => cell.index + 1)), 0)} passos`, `${item.channelCount} canal(is)`, `${item.noteCount} notas`]
    };
  }

  if (tab === "sequence") {
    return {
      tab,
      title: "Sequência e padrões",
      description: "Monte a música repetindo, movendo e combinando patterns.",
      centerLabel: item.patternSequence[0]?.label ?? item.patterns[0]?.name ?? "p1",
      metrics: [`${item.patternCount} padrão(ões)`, `${item.patternOrderCount} ordem(ns)`, `${item.channelCount} canal(is)`]
    };
  }

  return {
    tab,
    title: "Piano Roll",
    description: "Componha canais por notas em uma grade visual.",
    centerLabel: "Piano roll",
    metrics: [`${item.noteCount} notas`, `${item.channelCount} canal(is)`, item.loops ? "Loop OK" : "One-shot"]
  };
}

export function deriveAudioComposerContext(
  mode: AudioWorkspaceMode,
  item: AudioWorkspaceItem | null
): AudioComposerContext {
  return {
    modeLabel: mode === "complete" ? "Modo completo" : "Modo basico",
    audioName: item?.name ?? "Sem audio",
    bpm: item?.bpm ?? null,
    patternName: item?.activePatternName ?? item?.patterns[0]?.name ?? null,
    stepCount: item?.stepCount ?? 64,
    channelCount: item?.previewRows.length ?? item?.channelCount ?? 0
  };
}

export function deriveAudioChannelMixing(
  item: AudioWorkspaceItem | null,
  channelIDToMatch: string | null
): AudioChannelMixingState {
  const selectedRow = item && channelIDToMatch
    ? item.previewRows.find((row) => row.id === channelIDToMatch) ?? null
    : null;

  return {
    sampleAssetID: selectedRow?.sampleAssetID ?? null,
    sampleRootNote: selectedRow?.sampleRootNote ?? "C4",
    sampleLoop: selectedRow?.sampleLoop ?? false,
    channelID: selectedRow?.id ?? null,
    channelLabel: selectedRow?.label ?? null,
    instrument: selectedRow?.instrument ?? "Pulse Lead",
    envelope: selectedRow?.envelope ?? "Soft ADSR",
    volume: selectedRow?.volume ?? item?.volume ?? 80,
    bpm: item?.bpm ?? null,
    stepCount: item?.stepCount ?? 64,
    loopStart: item?.loopStart ?? 0
  };
}

export function deriveAudioStepToolbarState(
  item: AudioWorkspaceItem,
  selectedCell: AudioStepSelection | null
): AudioStepToolbarState {
  if (!selectedCell || selectedCell.audioID !== item.id) {
    return {
      hasSelection: false,
      selectedChannelLabel: null,
      selectedNote: null,
      canClearStep: false,
      canMoveLeft: false,
      canMoveRight: false
    };
  }

  const selectedRow = item.previewRows.find((row) => row.id === selectedCell.channelID);
  if (!selectedRow) {
    return {
      hasSelection: false,
      selectedChannelLabel: null,
      selectedNote: null,
      canClearStep: false,
      canMoveLeft: false,
      canMoveRight: false
    };
  }

  const selectedPreviewCell = selectedRow.cells.find((cell) => cell.index === selectedCell.stepIndex);
  const selectedNote = selectedPreviewCell?.note ?? null;
  const leftCell = selectedRow.cells.find((cell) => cell.index === selectedCell.stepIndex - 1);
  const rightCell = selectedRow.cells.find((cell) => cell.index === selectedCell.stepIndex + 1);
  return {
    hasSelection: true,
    selectedChannelLabel: selectedRow.label,
    selectedNote,
    canClearStep: Boolean(selectedNote),
    canMoveLeft: Boolean(selectedNote) && Boolean(leftCell) && !leftCell?.note,
    canMoveRight: Boolean(selectedNote) && Boolean(rightCell) && !rightCell?.note
  };
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;

  const rooms = projectArray(data, "rooms");
  if (rooms.length > 0) return rooms;

  return [];
}

function defaultExportID(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "audio_item";
}

function audioID(audio: Record<string, unknown>, index: number): string {
  return nullableString(audio.id) ?? `audio-${index + 1}`;
}

function audioName(audio: Record<string, unknown>, index: number): string {
  return stringField(audio.name, `Audio ${index + 1}`);
}

function defaultFormatForKind(kind: string): string {
  if (kind === "SFX") return "WAV";
  if (kind === "Musica") return "MOD";
  return "Desconhecido";
}

function defaultVolumeForKind(kind: string): number {
  return kind === "SFX" ? 90 : 80;
}

function clampedInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function parsePitchedNote(note: string): { pitchClass: string; octave: number; semitone: number; midi: number } | null {
  const match = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d)$/);
  if (!match) return null;

  const [, base, accidental, octaveText] = match;
  const naturalIndex = pitchClasses.indexOf(base as (typeof pitchClasses)[number]);
  if (naturalIndex < 0) return null;

  const octave = Number(octaveText);
  const accidentalDelta = accidental === "#" ? 1 : accidental === "B" ? -1 : 0;
  const midi = octave * pitchClasses.length + naturalIndex + accidentalDelta;
  if (!Number.isInteger(octave) || midi < 0 || midi > 8 * pitchClasses.length + pitchClasses.length - 1) return null;

  const semitone = ((midi % pitchClasses.length) + pitchClasses.length) % pitchClasses.length;
  const normalizedOctave = Math.floor(midi / pitchClasses.length);

  return {
    pitchClass: pitchClasses[semitone],
    octave: normalizedOctave,
    semitone,
    midi
  };
}

function noteFromMidi(midi: number): string | null {
  if (!Number.isInteger(midi) || midi < 0 || midi > 8 * pitchClasses.length + pitchClasses.length - 1) {
    return null;
  }

  const octave = Math.floor(midi / pitchClasses.length);
  const semitone = midi % pitchClasses.length;
  return `${pitchClasses[semitone]}${octave}`;
}

function seedComposedMusica(audio: Record<string, unknown>): void {
  const id = nullableString(audio.id) ?? "audio-1";
  const patternIDValue = `${id}-pattern-1`;
  const pattern = makeAudioPattern({ id: patternIDValue, name: "Pattern 1" });
  if (!pattern) return;

  const channels = patternChannels(pattern);
  applyPresetToChannels(channels, integerField(pattern.steps) ?? 64);
  pattern.channels = channels;

  audio.patterns = [pattern];
  audio.format = "COMPOSED";
  audio.patternOrder = [patternIDValue];
  audio.activePatternID = patternIDValue;
  audio.channels = [];
}

function makeAudioItem(options: CreateAudioItemOptions): Record<string, unknown> | null {
  const id = options.id.trim();
  const name = options.name.trim();
  const kind = normalizedKind(options.kind);
  if (!id || !name) return null;

  const audio: Record<string, unknown> = {
    id,
    name,
    kind,
    format: defaultFormatForKind(kind),
    assignedScene: kind === "SFX" ? "Global" : "",
    loops: kind === "Musica",
    bpm: 120,
    exportID: defaultExportID(name),
    volume: defaultVolumeForKind(kind),
    channels: []
  };

  if (kind === "Musica") {
    seedComposedMusica(audio);
  } else if (kind === "SFX") {
    const pattern = makeSfxPattern({ id: `${id}-pattern-1`, name: "Pattern 1" })!;
    audio.patterns = [pattern];
    audio.patternOrder = [pattern.id];
    audio.activePatternID = pattern.id;
    audio.format = "COMPOSED";
  }

  return audio;
}

function replaceAudioCommand(command: unknown, oldName: string, nextName: string): unknown {
  if (typeof command !== "string") return command;
  const parts = commandParts(command);
  if (!["play_music", "play_sfx"].includes(parts[0] ?? "") || parts[1] !== oldName) {
    return command;
  }

  parts[1] = nextName;
  return parts.join(" ");
}

function clearAudioCommand(command: unknown, audioNameToRemove: string): unknown {
  if (typeof command !== "string") return command;
  const parts = commandParts(command);
  if (!["play_music", "play_sfx"].includes(parts[0] ?? "") || parts[1] !== audioNameToRemove) {
    return command;
  }

  return "noop";
}

function updateAudioCommands(data: GBAProjectData, updater: (command: unknown) => unknown): void {
  for (const event of projectArray(data, "events")) {
    event.command = updater(event.command);
    if (!Array.isArray(event.steps)) continue;

    event.steps = event.steps.map((step) => {
      if (!isRecord(step)) return step;
      return {
        ...step,
        command: updater(step.command)
      };
    });
  }
}

function updateAudioReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  const replace = (record: Record<string, unknown>, key: string): void => {
    if (record[key] !== oldName) return;
    if (nextName) record[key] = nextName;
    else delete record[key];
  };
  for (const room of [...projectArray(data, "scenas"), ...projectArray(data, "rooms")]) {
    replace(room, "music");
    const runtime = isRecord(room.runtime) ? room.runtime : null;
    const config = runtime && isRecord(runtime.config) ? runtime.config : null;
    const presentation = config && isRecord(config.tacticalPresentation) ? config.tacticalPresentation : null;
    const audio = presentation && isRecord(presentation.audio) ? presentation.audio : null;
    if (audio) {
      replace(audio, "music");
      if (isRecord(audio.cues)) for (const cue of Object.keys(audio.cues)) replace(audio.cues, cue);
    }
  }
  for (const dialogue of projectArray(data, "dialogues")) {
    replace(dialogue, "textSound");
    replace(dialogue, "confirmSound");
  }
  updateAudioCommands(data, command => nextName ? replaceAudioCommand(command, oldName, nextName) : clearAudioCommand(command, oldName));
}

function renameAudioReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  updateAudioReferences(data, oldName, nextName);
}

function clearAudioReferences(data: GBAProjectData, name: string): void {
  updateAudioReferences(data, name, "");
}

function commandParts(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

function eventSteps(event: Record<string, unknown>): string[] {
  const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
  if (steps.length === 0) {
    return [stringField(event.command, "noop")];
  }

  return steps
    .filter((step) => step.isEnabled !== false)
    .map((step) => stringField(step.command, "noop"));
}

function roomUsageLabels(data: GBAProjectData, audioName: string): string[] {
  return projectRooms(data)
    .filter((room) => nullableString(room.music) === audioName)
    .map((room) => `Cena: ${stringField(room.name, "Cena sem nome")}`);
}

function eventUsageLabels(data: GBAProjectData, audioName: string, kind: string): string[] {
  const expectedVerb = kind === "SFX" ? "play_sfx" : kind === "Musica" ? "play_music" : null;
  if (!expectedVerb) return [];

  return projectArray(data, "events").flatMap((event) => {
    const hasUsage = eventSteps(event).some((command) => {
      const parts = commandParts(command);
      return parts[0] === expectedVerb && parts[1] === audioName;
    });
    return hasUsage ? [`Evento: ${stringField(event.name, "Evento sem nome")}`] : [];
  });
}

function dialogueUsageLabels(data: GBAProjectData, audioName: string): string[] {
  return projectArray(data, "dialogues").flatMap((dialogue, index) => {
    const dialogueLabel = stringField(
      dialogue.key ?? dialogue.id ?? dialogue.name,
      `Dialogo ${index + 1}`
    );
    const usages: string[] = [];
    if (nullableString(dialogue.textSound) === audioName) {
      usages.push(`Dialogo: ${dialogueLabel} (texto)`);
    }
    if (nullableString(dialogue.confirmSound) === audioName) {
      usages.push(`Dialogo: ${dialogueLabel} (confirmacao)`);
    }
    return usages;
  });
}

function tacticalUsageLabels(data: GBAProjectData, audioName: string): string[] {
  return projectArray(data, "scenas").flatMap((scene) => {
    const runtime = isRecord(scene.runtime) ? scene.runtime : null;
    const config = runtime && isRecord(runtime.config) ? runtime.config : null;
    const presentation = config && isRecord(config.tacticalPresentation)
      ? config.tacticalPresentation
      : null;
    const audio = presentation && isRecord(presentation.audio) ? presentation.audio : null;
    if (!audio) return [];

    const sceneName = stringField(scene.name, "Cena sem nome");
    const usages: string[] = [];
    if (nullableString(audio.music) === audioName) {
      usages.push(`Cena: ${sceneName} (trilha tática)`);
    }
    if (isRecord(audio.cues)) {
      for (const [cue, reference] of Object.entries(audio.cues)) {
        if (nullableString(reference) === audioName) {
          usages.push(`Cena: ${sceneName} (cue ${cue})`);
        }
      }
    }
    return usages;
  });
}

function itemPatterns(audio: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(audio.patterns) ? audio.patterns.filter(isRecord) : [];
}

function itemChannels(audio: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(audio.channels) ? audio.channels.filter(isRecord) : [];
}

function patternChannels(pattern: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(pattern.channels) ? pattern.channels.filter(isRecord) : [];
}

function channelID(channel: Record<string, unknown>, index: number): string {
  return nullableString(channel.id) ?? `channel-${index + 1}`;
}

function patternID(pattern: Record<string, unknown>, index: number): string {
  return nullableString(pattern.id) ?? `pattern-${index + 1}`;
}

function patternName(pattern: Record<string, unknown>, index: number): string {
  return nullableString(pattern.name) ?? `Padrao ${index + 1}`;
}

function defaultInstrumentForType(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes("pulse")) return "Pulse Lead";
  if (normalized.includes("wave")) return "Wave Bass";
  if (normalized.includes("noise")) return "Noise Kit";
  return "Pulse Lead";
}

function defaultEnvelopeForType(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.includes("noise")) return "Short Decay";
  return "Soft ADSR";
}

function defaultPatternChannels(patternIDToUse: string): Record<string, unknown>[] {
  return [
    { id: `${patternIDToUse}-pulse1`, name: "Pulse 1", type: "pulse1", instrument: "Pulse Lead", envelope: "Soft ADSR", notes: [] },
    { id: `${patternIDToUse}-pulse2`, name: "Pulse 2", type: "pulse2", instrument: "Pulse Lead", envelope: "Soft ADSR", notes: [] },
    { id: `${patternIDToUse}-wave`, name: "Wave", type: "wave", instrument: "Wave Bass", envelope: "Soft ADSR", notes: [] },
    { id: `${patternIDToUse}-noise`, name: "Noise", type: "noise", instrument: "Noise Kit", envelope: "Short Decay", notes: [] }
  ];
}

function makeAudioPattern(options: CreateAudioPatternOptions): Record<string, unknown> | null {
  const id = options.id.trim();
  const name = options.name.trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    steps: 64,
    channels: defaultPatternChannels(id)
  };
}

function makeSfxPattern(options: CreateAudioPatternOptions): Record<string, unknown> | null {
  const pattern = makeAudioPattern(options);
  return pattern ? { ...pattern, steps: 16, channels: [
    { id: `${options.id}-noise`, name: "Noise", type: "noise", instrument: "Noise Kit", envelope: "Short Decay", notes: [] }
  ] } : null;
}

function makeAudioChannel(options: CreateAudioChannelOptions): Record<string, unknown> | null {
  const id = options.id.trim();
  const name = options.name.trim();
  const type = options.type.trim();
  if (!id || !name || !type) return null;

  return {
    id,
    name,
    type,
    notes: [],
    muted: false,
    solo: false
  };
}

function allAudioChannels(audio: Record<string, unknown>): Record<string, unknown>[] {
  return [...itemChannels(audio), ...itemPatterns(audio).flatMap(patternChannels)];
}

function audioPatternSummaries(audio: Record<string, unknown>): AudioWorkspacePattern[] {
  return itemPatterns(audio).map((pattern, index) => ({
    id: patternID(pattern, index),
    name: patternName(pattern, index)
  }));
}

function patternOrderIDs(audio: Record<string, unknown>, patterns: AudioWorkspacePattern[]): string[] {
  if (Array.isArray(audio.patternOrder)) {
    return audio.patternOrder
      .map((pattern) => (typeof pattern === "string" ? pattern.trim() : ""))
      .filter((pattern) => pattern.length > 0);
  }

  return patterns.map((pattern) => pattern.id);
}

function derivePatternSequence(
  audio: Record<string, unknown>,
  patterns: AudioWorkspacePattern[]
): AudioWorkspacePatternSequenceSlot[] {
  const namesByID = new Map(patterns.map((pattern) => [pattern.id, pattern.name]));
  return patternOrderIDs(audio, patterns).map((patternIDToResolve, index) => {
    const label = namesByID.get(patternIDToResolve);
    return {
      index,
      patternID: patternIDToResolve,
      label: label ?? `Padrao ausente: ${patternIDToResolve}`,
      isMissing: !label
    };
  });
}

function channelsForMetrics(audio: Record<string, unknown>): Record<string, unknown>[] {
  const patterns = itemPatterns(audio);
  if (patterns.length > 0) {
    return patterns.flatMap(patternChannels);
  }
  return itemChannels(audio);
}

function patternCount(audio: Record<string, unknown>): number {
  const patterns = itemPatterns(audio);
  if (patterns.length > 0) return patterns.length;
  return itemChannels(audio).length > 0 ? 1 : 0;
}

function noteCount(channels: Record<string, unknown>[]): number {
  return channels.reduce((sum, channel) => {
    const notes = Array.isArray(channel.notes) ? channel.notes : [];
    return sum + notes.filter((note) => typeof note === "string" && note.trim().length > 0 && note.trim() !== "---").length;
  }, 0);
}

function noteCells(notes: unknown, maxSteps: number): AudioWorkspacePreviewCell[] {
  const values = Array.isArray(notes) ? notes : [];
  return Array.from({ length: maxSteps }, (_, index) => {
    const value = values[index];
    const note = typeof value === "string" ? value.trim() : "";
    const isActive = note.length > 0 && note !== "---";
    const pitchedNote = isActive ? parsePitchedNote(note) : null;
    return {
      index,
      isActive,
      isPercussion: isActive && !pitchedNote,
      note: isActive ? note : null,
      octave: pitchedNote?.octave ?? null,
      pianoLane: pitchedNote ? 8 * pitchClasses.length + pitchClasses.length - 1 - pitchedNote.midi : null,
      pitchClass: pitchedNote?.pitchClass ?? null
    };
  });
}

export function deriveAudioPreviewRows(
  channels: Record<string, unknown>[],
  maxRows = 4,
  maxSteps = 64,
  defaultVolume = 80
): AudioWorkspacePreviewRow[] {
  const safeMaxRows = clampedInteger(maxRows, 1, Math.max(16, channels.length));
  const safeMaxSteps = clampedInteger(maxSteps, 1, 64);
  return channels.slice(0, safeMaxRows).map((channel, index) => {
    const type = stringField(channel.type, "audio");
    const cells = noteCells(channel.notes, safeMaxSteps);
    return {
      id: nullableString(channel.id) ?? `channel-${index + 1}`,
      label: nullableString(channel.name) ?? `Canal ${index + 1}`,
      type,
      ...(channel.instrumentID ? { instrumentID: String(channel.instrumentID) } : {}),
      ...(channel.pan !== undefined ? { pan: Number(channel.pan) } : {}),
      ...(channel.sampleAssetID ? { sampleAssetID: nullableString(channel.sampleAssetID), sampleRootNote: stringField(channel.sampleRootNote, "C4"), sampleLoop: channel.sampleLoop === true } : {}),
      instrument: nullableString(channel.instrument) ?? defaultInstrumentForType(type),
      envelope: nullableString(channel.envelope) ?? defaultEnvelopeForType(type),
      volume: clampedInteger(integerField(channel.volume) ?? defaultVolume, 0, 100),
      isMuted: channel.muted === true,
      isSolo: channel.solo === true,
      activeNoteCount: cells.filter((cell) => cell.isActive).length,
      cells
    };
  });
}

function normalizedKind(value: unknown): string {
  const kind = stringField(value, "Audio");
  if (kind.toLowerCase() === "musica" || kind.toLowerCase() === "music") return "Musica";
  if (kind.toLowerCase() === "sfx" || kind.toLowerCase() === "sound") return "SFX";
  return kind;
}

function normalizedFormat(value: unknown): string {
  const format = nullableString(value);
  return format ? format.toUpperCase() : "Desconhecido";
}

function runtimeCommand(kind: string, name: string): string | null {
  if (kind === "Musica") return `play_music ${name}`;
  if (kind === "SFX") return `play_sfx ${name}`;
  return null;
}

function originForAudio(kind: string, source: string | null): AudioWorkspaceOrigin {
  if (source) return "Importado";
  if (kind === "Musica" || kind === "SFX") return "Composto";
  return "Sem fonte";
}

export function deriveAudioPlaybackExportStatus(item: {
  origin: AudioWorkspaceOrigin;
  format: string;
  source: string | null;
  patternCount: number;
  channelCount: number;
  kind: string;
}): { playbackBadge: AudioWorkspacePlaybackBadge; playbackLabel: string } {
  const format = item.format.toUpperCase();
  if (item.origin === "Importado" && item.source) {
    if (item.kind === "Musica" && ["MOD", "S3M"].includes(format)) {
      return {
        playbackBadge: "Compatível",
        playbackLabel: "Formato aceito pelo assetc; a compilação verifica o arquivo."
      };
    }
    if (item.kind === "SFX" && format === "WAV") {
      return {
        playbackBadge: "Compatível",
        playbackLabel: "Formato aceito pelo assetc; a compilação verifica o arquivo."
      };
    }
  }

  if ((item.patternCount > 0 || item.channelCount > 0) && (item.kind === "Musica" || item.kind === "SFX")) {
    return {
      playbackBadge: "Compatível",
      playbackLabel: "Composição convertida para o pack de áudio ao exportar."
    };
  }

  return {
    playbackBadge: "Sem pack",
    playbackLabel: "Este item não gera áudio no pack da ROM."
  };
}

function formatWarnings(kind: string, format: string, hasComposedContent: boolean): string[] {
  if (hasComposedContent && (kind === "Musica" || kind === "SFX")) {
    return [];
  }

  if (kind === "Musica" && !["MOD", "S3M", "VGM", "XM"].includes(format)) {
    return [`Formato incomum para Musica: ${format}.`];
  }

  if (kind === "SFX" && format !== "WAV") {
    return [`Formato incomum para SFX: ${format}.`];
  }

  return [];
}

function makeWarnings(item: {
  kind: string;
  format: string;
  hasComposedContent: boolean;
  usageCount: number;
  bpm: number | null;
  patternSequence: AudioWorkspacePatternSequenceSlot[];
}): string[] {
  const warnings: string[] = [];
  if (item.usageCount === 0) {
    warnings.push("Áudio sem uso em cenas ou eventos.");
  }
  warnings.push(...formatWarnings(item.kind, item.format, item.hasComposedContent));
  if (item.bpm !== null && (item.bpm < 40 || item.bpm > 240)) {
    warnings.push("BPM fora da faixa 40-240.");
  }
  for (const slot of item.patternSequence.filter((slot) => slot.isMissing)) {
    warnings.push(`Sequencia referencia padrao ausente no slot ${slot.index + 1}: ${slot.patternID}.`);
  }
  return warnings;
}

function countBy<T extends string>(values: T[], key: "kind" | "format"): Array<{ [K in typeof key]: string } & { count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ [key]: value, count }) as { [K in typeof key]: string } & { count: number })
    .sort((lhs, rhs) => lhs[key].localeCompare(rhs[key], "pt-BR"));
}

export function suggestAudioItemName(data: GBAProjectData, kind: string): string {
  const normalized = normalizedKind(kind);
  const stem = normalized === "Musica" ? "nova_musica" : normalized === "SFX" ? "novo_sfx" : "novo_audio";
  const extension = normalized === "Musica" ? ".mod" : ".wav";
  const existing = new Set(
    projectArray(data, "audioItems").map((item, index) => audioName(item, index).toLocaleLowerCase("pt-BR"))
  );

  let candidate = `${stem}${extension}`;
  let suffix = 2;
  while (existing.has(candidate.toLocaleLowerCase("pt-BR"))) {
    candidate = `${stem}_${suffix}${extension}`;
    suffix += 1;
  }

  return candidate;
}

export function createAudioItemInProject(data: GBAProjectData, options: CreateAudioItemOptions): GBAProjectData {
  const audio = makeAudioItem(options);
  if (!audio) return data;
  if (options.sourceAssetID) {
    const source = audioSourceAsset(data, { sourceAssetID: options.sourceAssetID });
    if (!source) return data;
    delete audio.patterns; delete audio.patternOrder; delete audio.activePatternID;
    audio.channels = []; audio.sourceAssetID = source.id;
    audio.format = String(source.name ?? "").split(".").at(-1)?.toUpperCase() ?? "";
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  if (audioItems.some((item, index) => audioID(item, index) === audio.id || audioName(item, index) === audio.name)) {
    return data;
  }

  next.audioItems = [...audioItems, audio];
  return next;
}

export function renameAudioItemInProject(data: GBAProjectData, audioIDToRename: string, nextName: string): GBAProjectData {
  const trimmedName = nextName.trim();
  if (!trimmedName) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToRename);
  if (audioIndex < 0) return data;

  const oldName = audioName(audioItems[audioIndex], audioIndex);
  if (oldName === trimmedName || audioItems.some((item, index) => index !== audioIndex && audioName(item, index) === trimmedName)) return data;
  const sourceAsset = audioSourceAsset(next, audioItems[audioIndex]);
  if (sourceAsset?.id) audioItems[audioIndex].sourceAssetID = sourceAsset.id;

  audioItems[audioIndex].name = trimmedName;
  audioItems[audioIndex].exportID = defaultExportID(trimmedName);
  next.audioItems = audioItems;
  renameAudioReferences(next, oldName, trimmedName);
  return next;
}

export function duplicateAudioItemInProject(data: GBAProjectData, options: DuplicateAudioItemOptions): GBAProjectData {
  const newAudioID = options.newAudioID.trim();
  const newName = options.newName.trim();
  if (!newAudioID || !newName || newAudioID === options.sourceAudioID) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const source = audioItems.find((item, index) => audioID(item, index) === options.sourceAudioID);
  if (!source || audioItems.some((item, index) => audioID(item, index) === newAudioID || audioName(item, index) === newName)) {
    return data;
  }

  next.audioItems = [
    ...audioItems,
    {
      ...cloneProjectData(source),
      ...(audioSourceAsset(next, source)?.id ? { sourceAssetID: audioSourceAsset(next, source)!.id } : {}),
      id: newAudioID,
      name: newName,
      exportID: defaultExportID(newName)
    }
  ];
  return next;
}

export function createAudioPatternInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: CreateAudioPatternOptions
): GBAProjectData {
  const pattern = makeAudioPattern(options);
  if (!pattern) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  if (audio.kind === "SFX") Object.assign(pattern, makeSfxPattern(options));
  const patterns = itemPatterns(audio);
  if (patterns.some((item, index) => patternID(item, index) === pattern.id || patternName(item, index) === pattern.name)) {
    return data;
  }

  const existingPatternOrder = patternOrderIDs(audio, audioPatternSummaries(audio));
  audio.patterns = [...patterns, pattern];
  audio.patternOrder = [...existingPatternOrder, pattern.id];
  next.audioItems = audioItems;
  return next;
}

export function renameAudioPatternInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  patternIDToRename: string,
  nextName: string
): GBAProjectData {
  const trimmedName = nextName.trim();
  if (!patternIDToRename.trim() || !trimmedName) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const patterns = itemPatterns(audio);
  const patternIndex = patterns.findIndex((item, index) => patternID(item, index) === patternIDToRename);
  if (patternIndex < 0 || patternName(patterns[patternIndex], patternIndex) === trimmedName) return data;
  if (patterns.some((item, index) => index !== patternIndex && patternName(item, index) === trimmedName)) {
    return data;
  }

  patterns[patternIndex].name = trimmedName;
  audio.patterns = patterns;
  next.audioItems = audioItems;
  return next;
}

export function removeAudioPatternFromProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  patternIDToRemove: string
): GBAProjectData {
  const trimmedPatternID = patternIDToRemove.trim();
  if (!trimmedPatternID) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const patterns = itemPatterns(audio);
  if (!patterns.some((item, index) => patternID(item, index) === trimmedPatternID)) {
    return data;
  }

  audio.patterns = patterns.filter((item, index) => patternID(item, index) !== trimmedPatternID);
  audio.patternOrder = patternOrderIDs(audio, audioPatternSummaries(audio)).filter((patternIDToKeep) => patternIDToKeep !== trimmedPatternID);
  next.audioItems = audioItems;
  return next;
}

export function createAudioChannelInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: CreateAudioChannelOptions
): GBAProjectData {
  const channel = makeAudioChannel(options);
  if (!channel || !audioPhysicalChannel(channel.type)) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  if (audio.kind === "SFX" && ![1, 4].includes(audioPhysicalChannel(channel.type) ?? 0)) return data;
  const channelIDToAdd = stringField(channel.id, "");
  if (allAudioChannels(audio).some((item, index) => channelID(item, index) === channelIDToAdd)) {
    return data;
  }

  const patterns = itemPatterns(audio);
  const targetPatternID = options.patternID?.trim() ?? "";
  if (patterns.length > 0) {
    if (!targetPatternID) return data;

    const pattern = patterns.find((item, index) => patternID(item, index) === targetPatternID);
    if (!pattern) return data;

    const channels = patternChannels(pattern);
    const limit = normalizedKind(audio.kind) === "SFX" ? 1 : 4;
    if (channels.length >= limit || channels.some(existing => audioPhysicalChannel(existing.type) === audioPhysicalChannel(channel.type))) return data;
    pattern.channels = [...channels, channel];
    audio.patterns = patterns;
  } else {
    if (targetPatternID) return data;
    const channels = itemChannels(audio);
    if (channels.length >= (normalizedKind(audio.kind) === "SFX" ? 1 : 4) || channels.some(existing => audioPhysicalChannel(existing.type) === audioPhysicalChannel(channel.type))) return data;
    audio.channels = [...channels, channel];
  }

  next.audioItems = audioItems;
  return next;
}

export function removeAudioChannelFromProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  channelIDToRemove: string
): GBAProjectData {
  const trimmedChannelID = channelIDToRemove.trim();
  if (!trimmedChannelID) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const patterns = itemPatterns(audio);
  for (const pattern of patterns) {
    const channels = patternChannels(pattern);
    if (!channels.some((item, index) => channelID(item, index) === trimmedChannelID)) continue;

    pattern.channels = channels.filter((item, index) => channelID(item, index) !== trimmedChannelID);
    audio.patterns = patterns;
    next.audioItems = audioItems;
    return next;
  }

  const channels = itemChannels(audio);
  if (!channels.some((item, index) => channelID(item, index) === trimmedChannelID)) {
    return data;
  }

  audio.channels = channels.filter((item, index) => channelID(item, index) !== trimmedChannelID);
  next.audioItems = audioItems;
  return next;
}

export function updateAudioItemFieldsInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  fields: UpdateAudioItemFields
): GBAProjectData {
  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  if (fields.kind !== undefined) {
    const kind = normalizedKind(fields.kind);
    const previousKind = normalizedKind(audio.kind);
    audio.kind = kind;
    if (kind !== previousKind) {
      audio.format = defaultFormatForKind(kind);
      audio.volume = defaultVolumeForKind(kind);
      audio.loops = kind === "Musica";
    }
  }

  if (fields.format !== undefined) {
    audio.format = normalizedFormat(fields.format);
  }

  if (fields.assignedScene !== undefined) {
    audio.assignedScene = fields.assignedScene.trim();
  }

  if (fields.loops !== undefined) {
    audio.loops = fields.loops;
  }

  if (fields.bpm !== undefined && Number.isFinite(fields.bpm)) {
    audio.bpm = clampedInteger(fields.bpm, 1, 999);
  }

  if (fields.volume !== undefined && Number.isFinite(fields.volume)) {
    audio.volume = clampedInteger(fields.volume, 0, 100);
  }

  if (fields.loopStart !== undefined && Number.isFinite(fields.loopStart)) {
    audio.loopStart = clampedInteger(fields.loopStart, 0, 63);
  }

  if (fields.activePatternID !== undefined) {
    const nextPatternID = fields.activePatternID.trim();
    if (!nextPatternID) {
      delete audio.activePatternID;
    } else {
      const validPatternIDs = new Set(itemPatterns(audio).map((pattern, index) => patternID(pattern, index)));
      if (!validPatternIDs.has(nextPatternID)) return data;
      audio.activePatternID = nextPatternID;
    }
  }

  next.audioItems = audioItems;
  return next;
}

function applyNoteToChannel(channel: Record<string, unknown>, stepIndex: number, note: string): void {
  const notes = Array.isArray(channel.notes) ? [...channel.notes] : [];
  while (notes.length <= stepIndex) {
    notes.push("---");
  }

  const trimmedNote = note.trim();
  notes[stepIndex] = trimmedNote.length > 0 ? trimmedNote : "---";
  channel.notes = notes;
}

const audioPatternPresetByType: Record<string, string[]> = {
  pulse1: ["C4", "---", "E4", "---", "G4", "---", "E4", "---", "C5", "---", "G4", "---", "E4", "---", "D4", "---"],
  pulse2: ["---", "C3", "---", "G3", "---", "C4", "---", "G3", "---", "C3", "---", "G3", "---", "B3", "---", "G3"],
  wave: ["C2", "---", "---", "---", "C2", "---", "---", "---", "A1", "---", "---", "---", "G1", "---", "---", "---"],
  noise: ["K", "---", "S", "---", "K", "---", "S", "---", "H", "---", "S", "---", "K", "---", "S", "---"]
};

function normalizedAudioChannelType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("pulse2") || normalized.includes("square2")) return "pulse2";
  if (normalized.includes("wave")) return "wave";
  if (normalized.includes("noise") || normalized.includes("sfx")) return "noise";
  if (normalized.includes("pulse1") || normalized.includes("square1") || normalized.includes("pulse")) return "pulse1";
  return "";
}

export function nextAudioChannelTypePreset(currentType: string): string {
  switch (normalizedAudioChannelType(currentType)) {
    case "pulse1":
      return "pulse2";
    case "pulse2":
      return "wave";
    case "wave":
      return "noise";
    default:
      return "pulse1";
  }
}

function presetNotesForChannel(channel: Record<string, unknown>): string[] {
  const type = stringField(channel.type, "").toLowerCase();
  if (type.includes("noise") || type.includes("sfx")) return audioPatternPresetByType.noise;
  if (type.includes("wave")) return audioPatternPresetByType.wave;
  if (type.includes("pulse2") || type.includes("square2")) return audioPatternPresetByType.pulse2;
  return audioPatternPresetByType.pulse1;
}

function rawNoteAt(channel: Record<string, unknown>, stepIndex: number): string | null {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  const value = notes[stepIndex];
  return typeof value === "string" ? value.trim() : null;
}

function activeNoteAt(channel: Record<string, unknown>, stepIndex: number): string | null {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  const value = notes[stepIndex];
  if (typeof value !== "string") return null;

  const note = value.trim();
  return note.length > 0 && note !== "---" ? note : null;
}

function isEmptyNoteAt(channel: Record<string, unknown>, stepIndex: number): boolean {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  const value = notes[stepIndex];
  if (typeof value !== "string") return true;

  const note = value.trim();
  return note.length === 0 || note === "---";
}

function applyPresetToChannels(channels: Record<string, unknown>[], maxSteps = 16): boolean {
  const safeMaxSteps = clampedInteger(maxSteps, 1, 64);
  let didChange = false;

  for (const channel of channels) {
    const preset = presetNotesForChannel(channel);
    for (let stepIndex = 0; stepIndex < safeMaxSteps; stepIndex += 1) {
      if (!isEmptyNoteAt(channel, stepIndex)) continue;

      const presetNote = preset[stepIndex % preset.length] ?? "---";
      const normalizedPresetNote = presetNote.trim() || "---";
      if (rawNoteAt(channel, stepIndex) === normalizedPresetNote) continue;

      applyNoteToChannel(channel, stepIndex, normalizedPresetNote);
      didChange = true;
    }
  }

  return didChange;
}

function resolveActivePattern(audio: Record<string, unknown>): Record<string, unknown> | null {
  const patterns = itemPatterns(audio);
  if (patterns.length === 0) return null;

  const summaries = audioPatternSummaries(audio);
  const activePatternID = nullableString(audio.activePatternID);
  if (activePatternID) {
    const active = patterns.find((item, index) => patternID(item, index) === activePatternID);
    if (active) return active;
  }

  const orderedPatternIDs = patternOrderIDs(audio, summaries);
  const firstOrderedPatternID = orderedPatternIDs[0];
  if (firstOrderedPatternID) {
    const orderedPattern = patterns.find((item, index) => patternID(item, index) === firstOrderedPatternID);
    if (orderedPattern) return orderedPattern;
  }

  return patterns[0] ?? null;
}

function previewChannelsForAudio(audio: Record<string, unknown>): { channels: Record<string, unknown>[]; maxSteps: number } {
  const activePattern = resolveActivePattern(audio);
  if (activePattern) {
    const steps = integerField(activePattern.steps) ?? 64;
    return {
      channels: patternChannels(activePattern),
      maxSteps: clampedInteger(steps, 1, 64)
    };
  }

  return {
    channels: itemChannels(audio),
    maxSteps: 64
  };
}

function activePatternPresentation(audio: Record<string, unknown>, patterns: AudioWorkspacePattern[]): {
  activePatternID: string | null;
  activePatternName: string | null;
  stepCount: number;
} {
  const activePattern = resolveActivePattern(audio);
  if (!activePattern) {
    return { activePatternID: null, activePatternName: null, stepCount: 64 };
  }

  const patternRecords = itemPatterns(audio);
  const patternIndex = patternRecords.indexOf(activePattern);
  const activePatternID = patternID(activePattern, patternIndex >= 0 ? patternIndex : 0);
  const activePatternName = patternName(activePattern, patternIndex >= 0 ? patternIndex : 0);
  const stepCount = clampedInteger(integerField(activePattern.steps) ?? 64, 1, 64);
  return { activePatternID, activePatternName, stepCount };
}

function targetPatternForPreset(audio: Record<string, unknown>): Record<string, unknown> | null {
  return resolveActivePattern(audio);
}

function moveNoteInChannel(
  channel: Record<string, unknown>,
  stepIndex: number,
  direction: -1 | 1,
  maxSteps = 16
): boolean {
  const targetIndex = stepIndex + direction;
  const safeMaxSteps = clampedInteger(maxSteps, 1, 64);
  if (stepIndex < 0 || stepIndex >= safeMaxSteps || targetIndex < 0 || targetIndex >= safeMaxSteps) {
    return false;
  }

  const note = activeNoteAt(channel, stepIndex);
  if (!note || !isEmptyNoteAt(channel, targetIndex)) return false;

  applyNoteToChannel(channel, targetIndex, note);
  applyNoteToChannel(channel, stepIndex, "");
  return true;
}

function transposedChannelNote(channel: Record<string, unknown>, stepIndex: number, deltaSemitones: number): string | null {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  const currentNote = notes[stepIndex];
  if (typeof currentNote !== "string") return null;

  const pitchedNote = parsePitchedNote(currentNote);
  if (!pitchedNote) return null;

  return noteFromMidi(pitchedNote.midi + deltaSemitones);
}

function transposeAllChannelNotes(channel: Record<string, unknown>, deltaSemitones: number): boolean {
  const notes = Array.isArray(channel.notes) ? [...channel.notes] : [];
  let didChange = false;
  const nextNotes = notes.map((value) => {
    if (typeof value !== "string") return value;

    const pitchedNote = parsePitchedNote(value);
    if (!pitchedNote) return value;

    const nextNote = noteFromMidi(pitchedNote.midi + deltaSemitones);
    if (!nextNote || nextNote === value.trim()) return value;

    didChange = true;
    return nextNote;
  });

  if (!didChange) return false;

  channel.notes = nextNotes;
  return true;
}

function updatePatternChannelNote(audio: Record<string, unknown>, channelIDToUpdate: string, stepIndex: number, note: string): boolean {
  for (const pattern of itemPatterns(audio)) {
    const channels = patternChannels(pattern);
    const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
    if (!channel) continue;

    applyNoteToChannel(channel, stepIndex, note);
    pattern.channels = channels;
    return true;
  }

  return false;
}

function transposePatternChannel(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  deltaSemitones: number
): boolean {
  for (const pattern of itemPatterns(audio)) {
    const channels = patternChannels(pattern);
    const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
    if (!channel) continue;

    const didChange = transposeAllChannelNotes(channel, deltaSemitones);
    if (!didChange) return false;

    pattern.channels = channels;
    return true;
  }

  return false;
}

function transposePatternChannelNote(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  stepIndex: number,
  deltaSemitones: number
): boolean {
  for (const pattern of itemPatterns(audio)) {
    const channels = patternChannels(pattern);
    const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
    if (!channel) continue;

    const nextNote = transposedChannelNote(channel, stepIndex, deltaSemitones);
    if (!nextNote) return false;

    applyNoteToChannel(channel, stepIndex, nextNote);
    pattern.channels = channels;
    return true;
  }

  return false;
}

function movePatternChannelNote(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  stepIndex: number,
  direction: -1 | 1
): boolean {
  for (const pattern of itemPatterns(audio)) {
    const channels = patternChannels(pattern);
    const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
    if (!channel) continue;

    const maxSteps = integerField(pattern.steps) ?? 16;
    const didMove = moveNoteInChannel(channel, stepIndex, direction, maxSteps);
    if (!didMove) return false;

    pattern.channels = channels;
    return true;
  }

  return false;
}

function updateDirectChannelNote(audio: Record<string, unknown>, channelIDToUpdate: string, stepIndex: number, note: string): boolean {
  const channels = itemChannels(audio);
  const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
  if (!channel) return false;

  applyNoteToChannel(channel, stepIndex, note);
  audio.channels = channels;
  return true;
}

function transposeDirectChannel(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  deltaSemitones: number
): boolean {
  const channels = itemChannels(audio);
  const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
  if (!channel) return false;

  const didChange = transposeAllChannelNotes(channel, deltaSemitones);
  if (!didChange) return false;

  audio.channels = channels;
  return true;
}

function transposeDirectChannelNote(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  stepIndex: number,
  deltaSemitones: number
): boolean {
  const channels = itemChannels(audio);
  const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
  if (!channel) return false;

  const nextNote = transposedChannelNote(channel, stepIndex, deltaSemitones);
  if (!nextNote) return false;

  applyNoteToChannel(channel, stepIndex, nextNote);
  audio.channels = channels;
  return true;
}

function moveDirectChannelNote(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  stepIndex: number,
  direction: -1 | 1
): boolean {
  const channels = itemChannels(audio);
  const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
  if (!channel) return false;

  const didMove = moveNoteInChannel(channel, stepIndex, direction);
  if (!didMove) return false;

  audio.channels = channels;
  return true;
}

function applyChannelFields(channel: Record<string, unknown>, fields: UpdateAudioChannelFieldsOptions): void {
  if (fields.instrumentID !== undefined) { if (fields.instrumentID) channel.instrumentID = fields.instrumentID; else delete channel.instrumentID; }
  if (fields.pan !== undefined && Number.isFinite(fields.pan)) channel.pan = clampedInteger(fields.pan, -127, 127);
  if (fields.sampleAssetID !== undefined) {
    if (fields.sampleAssetID) channel.sampleAssetID = fields.sampleAssetID;
    else { delete channel.sampleAssetID; delete channel.sampleRootNote; delete channel.sampleLoop; }
  }
  if (fields.sampleRootNote !== undefined) channel.sampleRootNote = fields.sampleRootNote;
  if (fields.sampleLoop !== undefined) channel.sampleLoop = fields.sampleLoop;
  if (fields.name !== undefined) {
    channel.name = fields.name.trim();
  }

  if (fields.type !== undefined) {
    channel.type = fields.type.trim();
  }

  if (fields.muted !== undefined) {
    channel.muted = fields.muted;
  }

  if (fields.solo !== undefined) {
    channel.solo = fields.solo;
  }

  if (fields.instrument !== undefined) {
    channel.instrument = fields.instrument.trim();
  }

  if (fields.envelope !== undefined) {
    channel.envelope = fields.envelope.trim();
  }

  if (fields.volume !== undefined && Number.isFinite(fields.volume)) {
    channel.volume = clampedInteger(fields.volume, 0, 100);
  }
}

function updatePatternChannelFields(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  fields: UpdateAudioChannelFieldsOptions
): boolean {
  for (const pattern of itemPatterns(audio)) {
    const channels = patternChannels(pattern);
    const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
    if (!channel) continue;

    applyChannelFields(channel, fields);
    pattern.channels = channels;
    return true;
  }

  return false;
}

function updateDirectChannelFields(
  audio: Record<string, unknown>,
  channelIDToUpdate: string,
  fields: UpdateAudioChannelFieldsOptions
): boolean {
  const channels = itemChannels(audio);
  const channel = channels.find((item, index) => channelID(item, index) === channelIDToUpdate);
  if (!channel) return false;

  applyChannelFields(channel, fields);
  audio.channels = channels;
  return true;
}

export function updateAudioChannelNoteInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: UpdateAudioChannelNoteOptions
): GBAProjectData {
  const channelIDToUpdate = options.channelID.trim();
  if (!channelIDToUpdate || !Number.isInteger(options.stepIndex) || options.stepIndex < 0) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const didUpdate = updatePatternChannelNote(audio, channelIDToUpdate, options.stepIndex, options.note) ||
    updateDirectChannelNote(audio, channelIDToUpdate, options.stepIndex, options.note);
  if (!didUpdate) return data;

  next.audioItems = audioItems;
  return next;
}

export function applyAudioPatternPresetInProject(
  data: GBAProjectData,
  audioIDToUpdate: string
): GBAProjectData {
  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const pattern = targetPatternForPreset(audio);
  if (pattern) {
    const channels = patternChannels(pattern);
    if (channels.length === 0) return data;

    const maxSteps = integerField(pattern.steps) ?? 16;
    const didApply = applyPresetToChannels(channels, maxSteps);
    if (!didApply) return data;

    pattern.channels = channels;
    audio.patterns = itemPatterns(audio);
    next.audioItems = audioItems;
    return next;
  }

  const channels = itemChannels(audio);
  if (channels.length === 0) return data;

  const didApply = applyPresetToChannels(channels);
  if (!didApply) return data;

  audio.channels = channels;
  next.audioItems = audioItems;
  return next;
}

export function moveAudioChannelNoteInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: MoveAudioChannelNoteOptions
): GBAProjectData {
  const channelIDToUpdate = options.channelID.trim();
  if (
    !channelIDToUpdate ||
    !Number.isInteger(options.stepIndex) ||
    options.stepIndex < 0 ||
    (options.direction !== -1 && options.direction !== 1)
  ) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const didMove = movePatternChannelNote(audio, channelIDToUpdate, options.stepIndex, options.direction) ||
    moveDirectChannelNote(audio, channelIDToUpdate, options.stepIndex, options.direction);
  if (!didMove) return data;

  next.audioItems = audioItems;
  return next;
}

export function transposeAudioChannelNoteInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: TransposeAudioChannelNoteOptions
): GBAProjectData {
  const channelIDToUpdate = options.channelID.trim();
  if (
    !channelIDToUpdate ||
    !Number.isInteger(options.stepIndex) ||
    options.stepIndex < 0 ||
    !Number.isInteger(options.deltaSemitones) ||
    options.deltaSemitones === 0
  ) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const didUpdate = transposePatternChannelNote(audio, channelIDToUpdate, options.stepIndex, options.deltaSemitones) ||
    transposeDirectChannelNote(audio, channelIDToUpdate, options.stepIndex, options.deltaSemitones);
  if (!didUpdate) return data;

  next.audioItems = audioItems;
  return next;
}

export function transposeAudioChannelInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: TransposeAudioChannelOptions
): GBAProjectData {
  const channelIDToUpdate = options.channelID.trim();
  if (!channelIDToUpdate || !Number.isInteger(options.deltaSemitones) || options.deltaSemitones === 0) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const didUpdate = transposePatternChannel(audio, channelIDToUpdate, options.deltaSemitones) ||
    transposeDirectChannel(audio, channelIDToUpdate, options.deltaSemitones);
  if (!didUpdate) return data;

  next.audioItems = audioItems;
  return next;
}

export function updateAudioChannelFieldsInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  fields: UpdateAudioChannelFieldsOptions
): GBAProjectData {
  const channelIDToUpdate = fields.channelID.trim();
  const hasName = fields.name !== undefined;
  const hasType = fields.type !== undefined;
  if (!channelIDToUpdate || (
    !hasName &&
    !hasType &&
    fields.muted === undefined &&
    fields.solo === undefined &&
    fields.instrument === undefined &&
    fields.envelope === undefined &&
    fields.volume === undefined &&
    fields.sampleAssetID === undefined && fields.sampleRootNote === undefined && fields.sampleLoop === undefined && fields.instrumentID === undefined && fields.pan === undefined
  )) {
    return data;
  }

  if ((hasName && fields.name?.trim().length === 0) || (hasType && fields.type?.trim().length === 0)) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  if (fields.instrumentID && (audio.kind !== "Musica" || !audioInstrumentBank(next).some(item => item.id === fields.instrumentID))) return data;
  const targetChannel = [...itemChannels(audio), ...itemPatterns(audio).flatMap(patternChannels)].find(channel => channel.id === channelIDToUpdate);
  if ((fields.instrumentID || fields.sampleAssetID) && audioPhysicalChannel(targetChannel?.type) === 4) return data;
  if (fields.sampleAssetID && (audio.kind !== "Musica" || !audioSampleAssets(next).some(asset => asset.id === fields.sampleAssetID))) return data;
  if (fields.type !== undefined) {
    const physical = audioPhysicalChannel(fields.type);
    const group = [itemChannels(audio), ...itemPatterns(audio).map(patternChannels)].find(channels => channels.some(channel => channel.id === channelIDToUpdate));
    if (!physical || audio.kind === "SFX" && physical !== 1 && physical !== 4 || group?.some(channel => channel.id !== channelIDToUpdate && audioPhysicalChannel(channel.type) === physical)) return data;
  }
  const didUpdate = updatePatternChannelFields(audio, channelIDToUpdate, fields) ||
    updateDirectChannelFields(audio, channelIDToUpdate, fields);
  if (!didUpdate) return data;

  next.audioItems = audioItems;
  return next;
}

export function updateAudioPatternOrderSlotInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  slotIndex: number,
  patternIDToSet: string
): GBAProjectData {
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const patterns = audioPatternSummaries(audio);
  const validPatternIDs = new Set(patterns.map((pattern) => pattern.id));
  const nextPatternID = patternIDToSet.trim();
  if (nextPatternID && !validPatternIDs.has(nextPatternID)) {
    return data;
  }

  const nextOrder = patternOrderIDs(audio, patterns);
  if (slotIndex > nextOrder.length || (slotIndex === nextOrder.length && !nextPatternID)) {
    return data;
  }

  if (nextPatternID) {
    if (nextOrder[slotIndex] === nextPatternID) return data;
    if (slotIndex === nextOrder.length) {
      nextOrder.push(nextPatternID);
    } else {
      nextOrder[slotIndex] = nextPatternID;
    }
  } else {
    if (slotIndex >= nextOrder.length) return data;
    nextOrder.splice(slotIndex, 1);
  }

  audio.patternOrder = nextOrder;
  next.audioItems = audioItems;
  return next;
}

export function setActiveAudioPatternInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  patternIDToSet: string
): GBAProjectData {
  return updateAudioItemFieldsInProject(data, audioIDToUpdate, { activePatternID: patternIDToSet });
}

export function duplicateAudioPatternInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  options: DuplicateAudioPatternOptions
): GBAProjectData {
  const sourcePatternID = options.sourcePatternID.trim();
  const newPatternID = options.newPatternID.trim();
  const newName = options.newName.trim();
  if (!sourcePatternID || !newPatternID || !newName) return data;

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const patterns = itemPatterns(audio);
  const sourceIndex = patterns.findIndex((item, index) => patternID(item, index) === sourcePatternID);
  if (sourceIndex < 0) return data;
  if (patterns.some((item, index) => patternID(item, index) === newPatternID || patternName(item, index) === newName)) {
    return data;
  }

  const source = patterns[sourceIndex];
  const clonedChannels = patternChannels(source).map((channel, index) => ({
    ...cloneProjectData(channel),
    id: `${newPatternID}-${stringField(channel.type, `ch${index + 1}`)}`
  }));
  const duplicate = {
    ...cloneProjectData(source),
    id: newPatternID,
    name: newName,
    channels: clonedChannels
  };

  audio.patterns = [...patterns, duplicate];
  audio.patternOrder = [...patternOrderIDs(audio, audioPatternSummaries(audio)), newPatternID];
  audio.activePatternID = newPatternID;
  next.audioItems = audioItems;
  return next;
}

export function clearAudioPatternSequenceInProject(
  data: GBAProjectData,
  audioIDToUpdate: string
): GBAProjectData {
  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  if (!Array.isArray(audio.patternOrder) || audio.patternOrder.length === 0) return data;

  audio.patternOrder = [];
  next.audioItems = audioItems;
  return next;
}

export function moveAudioPatternOrderSlotInProject(
  data: GBAProjectData,
  audioIDToUpdate: string,
  slotIndex: number,
  direction: -1 | 1
): GBAProjectData {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || (direction !== -1 && direction !== 1)) {
    return data;
  }

  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const order = [...patternOrderIDs(audio, audioPatternSummaries(audio))];
  const targetIndex = slotIndex + direction;
  if (slotIndex >= order.length || targetIndex < 0 || targetIndex >= order.length) return data;

  [order[slotIndex], order[targetIndex]] = [order[targetIndex], order[slotIndex]];
  audio.patternOrder = order;
  next.audioItems = audioItems;
  return next;
}

export function normalizeAudioInProject(
  data: GBAProjectData,
  audioIDToUpdate: string
): GBAProjectData {
  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToUpdate);
  if (audioIndex < 0) return data;

  const audio = audioItems[audioIndex];
  const bpm = integerField(audio.bpm);
  const volume = integerField(audio.volume);
  const loopStart = integerField(audio.loopStart);
  if (bpm !== null) audio.bpm = clampedInteger(bpm, 40, 240);
  if (volume !== null) audio.volume = clampedInteger(volume, 0, 100);
  audio.loopStart = clampedInteger(loopStart ?? 0, 0, 63);
  next.audioItems = audioItems;
  return next;
}

export function removeAudioItemFromProject(data: GBAProjectData, audioIDToRemove: string): GBAProjectData {
  const next = cloneProjectData(data);
  const audioItems = projectArray(next, "audioItems");
  const audioIndex = audioItems.findIndex((item, index) => audioID(item, index) === audioIDToRemove);
  if (audioIndex < 0) return data;

  const removedName = audioName(audioItems[audioIndex], audioIndex);
  next.audioItems = audioItems.filter((_, index) => index !== audioIndex);
  clearAudioReferences(next, removedName);
  return next;
}

export function deriveAudioWorkspacePresentation(data: GBAProjectData): AudioWorkspacePresentation {
  const items = projectArray(data, "audioItems")
    .map((rawAudio, index): AudioWorkspaceItem => {
      const audio = resolveAudioInstrumentComposition(data, rawAudio);
      const name = stringField(audio.name, "Audio sem nome");
      const kind = normalizedKind(audio.kind);
      const format = normalizedFormat(patternCount(audio) > 0 || itemChannels(audio).length > 0 ? audio.format : audioSourceFormat(data, audio));
      const sourceAsset = audioSourceAsset(data, audio);
      const sourceMetadata = sourceAsset && isRecord(sourceAsset.metadata) ? sourceAsset.metadata : null;
      const source = sourceMetadata ? nullableString(sourceMetadata.source) : null;
      const patterns = audioPatternSummaries(audio);
      const preview = previewChannelsForAudio(audio);
      const previewChannels = preview.channels;
      const activePattern = activePatternPresentation(audio, patterns);
      const usages = [
        ...roomUsageLabels(data, name),
        ...eventUsageLabels(data, name, kind),
        ...dialogueUsageLabels(data, name),
        ...tacticalUsageLabels(data, name)
      ];
      const bpm = integerField(audio.bpm);
      const normalizedBPM = bpm && bpm > 0 ? bpm : null;
      const patternSequence = derivePatternSequence(audio, patterns);
      const warnings = makeWarnings({
        kind,
        format,
        hasComposedContent: patternCount(audio) > 0 || previewChannels.length > 0,
        usageCount: usages.length,
        bpm: normalizedBPM,
        patternSequence
      });
      const issues = audioContractIssues(audio, data);
      const errors = issues.filter(issue => issue.level === "error").map(issue => issue.message);
      warnings.push(...issues.filter(issue => issue.level === "warning").map(issue => issue.message));
      const loopStart = clampedInteger(integerField(audio.loopStart) ?? 0, 0, 63);
      const compiledTracker = kind === "Musica"
        ? compileComposedMusicaToTracker(audio, stringField(audio.exportID, defaultExportID(name)))
        : null;
      const compiledSfx = kind === "SFX"
        ? compileComposedSfxToAssetc(audio, stringField(audio.exportID, defaultExportID(name)))
        : null;

      return {
        id: nullableString(audio.id) ?? `audio-${index + 1}`,
        name,
        kind,
        format,
        assignedScene: nullableString(audio.assignedScene),
        loops: booleanField(audio.loops, false),
        bpm: normalizedBPM,
        exportID: stringField(audio.exportID, defaultExportID(name)),
        volume: integerField(audio.volume),
        source,
        origin: originForAudio(kind, patternCount(audio) > 0 || previewChannels.length > 0 ? null : source),
        runtimeCommand: runtimeCommand(kind, name),
        usageCount: usages.length,
        usageLabels: usages,
        patternCount: patternCount(audio),
        patternOrderCount: Array.isArray(audio.patternOrder) ? audio.patternOrder.length : patternCount(audio),
        channelCount: previewChannels.length,
        noteCount: noteCount(previewChannels),
        mutedChannelCount: previewChannels.filter((channel) => channel.muted === true).length,
        soloChannelCount: previewChannels.filter((channel) => channel.solo === true).length,
        patterns,
        patternSequence,
        activePatternID: activePattern.activePatternID,
        activePatternName: activePattern.activePatternName,
        stepCount: activePattern.stepCount,
        loopStart,
        previewRows: deriveAudioPreviewRows(previewChannels, Math.max(4, previewChannels.length), preview.maxSteps, 100),
        sampleSources: Object.fromEntries(audioSampleAssets(data).map(asset => [String(asset.id), String((asset.metadata as Record<string, unknown>).source)])),
        compiledTracker,
        compiledSfx,
        status: errors.length > 0 ? "Bloqueado" : warnings.length > 0 ? "Atencao" : "OK",
        errors,
        warnings
      };
    })
    .sort((lhs, rhs) => lhs.name.localeCompare(rhs.name, "pt-BR"));

  const summary: AudioWorkspaceSummary = {
    audioCount: items.length,
    musicCount: items.filter((item) => item.kind === "Musica").length,
    sfxCount: items.filter((item) => item.kind === "SFX").length,
    loopingCount: items.filter((item) => item.loops).length,
    importedCount: items.filter((item) => item.origin === "Importado").length,
    composedCount: items.filter((item) => item.origin === "Composto").length,
    unknownOriginCount: items.filter((item) => item.origin === "Sem fonte").length,
    unusedCount: items.filter((item) => item.usageCount === 0).length,
    attentionCount: items.filter((item) => item.status !== "OK").length,
    totalPatterns: items.reduce((sum, item) => sum + item.patternCount, 0),
    totalChannels: items.reduce((sum, item) => sum + item.channelCount, 0),
    totalNotes: items.reduce((sum, item) => sum + item.noteCount, 0)
  };

  return {
    items,
    instruments: audioInstrumentBank(data).map(item => ({ ...item, usageCount: audioInstrumentUsageCount(data, item.id) })),
    sampleInstruments: audioSampleAssets(data).map(asset => ({ id: String(asset.id), name: String(asset.name) })),
    kindCounts: countBy(items.map((item) => item.kind), "kind"),
    formatCounts: countBy(items.map((item) => item.format), "format"),
    summary,
    exportDiagnostics: deriveAudioEngineExportDiagnostics(projectArray(data, "audioItems"), data),
    summaryCards: [
      { id: "total", label: "Total", value: String(summary.audioCount) },
      { id: "music", label: "Músicas", value: String(summary.musicCount) },
      { id: "sfx", label: "SFX", value: String(summary.sfxCount) },
      { id: "imported", label: "Import.", value: String(summary.importedCount) },
      { id: "composed", label: "Composto", value: String(summary.composedCount) },
      { id: "attention", label: "Atenção", value: String(summary.attentionCount) }
    ]
  };
}

export function prepareAudioExport(data: GBAProjectData, audioIDToExport: string): PreparedAudioExport | null {
  const item = deriveAudioWorkspacePresentation(data).items.find((audio) => audio.id === audioIDToExport);
  if (!item) return null;

  const fileStem = defaultExportID(item.exportID || item.name);
  const raw = projectArray(data, "audioItems").find((audio, index) => audioID(audio, index) === audioIDToExport)!;
  const audio = {
    ...cloneProjectData(raw),
    id: item.id,
    name: item.name,
    kind: item.kind,
    format: item.format,
    assignedScene: item.assignedScene,
    loops: item.loops,
    bpm: item.bpm,
    exportID: item.exportID,
    volume: item.volume,
    source: item.source,
    origin: item.origin,
    runtimeCommand: item.runtimeCommand,
    usageLabels: item.usageLabels,
    patterns: cloneProjectData(raw.patterns ?? []),
    patternOrder: cloneProjectData(raw.patternOrder ?? item.patternSequence.map(slot => slot.patternID)),
    patternSequence: item.patternSequence,
    previewRows: item.previewRows,
    warnings: item.warnings,
    errors: item.errors
  };

  return {
    fileName: `${fileStem}.audio.json`,
    contents: JSON.stringify({ kind: "gbastudio.audio", version: 2, audio }, null, 2)
  };
}

export function deriveAudioExportSummary(item: AudioWorkspaceItem | null): AudioWorkspaceExportSummary | null {
  if (!item) return null;
  const playback = deriveAudioPlaybackExportStatus(item);

  return {
    exportID: item.exportID,
    fileName: `${item.exportID || defaultExportID(item.name)}.audio.json`,
    runtimeCommand: item.runtimeCommand,
    origin: item.origin,
    format: item.format,
    warningCount: item.warnings.length + item.errors.length,
    ready: item.errors.length === 0,
    usageCount: item.usageCount,
    playbackBadge: playback.playbackBadge,
    playbackLabel: playback.playbackLabel
  };
}

export interface AudioPreviewPlaybackNote {
  pan?: number;
  sample?: { source: string; pitchRatio: number; loop: boolean };
  note: string;
  channelType: string;
  frequency: number | null;
  isNoise: boolean;
  channel: number;
  oscillator: "square" | "triangle" | "noise";
  duty: number;
  volume: number;
  attackFrames: number;
  releaseFrames: number;
  waveform: number;
}

export interface AudioPreviewPlaybackStep {
  stepIndex: number;
  startOffsetMs: number;
  durationMs: number;
  notes: AudioPreviewPlaybackNote[];
}

export interface AudioPreviewPlaybackPlan {
  stepCount: number;
  stepDurationMs: number;
  loopStart: number;
  loops: boolean;
  steps: AudioPreviewPlaybackStep[];
  totalDurationMs: number;
}

function previewNoteFrequency(note: string): number | null {
  const match = /^([A-G])(#?)(-?\d+)$/.exec(note.trim());
  if (!match) return null;

  const [, base, sharp, octaveText] = match;
  const semitoneByNote: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11
  };
  const octave = Number(octaveText);
  const semitone = semitoneByNote[base] + (sharp ? 1 : 0);
  if (!Number.isFinite(octave)) return null;

  const midi = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

function previewChannelIsNoise(channelType: string): boolean {
  return channelType.toLowerCase().includes("noise");
}

function previewOscillatorForChannel(channel: number): "square" | "triangle" | "noise" {
  if (channel === 3) return "triangle";
  if (channel === 4) return "noise";
  return "square";
}

function previewChannelTypeForTrackerChannel(channel: number): string {
  if (channel === 2) return "pulse2";
  if (channel === 3) return "wave";
  if (channel === 4) return "noise";
  return "pulse1";
}

function compiledTrackerPreviewPlan(
  tracker: AssetcAudioJsonDocument["tracker"][number],
  loops: boolean,
  selectedPatternIndex?: number,
  sampleSources: Record<string, string> = {}
): AudioPreviewPlaybackPlan | null {
  const patterns = tracker.patterns ?? [];
  const order = selectedPatternIndex !== undefined ? [selectedPatternIndex] : tracker.order && tracker.order.length > 0
    ? tracker.order
    : patterns.map((_, index) => index);
  if (patterns.length === 0 || order.length === 0) return null;

  const steps: AudioPreviewPlaybackStep[] = [];
  let startOffsetMs = 0;
  for (const patternIndex of order) {
    const pattern = patterns[patternIndex];
    if (!pattern) continue;
    let rowNotes: AudioPreviewPlaybackNote[] = [];
    for (const compiled of pattern.steps) {
      if (compiled.volume > 0) {
        const channelType = previewChannelTypeForTrackerChannel(compiled.channel);
        rowNotes.push({
          note: compiled.note && compiled.note !== "---" ? compiled.note : `${compiled.frequency_hz} Hz`,
          channelType,
          frequency: compiled.frequency_hz,
          isNoise: compiled.channel === 4,
          channel: compiled.channel,
          oscillator: previewOscillatorForChannel(compiled.channel),
          duty: compiled.duty,
          volume: compiled.volume,
          attackFrames: compiled.attack_frames,
          releaseFrames: compiled.release_frames,
          waveform: compiled.waveform,
          ...(compiled.pan !== undefined ? { pan: compiled.pan } : {}),
          ...(compiled.sample_only && compiled.sample_index !== undefined && tracker.samples?.[compiled.sample_index] ? { sample: { source: sampleSources[tracker.samples[compiled.sample_index].asset_id] ?? "", pitchRatio: compiled.sample_pitch_ratio ?? 1, loop: tracker.samples[compiled.sample_index].loop } } : {})
        });
      }
      if (compiled.duration_frames <= 0) continue;
      const durationMs = compiled.duration_frames * 1000 / 60;
      steps.push({ stepIndex: steps.length, startOffsetMs, durationMs, notes: rowNotes });
      startOffsetMs += durationMs;
      rowNotes = [];
    }
  }
  if (steps.length === 0) return null;

  return {
    stepCount: steps.length,
    stepDurationMs: steps[0]?.durationMs ?? 0,
    loopStart: 0,
    loops,
    steps,
    totalDurationMs: startOffsetMs
  };
}

function compiledSfxPreviewPlan(
  sfx: AssetcAudioJsonDocument["sfx"][number],
  loops: boolean
): AudioPreviewPlaybackPlan | null {
  if (sfx.tones.length === 0) return null;
  let startOffsetMs = 0;
  const steps = sfx.tones.map((tone, stepIndex): AudioPreviewPlaybackStep => {
    const durationMs = tone.duration_frames * 1000 / 60;
    const isNoise = tone.noise === true;
    const channel = isNoise ? 4 : 1;
    const notes: AudioPreviewPlaybackNote[] = tone.volume > 0 ? [{
      note: isNoise ? "Noise" : `${tone.frequency_hz} Hz`,
      channelType: isNoise ? "noise" : "pulse1",
      frequency: tone.frequency_hz,
      isNoise,
      channel,
      oscillator: isNoise ? "noise" : "square",
      duty: tone.duty ?? 2,
      volume: tone.volume,
      attackFrames: tone.attack_frames ?? 0,
      releaseFrames: tone.release_frames ?? 0,
      waveform: tone.waveform ?? 0,
      ...(tone.pan !== undefined ? { pan: tone.pan } : {})
    }] : [];
    const step = { stepIndex, startOffsetMs, durationMs, notes };
    startOffsetMs += durationMs;
    return step;
  });
  return {
    stepCount: steps.length,
    stepDurationMs: steps[0]?.durationMs ?? 0,
    loopStart: 0,
    loops,
    steps,
    totalDurationMs: startOffsetMs
  };
}

export function deriveAudioPreviewPlaybackPlan(
  item: Pick<AudioWorkspaceItem, "previewRows" | "bpm" | "stepCount" | "loopStart" | "loops" | "kind"> & {
    sampleSources?: Record<string, string>;
    compiledTracker?: AssetcAudioJsonDocument["tracker"][number] | null;
    compiledSfx?: AssetcAudioJsonDocument["sfx"][number] | null;
    activePatternID?: string | null;
    patterns?: AudioWorkspacePattern[];
  },
  options: { scope?: "pattern" | "sequence" } = {}
): AudioPreviewPlaybackPlan {
  const solos = new Set(item.previewRows.filter(row => row.isSolo).map(row => item.kind === "SFX" ? (audioPhysicalChannel(row.type) === 4 ? 4 : 1) : audioPhysicalChannel(row.type)));
  const audition = (plan: AudioPreviewPlaybackPlan): AudioPreviewPlaybackPlan => solos.size ? { ...plan, steps: plan.steps.map(step => ({ ...step, notes: step.notes.filter(note => solos.has(note.channel)) })) } : plan;
  if (item.compiledTracker) {
    const compiled = compiledTrackerPreviewPlan(item.compiledTracker, item.loops, options.scope === "pattern" ? Math.max(0, item.patterns?.findIndex(pattern => pattern.id === item.activePatternID) ?? 0) : undefined, item.sampleSources);
    if (compiled) return audition(compiled);
  }
  if (item.compiledSfx) {
    const compiled = options.scope === "pattern" ? null : compiledSfxPreviewPlan(item.compiledSfx, false);
    if (compiled) return audition(compiled);
  }

  const stepCount = Math.max(1, item.stepCount);
  const bpm = item.bpm ?? 120;
  const stepDurationMs = Math.max(80, (60 / bpm / 2) * 1000);
  const loopStart = 0;
  if (item.compiledSfx && options.scope === "pattern") {
    // The presentation preview rows refer to the selected pattern.
    const rows = item.previewRows.map(row => ({ ...row, volume: row.volume }));
    const audio = { kind: "SFX", bpm, volume: (item as AudioWorkspaceItem).volume ?? 80, channels: rows.map(row => ({ type: row.type, volume: row.volume, muted: row.isMuted || (solos.size > 0 && !row.isSolo), instrument: row.instrument, envelope: row.envelope, ...(row.pan !== undefined ? { pan: row.pan } : {}), notes: row.cells.map(cell => cell.note ?? "---") })) };
    const sfx = compileComposedSfxToAssetc(audio, "preview");
    const compiled = sfx ? compiledSfxPreviewPlan(sfx, false) : null;
    if (compiled) return compiled;
  }
  const steps: AudioPreviewPlaybackStep[] = Array.from({ length: stepCount }, (_, stepIndex) => ({
    stepIndex,
    startOffsetMs: stepIndex * stepDurationMs,
    durationMs: stepDurationMs,
    notes: item.previewRows.flatMap((row) => {
      if (row.isMuted || (solos.size > 0 && !row.isSolo)) return [];
      const cell = row.cells[stepIndex];
      if (!cell?.note) return [];
      return [{
        note: cell.note,
        channelType: row.type,
        frequency: previewNoteFrequency(cell.note),
        isNoise: previewChannelIsNoise(row.type),
        channel: row.type.includes("pulse2") ? 2 : row.type.includes("wave") ? 3 : row.type.includes("noise") ? 4 : 1,
        oscillator: row.type.includes("wave") ? "triangle" : row.type.includes("noise") ? "noise" : "square",
        duty: 2,
        volume: Math.max(0, Math.min(15, Math.round(row.volume * 15 / 100))),
        attackFrames: row.envelope?.toLowerCase().includes("soft") ? 2 : 0,
        releaseFrames: row.envelope?.toLowerCase().includes("short") ? 4 : 0,
        waveform: row.type.includes("wave") ? 1 : 0
      }];
    })
  }));

  return {
    stepCount,
    stepDurationMs,
    loopStart,
    loops: item.loops,
    steps,
    totalDurationMs: stepCount * stepDurationMs
  };
}

export function deriveAudioWorkspaceFilterChips(
  presentation: AudioWorkspacePresentation,
  active: Pick<AudioWorkspaceFilterOptions, "kind" | "format" | "origin" | "status"> = {}
): AudioWorkspaceFilterChips {
  const activeKind = active.kind?.trim() ?? "";
  const activeFormat = active.format?.trim() ?? "";
  const activeOrigin = active.origin ?? "";
  const activeStatus = active.status ?? "";

  return {
    kind: [
      {
        id: "kind-all",
        label: "Todos",
        count: presentation.summary.audioCount,
        value: "",
        isActive: activeKind === ""
      },
      ...presentation.kindCounts.map((kind) => ({
        id: `kind-${kind.kind}`,
        label: kind.kind === "Musica" ? "Música" : kind.kind,
        count: kind.count,
        value: kind.kind,
        isActive: activeKind === kind.kind
      }))
    ],
    format: [
      {
        id: "format-all",
        label: "Todos",
        count: presentation.summary.audioCount,
        value: "",
        isActive: activeFormat === ""
      },
      ...presentation.formatCounts.map((format) => ({
        id: `format-${format.format}`,
        label: format.format,
        count: format.count,
        value: format.format,
        isActive: activeFormat === format.format
      }))
    ],
    origin: [
      {
        id: "origin-all",
        label: "Todas",
        count: presentation.summary.audioCount,
        value: "",
        isActive: activeOrigin === ""
      },
      {
        id: "origin-imported",
        label: "Importado",
        count: presentation.summary.importedCount,
        value: "Importado",
        isActive: activeOrigin === "Importado"
      },
      {
        id: "origin-composed",
        label: "Composto",
        count: presentation.summary.composedCount,
        value: "Composto",
        isActive: activeOrigin === "Composto"
      },
      {
        id: "origin-unknown",
        label: "Sem fonte",
        count: presentation.summary.unknownOriginCount,
        value: "Sem fonte",
        isActive: activeOrigin === "Sem fonte"
      }
    ],
    status: [
      {
        id: "status-all",
        label: "Todos",
        count: presentation.summary.audioCount,
        value: "",
        isActive: activeStatus === ""
      },
      {
        id: "status-attention",
        label: "Atenção",
        count: presentation.summary.attentionCount,
        value: "attention",
        isActive: activeStatus === "attention"
      },
      {
        id: "status-unused",
        label: "Sem uso",
        count: presentation.summary.unusedCount,
        value: "unused",
        isActive: activeStatus === "unused"
      }
    ]
  };
}

function audioMatchesQuery(item: AudioWorkspaceItem, query: string): boolean {
  if (!query) return true;

  return [
    item.name,
    item.kind,
    item.format,
    item.assignedScene ?? "",
    item.exportID,
    item.source ?? "",
    item.origin,
    item.runtimeCommand ?? "",
    item.usageLabels.join(" "),
    item.warnings.join(" "),
    item.patterns.map((pattern) => pattern.name).join(" "),
    item.previewRows.map((row) => `${row.label} ${row.type}`).join(" ")
  ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
}

function audioMatchesStatus(item: AudioWorkspaceItem, status: AudioWorkspaceFilterStatus): boolean {
  if (status === "attention") return item.status !== "OK";
  if (status === "unused") return item.usageCount === 0;
  return true;
}

function audioMatchesOrigin(item: AudioWorkspaceItem, origin: AudioWorkspaceOriginFilter): boolean {
  if (!origin) return true;
  return item.origin === origin;
}

function compareAudioWorkspaceItems(
  lhs: AudioWorkspaceItem,
  rhs: AudioWorkspaceItem,
  sort: AudioWorkspaceSortOption
): number {
  switch (sort) {
    case "name-desc":
      return rhs.name.localeCompare(lhs.name, "pt-BR");
    case "kind":
      return lhs.kind.localeCompare(rhs.kind, "pt-BR") || lhs.name.localeCompare(rhs.name, "pt-BR");
    case "bpm-desc":
      return (rhs.bpm ?? 0) - (lhs.bpm ?? 0) || lhs.name.localeCompare(rhs.name, "pt-BR");
    case "usage-desc":
      return rhs.usageCount - lhs.usageCount || lhs.name.localeCompare(rhs.name, "pt-BR");
    default:
      return lhs.name.localeCompare(rhs.name, "pt-BR");
  }
}

export function filterAudioWorkspaceItems(
  items: AudioWorkspaceItem[],
  options: AudioWorkspaceFilterOptions
): AudioWorkspaceItem[] {
  const query = options.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const kind = options.kind?.trim() ?? "";
  const format = options.format?.trim() ?? "";
  const origin = options.origin ?? "";
  const status = options.status ?? "";
  const sort = options.sort ?? "name-asc";

  const filtered = items.filter((item) => {
    if (kind && item.kind !== kind) return false;
    if (format && item.format !== format) return false;
    if (!audioMatchesOrigin(item, origin)) return false;
    return audioMatchesQuery(item, query) && audioMatchesStatus(item, status);
  });

  return [...filtered].sort((lhs, rhs) => compareAudioWorkspaceItems(lhs, rhs, sort));
}
