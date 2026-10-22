import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { promoteLostSignalMission } from './lost-signal-mission.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { bootPreviewRuntimeAtRoom, runPreviewRuntimeEvent, dispatchPreviewRuntimeAction, tickPreviewRuntime } from '../src/shared/previewRuntime.js';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
const commands = (p, name) => p.events.find(e => e.name === name)?.steps.map(s => s.command) ?? [];
function finish(state) {
  for (let n = 0; n < 600; n++) {
    if (state.activeDialogue) state = dispatchPreviewRuntimeAction(state, 'action');
    else if (!state.scriptWaitFrames && !state.scriptContinuations.length) return state;
    state = tickPreviewRuntime(state, 1000 / 60);
  }
  throw new Error('Mission event did not finish');
}
const event = (state, name) => finish(runPreviewRuntimeEvent(state, name));
const boot = (p, room) => ({ ...bootPreviewRuntimeAtRoom(p, room, { skipBootEvents: true }), variables: Object.fromEntries(p.variables.map(v => [v.name, v.initialValue])) });

describe('O sinal perdido — editable canonical mission', () => {
  it('preserves approved visual data and unrelated content, without mutating its input', () => {
    const before = source(), snapshot = structuredClone(before), p = promoteLostSignalMission(before);
    expect(before).toEqual(snapshot);
    expect(promoteLostSignalMission(p)).toEqual(p);
    for (const key of ['assets', 'actors', 'animations', 'animationStates', 'triggers', 'actorPrefabs', 'triggerPrefabs']) expect(p[key]).toEqual(before[key]);
    expect(p.settings).toEqual(before.settings);
    for (const key of ['rooms', 'scenas']) {
      for (const room of before[key]) {
        const after = p[key].find(r => r.id === room.id);
        const { authoringNotes: _oldNotes, ...oldVisual } = room;
        const { authoringNotes: _newNotes, ...newVisual } = after;
        expect(newVisual).toEqual(oldVisual);
      }
    }
    expect(p.variables.filter(v => !v.name.startsWith('var_signal_'))).toEqual(before.variables.filter(v => !v.name.startsWith('var_signal_')));
    expect(p.variables.some(v => v.name === 'var_signal_stage')).toBe(true);
  });

  it('requires the chart before the chest, prevents duplicate items and remembers the observation order', () => {
    const p = promoteLostSignalMission(source());
    let state = boot(p, 'porto_lumen');
    state = event(state, 'porto_recuperar_estrutura');
    expect(state.variables.var_signal_stage).toBe(1);
    state = event(state, 'signal_go_warehouse');
    expect(state.currentRoom.name).toBe('armazem_das_mares');
    state = event(state, 'armazem_das_mares_bau');
    expect(state.inventory.zz_signal_relay ?? 0).toBe(0);
    state = event(state, 'armazem_das_mares_carta');
    state = event(state, 'armazem_das_mares_carta');
    expect(state.inventory.zz_signal_chart).toBe(1);
    state = event(state, 'armazem_das_mares_bau');
    state = event(state, 'armazem_das_mares_bau');
    expect(state.inventory.zz_signal_relay).toBe(1);
    state = event(state, 'signal_go_observatory');
    expect(state.currentRoom.name).toBe('observatorio_do_farol');
    state = event(state, 'observatorio_do_farol_mapa');
    expect(state.variables.var_signal_code).toBe(0);
    state = event(state, 'observatorio_do_farol_telescopio');
    state = event(state, 'observatorio_do_farol_mapa');
    expect(state.variables.var_signal_code).toBe(1);
    expect(state.saveSlots[0].inventory.zz_signal_relay).toBe(1);
    expect(state.saveSlots[0].variables.var_signal_code).toBe(1);
    const saved = state.saveSlots;
    state = bootPreviewRuntimeAtRoom(p, 'titulo', { skipBootEvents: true, saveSlots: saved });
    state = event(state, 'carregar_jogo_slot_1');
    expect(state.currentRoom.name).toBe('observatorio_do_farol');
    expect(state.variables.var_signal_code).toBe(1);
    expect(state.inventory.zz_signal_relay).toBe(1);
  });

  it('cancels or rejects an incorrect code without consuming the relay', () => {
    const p = promoteLostSignalMission(source());
    for (const action of ['action', 'back']) {
      let state = boot(p, 'farol_interior');
      state = { ...state, variables: { ...state.variables, var_signal_stage: 1, var_signal_code: 1 }, inventory: { zz_signal_chart: 1, zz_signal_relay: 1 } };
      state = runPreviewRuntimeEvent(state, 'farol_examinar_lente');
      for (let n = 0; n < 40 && !state.nativeEvents.modal; n++) {
        if (state.activeDialogue) state = dispatchPreviewRuntimeAction(state, 'action');
        state = tickPreviewRuntime(state, 1000 / 60);
      }
      expect(state.nativeEvents.modal?.kind).toBe('code');
      state = finish(dispatchPreviewRuntimeAction(state, action));
      expect(state.variables.var_signal_lock).toBe(action === 'back' ? -1 : 0);
      expect(state.variables.var_signal_stage).toBe(1);
      expect(state.inventory.zz_signal_relay).toBe(1);
    }
  });

  it('guards the repair and reward, consumes the piece once and persists completion', () => {
    const p = promoteLostSignalMission(source());
    let state = boot(p, 'farol_interior');
    state = event(state, 'signal_finish_repair');
    expect(state.variables.var_signal_stage).toBe(0);
    state = event(state, 'signal_claim_reward');
    expect(state.inventory.currency_gold ?? 0).toBe(0);
    state = { ...state, variables: { ...state.variables, var_signal_stage: 1, var_signal_code: 1, var_signal_lock: 1 }, inventory: { zz_signal_chart: 1, zz_signal_relay: 1 } };
    state = event(state, 'signal_finish_repair');
    expect(state.variables.var_signal_stage).toBe(2);
    expect(state.inventory.zz_signal_relay).toBe(0);
    state = event(state, 'signal_claim_reward');
    state = event(state, 'signal_claim_reward');
    expect(state.variables.var_signal_stage).toBe(3);
    expect(state.inventory.currency_gold).toBe(2);
    expect(state.saveSlots[0].variables.var_signal_stage).toBe(3);
    expect(state.saveSlots[0].inventory.currency_gold).toBe(2);
  });

  it('exports the code lock, inventory checks, return routes and the bound cinematic into the mixed ROM', () => {
    const p = promoteLostSignalMission(source()), c = buildEngineExportProjectContract(p);
    expect(commands(p, 'farol_examinar_lente')).toContain('open_code_lock var_signal_lock 3 314');
    expect(commands(p, 'missoes_detalhar_proximo')).toContain('call_procedure signal_mission_status');
    for (const v of p.variables.filter(v => v.name.startsWith('var_signal_'))) expect(commands(p, 'titulo_novo_jogo')).toContain(`set_variable ${v.name} 0`);
    expect(c.topdown_project.scripts.some(s => s.script.some(op => op.op === 'open_code_lock' && op.code === 314))).toBe(true);
    const completedDialogue = p.dialogues.findIndex(d => d.key === 'signal_done');
    expect(c.topdown_project.rooms[0].npcs[0].on_interact).toContainEqual({ op: 'show_dialogue', dialogue: completedDialogue });
    expect(c.advanced_tools.timelines).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'signal_repair', keyframe_count: 9 })]));
    const warehouse = c.point_click_project.scenes.find(s => s.name === 'armazem_das_mares');
    expect(warehouse.hotspots.find(h => h.name === 'Baú Vermelho').on_click.some(op => op.op === 'jump_if_inventory_at_least')).toBe(true);
  });
});
