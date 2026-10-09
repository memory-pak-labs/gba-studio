/** Authorable Luta controls. Operand order matches EventOp::LutaControl. */
export const lutaEventVerbs = [
  "luta_start_match", "luta_end_match", "luta_set_super_gauge", "luta_add_super_gauge",
  "luta_set_guard_power", "luta_set_ism_style", "luta_trigger_super", "luta_enable_alpha_counter",
  "luta_set_round_timer", "luta_set_rounds_to_win"
] as const;
export type LutaEventVerb = typeof lutaEventVerbs[number];
export interface LutaEventCommand {
  op: LutaEventVerb;
  target?: string;
  value: number;
}
export function isLutaEventVerb(verb: string): verb is LutaEventVerb {
  return (lutaEventVerbs as readonly string[]).includes(verb);
}
export function parseLutaEventCommand(command: string): LutaEventCommand {
  const [verb = "", ...args] = command.trim().split(/\s+/);
  if (!isLutaEventVerb(verb)) throw new Error("Evento de Luta desconhecido.");
  const targeted = !["luta_set_round_timer", "luta_set_rounds_to_win"].includes(verb);
  const expected = ["luta_start_match", "luta_end_match", "luta_set_round_timer", "luta_set_rounds_to_win"].includes(verb) ? 1 : 2;
  if (args.length !== expected || args.some(arg => /^\{.*\}$/.test(arg))) throw new Error(`${verb} requer ${expected} argumento(s) preenchido(s).`);
  const integer = (raw: string | undefined, min: number, max: number): number => {
    if (!raw || !/^-?\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new Error(`${verb} requer inteiro de ${min} a ${max}.`);
    return Number(raw);
  };
  let value = 0;
  switch (verb) {
    case "luta_start_match": break;
    case "luta_end_match": {
      const winner = ["player1", "player2", "draw"].indexOf(args[0]!.toLowerCase());
      if (winner < 0) throw new Error("Vencedor deve ser player1, player2 ou draw.");
      value = winner; break;
    }
    case "luta_set_super_gauge": value = integer(args[1], 0, 32767); break;
    case "luta_add_super_gauge": value = integer(args[1], -32767, 32767); break;
    case "luta_set_guard_power": value = integer(args[1], 0, 255); break;
    case "luta_set_ism_style": {
      value = ["aism", "xism", "vism"].indexOf(args[1]!.toLowerCase().replaceAll("-", ""));
      if (value < 0) throw new Error("Estilo deve ser a-ism, x-ism ou v-ism.");
      break;
    }
    case "luta_trigger_super": {
      value = ["super", "ultra"].indexOf(args[1]!.toLowerCase());
      if (value < 0) throw new Error("Golpe deve ser super ou ultra.");
      break;
    }
    case "luta_enable_alpha_counter": {
      if (!["true", "false"].includes(args[1]!)) throw new Error("Alpha Counter requer true ou false.");
      value = args[1] === "true" ? 1 : 0; break;
    }
    case "luta_set_round_timer": value = integer(args[0], 1, 546) * 60; break;
    case "luta_set_rounds_to_win": value = integer(args[0], 1, 255); break;
  }
  return { op: verb, ...(targeted ? { target: args[0] } : {}), value };
}
