/** Native tracker cells stay native: editing a note never translates its effects to PSG/PCM recipes. */
export type TrackerModuleFormat = "MOD" | "S3M";
export interface TrackerModuleCell {
  instrument: number;
  effect: number;
  parameter: number;
  volume?: number;
  period?: number;
  sourceNote?: string;
  rawNote?: number;
}
export interface TrackerModuleChannel {
  id: string;
  name: string;
  type: "pcm";
  notes: string[];
  trackerCells: TrackerModuleCell[];
}
export interface TrackerModulePattern {
  id: string;
  name: string;
  steps: number;
  channels: TrackerModuleChannel[];
  trackerHiddenChannels?: Record<string, TrackerModuleChannel>;
}
export interface TrackerModuleMetadata {
  version: 1;
  format: TrackerModuleFormat;
  sourceSha256: string;
  channelMap: number[];
  originalOrders: number[];
  initialTempo: number;
  initialSpeed: number;
  panning?: number[];
  instruments: Array<{ number: number; name: string; length: number; volume: number; loopStart: number; loopEnd: number; finetune?: number; sampleRate?: number }>;
}
export interface TrackerModuleSong {
  trackerModule: TrackerModuleMetadata;
  patterns: TrackerModulePattern[];
  patternOrder: string[];
  activePatternID: string;
  bpm: number;
  synthesis: "PCM";
  format: TrackerModuleFormat;
}
export const isTrackerModule = (audio: Record<string, unknown>): boolean => !!audio.trackerModule;
const pitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const emptyCell = (): TrackerModuleCell => ({ instrument: 0, effect: 0, parameter: 0 });
const noteMidi = (note: string): number | null => {
  const match = /^([A-G]#?)([0-9])$/.exec(note);
  return match && pitches.includes(match[1]) ? (Number(match[2]) + 1) * 12 + pitches.indexOf(match[1]) : null;
};
const midiNote = (midi: number): string => `${pitches[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
export function trackerPeriodNote(period: number): string { return period ? midiNote(Math.round(60 + 12 * Math.log2(428 / period))) : "---"; }
export function trackerNotePeriod(note: string): number {
  if (note === "---" || !note) return 0;
  const midi = noteMidi(note);
  if (midi === null) throw new Error(`Nota MOD inválida: ${note}.`);
  const period = Math.round(428 * 2 ** ((60 - midi) / 12));
  if (period < 1 || period > 4095) throw new Error(`Nota ${note} fora dos períodos do MOD.`);
  return period;
}
const s3mNote = (raw: number): string => raw === 254 ? "OFF" : raw === 255 ? "---"
  : (raw & 15) <= 11 && (raw >> 4) <= 9 ? `${pitches[raw & 15]}${raw >> 4}` : "---";
const s3mNoteByte = (note: string): number => {
  if (!note || note === "---") return 255;
  if (note === "OFF") return 254;
  const midi = noteMidi(note);
  if (midi === null) throw new Error(`Nota S3M inválida: ${note}.`);
  return ((Math.floor(midi / 12) - 1) << 4) | midi % 12;
};
const text = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes).split("\0")[0].trim();
const ascii = (bytes: Uint8Array): string => String.fromCharCode(...bytes);
function integer(value: unknown, min: number, max: number, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label} inválido (${min}–${max}).`);
}
function checked(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset + length > bytes.length) throw new Error("Módulo truncado ou com ponteiro fora do arquivo.");
}
const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
function modChannels(bytes: Uint8Array): number {
  checked(bytes, 0, 1084); const signature = ascii(bytes.slice(1080, 1084));
  const count = ["M.K.", "M!K!", "4CHN", "FLT4"].includes(signature) ? 4
    : /^([1-9])CHN$/.test(signature) ? Number(signature[0]) : /^([1-3][0-9])CH$/.test(signature) ? Number(signature.slice(0, 2)) : 0;
  if (count > 16) throw new Error("A engine aceita até 16 canais PCM independentes.");
  if (!count) throw new Error("Assinatura MOD não suportada.");
  return count;
}
function makeChannel(pattern: number, channel: number): TrackerModuleChannel {
  return { id: `module-pattern-${pattern + 1}-channel-${channel + 1}`, name: `Canal ${channel + 1}`, type: "pcm",
    notes: Array(64).fill("---"), trackerCells: Array.from({ length: 64 }, emptyCell) };
}
function makePattern(index: number, channels: number): TrackerModulePattern {
  return { id: `module-pattern-${index + 1}`, name: `Padrão ${String(index + 1).padStart(2, "0")}`, steps: 64,
    channels: Array.from({ length: channels }, (_, c) => makeChannel(index, c)) };
}
function parseMod(bytes: Uint8Array, sourceSha256: string): TrackerModuleSong {
  const count = modChannels(bytes); const data = view(bytes); const length = bytes[950]; integer(length, 1, 128, "Sequência MOD");
  const orders = Array.from(bytes.slice(952, 952 + length)); const patternCount = Math.max(...orders) + 1;
  if (patternCount > 128) throw new Error("MOD aceita até 128 padrões.");
  const sampleOffset = 1084 + patternCount * 64 * count * 4; checked(bytes, 0, sampleOffset);
  const instruments: TrackerModuleMetadata["instruments"] = [];
  for (let i = 0; i < 31; i++) {
    const offset = 20 + i * 30; const length = data.getUint16(offset + 22) * 2;
    const start = data.getUint16(offset + 26) * 2; const repeat = data.getUint16(offset + 28) * 2;
    instruments.push({ number: i + 1, name: text(bytes.slice(offset, offset + 22)), length, volume: bytes[offset + 25],
      finetune: bytes[offset + 24] & 8 ? (bytes[offset + 24] & 15) - 16 : bytes[offset + 24] & 15,
      loopStart: repeat > 2 ? start : 0, loopEnd: repeat > 2 ? start + repeat : 0 });
  }
  checked(bytes, sampleOffset, instruments.reduce((sum, instrument) => sum + instrument.length, 0));
  const patterns = Array.from({ length: patternCount }, (_, p) => {
    const pattern = makePattern(p, count);
    for (let row = 0; row < 64; row++) for (let channel = 0; channel < count; channel++) {
      const offset = 1084 + ((p * 64 + row) * count + channel) * 4;
      const period = ((bytes[offset] & 15) << 8) | bytes[offset + 1]; const note = trackerPeriodNote(period);
      pattern.channels[channel].notes[row] = note;
      pattern.channels[channel].trackerCells[row] = { period, sourceNote: note,
        instrument: (bytes[offset] & 0xf0) | (bytes[offset + 2] >> 4), effect: bytes[offset + 2] & 15, parameter: bytes[offset + 3] };
    }
    return pattern;
  });
  return { trackerModule: { version: 1, format: "MOD", sourceSha256, channelMap: Array.from({ length: count }, (_, i) => i),
    originalOrders: orders, initialSpeed: 4, initialTempo: 125, instruments }, patterns,
    patternOrder: orders.map(i => patterns[i].id), activePatternID: patterns[orders[0]].id, bpm: 125, synthesis: "PCM", format: "MOD" };
}
function s3mHeader(bytes: Uint8Array) {
  checked(bytes, 0, 96); if (ascii(bytes.slice(44, 48)) !== "SCRM") throw new Error("Assinatura S3M ausente.");
  const data = view(bytes); const orders = data.getUint16(32, true), instruments = data.getUint16(34, true), patterns = data.getUint16(36, true);
  integer(orders, 1, 256, "Sequência S3M"); integer(instruments, 0, 256, "Instrumentos S3M"); integer(patterns, 1, 256, "Padrões S3M");
  const instrumentTable = 96 + orders; const patternTable = instrumentTable + instruments * 2;
  const end = patternTable + patterns * 2; checked(bytes, 0, end + (bytes[53] === 252 ? 32 : 0));
  return { data, orders, instruments, patterns, instrumentTable, patternTable, end };
}
function parseS3m(bytes: Uint8Array, sourceSha256: string): TrackerModuleSong {
  const h = s3mHeader(bytes); const channelMap = Array.from({ length: 32 }, (_, i) => i).filter(i => bytes[64 + i] < 16);
  if (!channelMap.length || channelMap.length > 16) throw new Error("S3M precisa de 1 a 16 canais PCM ativos.");
  const orders = Array.from(bytes.slice(96, 96 + h.orders)); const validOrders = orders.filter(i => i < h.patterns);
  if (!validOrders.length || orders.some(i => i < 254 && i >= h.patterns)) throw new Error("Sequência S3M referencia padrão ausente.");
  const instruments: TrackerModuleMetadata["instruments"] = [];
  for (let i = 0; i < h.instruments; i++) {
    const offset = h.data.getUint16(h.instrumentTable + i * 2, true) * 16;
    if (!offset) { instruments.push({ number: i + 1, name: "", length: 0, volume: 0, loopStart: 0, loopEnd: 0 }); continue; }
    checked(bytes, offset, 80);
    const pcm = bytes[offset] === 1; const length = pcm ? h.data.getUint32(offset + 16, true) : 0;
    if (pcm && length) {
      const pointer = ((bytes[offset + 13] << 16) | h.data.getUint16(offset + 14, true)) * 16;
      checked(bytes, pointer, length * (bytes[offset + 31] & 4 ? 2 : 1) * (bytes[offset + 31] & 2 ? 2 : 1));
    }
    instruments.push({ number: i + 1, name: text(bytes.slice(offset + 48, offset + 76)), length, volume: bytes[offset + 28],
      sampleRate: pcm ? h.data.getUint32(offset + 32, true) : 0,
      loopStart: pcm && bytes[offset + 31] & 1 ? h.data.getUint32(offset + 20, true) : 0,
      loopEnd: pcm && bytes[offset + 31] & 1 ? h.data.getUint32(offset + 24, true) : 0 });
  }
  const patterns = Array.from({ length: h.patterns }, (_, p) => {
    const pattern = makePattern(p, channelMap.length); const hidden: Record<string, TrackerModuleChannel> = {};
    const offset = h.data.getUint16(h.patternTable + p * 2, true) * 16;
    if (!offset) return pattern;
    checked(bytes, offset, 2); const length = h.data.getUint16(offset, true);
    if (length < 2) throw new Error("Tamanho de padrão S3M inválido.");
    checked(bytes, offset, length);
    let cursor = offset + 2, row = 0; const end = offset + length;
    const byte = () => { if (cursor >= end) throw new Error("Célula S3M truncada."); return bytes[cursor++]; };
    while (cursor < end && row < 64) {
      const token = byte(); if (!token) { row++; continue; }
      const physical = token & 31; const active = channelMap.indexOf(physical);
      const channel = active >= 0 ? pattern.channels[active] : hidden[physical] ??= makeChannel(p, physical);
      const cell = channel.trackerCells[row];
      if (token & 32) { cell.rawNote = byte(); cell.instrument = byte(); channel.notes[row] = s3mNote(cell.rawNote); cell.sourceNote = channel.notes[row]; }
      if (token & 64) cell.volume = byte();
      if (token & 128) { cell.effect = byte(); cell.parameter = byte(); }
    }
    if (row < 64) throw new Error("Pattern S3M incompleto: são necessárias 64 linhas.");
    if (Object.keys(hidden).length) pattern.trackerHiddenChannels = hidden;
    return pattern;
  });
  return { trackerModule: { version: 1, format: "S3M", sourceSha256, channelMap, originalOrders: orders, initialSpeed: bytes[49],
    initialTempo: bytes[50], ...(bytes[53] === 252 ? { panning: Array.from(bytes.slice(h.end, h.end + 32)) } : {}), instruments },
    patterns, patternOrder: validOrders.map(i => patterns[i].id), activePatternID: patterns[validOrders[0]].id,
    bpm: bytes[50], synthesis: "PCM", format: "S3M" };
}
export function parseTrackerModule(bytes: Uint8Array, format: TrackerModuleFormat, sourceSha256: string): TrackerModuleSong {
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Módulo excede o limite de 8 MiB para edição.");
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("Hash da fonte do módulo inválido.");
  return format === "MOD" ? parseMod(bytes, sourceSha256) : format === "S3M" ? parseS3m(bytes, sourceSha256) : (() => { throw new Error("Formato de módulo não suportado."); })();
}

export function validateTrackerModuleSong(song: TrackerModuleSong): void {
  const meta = song.trackerModule;
  if (meta?.version !== 1 || !["MOD", "S3M"].includes(meta.format) || !/^[a-f0-9]{64}$/.test(meta.sourceSha256)) throw new Error("Dados do módulo editável inválidos.");
  integer(song.patterns?.length, 1, meta.format === "MOD" ? 128 : 256, "Quantidade de padrões");
  integer(meta.channelMap?.length, 1, 16, "Canais do módulo");
  if (new Set(meta.channelMap).size !== meta.channelMap.length) throw new Error("Mapa de canais duplicado.");
  meta.channelMap.forEach(c => integer(c, 0, meta.format === "MOD" ? 15 : 31, "Canal físico"));
  integer(song.patternOrder?.length, 1, meta.format === "MOD" ? 128 : 256, "Sequência");
  const ids = new Set(song.patterns.map(p => p.id));
  if (ids.size !== song.patterns.length || song.patternOrder.some(id => !ids.has(id))) throw new Error("Sequência referencia padrão ausente ou duplicado.");
  integer(song.bpm, 32, 255, "Andamento");
  for (const pattern of song.patterns) {
    if (pattern.steps !== 64 || pattern.channels.length !== meta.channelMap.length) throw new Error("Módulos usam 64 linhas e o mesmo número de canais em cada padrão.");
    for (const channel of [...pattern.channels, ...Object.values(pattern.trackerHiddenChannels ?? {})]) {
      if (!Array.isArray(channel.notes) || channel.notes.length !== 64 || !Array.isArray(channel.trackerCells) || channel.trackerCells.length !== 64) throw new Error("Células do módulo incompletas.");
      for (let row = 0; row < 64; row++) {
        const cell = channel.trackerCells[row]; const note = channel.notes[row];
        if (!cell) throw new Error("Célula do módulo ausente.");
        integer(cell.instrument, 0, meta.format === "MOD" ? 31 : meta.instruments.length, "Número do instrumento");
        integer(cell.effect, 0, meta.format === "MOD" ? 15 : 255, "Comando"); integer(cell.parameter, 0, 255, "Parâmetro");
        if (cell.volume !== undefined) integer(cell.volume, 0, 255, "Coluna de volume");
        if (meta.format === "MOD") { if (note !== cell.sourceNote) trackerNotePeriod(note); }
        else if (note !== cell.sourceNote) s3mNoteByte(note);
      }
    }
  }
}
function playbackShape(song: TrackerModuleSong): string {
  return JSON.stringify({ channelMap: song.trackerModule.channelMap, bpm: song.bpm,
    order: song.patternOrder.map(id => song.patterns.findIndex(p => p.id === id)),
    patterns: song.patterns.map(p => ({ channels: p.channels.map(c => ({ notes: c.notes, cells: c.trackerCells })), hidden: p.trackerHiddenChannels })) });
}
const align16 = (n: number) => Math.ceil(n / 16) * 16;
export function writeTrackerModule(original: Uint8Array, song: TrackerModuleSong): Uint8Array {
  validateTrackerModuleSong(song);
  const source = parseTrackerModule(original, song.trackerModule.format, song.trackerModule.sourceSha256);
  if (playbackShape(source) === playbackShape(song)) return Uint8Array.from(original);
  const count = song.trackerModule.channelMap.length;
  if (song.trackerModule.format === "MOD") {
    const originalChannels = modChannels(original); const originalPatterns = Math.max(...source.trackerModule.originalOrders) + 1;
    const samples = original.slice(1084 + originalPatterns * 64 * originalChannels * 4);
    // MOD has no pattern-count field: the highest order determines where samples start.
    const exportedPatternCount = Math.max(...song.patternOrder.map(id => song.patterns.findIndex(p => p.id === id))) + 1;
    const output = new Uint8Array(1084 + exportedPatternCount * 64 * count * 4 + samples.length);
    output.set(original.slice(0, 1084)); output[950] = song.patternOrder.length;
    output.fill(0, 952, 1080); output.set(song.patternOrder.map(id => song.patterns.findIndex(p => p.id === id)), 952);
    output.set(new TextEncoder().encode(count === 4 ? "M.K." : count < 10 ? `${count}CHN` : `${count}CH`), 1080);
    song.patterns.slice(0, exportedPatternCount).forEach((pattern, p) => pattern.channels.forEach((channel, c) => channel.trackerCells.forEach((cell, row) => {
      const offset = 1084 + ((p * 64 + row) * count + c) * 4; const note = channel.notes[row];
      const period = note === cell.sourceNote && cell.period !== undefined ? cell.period : trackerNotePeriod(note);
      output.set([(cell.instrument & 0xf0) | (period >> 8), period & 255, (cell.instrument << 4) | cell.effect, cell.parameter], offset);
    })));
    if (song.bpm !== source.bpm) {
      const p = song.patterns.findIndex(p => p.id === song.patternOrder[0]); const row = song.patterns[p].channels;
      const channel = row.findIndex(c => !c.trackerCells[0].effect && !c.trackerCells[0].parameter);
      if (channel < 0) throw new Error("Primeira linha sem espaço para o comando de andamento. Edite Fxx no Tracker.");
      const offset = 1084 + (p * 64 * count + channel) * 4;
      output[offset + 2] = (output[offset + 2] & 0xf0) | 15; output[offset + 3] = song.bpm;
    }
    output.set(samples, 1084 + exportedPatternCount * 64 * count * 4);
    return output;
  }
  const h = s3mHeader(original);
  const orderIndexes = song.patternOrder.map(id => song.patterns.findIndex(p => p.id === id));
  const originalIndexes = source.patternOrder.map(id => source.patterns.findIndex(p => p.id === id));
  const orders = JSON.stringify(orderIndexes) === JSON.stringify(originalIndexes) ? source.trackerModule.originalOrders : orderIndexes;
  const instrumentTable = 96 + orders.length, patternTable = instrumentTable + h.instruments * 2;
  const tableEnd = patternTable + song.patterns.length * 2;
  const payloads = song.patterns.map(pattern => {
    const out: number[] = [];
    for (let row = 0; row < 64; row++) {
      const channels: Array<[number, TrackerModuleChannel]> = pattern.channels.map((channel, i) => [song.trackerModule.channelMap[i], channel]);
      for (const [key, channel] of Object.entries(pattern.trackerHiddenChannels ?? {})) if (!song.trackerModule.channelMap.includes(Number(key))) channels.push([Number(key), channel]);
      channels.sort((a, b) => a[0] - b[0]);
      for (const [physical, channel] of channels) {
        const cell = channel.trackerCells[row]; const currentNote = channel.notes[row];
        const note = currentNote === cell.sourceNote && cell.rawNote !== undefined ? cell.rawNote : s3mNoteByte(currentNote);
        const pitched = note !== 255 || cell.instrument !== 0; const volume = cell.volume !== undefined;
        const command = cell.effect !== 0 || cell.parameter !== 0;
        if (!pitched && !volume && !command) continue;
        out.push(physical | (pitched ? 32 : 0) | (volume ? 64 : 0) | (command ? 128 : 0));
        if (pitched) out.push(note, cell.instrument); if (volume) out.push(cell.volume!); if (command) out.push(cell.effect, cell.parameter);
      }
      out.push(0);
    }
    return Uint8Array.from(out);
  });
  const patternOffsets: number[] = []; let end = align16(tableEnd + (song.trackerModule.panning ? 32 : 0));
  for (const payload of payloads) { patternOffsets.push(end); end = align16(end + payload.length + 2); }
  const originalBase = end; const output = new Uint8Array(originalBase + original.length); const data = view(output);
  output.set(original.slice(0, 96)); output.set(original, originalBase); output.set(orders, 96);
  data.setUint16(32, orders.length, true); data.setUint16(36, song.patterns.length, true); output[50] = song.bpm;
  output.fill(255, 64, 96);
  song.trackerModule.channelMap.forEach((physical, i) => { output[64 + physical] = original[64 + physical] < 16 ? original[64 + physical] : i % 16; });
  if (song.trackerModule.panning) output.set(song.trackerModule.panning, tableEnd);
  for (let i = 0; i < h.instruments; i++) {
    const offset = h.data.getUint16(h.instrumentTable + i * 2, true) * 16;
    if (!offset) continue;
    const moved = offset + originalBase; integer(moved / 16, 0, 65535, "Ponteiro de instrumento S3M"); data.setUint16(instrumentTable + i * 2, moved / 16, true);
    if (original[offset] === 1) {
      const pointer = ((original[offset + 13] << 16) | h.data.getUint16(offset + 14, true)) + originalBase / 16;
      integer(pointer, 0, 0xffffff, "Ponteiro de sample S3M"); output[moved + 13] = pointer >> 16; data.setUint16(moved + 14, pointer & 65535, true);
    }
  }
  payloads.forEach((payload, i) => { const offset = patternOffsets[i]; integer(offset / 16, 0, 65535, "Ponteiro de padrão S3M");
    data.setUint16(patternTable + i * 2, offset / 16, true); data.setUint16(offset, payload.length + 2, true); output.set(payload, offset + 2); });
  return output;
}
