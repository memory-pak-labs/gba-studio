import { createHash } from "node:crypto";

// SF2 is converted on the host. The GBA only receives bounded PCM samples.
// Preset zones remain independent instruments: no hidden extra mixer voices.
export interface SoundFontInstrument {
  name: string;
  rootNote: string;
  loop: boolean;
  keyRange: [number, number];
  velocityRange: [number, number];
  preset: number;
  bank: number;
  wav: Buffer;
}
export interface ConvertedSoundFont {
  instruments: SoundFontInstrument[];
  sourceSha256: string;
  copyright: string;
  warnings: string[];
}
const fail = (reason: string): never => { throw new Error(`SoundFont: ${reason}`); };
type Generators = Map<number, number>;
const signed = (value: number) => value > 32767 ? value - 65536 : value;
const name = (b: Buffer, offset = 0) => b.toString("latin1", offset, offset + 20).split("\0")[0].trim();
function chunks(bytes: Buffer, start: number, end: number): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (let at = start; at < end;) {
    if (at + 8 > end) fail("cabeçalho de chunk truncado.");
    const id = bytes.toString("ascii", at, at + 4); const size = bytes.readUInt32LE(at + 4);
    if (size > end - at - 8) fail("chunk fora dos limites do arquivo.");
    const value = bytes.subarray(at + 8, at + 8 + size);
    const key = id === "LIST" ? value.toString("ascii", 0, 4) : id;
    if (result.has(key)) fail(`chunk duplicado: ${key}.`);
    result.set(key, id === "LIST" ? value.subarray(4) : value);
    at += 8 + size + size % 2;
    if (at > end) fail("padding de chunk truncado.");
  }
  return result;
}
function table(data: Map<string, Buffer>, id: string, size: number): Buffer[] {
  const b = data.get(id);
  if (!b || b.length < size || b.length % size) return fail(`tabela ${id} inválida.`);
  return Array.from({ length: b.length / size }, (_, i) => b.subarray(i * size, (i + 1) * size));
}
function zones(headers: Buffer[], index: number, headerOffset: number, bags: Buffer[], gens: Buffer[], terminal: number): Generators[] {
  const first = headers[index].readUInt16LE(headerOffset), end = headers[index + 1].readUInt16LE(headerOffset);
  if (first > end || end >= bags.length) return fail("índices de zonas inválidos.");
  let global: Generators = new Map(); const result: Generators[] = [];
  for (let i = first; i < end; i++) {
    const from = bags[i].readUInt16LE(), to = bags[i + 1].readUInt16LE();
    if (from > to || to > gens.length) fail("índices de generators inválidos.");
    const local: Generators = new Map();
    for (let j = from; j < to; j++) {
      const op = gens[j].readUInt16LE();
      if (local.has(op)) fail("generator duplicado na zona.");
      local.set(op, gens[j].readUInt16LE(2));
    }
    if (!local.has(terminal)) {
      if (i !== first) fail("zona global precisa ser a primeira.");
      global = local;
    } else result.push(new Map([...global, ...local]));
  }
  return result;
}
function riffChunk(id: string, data: Buffer): Buffer {
  const b = Buffer.alloc(8); b.write(id); b.writeUInt32LE(data.length, 4);
  return Buffer.concat([b, data, Buffer.alloc(data.length % 2)]);
}
function wavForSample(smpl: Buffer, start: number, end: number, rate: number, gain: number, loop: [number, number] | null): Buffer {
  const sourceCount = end - start;
  const outputRate = Math.min(15768, Math.floor(65535 * rate / sourceCount));
  if (outputRate < 4000 || !Number.isFinite(rate) || rate <= 0) return fail("sample excede 65535 amostras mesmo a 4 kHz; divida o instrumento.");
  const count = Math.max(1, Math.min(65535, Math.round(sourceCount * outputRate / rate)));
  const pcm = Buffer.alloc(count * 2); const stride = rate / outputRate;
  // Box integration when reducing the rate avoids unfiltered sample dropping.
  for (let i = 0; i < count; i++) {
    const a = Math.min(sourceCount - 1, i * stride), b = Math.min(sourceCount, (i + 1) * stride);
    let sum = 0, weight = 0;
    for (let j = Math.floor(a); j < Math.ceil(b); j++) {
      const w = Math.max(0, Math.min(b, j + 1) - Math.max(a, j));
      sum += smpl.readInt16LE((start + j) * 2) * w; weight += w;
    }
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / (weight || 1) * gain))), i * 2);
  }
  const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(outputRate, 4);
  fmt.writeUInt32LE(outputRate * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14);
  const parts = [riffChunk("fmt ", fmt), riffChunk("data", pcm)];
  if (loop) {
    const from = Math.round((loop[0] - start) / stride), to = Math.min(count, Math.round((loop[1] - start) / stride));
    if (from < 0 || from >= to) return fail("loop inválido após conversão.");
    const info = Buffer.alloc(60); info.writeUInt32LE(Math.round(1e9 / outputRate), 8); info.writeUInt32LE(60, 12);
    info.writeUInt32LE(1, 28); info.writeUInt32LE(from, 44); info.writeUInt32LE(to - 1, 48);
    parts.push(riffChunk("smpl", info));
  }
  return riffChunk("RIFF", Buffer.concat([Buffer.from("WAVE"), ...parts]));
}

export function convertSoundFont(bytes: Buffer, sourceName: string): ConvertedSoundFont {
  if (bytes.length > 128 * 1024 * 1024) fail("banco maior que 128 MiB; selecione um banco menor.");
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "sfbk"
    || bytes.readUInt32LE(4) !== bytes.length - 8) fail("RIFF sfbk inválido ou truncado.");
  const lists = chunks(bytes, 12, bytes.length);
  const infoBytes = lists.get("INFO"), sdtaBytes = lists.get("sdta"), pdtaBytes = lists.get("pdta");
  if (!infoBytes || !sdtaBytes || !pdtaBytes) return fail("INFO, sdta e pdta são obrigatórios.");
  const info = chunks(infoBytes, 0, infoBytes.length), sdta = chunks(sdtaBytes, 0, sdtaBytes.length), pdta = chunks(pdtaBytes, 0, pdtaBytes.length);
  const version = info.get("ifil");
  if (!version || version.length !== 4 || version.readUInt16LE() !== 2) fail("apenas SF2 PCM é aceito; SF3 comprimido não é suportado.");
  const smpl = sdta.get("smpl"); if (!smpl || smpl.length % 2) return fail("samples PCM16 ausentes ou inválidos.");
  const phdr = table(pdta, "phdr", 38), pbag = table(pdta, "pbag", 4), pgen = table(pdta, "pgen", 4);
  const inst = table(pdta, "inst", 22), ibag = table(pdta, "ibag", 4), igen = table(pdta, "igen", 4), shdr = table(pdta, "shdr", 46);
  const warnings = new Set<string>(["SF2 convertido em zonas independentes no banco: camadas e divisões por nota/velocidade são identificadas no nome, sem criar vozes adicionais."]);
  if (sdta.has("sm24")) warnings.add("Samples de 24 bits foram convertidos usando os 16 bits principais.");
  for (const mod of [pdta.get("pmod"), pdta.get("imod")]) if (mod && mod.length > 10) warnings.add("Moduladores SF2 não são reproduzidos; use os envelopes e o panorama do compositor.");
  const instruments: SoundFontInstrument[] = []; let outputBytes = 0;
  const supported = new Set([0, 1, 2, 3, 4, 12, 41, 43, 44, 45, 48, 50, 51, 52, 53, 54, 58]);
  for (let p = 0; p < phdr.length - 1; p++) for (const preset of zones(phdr, p, 24, pbag, pgen, 41)) {
    const index = preset.get(41)!; if (index >= inst.length - 1) fail("instrumento fora da tabela.");
    for (const zone of zones(inst, index, 20, ibag, igen, 53)) {
      const sampleIndex = zone.get(53)!; if (sampleIndex >= shdr.length - 1) fail("sample fora da tabela.");
      const header = shdr[sampleIndex], type = header.readUInt16LE(44);
      if (type !== 1) fail("apenas samples mono internos são aceitos; converta samples stereo, vinculados ou ROM para mono antes de importar.");
      const sum = (op: number) => signed(preset.get(op) ?? 0) + signed(zone.get(op) ?? 0);
      const range = (op: number): [number, number] => {
        const a = preset.get(op) ?? 0x7f00, b = zone.get(op) ?? 0x7f00;
        return [Math.max(a & 255, b & 255), Math.min(a >> 8, b >> 8)];
      };
      const keyRange = range(43), velocityRange = range(44);
      if (keyRange[0] > keyRange[1] || velocityRange[0] > velocityRange[1]) continue;
      if (keyRange[1] > 127 || velocityRange[1] > 127) fail("faixa de nota/velocidade inválida.");
      const start = header.readUInt32LE(20) + sum(0) + sum(4) * 32768, end = header.readUInt32LE(24) + sum(1) + sum(12) * 32768;
      const ls = header.readUInt32LE(28) + sum(2) + sum(45) * 32768, le = header.readUInt32LE(32) + sum(3) + sum(50) * 32768;
      const loop = ((zone.get(54) ?? 0) & 3) === 1 || ((zone.get(54) ?? 0) & 3) === 3;
      if (start < 0 || start >= end || end * 2 > smpl.length || loop && (ls < start || ls >= le || le > end)) fail("sample ou loop fora dos limites.");
      let root = zone.get(58) ?? header[40]; if (root === 255) root = 60;
      if (root > 127) fail("nota original inválida.");
      const normalizedRoot = Math.max(36, Math.min(107, root));
      const rate = header.readUInt32LE(36) * 2 ** ((normalizedRoot - root) / 12 + (sum(51) * 100 + sum(52) + header.readInt8(41)) / 1200);
      const wav = wavForSample(smpl, start, end, rate, Math.min(1, 10 ** (-sum(48) / 200)), loop ? [ls, le] : null);
      outputBytes += wav.length;
      if (outputBytes > 8 * 1024 * 1024 || instruments.length >= 512) fail("banco convertido excede 8 MiB ou 512 zonas; divida o banco antes de importar.");
      for (const op of [...preset.keys(), ...zone.keys()]) if (!supported.has(op)) warnings.add("Filtros, efeitos e envelopes SF2 foram substituídos pelos controles disponíveis no compositor.");
      if ((zone.get(54) ?? 0) === 3) warnings.add("Loops até soltar a tecla foram convertidos em loops contínuos com envelope do compositor.");
      const pitchNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      instruments.push({ name: `${name(phdr[p]) || sourceName} / ${name(inst[index])} / ${name(header)} [${keyRange.join("–")}; v${velocityRange.join("–")}]`,
        rootNote: `${pitchNames[normalizedRoot % 12]}${Math.floor(normalizedRoot / 12) - 1}`, loop, keyRange, velocityRange,
        preset: phdr[p].readUInt16LE(20), bank: phdr[p].readUInt16LE(22), wav });
    }
  }
  if (!instruments.length) fail("banco sem zonas PCM utilizáveis.");
  return { instruments, sourceSha256: createHash("sha256").update(bytes).digest("hex"), copyright: info.get("ICOP")?.toString("latin1").replace(/\0.*$/s, "") ?? "", warnings: [...warnings] };
}
