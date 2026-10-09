import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GBAProjectData } from './projectFile.js';
import { playerArrivalPreview } from './playerArrivalPreview.js';

const project = () => JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8')) as GBAProjectData;
describe('player arrival preview', () => {
  it('uses directional idle frames without mutating the player or adding actors', () => {
    const p = project(), before = JSON.stringify(p);
    for (const direction of ['up', 'down', 'left', 'right']) {
      const preview = playerArrivalPreview(p, 'porto_lumen', 'Nara', direction);
      expect(preview?.sprite.animationName).toBe(`idle_${direction}`);
      expect(preview?.sprite.frame).toBeTruthy();
    }
    expect(JSON.stringify(p)).toBe(before);
  });
  it('does not show a player for a scene without a controlled actor', () => {
    expect(playerArrivalPreview(project(), 'titulo', null, 'down')).toBeNull();
  });
  it('mirrors the right frame when no left frame is authored', () => {
    const p = project();
    p.animations = (p.animations as Record<string, unknown>[]).filter(a => a.spriteSheet !== 'player-pilot-32x32.png' || a.name !== 'idle_left');
    (p.animationStates as Record<string, unknown>[]).find(s => s.id === 'nara-topdown-state')!.mirrorLeftFromRight = true;
    const preview = playerArrivalPreview(p, 'porto_lumen', 'Nara', 'left');
    expect(preview?.sprite.animationName).toBe('idle_right');
    expect(preview?.flipX).toBe(true);
  });
  it('uses idle rather than attack or special poses for battle and fighting arrivals', () => {
    const p = project();
    const battle = playerArrivalPreview(p, 'guardiao_rele', 'Nara · Mecânica', 'left');
    expect(battle?.sprite.animationName).toBe('battle_party_mechanic_idle_v2');
    const fighter = playerArrivalPreview(p, 'arena_arrancada', 'Nara · Arena', 'up');
    expect(fighter?.sprite.animationName).toBe('idle');
    expect(fighter?.sprite.animationName).not.toBe('attack');
    expect(fighter?.sprite.animationName).not.toBe('jump');
  });
  it('resolves a safe arrival pose for each of the eight gameplay scenes', () => {
    const p = project();
    const arrivals = [
      ['porto_lumen', 'Nara', 'down', 'idle_down'],
      ['farol_interior', 'Nara · Farol', 'up', 'idle_up'],
      ['penedos_vento', 'Nara · Penedos', 'right', 'idle_right'],
      ['armazem_das_mares', 'Cursor do Armazém', 'down', 'idle'],
      ['observatorio_do_farol', 'Cursor do Observatório', 'left', 'idle'],
      ['tempestade', 'Aeronave de Nara', 'left', 'fly'],
      ['guardiao_rele', 'Nara · Mecânica', 'down', 'battle_party_mechanic_idle_v2'],
      ['arena_arrancada', 'Nara · Arena', 'right', 'idle']
    ] as const;

    for (const [roomName, playerName, direction, expectedAnimation] of arrivals) {
      const preview = playerArrivalPreview(p, roomName, playerName, direction);
      expect(preview?.sprite.animationName, roomName).toBe(expectedAnimation);
      expect(preview?.sprite.animationName, roomName).not.toMatch(/attack|power|special|hurt/i);
    }
  });
  it('does not present a wrong-facing or attack pose when the selected direction has no idle frame', () => {
    const p = project();
    expect(playerArrivalPreview(p, 'arena_arrancada', 'Rival · Arena', 'right')).toBeNull();
    p.animations = (p.animations as Record<string, unknown>[]).filter(a => a.spriteSheet !== 'nara-fighter.png' || a.state !== 'idle');
    expect(playerArrivalPreview(p, 'arena_arrancada', 'Nara · Arena', 'left')).toBeNull();
  });
});
