import { audioComposed, audioSourceFormat } from "./audioContract.js";
import { isPcmAudio } from "./audioPcm.js";
import type { GBAProjectData } from "./projectFile.js";

export const sfxInstanceVerbs = [
  "play_sfx_instance",
  "stop_sfx_instance",
  "set_sfx_instance_speed",
  "set_sfx_instance_pan"
] as const;
type SfxInstanceVerb = typeof sfxInstanceVerbs[number];

type SfxInstanceCommand =
  | { verb: "play_sfx_instance"; instance: number; audio: string }
  | { verb: "stop_sfx_instance"; instance: number }
  | { verb: "set_sfx_instance_speed" | "set_sfx_instance_pan"; instance: number; percent: number };

export function isSfxInstanceVerb(verb: string): verb is SfxInstanceVerb {
  return (sfxInstanceVerbs as readonly string[]).includes(verb);
}

export function isSfxInstanceAudio(data: GBAProjectData, audio: Record<string, unknown>): boolean {
  return audio.kind === "SFX" && (isPcmAudio(audio) || (!audioComposed(audio) && audioSourceFormat(data, audio) === "WAV"));
}

function integerInRange(value: string | undefined, min: number, max: number, message: string): number {
  const number = Number(value);
  if (!value || !/^-?\d+$/.test(value) || number < min || number > max) throw new Error(message);
  return number;
}

export function parseSfxInstanceCommand(verb: SfxInstanceVerb, operands: string[]): SfxInstanceCommand {
  const play = verb === "play_sfx_instance";
  if (play && !operands[0]) throw new Error("Selecione um efeito PCM ou WAV para tocar na instância.");
  const instance = integerInRange(operands[play ? 1 : 0], 1, 4, "A instância deve ser um número inteiro de 1–4.");
  if (operands.length > (verb === "stop_sfx_instance" ? 1 : 2)) throw new Error("O comando de instância de som tem argumentos extras.");
  if (play) return { verb, instance, audio: operands[0]! };
  if (verb === "stop_sfx_instance") return { verb, instance };
  const percent = verb === "set_sfx_instance_speed"
    ? integerInRange(operands[1], 25, 400, "A velocidade deve ser um número inteiro de 25–400%.")
    : integerInRange(operands[1], -100, 100, "O pan deve ser um número inteiro de −100 a 100%.");
  return { verb, instance, percent };
}
