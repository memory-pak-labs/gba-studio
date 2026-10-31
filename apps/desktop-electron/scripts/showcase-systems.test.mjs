import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { promoteShowcaseSystems } from './showcase-systems.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { bootPreviewRuntimeAtRoom, runPreviewRuntimeEvent, dispatchPreviewRuntimeAction, tickPreviewRuntime } from '../src/shared/previewRuntime.js';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
const items = p => [...new Set(p.events.flatMap(e => e.steps ?? []).flatMap(s => {
  const t = s.command.split(/\s+/); return ['add_item', 'has_item'].includes(t[0]) ? [t[1]] : t[0] === 'set_equipped_item' && t[2] !== 'none' ? [t[2]] : [];
}))].sort();
const boot = (p, room) => ({ ...bootPreviewRuntimeAtRoom(p, room, { skipBootEvents: true }), variables: { ...Object.fromEntries(p.variables.map(v => [v.name, v.initialValue])), z_feature_quest_state: 1 } });
function finish(state, seen = []) {
  for (let i = 0; i < 600; i++) {
    if (state.nativeEvents.modal) return state;
    if (state.activeDialogue) { seen.push(state.activeDialogue.key); state = dispatchPreviewRuntimeAction(state, 'action'); }
    else if (!state.scriptWaitFrames && !state.scriptContinuations.length && !state.scriptQueue.length) return state;
    state = tickPreviewRuntime(state, 1000 / 60);
  }
  throw new Error('Showcase event did not finish');
}
const event = (s, name) => finish(runPreviewRuntimeEvent(s, name));

describe('connected showcase systems', () => {
  it('preserves approved images, layout, collisions and the previous mission, and is idempotent', () => {
    const before = source(), snapshot = structuredClone(before), p = promoteShowcaseSystems(before);
    expect(before).toEqual(snapshot); expect(promoteShowcaseSystems(p)).toEqual(p);
    for (const key of ['assets', 'animations', 'animationStates', 'actorPrefabs', 'triggerPrefabs']) expect(p[key]).toEqual(before[key]);
    for (const key of ['rooms', 'scenas']) for (const old of before[key]) {
      const room = p[key].find(r => r.id === old.id);
      for (const field of ['backgroundAssetName', 'width', 'height', 'collisions', 'collisionTypes', 'tilemap', 'cameraBounds']) expect(room[field]).toEqual(old[field]);
    }
    for (const old of before.actors) {
      const { eventBindings: _old, ...a } = old;
      const { eventBindings: _new, ...b } = p.actors.find(a => a.id === old.id);
      expect(b).toEqual(a);
    }
    expect(p.events.find(e => e.name === 'signal_finish_repair')).toEqual(before.events.find(e => e.name === 'signal_finish_repair'));
    for (const name of ['porto_ao_entrar', 'farol_interior_ao_entrar', 'circuito_concluir']) {
      expect(p.events.find(e => e.name === name)).toEqual(before.events.find(e => e.name === name));
    }
    expect(p.variables.some(v => v.name === 'var_council_path')).toBe(true);
  });

  it('remembers either council decision, grants its reward once and returns an optional visitor to Porto', () => {
    const p = promoteShowcaseSystems(source());
    expect(p.dialogues.find(d => d.key === 'conselho').choices).toHaveLength(2);
    for (const [name, path] of [['conselho_confirmar_alianca', 1], ['conselho_escolher_exploracao', 2]]) {
      let state = boot(p, 'conselho_guardia');
      state = { ...state, variables: { ...state.variables, var_council_visit: 1, var_chapter: 2 }, inventory: { currency_gold: 3 } };
      state = event(state, name);
      expect(state.variables.var_council_path).toBe(path);
      expect(state.currentRoom.name).toBe('porto_lumen');
      expect(state.variables.var_guardian_bond).toBe(0);
      expect(state.variables.var_chapter).toBe(2);
      if (path === 1) expect(state.inventory.currency_gold).toBe(5);
      else expect(state.inventory.zzz_guardian_compass).toBe(1);
      const inventory = structuredClone(state.inventory);
      expect(state.saveSlots[0].roomName).toBe('porto_lumen');
      expect(state.saveSlots[0].variables.var_council_path).toBe(path);
      let revisit = boot(p, 'conselho_guardia');
      revisit = { ...revisit, variables: { ...state.variables, var_council_visit: 1 }, inventory: structuredClone(inventory) };
      revisit = event(revisit, 'conselho_ao_entrar');
      expect(revisit.currentRoom.name).toBe('porto_lumen');
      expect(revisit.inventory).toEqual(inventory);
      state = event(state, 'conselho_confirmar_alianca');
      state = event(state, 'conselho_escolher_exploracao');
      expect(state.variables.var_council_path).toBe(path);
      expect(state.inventory).toEqual(inventory);
    }
  });

  it('uses currency and finite stock in the real shop and requires the tool to be equipped', () => {
    const p = promoteShowcaseSystems(source());
    let state = boot(p, 'porto_lumen');
    state = { ...state, inventory: { currency_gold: 3 } };
    state = event(state, 'showcase_open_shop');
    state = dispatchPreviewRuntimeAction(state, 'action');
    expect(state.inventory.zzz_lumen_tool ?? 0).toBe(0);
    state = { ...state, inventory: { ...state.inventory, currency_gold: 5 } };
    state = dispatchPreviewRuntimeAction(state, 'action');
    expect(state.inventory.zzz_lumen_tool).toBe(1); expect(state.inventory.currency_gold).toBe(1);
    state = { ...state, inventory: { ...state.inventory, currency_gold: 99 } };
    state = dispatchPreviewRuntimeAction(state, 'action');
    expect(state.inventory.zzz_lumen_tool).toBe(1); expect(state.inventory.currency_gold).toBe(99);
    state = boot(p, 'farol_interior');
    state = { ...state, variables: { ...state.variables, var_signal_stage: 3 }, inventory: { zzz_lumen_tool: 1 } };
    state = event(state, 'showcase_begin_trial');
    expect(state.variables.var_trial_active ?? 0).toBe(0);
    state = { ...state, equippedItems: { 0: 'zzz_lumen_tool' } };
    state = event(state, 'showcase_begin_trial');
    expect(state.variables.var_trial_active).toBe(1);
    expect(Object.keys(state.nativeEvents.timers)).toHaveLength(1);
  });

  it('expires, retries, succeeds and pays only once while hiding the contextual timer', () => {
    const p = promoteShowcaseSystems(source());
    let state = boot(p, 'farol_interior');
    state = { ...state, variables: { ...state.variables, var_signal_stage: 3 }, inventory: { zzz_lumen_tool: 1 }, equippedItems: { 0: 'zzz_lumen_tool' } };
    state = event(state, 'showcase_begin_trial');
    expect(state.variables.var_trial_charge).toBe(12);
    for (let i = 0; i < 720; i++) state = tickPreviewRuntime(state, 1000 / 60);
    state = finish(state);
    expect(state.variables.var_trial_active).toBe(0); expect(state.variables.var_trial_result).toBe(-1);
    state = event(state, 'showcase_begin_trial');
    expect(state.variables.var_trial_attempts).toBe(2);
    state = event(state, 'farol_sair_porto');
    expect(state.variables.var_trial_result).toBe(1); expect(state.variables.var_trial_active).toBe(0);
    expect(state.inventory.currency_gold).toBe(1);
    state = event(state, 'farol_sair_porto');
    expect(state.inventory.currency_gold).toBe(1);
    expect(Object.keys(state.nativeEvents.timers)).toHaveLength(0);
  });

  it('recovers safely from a mid-trial load while retaining the actual equipment and decision', () => {
    const p = promoteShowcaseSystems(source());
    p.events.push({ name: 'test_save', steps: [{ command: 'save_game 1' }] });
    let state = boot(p, 'farol_interior');
    state = { ...state, variables: { ...state.variables, var_signal_stage: 3, var_council_path: 2 }, inventory: { zzz_lumen_tool: 1, zzz_guardian_compass: 1 }, equippedItems: { 0: 'zzz_lumen_tool' } };
    state = event(state, 'showcase_begin_trial');
    expect(state.variables.var_trial_charge).toBe(18);
    state = event(state, 'test_save');
    state = bootPreviewRuntimeAtRoom(p, 'titulo', { skipBootEvents: true, saveSlots: state.saveSlots });
    state = event(state, 'carregar_jogo_slot_2');
    for (let i = 0; i < 4; i++) state = finish(tickPreviewRuntime(state, 1000 / 60));
    expect(state.variables.var_council_path).toBe(2);
    expect(state.equippedItems['0']).toBe('zzz_lumen_tool');
    expect(state.variables.var_trial_active).toBe(0); expect(state.variables.var_trial_result).toBe(-2);
    expect(state.inventory.zzz_guardian_compass).toBe(1);
  });

  it('hides only the lower race panel at the ending without changing approved HUD drawings or positions', () => {
    const before=source(),base=before.settings.hudPresets.find(h=>h.id==='hud-porto-corrida');
    for(const c of base.components)if(['race-panel-3','race-text-3'].includes(c.id))delete c.behavior;
    const p=promoteShowcaseSystems(before),hud=p.settings.hudPresets.find(h=>h.id===base.id);
    for(const c of hud.components){
      const old=base.components.find(o=>o.id===c.id);
      if(['race-panel-3','race-text-3'].includes(c.id)){
        expect(c.behavior?.states?.hidden).toEqual({variable:'var_campaign_finished',value:1});
        const {behavior,...visual}=c;expect(visual).toEqual(old);
      }else expect(c).toEqual(old);
    }
  });

  it('compiles equipment, timers, parallel reactions and a conditional HUD, with distinct epilogues', () => {
    const p = promoteShowcaseSystems(source()), c = buildEngineExportProjectContract(p);
    const commands = c.topdown_project.scripts.flatMap(s => s.script);
    for (const op of ['open_shop', 'open_equip_menu', 'attach_timer_event', 'start_segment', 'jump_if_engine_field_equals']) expect(commands.some(c => c.op === op), op).toBe(true);
    expect(c.topdown_project.shop_items[0].item).toBe(items(p).indexOf('zzz_lumen_tool'));
    const exit=c.topdown_project.scripts.find(s=>s.name==='farol_sair_porto').script;
    const resultIndex=p.variables.findIndex(v=>v.name==='var_trial_result');
    const finishIndex=exit.findIndex(c=>c.op==='set_variable'&&c.variable===resultIndex&&c.value===1);
    expect(finishIndex,'Completion must run inline before leaving the room').toBeGreaterThanOrEqual(0);
    expect(exit.findIndex(c=>c.op==='warp_runtime')).toBeGreaterThan(finishIndex);
    const hud = p.settings.hudPresets.find(h => h.id === 'hud-farol-trial');
    expect(hud.components.find(c => c.id === 'trial-charge').behavior.states.hidden).toEqual({ variable: 'var_trial_active', value: 0 });
    for (const path of [1, 2]) {
      let state = boot(p, 'corrida_resultados');
      state = { ...state, variables: { ...state.variables, var_council_path: path, racing_result: 1, previous_room: 0 } };
      let final = finish(runPreviewRuntimeEvent(state, 'race_results_continue'));
      const shown = final.eventLog.filter(e => e.result === 'dialogue').map(e => e.detail);
      expect(shown).toContain(path === 1 ? 'showcase_epilogue_community' : 'showcase_epilogue_exploration');
      expect(shown).not.toContain(path === 2 ? 'showcase_epilogue_community' : 'showcase_epilogue_exploration');
      expect(final.variables.var_campaign_finished).toBe(1);
      for (let i = 0; i < 400; i++) {
        if (final.activeDialogue) final = dispatchPreviewRuntimeAction(final, 'action');
        final = tickPreviewRuntime(final, 100);
      }
      expect(final.currentRoom.name).toBe('titulo');
    }
  });
});
