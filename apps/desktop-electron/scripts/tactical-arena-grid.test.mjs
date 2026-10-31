import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { promoteApprovedTacticalArena } from './tactical-arena-promotion.mjs';
import { decodePngRgba } from './lib/png-icons.mjs';
import { expandCompactSequence } from './exemplo-template-audit.mjs';

const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
const project = JSON.parse(readFileSync(new URL('exemplo-gba.gba-project', root)));
const arena = value => {
  const room = value.rooms.find(room => room.name === 'arena_tatica');
  return { ...room, ...Object.fromEntries(['heightLevels','rampFlags','collisionTypes','collisions'].map(key => [key, expandCompactSequence(room[key])])) };
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stairs = [
  [[3, 2, 3, 8], [3, 3, 2, 8], [3, 4, 1, 8], [3, 5, 0, 0]],
  [[11, 1, 3, 16], [12, 1, 2, 16], [13, 1, 1, 16], [14, 1, 0, 0]]
];
const cell = (x, y) => y * 16 + x;
function canMove(room, from, to) {
  if (room.collisionTypes[to] === 'solid') return false;
  const delta = room.heightLevels[to] - room.heightLevels[from];
  if (Math.abs(delta) > 1) return false;
  if (delta === 0) return true;
  const ramp = room.rampFlags[delta > 0 ? to : from];
  const sign = Math.sign(delta), dx = to % 16 - from % 16, dy = Math.floor(to / 16) - Math.floor(from / 16);
  return Boolean(((ramp & 2) && dx === sign && dy === 0)
    || ((ramp & 4) && dy === sign && dx === 0)
    || ((ramp & 8) && dy === -sign && dx === 0)
    || ((ramp & 16) && dx === -sign && dy === 0));
}

describe('Arena Tática: piso modular aprovado', () => {
  it('usa os bytes aprovados e preserva os pixels e a máscara do foreground', () => {
    const background = readFileSync(new URL('Assets/backgrounds/tactical-arena-large-768x512.png', root));
    const foreground = readFileSync(new URL('Assets/backgrounds/tactical-arena-large-foreground.png', root));
    expect(hash(background)).toBe('c4ba0bcd0f84fdb41e6191136ea77348624d0e9b17a6b00a1dacc236c2000000');
    expect(hash(foreground)).toBe('0971c107b41797db7679721027a8d56f3de3de81fae3590b43fe05b470764abb');
    const bg = decodePngRgba(background), fg = decodePngRgba(foreground);
    expect([bg.width, bg.height]).toEqual([768, 512]);
    for (let index = 0; index < fg.pixels.length; index += 4) {
      if (fg.pixels[index + 3]) expect(bg.pixels.subarray(index, index + 3)).toEqual(fg.pixels.subarray(index, index + 3));
    }
  });

  it('registra a mesma geometria, alturas e colisões na reconstrução e no template', () => {
    const current = arena(project), rebuilt = arena(promoteApprovedTacticalArena(project));
    expect(current.runtime.config).toMatchObject({ originX: 384, originY: 68, tileWidth: 48, tileHeight: 24, heightStep: 8 });
    expect(arena({ rooms: project.scenas })).toEqual(current);
    for (const key of ['heightLevels', 'rampFlags', 'collisionTypes']) {
      expect(current[key]).toHaveLength(256);
      expect(rebuilt[key]).toEqual(current[key]);
    }
    expect(current.collisions).toEqual(current.collisionTypes);
    for (const stair of stairs) for (const [x, y, z, ramp] of stair) {
      expect(current.heightLevels[cell(x, y)], `height ${x},${y}`).toBe(z);
      expect(current.rampFlags[cell(x, y)], `ramp ${x},${y}`).toBe(ramp);
      expect(current.collisionTypes[cell(x, y)]).toBe('free');
    }
  });

  it('conecta os dois percursos de escada nos dois sentidos', () => {
    const room = arena(project);
    for (const path of stairs) for (let i = 1; i < path.length; i++) {
      const from = cell(...path[i - 1]), to = cell(...path[i]);
      expect(canMove(room, from, to), `descida ${path[i - 1]} -> ${path[i]}`).toBe(true);
      expect(canMove(room, to, from), `subida ${path[i]} -> ${path[i - 1]}`).toBe(true);
    }
  });

  it('mantém todos os espaços jogáveis alcançáveis, atores no chão e props bloqueados', () => {
    const room = arena(project), seen = new Set([cell(5, 9)]), queue = [...seen];
    for (const from of queue) {
      const x = from % 16, y = Math.floor(from / 16);
      for (const [xx, yy] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (xx < 0 || yy < 0 || xx >= 16 || yy >= 16) continue;
        const to = cell(xx, yy);
        if (!seen.has(to) && canMove(room, from, to)) { seen.add(to); queue.push(to); }
      }
    }
    expect(room.collisionTypes.filter(type => type === 'free')).toHaveLength(184);
    expect(seen.size).toBe(184);
    for (const actor of project.actors.filter(actor => actor.roomName === room.name)) expect(seen.has(cell(actor.x, actor.y))).toBe(true);
    expect(room.collisionTypes[cell(3, 10)]).toBe('solid');
    expect(room.collisionTypes[cell(4, 10)]).toBe('free');
  });
});
