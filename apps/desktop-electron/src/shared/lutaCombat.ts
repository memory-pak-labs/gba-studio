import type { LutaEventCommand } from "./lutaEventCommands.js";

export interface LutaCombatFighter {
  hp: number; maxHp: number; superGauge: number; guardPower: number; guardMax: number;
  style: number; alphaCounterEnabled: boolean;
}
export interface LutaCombatConfig {
  maxSuperGauge?: number; roundsToWin?: number; roundTime?: number;
  alphaCounterEnabled?: boolean; guardPowerRecovery?: number; superGaugeGainOnReceive?: number;
  defaultStyle?: string;
}
export interface LutaCombatState {
  fighters: [LutaCombatFighter, LutaCombatFighter];
  wins: [number, number]; round: number; roundsToWin: number;
  roundTimerFrames: number; roundTimeFrames: number;
  roundState: "active" | "player1" | "player2" | "draw";
  maxSuperGauge: number; guardPowerRecovery: number; hitGaugeGain: number;
}
const bound = (value: number, max: number) => Math.max(0, Math.min(max, Math.trunc(value)));
export function createLutaCombatState(config: LutaCombatConfig = {}, fighters: Array<{ maxHp?: number; guardPower?: number }> = []): LutaCombatState {
  const fighter = (index: number): LutaCombatFighter => ({
    hp: fighters[index]?.maxHp ?? 100, maxHp: fighters[index]?.maxHp ?? 100, superGauge: 0,
    guardPower: fighters[index]?.guardPower ?? 48, guardMax: fighters[index]?.guardPower ?? 48,
    style: Math.max(0, ["aism", "xism", "vism"].indexOf((config.defaultStyle ?? "aism").replaceAll("-", ""))),
    alphaCounterEnabled: config.alphaCounterEnabled ?? true
  });
  return {
    fighters: [fighter(0), fighter(1)], wins: [0, 0], round: 1,
    roundsToWin: config.roundsToWin ?? 2, roundState: "active",
    roundTimerFrames: (config.roundTime ?? 99) * 60, roundTimeFrames: (config.roundTime ?? 99) * 60,
    maxSuperGauge: config.maxSuperGauge ?? 100, guardPowerRecovery: config.guardPowerRecovery ?? 2,
    hitGaugeGain: config.superGaugeGainOnReceive ?? 4
  };
}
function copy(state: LutaCombatState): LutaCombatState {
  return { ...state, wins: [...state.wins], fighters: [{ ...state.fighters[0] }, { ...state.fighters[1] }] };
}
export function applyLutaCombatEvent(state: LutaCombatState, command: LutaEventCommand, side: 0 | 1 = 0): LutaCombatState {
  const next = copy(state);
  const fighter = next.fighters[side];
  switch (command.op) {
    case "luta_start_match": return state; // Scene selection is handled by the runtime adapter.
    case "luta_end_match":
      next.roundState = (["player1", "player2", "draw"] as const)[command.value]!;
      if (command.value < 2) next.wins[command.value as 0 | 1] = next.roundsToWin;
      break;
    case "luta_set_super_gauge": fighter.superGauge = bound(command.value, next.maxSuperGauge); break;
    case "luta_add_super_gauge": fighter.superGauge = bound(fighter.superGauge + command.value, next.maxSuperGauge); break;
    case "luta_set_guard_power": fighter.guardMax = fighter.guardPower = bound(command.value, 255); break;
    case "luta_set_ism_style": fighter.style = command.value; break;
    case "luta_enable_alpha_counter": fighter.alphaCounterEnabled = command.value !== 0; break;
    case "luta_set_round_timer": next.roundTimerFrames = next.roundTimeFrames = command.value; break;
    case "luta_set_rounds_to_win": next.roundsToWin = command.value; break;
    case "luta_trigger_super":
      if (next.roundState === "active" && fighter.superGauge >= next.maxSuperGauge) {
        next.fighters[side === 0 ? 1 : 0].hp = bound(next.fighters[side === 0 ? 1 : 0].hp - (command.value === 1 ? 40 : 25), 9999);
        fighter.superGauge = bound(next.hitGaugeGain, next.maxSuperGauge);
      }
      break;
  }
  return next;
}
export function tickLutaCombat(state: LutaCombatState, frames: number): LutaCombatState {
  if (state.roundState !== "active" || frames <= 0) return state;
  const next = copy(state);
  for (let frame = 0; frame < frames && next.roundState === "active"; frame++) {
    next.roundTimerFrames = Math.max(0, next.roundTimerFrames - 1);
    for (const fighter of next.fighters) fighter.guardPower = bound(fighter.guardPower + next.guardPowerRecovery, fighter.guardMax);
    if (next.roundTimerFrames > 0 && next.fighters.every(fighter => fighter.hp > 0)) continue;
    const draw = next.fighters[0].hp === next.fighters[1].hp;
    const winner = next.fighters[0].hp > next.fighters[1].hp ? 0 : 1;
    if (!draw) next.wins[winner]++;
    if (draw && next.roundsToWin <= 1) next.roundState = "draw";
    else if (!draw && next.wins[winner] >= next.roundsToWin) next.roundState = winner === 0 ? "player1" : "player2";
    else {
      next.round++; next.roundTimerFrames = next.roundTimeFrames;
      for (const fighter of next.fighters) { fighter.hp = fighter.maxHp; fighter.guardPower = fighter.guardMax; fighter.superGauge = 0; }
    }
  }
  return next;
}
