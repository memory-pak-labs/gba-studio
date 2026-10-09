import { audioInstrumentBank, resolveAudioInstrumentChannel } from "./audioInstruments.js";
import type { GBAProjectData } from "./projectFile.js";

export function audioRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export function audioSourceAsset(data: GBAProjectData, audio: Record<string, unknown>): Record<string, unknown> | null {
  const assets = audioRecords(data.assets).filter(asset => ["Audio", "Musica", "SFX"].includes(String(asset.kind)));
  return assets.find(asset => audio.sourceAssetID ? asset.id === audio.sourceAssetID : asset.name === audio.name) ?? null;
}

export function audioSourceFormat(data: GBAProjectData | undefined, audio: Record<string, unknown>): string {
  const asset = data ? audioSourceAsset(data, audio) : null;
  const fileName = String(asset?.name ?? "");
  return (fileName.includes(".") ? fileName.split(".").at(-1) : String(audio.format ?? ""))?.toUpperCase() ?? "";
}

export function audioPhysicalChannel(type: unknown): number | null {
  const value = String(type ?? "").toLowerCase();
  if (value.includes("noise") || value === "sfx") return 4;
  if (value.includes("wave")) return 3;
  if (value.includes("pulse2") || value.includes("square2")) return 2;
  if (value.includes("pulse1") || value.includes("square1") || value === "pulse") return 1;
  return null;
}

export function audioComposed(audio: Record<string, unknown>): boolean {
  return audioRecords(audio.patterns).length > 0 || audioRecords(audio.channels).length > 0;
}

export function audioSampleAssets(data: GBAProjectData): Record<string, unknown>[] {
  return audioRecords(data.assets).filter(asset => ["Audio", "Musica", "SFX"].includes(String(asset.kind)) && /\.wav$/i.test(String(asset.name)) && (asset.metadata as Record<string, unknown> | undefined)?.source);
}

export function audioSampleRootFrequency(note: unknown): number | null {
  const match = /^([A-G])(#?)([2-7])$/i.exec(String(note ?? "C4"));
  if (!match) return null;
  const pitches: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pitch = pitches[match[1].toUpperCase()];
  const frequency = Math.round(440 * 2 ** (((Number(match[3]) + 1) * 12 + pitch + (match[2] ? 1 : 0) - 69) / 12));
  return frequency >= 64 && frequency <= 4095 ? frequency : null;
}

export interface AudioContractIssue {
  level: "error" | "warning";
  message: string;
}

// The limits apply to the editor's PSG composer, not the engine's PCM mixer.
export function audioContractIssues(audio: Record<string, unknown>, data?: GBAProjectData): AudioContractIssue[] {
  const issues: AudioContractIssue[] = [];
  const error = (message: string) => issues.push({ level: "error", message });
  if (!audioComposed(audio)) {
    const asset = data ? audioSourceAsset(data, audio) : null;
    const source = asset?.metadata as Record<string, unknown> | undefined;
    if (data && !source?.source) error("Arquivo de áudio ausente na biblioteca do projeto.");
    const format = audioSourceFormat(data, audio);
    const supported = audio.kind === "SFX" ? ["WAV"] : ["MOD", "S3M"];
    if (!supported.includes(format)) error(`Formato ${format || "desconhecido"} sem exportação de áudio suportada. Use ${supported.join(" ou ")}.`);
    return issues;
  }
  const patterns = audioRecords(audio.patterns);
  const groups = patterns.length ? patterns : [{ channels: audio.channels, name: "Composição" }];
  for (const pattern of groups) {
    const channels = audioRecords(pattern.channels);
    const label = String(pattern.name ?? "Pattern");
    const limit = audio.kind === "SFX" ? 1 : 4;
    if (channels.length > limit) error(`${label}: o compositor ${audio.kind === "SFX" ? "de SFX aceita uma voz" : "PSG aceita até quatro vozes"}. Há ${channels.length} canais.`);
    const used = new Set<number>();
    for (const rawChannel of channels) {
      if (rawChannel.instrumentID && (!data || !audioInstrumentBank(data).some(item => item.id === rawChannel.instrumentID))) error(`${label}: instrumento compartilhado ausente no banco.`);
      const channel = data ? resolveAudioInstrumentChannel(data, rawChannel) : rawChannel;
      if (channel.sampleAssetID) {
        if (audio.kind !== "Musica") error("Instrumentos com sample estão disponíveis em músicas compostas.");
        if (audioPhysicalChannel(channel.type) === 4) error(`${label}: escolha uma voz melódica para usar um sample.`);
        if (data && !audioSampleAssets(data).some(asset => asset.id === channel.sampleAssetID)) error(`${label}: sample WAV ausente na biblioteca do projeto.`);
        if (!audioSampleRootFrequency(channel.sampleRootNote)) error(`${label}: nota original do sample inválida. Use C2 a B7.`);
      }
      const physical = audioPhysicalChannel(channel.type);
      if (!physical) error(`${label}: tipo de canal inválido em ${String(channel.name ?? channel.id ?? "canal")}.`);
      else if (!channel.muted) {
        if (audio.kind === "SFX" && physical !== 1 && physical !== 4) issues.push({ level: "warning", message: `${label}: SFX sintetizado usa Pulse 1 ou Noise. Esta voz legada toca em Pulse 1 na ROM; altere o tipo para editar o timbre correto.` });
        if (used.has(physical)) error(`${label}: dois canais usam a mesma voz PSG (${String(channel.type)}).`);
        used.add(physical);
      }
    }
  }
  if (audio.kind === "Musica" && patterns.length === 0) error("Música composta precisa de um pattern para exportação.");
  if (patterns.length && Array.isArray(audio.patternOrder)) {
    const ids = new Set(patterns.map(pattern => pattern.id));
    for (const id of audio.patternOrder) if (!ids.has(id)) error(`Sequência referencia pattern ausente: ${String(id)}.`);
  }
  if (audio.kind === "SFX" && audio.loops) issues.push({ level: "warning", message: "SFX composto toca uma vez. Loop está disponível para músicas e WAV importado." });
  if (typeof audio.loopStart === "number" && audio.loopStart > 0) issues.push({ level: "warning", message: "O ponto de loop salvo não é aplicado. A repetição começa no início da sequência." });
  return issues;
}
