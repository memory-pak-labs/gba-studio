import type { GBAProjectData } from "./projectFile.js";

/** Frame-aligned Direct Sound output rates; independent of WAV conversion. */
export const AUDIO_MIXING_RATES = [10512, 21024, 31536] as const;
export type AudioMixingRate = typeof AUDIO_MIXING_RATES[number];
export const DEFAULT_AUDIO_MIXING_RATE: AudioMixingRate = 31536;

export function isAudioMixingRate(value: unknown): value is AudioMixingRate {
  return AUDIO_MIXING_RATES.some(rate => rate === value);
}

export function requireAudioMixingRate(value: unknown): AudioMixingRate {
  if (!isAudioMixingRate(value)) throw new Error("Frequência de mixagem inválida: escolha 10.512, 21.024 ou 31.536 Hz.");
  return value;
}

export function projectAudioMixingRate(data: GBAProjectData): AudioMixingRate {
  const audio = (data.settings as { audio?: { mixingRate?: unknown } } | undefined)?.audio;
  return audio?.mixingRate === undefined ? DEFAULT_AUDIO_MIXING_RATE : requireAudioMixingRate(audio.mixingRate);
}
