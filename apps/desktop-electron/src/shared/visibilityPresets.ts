export interface VisibilityPreset {
  effect: "lantern" | "reveal" | "clear";
  actor: string;
  width: number;
  height: number;
  intensity: number;
  frames: number;
}

export const visibilityPresetVerbs = ["lantern", "reveal_area", "clear_visibility"];

export function parseVisibilityPreset(parts: readonly string[]): VisibilityPreset {
  if (parts[0] === "clear_visibility" && parts.length === 1) return { effect: "clear", actor: "player", width: 8, height: 8, intensity: 0, frames: 0 };
  if (!["lantern", "reveal_area"].includes(parts[0] ?? "") || parts.length !== 6 || !parts[1]) throw new Error("Visibilidade requer ator, largura, altura, intensidade e duração.");
  const number = (index: number, min: number, max: number): number => {
    const text = parts[index] ?? "";
    const value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isInteger(value) || value < min || value > max) throw new Error(`Parâmetro de visibilidade deve estar entre ${min} e ${max}.`);
    return value;
  };
  return { effect: parts[0] === "lantern" ? "lantern" : "reveal", actor: parts[1], width: number(2, 8, 240), height: number(3, 8, 160), intensity: number(4, 0, 100), frames: number(5, 1, 3600) };
}
