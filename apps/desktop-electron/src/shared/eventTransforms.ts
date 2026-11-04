/** Runtime visual transforms use percentages in events and 8.8 scales in the engine. */
export const scaleEventVerbs = ["set_actor_scale", "animate_actor_scale", "reset_actor_scale", "set_background_scale", "animate_background_scale", "reset_background_scale"] as const;
export function isScaleEvent(verb: string): boolean { return (scaleEventVerbs as readonly string[]).includes(verb); }
export function scaleEventTokens(command: string): string[] {
  return (command.match(/"(?:\\.|[^"\\])*"|[^\s]+/g) ?? []).map(token => token.startsWith('"') ? JSON.parse(token) as string : token);
}
export function parseScaleEvent(parts: string[]): { target: string; x256: number; y256: number; frames: number; background: boolean } {
  const [verb = "", target = ""] = parts;
  const background = verb.includes("background"), reset = verb.startsWith("reset_"), animate = verb.startsWith("animate_");
  if (!isScaleEvent(verb) || parts.length !== (reset ? 2 : animate ? 5 : 4) || !target || /^\{/.test(target)) throw new Error("Escala requer um alvo e todos os parâmetros preenchidos.");
  if (background && !["BG2", "BG3"].includes(target)) throw new Error("Escala de fundo requer uma camada affine BG2 ou BG3 preparada na composição da cena.");
  const percent = (token: string | undefined): number => {
    if (!token || !/^\d+(?:\.\d+)?$/.test(token) || Number(token) < 50 || Number(token) > (background ? 400 : 200)) throw new Error(`Escala requer valores de 50 a ${background ? 400 : 200}%.`);
    return Math.round(Number(token) * 256 / 100);
  };
  const frames = animate ? Number(parts[4]) : 0;
  if (animate && (!/^\d+$/.test(parts[4] ?? "") || frames < 1 || frames > 32767)) throw new Error("Duração da escala requer 1–32767 quadros.");
  return { target, x256: reset ? 256 : percent(parts[2]), y256: reset ? 256 : percent(parts[3]), frames, background };
}
