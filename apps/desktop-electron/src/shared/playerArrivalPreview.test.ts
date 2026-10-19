import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { GBAProjectData } from './projectFile.js';
import { playerArrivalPreview } from './playerArrivalPreview.js';

const project = () => JSON.parse(readFileSync(new URL('../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8')) as GBAProjectData;
describe('player arrival preview', () => {
  it('uses each approved Porto idle direction without mirroring left', () => {
    const p=project(), before=JSON.stringify(p);
    for(const direction of ['up','down','left','right']) {
      const preview=playerArrivalPreview(p,'porto_lumen','Nara',direction);
      expect(preview?.sprite.animationName).toBe('idle_'+direction);
      expect(preview?.flipX).toBe(false);
    }
    expect(JSON.stringify(p)).toBe(before);
  });
  it('retains a single front reference when no directional poses are bound', () => {
    const p=project();
    const actor=(p.actors as Record<string,unknown>[]).find(a=>a.id==='port-nara')!;
    delete actor.animationStateID;
    p.animations=(p.animations as Record<string,unknown>[]).filter(a=>a.spriteSheet!==actor.spriteSheet||a.name==='idle_down');
    for(const direction of ['up','down','left','right']) {
      const preview=playerArrivalPreview(p,'porto_lumen','Nara',direction);
      expect(preview?.sprite.animationName).toBe('idle_down');
      expect(preview?.flipX).toBe(false);
    }
  });
  it('uses directional idle frames without mutating the player or adding actors', () => {
    const p = project(), before = JSON.stringify(p);
    for (const direction of ['up', 'down', 'left', 'right']) {
      const preview = playerArrivalPreview(p, 'farol_interior', 'Nara · Farol', direction);
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
    p.animations = (p.animations as Record<string, unknown>[]).filter(a => a.spriteSheet !== 'porto-nara-animations48.png' || a.name !== 'idle_left');
    (p.animationStates as Record<string, unknown>[]).find(s => s.id === 'porto-nara-animations48-state')!.mirrorLeftFromRight = true;
    const preview = playerArrivalPreview(p, 'farol_interior', 'Nara · Farol', 'left');
    expect(preview?.sprite.animationName).toBe('idle_right');
    expect(preview?.flipX).toBe(true);
  });
  it('uses idle rather than attack or special poses for battle and fighting arrivals', () => {
    const p = project();
    const battle = playerArrivalPreview(p, 'guardiao_rele', 'Nara · Mecânica', 'left');
    expect(battle?.sprite.animationName).toBe('idle');
    const fighter = playerArrivalPreview(p, 'arena_arrancada', 'Nara · Arena', 'up');
    expect(fighter?.sprite.animationName).toBe('arena_nara_idle');
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
      ['tempestade', 'Aeronave de Nara', 'left', 'fly_right'],
      ['guardiao_rele', 'Nara · Mecânica', 'down', 'idle'],
      ['arena_arrancada', 'Nara · Arena', 'right', 'arena_nara_idle']
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
    const sheet = (p.actors as Record<string, unknown>[]).find(a => a.id === 'nara-fighter')?.spriteSheet;
    p.animations = (p.animations as Record<string, unknown>[]).filter(a => a.spriteSheet !== sheet || a.state !== 'idle');
    expect(playerArrivalPreview(p, 'arena_arrancada', 'Nara · Arena', 'left')).toBeNull();
  });
});
