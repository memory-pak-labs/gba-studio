import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseGBAProjectFile } from '../src/shared/projectFile.js';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { expandProjectTilemaps } from '../src/shared/projectResourceFormat.js';
import { refineExampleTopdownMovement } from './topdown-movement-project.mjs';

const source = () => parseGBAProjectFile(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8')).data;

it('uses an eight-way player with a shallow foot box in the three approved topdown rooms', () => {
  const p = source();
  expect(p.settings.topdown).toMatchObject({ allowDiagonal: true, normalizeDiagonal: true, movementType: '8 direcoes', directionalAnimation: '4-way animation' });
  const nara = p.animations.filter(a => a.spriteSheet === 'nara-topdown-walk-run-v1.png');
  expect(nara).toHaveLength(12);
  for (const a of nara) expect(a).toMatchObject({ hitboxX: 0, hitboxY: 0, hitboxWidth: 16, hitboxHeight: 8 });
  const exported = buildEngineExportProjectContract(expandProjectTilemaps(p)).topdown_project;
  expect(exported.player).toMatchObject({ allow_diagonal: true, size: { x: 16, y: 8 }, collision_offset: { x: 0, y: 0 } });
  const port = exported.rooms.find(r => r.name === 'porto_lumen');
  expect(port.collision_flags[24 * port.width_tiles + 23]).toBe(0);
  expect(port.collision_flags[25 * port.width_tiles + 23]).toBe(0);
  // The cliff outside the bend must remain closed.
  expect(port.collision_flags[24 * port.width_tiles + 22] & 1).toBe(1);
});

it('is idempotent and preserves artwork, actors, HUD, events and unrelated scene data', () => {
  const p = source(), before = structuredClone(p), result = refineExampleTopdownMovement(p);
  expect(p).toEqual(before);
  expect(result).toEqual(p);
  expect(refineExampleTopdownMovement(result)).toEqual(result);
  for (const key of ['assets', 'actors', 'animationStates', 'events', 'dialogues', 'variables', 'triggers']) expect(result[key]).toEqual(p[key]);
  expect(result.settings.hudPresets).toEqual(p.settings.hudPresets);
  const old = structuredClone(p);
  old.settings.topdown.allowDiagonal = false;
  for (const a of old.animations) if (a.spriteSheet === 'nara-topdown-walk-run-v1.png') Object.assign(a, { hitboxY: -8, hitboxHeight: 16 });
  const revised = refineExampleTopdownMovement(old);
  expect(revised).toEqual(p);
});
