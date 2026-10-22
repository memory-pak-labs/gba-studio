import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { eventCommandIntegrationIssue } from './eventCommandSupport.js';
import { createPreviewRuntime, runPreviewRuntimeEvent, tickPreviewRuntime } from './previewRuntime.js';

describe('equipment requirements in authored events', () => {
  it('reads the actual equipped item, including an empty slot, instead of an inventory flag', () => {
    const project = {
      scenas: [{ name: 'workshop', sceneType: 'topdown', width: 30, height: 20 }],
      events: [
        { name: 'inspect', steps: [{ command: 'store_engine_field equipped_item_0 equipped' }] },
        { name: 'equip', steps: [{ command: 'add_item wrench 1' }, { command: 'set_equipped_item 0 wrench' }] },
        { name: 'unequip', steps: [{ command: 'set_equipped_item 0 none' }] }
      ], settings: { general: { startScene: 'workshop' } }
    };
    let state = runPreviewRuntimeEvent(createPreviewRuntime(project), 'inspect');
    expect(state.variables.equipped).toBe(-1);
    state = runPreviewRuntimeEvent(state, 'equip');
    state = runPreviewRuntimeEvent(state, 'inspect');
    expect(state.variables.equipped).toBe(0);
    state = runPreviewRuntimeEvent(state, 'unequip');
    state = runPreviewRuntimeEvent(state, 'inspect');
    expect(state.inventory.wrench).toBe(1);
    expect(state.variables.equipped).toBe(-1);
  });

  it('accepts the eight equipment slots and timer count as native read fields', () => {
    for (const field of [...Array.from({ length: 8 }, (_, i) => `equipped_item_${i}`), 'timer_count']) {
      expect(eventCommandIntegrationIssue(`store_engine_field ${field} result`, 'topdown')).toBeNull();
    }
    expect(eventCommandIntegrationIssue('store_engine_field equipped_item_8 result', 'topdown')).toBeTruthy();
  });

  it('uses the same field ids in assetc as the native event consumer', () => {
    const assetc = fileURLToPath(new URL('../../../../packages/GBAStudioEngine/tools/assetc/assetc.py', import.meta.url));
    const result = spawnSync('python3', ['-c', `import importlib.util,sys,json
s=importlib.util.spec_from_file_location('assetc',sys.argv[1]);m=importlib.util.module_from_spec(s);sys.modules[s.name]=m;s.loader.exec_module(m)
print(json.dumps([m.event_engine_field({'field':'equipped_item_'+str(i)}) for i in range(8)]+[m.event_engine_field({'field':'timer_count'})]))`, assetc], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('counts actual timer bindings and runs/removes a timed event in the preview', () => {
    const project = {
      scenas: [{ name: 'workshop', sceneType: 'topdown', width: 30, height: 20 }],
      events: [
        { name: 'start', steps: [{ command: 'timer_attach 3 pulse' }, { command: 'store_engine_field timer_count bindings' }] },
        { name: 'pulse', steps: [{ command: 'add_variable pulses 1' }] },
        { name: 'stop', steps: [{ command: 'timer_remove pulse' }, { command: 'store_engine_field timer_count bindings' }] }
      ], settings: { general: { startScene: 'workshop' } }
    };
    let state = runPreviewRuntimeEvent(createPreviewRuntime(project), 'start');
    expect(state.variables.bindings).toBe(1);
    for (let i = 0; i < 3; i++) state = tickPreviewRuntime(state, 1000 / 60);
    expect(state.variables.pulses).toBe(1);
    state = runPreviewRuntimeEvent(state, 'stop');
    expect(state.variables.bindings).toBe(0);
    for (let i = 0; i < 6; i++) state = tickPreviewRuntime(state, 1000 / 60);
    expect(state.variables.pulses).toBe(1);
  });

  it('treats restarting a missing timer as a supported no-op', () => {
    const state=runPreviewRuntimeEvent(createPreviewRuntime({events:[{name:'restart',steps:[{command:'timer_restart absent'}]}]}),'restart');
    expect(state.eventLog.find(e=>e.command==='timer_restart absent')?.result).not.toBe('unsupported');
    expect(Object.keys(state.nativeEvents.timers)).toEqual([]);
  });

  it('skips a nested condition tree when the equipment requirement is false', () => {
    const state = runPreviewRuntimeEvent(createPreviewRuntime({
      scenas: [{ name: 'workshop', sceneType: 'topdown', width: 30, height: 20 }],
      events: [{ name: 'check', steps: [
        'if_engine_field equipped_item_0 0', 'if_variable nested 0', 'set_variable inner 1',
        'else', 'set_variable inner 2', 'condition_end', 'set_variable outer 1',
        'else', 'set_variable fallback 1', 'condition_end'
      ].map(command => ({ command })) }], settings: { general: { startScene: 'workshop' } }
    }), 'check');
    expect(state.variables.inner).toBeUndefined();
    expect(state.variables.outer).toBeUndefined();
    expect(state.variables.fallback).toBe(1);
  });
});
