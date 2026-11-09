import type { GBAProjectData } from "./projectFile.js";

export const PCM_COMPOSER_CHANNELS = 16;
export const PCM_SAMPLE_RATE = 31536;
export const PCM_INSTRUMENTS = ["PCM Sine", "PCM Triangle", "PCM Square", "PCM Saw", "PCM Noise"] as const;
export const PCM_WAVEFORMS = ["sine", "triangle", "square", "saw", "noise"] as const;
export type PcmWaveform = typeof PCM_WAVEFORMS[number];
export interface PcmSfxConfig {
  source: "synth" | "sample";
  sampleAssetID: string | null;
  waveform: PcmWaveform;
  durationMs: number;
  frequencyStart: number;
  frequencyEnd: number;
  attackMs: number;
  releaseMs: number;
  noiseMix: number;
  trimStartMs: number;
  pitchSemitones: number;
}
export function isPcmAudio(audio: { synthesis?: unknown }): boolean { return audio.synthesis === "PCM"; }
export function defaultPcmSfx(): PcmSfxConfig {
  return { source: "synth", sampleAssetID: null, waveform: "sine", durationMs: 300,
    frequencyStart: 660, frequencyEnd: 330, attackMs: 5, releaseMs: 80, noiseMix: 0,
    trimStartMs: 0, pitchSemitones: 0 };
}
const ranges = { durationMs: [10, 2000], frequencyStart: [40, 4000], frequencyEnd: [40, 4000],
  attackMs: [0, 1000], releaseMs: [0, 1000], noiseMix: [0, 100], trimStartMs: [0, 60000], pitchSemitones: [-24, 24] } as const;
export function pcmSfxConfig(value: unknown): PcmSfxConfig {
  return { ...defaultPcmSfx(), ...(value && typeof value === "object" ? value : {}) } as PcmSfxConfig;
}
export function pcmSfxErrors(config: PcmSfxConfig): string[] {
  const errors: string[] = [];
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = config[key as keyof typeof ranges];
    if (!Number.isFinite(value) || key !== "pitchSemitones" && !Number.isInteger(value) || value < min || value > max) errors.push(`PCM: ${key} precisa estar entre ${min} e ${max}.`);
  }
  if (!PCM_WAVEFORMS.includes(config.waveform)) errors.push("PCM: forma de onda inválida.");
  if (!["synth", "sample"].includes(config.source)) errors.push("PCM: fonte de som inválida.");
  if (config.source === "sample" && !config.sampleAssetID) errors.push("PCM: selecione um sample WAV.");
  if (config.attackMs + config.releaseMs > config.durationMs) errors.push("PCM: ataque e finalização precisam caber na duração do efeito.");
  return errors;
}
export function updatePcmSfxInProject(data: GBAProjectData, id: string, fields: Partial<PcmSfxConfig>): GBAProjectData {
  const items = Array.isArray(data.audioItems) ? data.audioItems as Record<string, unknown>[] : [];
  const audio = items.find(item => item.id === id);
  if (!audio || !isPcmAudio(audio) || audio.kind !== "SFX") return data;
  const config = { ...pcmSfxConfig(audio.pcmSfx), ...fields };
  if (pcmSfxErrors(config).length) return data;
  if (config.source === "sample" && !(Array.isArray(data.assets) && data.assets.some((a: any) => a.id === config.sampleAssetID && /\.wav$/i.test(a.name)))) return data;
  return { ...data, audioItems: items.map(item => item.id === id ? { ...item, pcmSfx: config } : item) };
}
function waveAt(wave: PcmWaveform, phase: number, noise: number): number {
  const t = phase - Math.floor(phase);
  if (wave === "triangle") return 1 - 4 * Math.abs(Math.round(t) - t);
  if (wave === "square") return t < .5 ? 1 : -1;
  if (wave === "saw") return 2 * t - 1;
  if (wave === "noise") return noise;
  return Math.sin(t * Math.PI * 2);
}
function noiseGenerator(): () => number {
  let seed = 7069;
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff * 2 - 1; };
}
export function renderPcmSfx(config: PcmSfxConfig): number[] {
  if (pcmSfxErrors(config).length) return [];
  const count = Math.round(config.durationMs * PCM_SAMPLE_RATE / 1000);
  const random = noiseGenerator(); let phase = 0;
  return Array.from({ length: count }, (_, index) => {
    const progress = index / Math.max(1, count - 1); const timeMs = index * 1000 / PCM_SAMPLE_RATE;
    const noise = random(); const waveform = waveAt(config.waveform, phase, noise);
    phase += (config.frequencyStart + (config.frequencyEnd - config.frequencyStart) * progress) / PCM_SAMPLE_RATE;
    const attack = config.attackMs ? Math.min(1, timeMs / config.attackMs) : 1;
    const release = config.releaseMs ? Math.min(1, (config.durationMs - timeMs) / config.releaseMs) : 1;
    const value = (waveform * (1 - config.noiseMix / 100) + noise * config.noiseMix / 100) * attack * release;
    return index === 0 || index === count - 1 ? 0 : Math.round(Math.max(-1, Math.min(1, value)) * 96);
  });
}
export function pcmInstrumentSource(instrument: string): { samples: number[]; sample_rate_hz: number; loop: boolean } {
  const waveform = PCM_WAVEFORMS.find(wave => instrument.toLowerCase().includes(wave)) ?? "sine";
  const random = noiseGenerator(); const noise = waveform === "noise";
  const count = noise ? 4096 : 64;
  return { samples: Array.from({ length: count }, (_, i) => Math.round(waveAt(waveform, i / 64, random()) * 64 * (noise ? 1 - i / count : 1))),
    sample_rate_hz: noise ? PCM_SAMPLE_RATE : 262 * 64, loop: !noise };
}
export function createPcmPatternChannels(patternID: string, seed = false): Record<string, unknown>[] {
  return ["PCM Sine", "PCM Triangle", "PCM Square", "PCM Noise"].map((instrument, index) => ({
    id: `${patternID}-pcm-${index + 1}`, name: `Faixa ${index + 1}`, type: "pcm", instrument,
    envelope: "Soft ADSR", volume: 65, pan: 0, notes: seed ? Array.from({ length: 64 }, (_, step) => [
      ["C4", "---", "E4", "---", "G4", "---", "E4", "---"],
      ["C3", "---", "---", "---", "G3", "---", "---", "---"],
      ["---", "---", "G3", "---", "---", "---", "C4", "---"],
      ["C4", "---", "---", "---", "C4", "---", "---", "---"]
    ][index][step % 8]) : []
  }));
}
