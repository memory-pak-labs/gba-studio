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
  p.events = p.events.filter(e => e.name.startsWith('penedos_teste_'));
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
    expect(falls.map(t => [t.x, t.y, t.width, t.height])).toEqual([[12,18,8,2]]);
    for (const t of falls) {
      const e = next.events.find(e => e.name === t.eventBindings.onEnter);
      expect(e.steps.map(s => s.command)).toEqual([
        'group Queda - Retornar ao farol', 'if_variable var_penedos_farol 1',
        'set_actor_position player 10 6', 'else', 'set_actor_position player 6 11', 'condition_end'
      ]);
    }
  });
  it('mantém a saída de campanha na margem do viewport', () => {
    const p = source();
    const exit = p.editorState.scenaConnections.find(c => c.from === sceneName);
    exit.exit = { x: 76, y: 9, width: 3, height: 8 };
    const next = configurePlatformerEvents(p);
    expect(next.editorState.scenaConnections.find(c => c.from === sceneName).exit)
      .toEqual({ x: 28, y: 10, width: 2, height: 2 });
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
      expect(event.steps[0].command).toMatch(/^group /);
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
      { op: 'move_actor', actor: 0, x: 1, y: 0 },
      { op: 'move_actor', actor: 0, x: -1, y: 0 },
      { op: 'move_actor', actor: 1, x: 0, y: 2 }
    ]);
  });
  it('liga scripts de início, atualização e interação no contrato nativo', () => {
    const p = isolated(configurePlatformerEvents(source()));
    const out = buildEngineExportProjectContract(p).platformer_project;
    const npcs = out.rooms[0].npcs;
    expect(npcs[0].on_update?.length).toBeGreaterThan(0);
    expect(npcs[0].on_start?.some(c => c.op === 'set_actor_animation')).toBe(true);
    for (const npc of npcs.slice(0, 2)) {
      expect(npc.animations.find(a => a.name === 'patrol_right')?.frame_indices).toEqual([0]);
    }
    expect(npcs[2].on_interact?.some(c => c.op === 'show_dialogue')).toBe(true);
  });
});
