import { describe, expect, it } from "vitest";
import { createLutaCombatState, applyLutaCombatEvent, tickLutaCombat } from "./lutaCombat.js";
import { parseLutaEventCommand } from "./lutaEventCommands.js";

describe("Luta event simulation", () => {
  it("uses the actual fighter state and clamps gauge changes", () => {
    let state = createLutaCombatState({ maxSuperGauge: 100, roundsToWin: 2, roundTime: 30 });
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_set_super_gauge player1 500"), 0);
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_add_super_gauge player1 -25"), 0);
    expect(state.fighters[0].superGauge).toBe(75);
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_set_guard_power player2 80"), 1);
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_set_ism_style player2 v-ism"), 1);
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_enable_alpha_counter player2 false"), 1);
    expect(state.fighters[1]).toMatchObject({ guardPower: 80, guardMax: 80, style: 2, alphaCounterEnabled: false });
  });
  it("consumes a charged super and applies real damage, but an uncharged super does not hit", () => {
    let state = createLutaCombatState({ maxSuperGauge: 100, superGaugeGainOnReceive: 4 });
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_trigger_super player1 ultra"), 0);
    expect(state.fighters[1].hp).toBe(100);
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_set_super_gauge player1 100"), 0);
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_trigger_super player1 ultra"), 0);
    expect(state.fighters[1].hp).toBe(60);
    expect(state.fighters[0].superGauge).toBe(4);
  });
  it("advances the authored timer and ends the match at the authored win count", () => {
    let state = createLutaCombatState({ roundsToWin: 2, roundTime: 30 });
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_set_rounds_to_win 1"));
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_set_round_timer 1"));
    state.fighters[1].hp = 50;
    state = tickLutaCombat(state, 59);
    expect(state.roundTimerFrames).toBe(1);
    state = tickLutaCombat(state, 1);
    expect(state).toMatchObject({ roundState: "player1", wins: [1, 0] });
  });
  it("explicit finalization applies winner or draw", () => {
    let state = createLutaCombatState({ roundsToWin: 3 });
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_end_match player2"));
    expect(state).toMatchObject({ roundState: "player2", wins: [0, 3] });
    state = applyLutaCombatEvent(state, parseLutaEventCommand("luta_end_match draw"));
    expect(state.roundState).toBe("draw");
  });
});
