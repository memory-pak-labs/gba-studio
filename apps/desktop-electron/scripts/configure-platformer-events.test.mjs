import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { configurePlatformerEvents } from './configure-platformer-events.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';

const source = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8'));
const sceneName = 'penedos_vento';
function isolated(project) {
  const p = structuredClone(project);
  p.scenas = p.scenas.filter(s => s.name === sceneName);
  p.rooms = p.rooms.filter(s => s.name === sceneName);
  p.scena = p.scenas[0];
  p.actors = p.actors.filter(a => a.roomName === sceneName);
  // Keep global callees; only remove other rooms and their bindings.
  p.events = p.events.filter(e => !e.roomName || e.roomName === sceneName);
  p.triggers = [];
  p.sceneRouteTables = [];
  p.editorState = {};
  p.advancedTools = {};
  p.settings.general.startScene = sceneName;
  p.settings.general.startSceneType = 'platformer';
  for (const s of [...p.scenas, ...p.rooms]) s.eventBindings = {};
  return p;
}
describe('Penedos: eventos dos atores', () => {
  it('liga o vão central ao retorno condicionado pelo farol', () => {
    const next = configurePlatformerEvents(source());
    const falls = next.triggers.filter(t => t.id.startsWith('trigger-penedos-fall-'));
    expect(falls.map(t => [t.x, t.y, t.width, t.height])).toEqual([[24,36,8,4],[52,36,8,4],[76,36,12,4]]);
    for (const t of falls) {
      const e = next.events.find(e => e.name === t.eventBindings.onEnter);
      expect(e.steps.map(s => s.command)).toEqual([
        'play_sfx penedos_impacto_candidato','add_variable penedos_player_health -1',
        'if_variable penedos_player_health 0','set_variable penedos_player_health 3','condition_end',
        'set_platformer_state knockback','if_variable var_penedos_farol 1',
        'set_actor_position player 63 28', 'else', 'set_actor_position player 11 32', 'condition_end'
      ]);
    }
  });
  it('mantém a saída de campanha na margem do mapa ampliado', () => {
    const p = source();
    const exit = p.editorState.scenaConnections.find(c => c.from === sceneName);
    exit.exit = { x: 76, y: 9, width: 3, height: 8 };
    const next = configurePlatformerEvents(p);
    expect(next.editorState.scenaConnections.find(c => c.from === sceneName).exit)
      .toEqual({ x: 116, y: 28, width: 4, height: 4 });
  });
  it('monta timelines agrupadas, patrulhas e interações sem alterar outras cenas ou assets', () => {
    const p = source(), next = configurePlatformerEvents(p);
    expect(next.assets).toEqual(p.assets);
    expect(next.scenas.filter(s => s.name !== sceneName)).toEqual(p.scenas.filter(s => s.name !== sceneName));
    expect(next.actors.filter(a => a.roomName !== sceneName)).toEqual(p.actors.filter(a => a.roomName !== sceneName));
    for (const kind of ['crab', 'moth']) {
      const a = next.actors.find(a => a.id === `penedos-${kind}`);
      expect(a.collisionGroup).toBe(1);
      expect(a.eventBindings.onUpdate).toBeTruthy();
      const event = next.events.find(e => e.name === a.eventBindings.onUpdate);
      expect(event.steps[0].command).toMatch(/^if_variable penedos_defeated_/);
      expect(event.steps.some(s => s.command.startsWith('wait '))).toBe(true);
    }
    for (const kind of ['npc', 'checkpoint']) {
      expect(next.actors.find(a => a.id === `penedos-${kind}`).eventBindings.onInteract).toBeTruthy();
    }
    expect(configurePlatformerEvents(next)).toEqual(next);
  });
  it('exporta deslocamentos sub-tile como pixels, sem truncar patrulha suave', () => {
    const p = isolated(source());
    for (const a of p.actors) a.eventBindings = {};
    p.events = [{ id: 'subtile', name: 'subtile', category: 'Ator', steps: [
      { command: 'move_actor_relative penedos-crab 0.125 0' },
      { command: 'move_actor_relative penedos-crab -0.125 0' },
      { command: 'move_actor penedos-moth 0 0.25' }
    ] }];
    const out = buildEngineExportProjectContract(p).platformer_project;
    expect(out.scripts.find(s => s.name === 'subtile').script).toEqual([
      { op: 'move_actor', actor: 1, x: 1, y: 0 },
      { op: 'move_actor', actor: 1, x: -1, y: 0 },
      { op: 'move_actor', actor: 2, x: 0, y: 2 }
    ]);
  });
  it('liga scripts de início, atualização e interação no contrato nativo', () => {
    const p = configurePlatformerEvents(source());
    const out = buildEngineExportProjectContract(p).platformer_project;
    const npcs = out.rooms.find(r => r.name === sceneName).npcs;
    expect(npcs[1].on_update?.length).toBeGreaterThan(0);
    expect(npcs[1].on_start?.some(c => c.op === 'set_actor_animation')).toBe(true);
    for (const npc of npcs.slice(1, 3)) {
      expect(npc.animations.find(a => a.name === 'idle_right')?.frame_indices.length).toBeGreaterThan(1);
    }
    expect(npcs[0].on_interact?.some(c => c.op === 'show_dialogue')).toBe(true);
  });
});
