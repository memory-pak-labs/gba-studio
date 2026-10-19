import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pruneObsoleteExampleScripts } from './prune-obsolete-example-scripts.mjs';
import { promoteApprovedRacing } from './racing-approved-promotion.mjs';

describe('retired example scripts', () => {
  it('removes audited unreferenced definitions, preserving unknown scripts and the source', () => {
    const source = { events: [{ name: 'abertura_sinal', command: 'noop' }, { name: 'custom', command: 'noop' }, { name: 'tempestade_drone_disparar', command: 'noop' }],
      dialogues: [{ key: 'penedos_teste_signpost_fala', text: 'old' }, { key: 'custom', text: 'keep' }], actors: [{ name: 'Nara' }] };
    const before = structuredClone(source), result = pruneObsoleteExampleScripts(source);
    expect(source).toEqual(before);
    expect(result.events.map(e => e.name)).toEqual(['custom', 'tempestade_drone_disparar']);
    expect(result.dialogues.map(d => d.key)).toEqual(['custom']);
    expect(result.actors).toEqual(source.actors);
    expect(pruneObsoleteExampleScripts(result)).toEqual(result);
  });
  it.each([
    { actors: [{ eventBindings: { onInteract: 'abertura_sinal' } }] },
    { actors: [{ scriptName: 'abertura_sinal' }] },
    { animations: [{ frameEvents: [[{ type: 'event', value: 'abertura_sinal' }]] }] },
    { rooms: [{ runtime: { config: { steps: [{ eventName: 'abertura_sinal' }] } } }] },
    { events: [{ name: 'caller', command: 'call_event abertura_sinal' }] }
  ])('preserves a retired event when any reference remains: %j', extra => {
    const p = { ...extra, events: [{ name: 'abertura_sinal', command: 'noop' }, ...(extra.events ?? [])] };
    expect(pruneObsoleteExampleScripts(p).events).toContainEqual(p.events[0]);
  });
  it('preserves a retired dialogue when an event still displays it', () => {
    const p = { dialogues: [{ key: 'penedos_teste_signpost_fala' }], events: [{ command: 'show_dialogue penedos_teste_signpost_fala' }] };
    expect(pruneObsoleteExampleScripts(p)).toEqual(p);
  });
  it('removes a retired audio definition only when no scene or event consumes it', () => {
    const clip = { id: 'old-motor', name: 'farol_sfx_motor', exportID: 'farol_sfx_motor', patterns: [{ id: 'motor-main' }] };
    expect(pruneObsoleteExampleScripts({ audioItems: [clip] }).audioItems).toEqual([]);
    for (const reference of ['farol_sfx_motor', 'old-motor']) {
      expect(pruneObsoleteExampleScripts({ audioItems: [clip], events: [{ command: 'play_sfx ' + reference }] }).audioItems).toEqual([clip]);
    }
  });
  it('replaces retired racing entry aliases with the approved onInit binding', () => {
    const p = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
    for (const key of ['rooms', 'scenas']) p[key].find(r => r.name === 'circuito_final').onEnterEventName = 'circuito_ao_entrar';
    const result = promoteApprovedRacing(p);
    for (const key of ['rooms', 'scenas']) {
      const race = result[key].find(r => r.name === 'circuito_final');
      expect(race).not.toHaveProperty('onEnterEventName');
      expect(race.eventBindings.onInit).toBe('circuito_final_ao_entrar');
    }
  });
});
