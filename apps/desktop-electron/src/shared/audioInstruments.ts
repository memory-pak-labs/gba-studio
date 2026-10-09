import type { GBAProjectData } from "./projectFile.js";

export interface AudioInstrument {
  id: string;
  name: string;
  sampleAssetID: string;
  sampleRootNote: string;
  sampleLoop: boolean;
  envelope: string;
}
export type UpdateAudioInstrumentFields = Partial<Omit<AudioInstrument, "id">>;
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)) : [];

export function audioInstrumentBank(data: GBAProjectData): AudioInstrument[] {
  return records(data.audioInstruments) as unknown as AudioInstrument[];
}
export function audioInstrumentUsageCount(data: GBAProjectData, id: string): number {
  return records(data.audioItems).reduce((count, audio) => count +
    [...records(audio.channels), ...records(audio.patterns).flatMap(pattern => records(pattern.channels))]
      .filter(channel => channel.instrumentID === id).length, 0);
}
export function resolveAudioInstrumentChannel(data: GBAProjectData, channel: Record<string, unknown>): Record<string, unknown> {
  const instrument = audioInstrumentBank(data).find(item => item.id === channel.instrumentID);
  return instrument ? { ...channel, sampleAssetID: instrument.sampleAssetID, sampleRootNote: instrument.sampleRootNote,
    sampleLoop: instrument.sampleLoop, envelope: instrument.envelope } : channel;
}
export function resolveAudioInstrumentComposition(data: GBAProjectData, audio: Record<string, unknown>): Record<string, unknown> {
  return { ...audio,
    ...(Array.isArray(audio.channels) ? { channels: records(audio.channels).map(channel => resolveAudioInstrumentChannel(data, channel)) } : {}),
    ...(Array.isArray(audio.patterns) ? { patterns: records(audio.patterns).map(pattern => ({ ...pattern,
      channels: records(pattern.channels).map(channel => resolveAudioInstrumentChannel(data, channel)) })) } : {}) };
}
function validInstrument(data: GBAProjectData, instrument: AudioInstrument): boolean {
  return !!instrument.id?.trim() && !!instrument.name?.trim()
    && /^[A-G]#?[2-7]$/.test(instrument.sampleRootNote)
    && typeof instrument.sampleLoop === "boolean"
    && ["Soft ADSR", "Short Decay"].includes(instrument.envelope)
    && records(data.assets).some(asset => asset.id === instrument.sampleAssetID && ["Audio", "Musica", "SFX"].includes(String(asset.kind)) && /\.wav$/i.test(String(asset.name))
      && !!(asset.metadata as Record<string, unknown> | undefined)?.source);
}
export function createAudioInstrumentFromChannel(data: GBAProjectData, audioID: string, channelID: string,
  options: { id: string; name: string }): GBAProjectData {
  if (audioInstrumentBank(data).some(item => item.id === options.id)) return data;
  const audio = records(data.audioItems).find(item => item.id === audioID);
  if (!audio || audio.kind !== "Musica") return data;
  const channel = [...records(audio.channels), ...records(audio.patterns).flatMap(pattern => records(pattern.channels))].find(row => row.id === channelID);
  if (!channel || /noise/i.test(String(channel.type))) return data;
  const source = resolveAudioInstrumentChannel(data, channel);
  const instrument: AudioInstrument = { id: options.id, name: options.name.trim(), sampleAssetID: String(source.sampleAssetID ?? ""),
    sampleRootNote: String(source.sampleRootNote ?? "C4"), sampleLoop: source.sampleLoop === true,
    envelope: source.envelope === "Short Decay" ? "Short Decay" : "Soft ADSR" };
  if (!validInstrument(data, instrument)) return data;
  const next = JSON.parse(JSON.stringify(data)) as GBAProjectData;
  const target = records(next.audioItems).find(item => item.id === audioID)!;
  const link = [...records(target.channels), ...records(target.patterns).flatMap(pattern => records(pattern.channels))].find(row => row.id === channelID)!;
  link.instrumentID = instrument.id;
  delete link.sampleAssetID; delete link.sampleRootNote; delete link.sampleLoop;
  next.audioInstruments = [...audioInstrumentBank(next), instrument];
  return next;
}
export function updateAudioInstrumentInProject(data: GBAProjectData, id: string, fields: UpdateAudioInstrumentFields): GBAProjectData {
  const bank = audioInstrumentBank(data); const current = bank.find(item => item.id === id);
  if (!current) return data;
  const instrument = { ...current, ...fields, id, name: (fields.name ?? current.name).trim() };
  if (!validInstrument(data, instrument)) return data;
  return { ...data, audioInstruments: bank.map(item => item.id === id ? instrument : item) };
}
export function removeAudioInstrumentFromProject(data: GBAProjectData, id: string): GBAProjectData {
  if (audioInstrumentUsageCount(data, id) > 0 || !audioInstrumentBank(data).some(item => item.id === id)) return data;
  return { ...data, audioInstruments: audioInstrumentBank(data).filter(item => item.id !== id) };
}
