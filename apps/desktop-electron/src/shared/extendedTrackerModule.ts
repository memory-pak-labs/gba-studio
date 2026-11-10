import type { TrackerModuleCell, TrackerModuleChannel, TrackerModulePattern, TrackerModuleSong } from "./trackerModule.js";

// Format references: MilkyTracker/resources/reference/xm-form.txt and
// schismtracker/schismtracker/wiki/ITTECH.TXT. These readers retain native cells.
const pitches = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function need(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function range(bytes: Uint8Array, at: number, size: number): void { need(Number.isSafeInteger(at) && Number.isSafeInteger(size) && at >= 0 && size >= 0 && at + size <= bytes.length, "Módulo truncado ou com ponteiro inválido."); }
const dataView = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b).split("\0")[0].trim();
const namedNote = (n: number) => `${pitches[n % 12]}${Math.floor(n / 12)}`;
export function extendedNoteByte(note: string, format: "XM" | "IT"): number | undefined {
  if (!note || note === "---") return format === "XM" ? 0 : undefined;
  if (note === "OFF") return format === "XM" ? 97 : 255;
  if (format === "IT" && note === "CUT") return 254;
  if (format === "IT" && note === "FADE") return 253;
  const m = /^([A-G]#?)([0-9])$/.exec(note), pitch = m ? pitches.indexOf(m[1]) : -1;
  need(m && pitch >= 0, `Nota ${format} inválida.`);
  const n = Number(m[2]) * 12 + pitch; need(n < (format === "XM" ? 96 : 120), `Nota fora do intervalo ${format}.`);
  return n + (format === "XM" ? 1 : 0);
}
function pattern(index: number, rows: number, channels: number): TrackerModulePattern {
  need(rows >= 1 && rows <= 1024, "Quantidade de linhas inválida.");
  return { id: `module-pattern-${index + 1}`, name: `Padrão ${index + 1}`, steps: rows,
    channels: Array.from({ length: channels }, (_, c) => ({ id: `module-pattern-${index + 1}-channel-${c + 1}`, name: `Canal ${c + 1}`, type: "pcm", notes: Array(rows).fill("---"), trackerCells: Array.from({ length: rows }, () => ({ instrument: 0, effect: 0, parameter: 0 })) })) };
}
function physicalChannel(index: number, rows: number, physical: number): TrackerModuleChannel {
  const c = pattern(index, rows, 1).channels[0]; c.id = `module-pattern-${index + 1}-channel-${physical + 1}`; c.name = `Canal ${physical + 1}`; return c;
}
function finish(format: "XM" | "IT", sourceSha256: string, channelMap: number[], orders: number[], patterns: TrackerModulePattern[], speed: number, bpm: number, instruments: TrackerModuleSong["trackerModule"]["instruments"]): TrackerModuleSong {
  need(patterns.length >= 1 && patterns.length <= 256 && orders.length >= 1 && orders.length <= 256 && orders.every(i => i >= 0 && i < patterns.length), "Sequência de padrões inválida.");
  need(speed >= 1 && speed <= 255 && bpm >= 32 && bpm <= 255, "Velocidade ou andamento inválido.");
  need(channelMap.length >= 1 && channelMap.length <= 16, "A engine aceita até 16 canais PCM independentes.");
  return { trackerModule: { version: 1, format, sourceSha256, channelMap, originalOrders: orders, initialTempo: bpm, initialSpeed: speed, instruments }, patterns,
    patternOrder: orders.map(i => patterns[i].id), activePatternID: patterns[orders[0]].id, bpm, synthesis: "PCM", format };
}
export function xmLayout(b: Uint8Array) {
  range(b, 0, 80); const v = dataView(b);
  need(text(b.subarray(0, 17)) === "Extended Module:" && b[37] === 26 && v.getUint16(58, true) === 0x104, "Use XM 1.04 com cabeçalho válido.");
  const header = v.getUint32(60, true), orders = v.getUint16(64, true), channels = v.getUint16(68, true), count = v.getUint16(70, true), instruments = v.getUint16(72, true);
  need(header >= 20 + orders && orders >= 1 && orders <= 256 && channels >= 1 && channels <= 16 && count <= 256 && instruments <= 128, "Cabeçalho XM inválido ou acima de 16 canais."); range(b, 60, header);
  let at = 60 + header; const locations: Array<{ at: number; rows: number; data: number; size: number }> = [];
  for (let p = 0; p < count; p++) {
    range(b, at, 9); const size = v.getUint32(at, true), rows = v.getUint16(at + 5, true), length = v.getUint16(at + 7, true);
    need(size >= 9 && b[at + 4] === 0 && rows >= 1 && rows <= 256, "Padrão XM inválido."); range(b, at, size + length);
    locations.push({ at, rows, data: at + size, size: length }); at += size + length;
  }
  return { v, header, orders: Array.from(b.subarray(80, 80 + orders)), channels, instruments, locations, instrumentOffset: at };
}
export function parseXm(b: Uint8Array, sha: string): TrackerModuleSong {
  const h = xmLayout(b), patterns: TrackerModulePattern[] = [];
  for (const [p, loc] of h.locations.entries()) {
    const next = pattern(p, loc.rows, h.channels); let at = loc.data, end = at + loc.size;
    const byte = () => { need(at < end, "Célula XM truncada."); return b[at++]; };
    if (loc.size) for (let r = 0; r < loc.rows; r++) for (let c = 0; c < h.channels; c++) {
      const first = byte(), values = [0, 0, 0, 0, 0];
      if (first & 128) for (let field = 0; field < 5; field++) { if (first & (1 << field)) values[field] = byte(); }
      else { values[0] = first; for (let field = 1; field < 5; field++) values[field] = byte(); }
      const [note, instrument, volume, effect, parameter] = values; need(note <= 97, "Nota XM fora do intervalo.");
      const name = note === 97 ? "OFF" : note ? namedNote(note - 1) : "---";
      next.channels[c].notes[r] = name; next.channels[c].trackerCells[r] = { instrument, volume, effect, parameter, rawNote: note, sourceNote: name };
    }
    need(at === end, "Padrão XM contém dados excedentes."); patterns.push(next);
  }
  // FT2 may omit empty patterns referenced at the end of the order list.
  while (patterns.length <= Math.max(...h.orders)) patterns.push(pattern(patterns.length, 64, h.channels));
  const instruments: TrackerModuleSong["trackerModule"]["instruments"] = []; let at = h.instrumentOffset;
  for (let i = 0; i < h.instruments; i++) {
    range(b, at, 29); const size = h.v.getUint32(at, true), count = h.v.getUint16(at + 27, true); need(size >= 29 && count <= 16, "Instrumento XM inválido."); range(b, at, size);
    let length = 0, volume = 0, start = 0, end = 0, bytes = 0;
    if (count) {
      need(size >= 243, "Cabeçalho de samples XM truncado."); const sampleHeader = h.v.getUint32(at + 29, true); need(sampleHeader >= 40 && sampleHeader <= 1024, "Cabeçalho de sample XM inválido."); range(b, at + size, count * sampleHeader);
      for (let s = 0; s < count; s++) { const loc = at + size + s * sampleHeader, n = h.v.getUint32(loc, true); bytes += n; length += n; if (!s) { volume = b[loc + 12]; start = h.v.getUint32(loc + 4, true); end = start + h.v.getUint32(loc + 8, true); } }
      range(b, at + size + count * sampleHeader, bytes);
      instruments.push({ number: i + 1, name: text(b.subarray(at + 4, at + 26)), length, volume, loopStart: start, loopEnd: end });
      at += size + count * sampleHeader + bytes;
    } else { instruments.push({ number: i + 1, name: text(b.subarray(at + 4, at + 26)), length: 0, volume: 0, loopStart: 0, loopEnd: 0 }); at += size; }
  }
  return finish("XM", sha, Array.from({ length: h.channels }, (_, i) => i), h.orders, patterns, h.v.getUint16(76, true), h.v.getUint16(78, true), instruments);
}
export function itLayout(b: Uint8Array) {
  range(b, 0, 192); need(text(b.subarray(0, 4)) === "IMPM", "Assinatura IT ausente."); const v = dataView(b);
  const orders = v.getUint16(32, true), instruments = v.getUint16(34, true), samples = v.getUint16(36, true), patterns = v.getUint16(38, true);
  need(orders >= 1 && orders <= 256 && instruments <= 255 && samples <= 255 && patterns >= 1 && patterns <= 256, "Quantidades IT inválidas."); range(b, 192, orders + 4 * (instruments + samples + patterns));
  const insTable = 192 + orders, smpTable = insTable + instruments * 4, patTable = smpTable + samples * 4;
  const pointers = (at: number, n: number) => Array.from({ length: n }, (_, i) => v.getUint32(at + i * 4, true));
  return { v, orders: Array.from(b.subarray(192, 192 + orders)), instruments: pointers(insTable, instruments), samples: pointers(smpTable, samples), patterns: pointers(patTable, patterns), tableEnd: patTable + patterns * 4 };
}
export function parseIt(b: Uint8Array, sha: string): TrackerModuleSong {
  const h = itLayout(b), full: TrackerModulePattern[] = [], used = new Set<number>();
  for (const [p, loc] of h.patterns.entries()) {
    if (!loc) { full.push(pattern(p, 64, 0)); continue; }
    range(b, loc, 8); const length = h.v.getUint16(loc, true), rows = h.v.getUint16(loc + 2, true); range(b, loc + 8, length);
    const next = pattern(p, rows, 0), masks = Array(64).fill(0), previous: Array<TrackerModuleCell> = Array.from({ length: 64 }, () => ({ instrument: 0, effect: 0, parameter: 0 }));
    let at = loc + 8, row = 0; const end = at + length;
    const byte = () => { need(at < end, "Padrão IT truncado."); return b[at++]; };
    while (row < rows) {
      const token = byte(); if (!token) { row++; continue; } const channel = (token - 1) & 63;
      if (token & 128) masks[channel] = byte(); const mask = masks[channel], last = previous[channel], cell: TrackerModuleCell = { instrument: 0, effect: 0, parameter: 0 };
      if (mask & 1) last.rawNote = cell.rawNote = byte(); else if (mask & 16) cell.rawNote = last.rawNote;
      if (mask & 2) last.instrument = cell.instrument = byte(); else if (mask & 32) cell.instrument = last.instrument;
      if (mask & 4) last.volume = cell.volume = byte(); else if (mask & 64) cell.volume = last.volume;
      if (mask & 8) { last.effect = cell.effect = byte(); last.parameter = cell.parameter = byte(); } else if (mask & 128) { cell.effect = last.effect; cell.parameter = last.parameter; }
      const raw = cell.rawNote, name = raw === undefined ? "---" : raw < 120 ? namedNote(raw) : raw === 255 ? "OFF" : raw === 254 ? "CUT" : "FADE";
      const target = next.channels[channel] ?? (next.channels[channel] = physicalChannel(p, rows, channel));
      cell.sourceNote = name; target.notes[row] = name; target.trackerCells[row] = cell;
      if ((b[64 + channel] & 128) === 0 && (raw !== undefined || cell.instrument || cell.volume !== undefined || cell.effect || cell.parameter)) used.add(channel);
    }
    need(at === end, "Padrão IT contém dados excedentes."); full.push(next);
  }
  const channelMap = [...used].sort((a, b) => a - b); if (!channelMap.length) channelMap.push(0);
  need(channelMap.length <= 16, "A engine aceita até 16 canais PCM independentes.");
  for (const [index, p] of full.entries()) {
    const hidden: Record<string, TrackerModuleChannel> = {};
    p.channels.forEach((c, i) => { if (!channelMap.includes(i) && c.trackerCells.some((cell, r) => c.notes[r] !== "---" || cell.instrument || cell.effect || cell.parameter || cell.volume !== undefined)) hidden[String(i)] = c; });
    p.channels = channelMap.map(i => p.channels[i] ?? physicalChannel(index, p.steps, i)); if (Object.keys(hidden).length) p.trackerHiddenChannels = hidden;
  }
  for (const ptr of h.samples) if (ptr) {
    range(b, ptr, 80); need(text(b.subarray(ptr, ptr + 4)) === "IMPS", "Cabeçalho de sample IT inválido.");
    const frames = h.v.getUint32(ptr + 48, true), data = h.v.getUint32(ptr + 72, true), flags = b[ptr + 18];
    need(frames <= 16 * 1024 * 1024, "Sample IT excede o limite de memória do editor.");
    if (frames && flags & 1) range(b, data, flags & 8 ? 1 : frames * (flags & 2 ? 2 : 1) * (flags & 4 ? 2 : 1));
  }
  const mode = Boolean(h.v.getUint16(44, true) & 4), list = mode ? h.instruments : h.samples;
  const instruments = list.map((loc, index) => {
    if (!loc) return { number: index + 1, name: "", length: 0, volume: 0, loopStart: 0, loopEnd: 0 };
    range(b, loc, mode ? 554 : 80); need(text(b.subarray(loc, loc + 4)) === (mode ? "IMPI" : "IMPS"), "Cabeçalho IT de instrumento/sample inválido.");
    return { number: index + 1, name: text(b.subarray(loc + (mode ? 32 : 20), loc + (mode ? 58 : 46))), length: mode ? 1 : h.v.getUint32(loc + 48, true), volume: mode ? b[loc + 24] : b[loc + 19], loopStart: mode ? 0 : h.v.getUint32(loc + 52, true), loopEnd: mode ? 0 : h.v.getUint32(loc + 56, true) };
  });
  const orders = h.orders.slice(0, h.orders.includes(255) ? h.orders.indexOf(255) : undefined).filter(i => i !== 254);
  return finish("IT", sha, channelMap, orders, full, b[50], b[51], instruments);
}
function nativeNote(note: string, cell: TrackerModuleCell, format: "XM" | "IT") { return note === cell.sourceNote && cell.rawNote !== undefined ? cell.rawNote : extendedNoteByte(note, format); }
export function writeExtendedModule(original: Uint8Array, song: TrackerModuleSong): Uint8Array {
  const format = song.trackerModule.format; need(format === "XM" || format === "IT", "Formato estendido inválido.");
  const orders = song.patternOrder.map(id => song.patterns.findIndex(p => p.id === id)), channels = song.trackerModule.channelMap.length;
  if (format === "XM") {
    const h = xmLayout(original), chunks = song.patterns.map(p => {
      const b = new Uint8Array(9 + p.steps * channels * 5), v = dataView(b); v.setUint32(0, 9, true); v.setUint16(5, p.steps, true); v.setUint16(7, b.length - 9, true);
      p.channels.forEach((c, i) => c.trackerCells.forEach((cell, row) => b.set([nativeNote(c.notes[row], cell, "XM") ?? 0, cell.instrument, cell.volume ?? 0, cell.effect, cell.parameter], 9 + (row * channels + i) * 5))); return b;
    });
    const prefix = original.slice(0, 60 + h.header), v = dataView(prefix); need(prefix.length >= 80 + 256, "Cabeçalho XM sem espaço para ordens.");
    v.setUint16(64, orders.length, true); v.setUint16(68, channels, true); v.setUint16(70, chunks.length, true); v.setUint16(78, song.bpm, true);
    prefix.fill(0, 80, 336); prefix.set(orders, 80);
    const tail = original.subarray(h.instrumentOffset), out = new Uint8Array(prefix.length + chunks.reduce((n, b) => n + b.length, 0) + tail.length);
    out.set(prefix); let at = prefix.length; for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; } out.set(tail, at); return out;
  }
  const h = itLayout(original), chunks = song.patterns.map(p => {
    const packed: number[] = [], masks = Array(64).fill(0), previous = Array.from({ length: 64 }, () => ({} as Record<string, number>));
    for (let row = 0; row < p.steps; row++) {
      const all = new Map(song.trackerModule.channelMap.map((physical, i) => [physical, p.channels[i]]));
      for (const [id, channel] of Object.entries(p.trackerHiddenChannels ?? {})) all.set(Number(id), channel);
      for (const [physical, c] of [...all].sort((a, b) => a[0] - b[0])) {
        const cell = c.trackerCells[row], note = nativeNote(c.notes[row], cell, "IT"); let mask = 0; const bytes: number[] = [], last = previous[physical];
        for (const [key, value, fresh, repeated] of [["note", note, 1, 16], ["instrument", cell.instrument || undefined, 2, 32], ["volume", cell.volume, 4, 64]] as const) if (value !== undefined) { if (last[key] === value) mask |= repeated; else { mask |= fresh; bytes.push(value); last[key] = value; } }
        if (cell.effect || cell.parameter) { if (last.effect === cell.effect && last.parameter === cell.parameter) mask |= 128; else { mask |= 8; bytes.push(cell.effect, cell.parameter); last.effect = cell.effect; last.parameter = cell.parameter; } }
        if (!mask) continue; if (mask !== masks[physical]) { packed.push(128 | (physical + 1), mask); masks[physical] = mask; } else packed.push(physical + 1); packed.push(...bytes);
      }
      packed.push(0);
    }
    need(packed.length <= 65535, "Padrão IT excede 65535 bytes comprimidos."); const out = new Uint8Array(8 + packed.length), v = dataView(out); v.setUint16(0, packed.length, true); v.setUint16(2, p.steps, true); out.set(packed, 8); return out;
  });
  const first = Math.min(original.length, ...[...h.instruments, ...h.samples, ...h.patterns].filter(Boolean)); need(first >= h.tableEnd, "Estruturas IT sobrepostas ao cabeçalho.");
  const extra = original.subarray(h.tableEnd, first), tableEnd = 192 + orders.length + 4 * (h.instruments.length + h.samples.length + chunks.length);
  const base = Math.ceil((tableEnd + extra.length + chunks.reduce((n, b) => n + b.length, 0)) / 16) * 16;
  const out = new Uint8Array(base + original.length), v = dataView(out); out.set(original.subarray(0, 192)); out.set(orders, 192); out.set(extra, tableEnd); out.set(original, base);
  v.setUint16(32, orders.length, true); v.setUint16(38, chunks.length, true); out[51] = song.bpm;
  const message = h.v.getUint32(56, true); if (message) v.setUint32(56, base + message, true);
  let table = 192 + orders.length;
  for (const ptr of h.instruments) { v.setUint32(table, ptr ? ptr + base : 0, true); table += 4; }
  for (const ptr of h.samples) { v.setUint32(table, ptr ? ptr + base : 0, true); table += 4; if (ptr) { range(original, ptr, 80); const data = h.v.getUint32(ptr + 72, true); if (data) { range(original, data, 1); v.setUint32(base + ptr + 72, data + base, true); } } }
  let at = tableEnd + extra.length; for (const chunk of chunks) { v.setUint32(table, at, true); table += 4; out.set(chunk, at); at += chunk.length; }
  return out;
}
