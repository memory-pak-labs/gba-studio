import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { promoteApprovedBookMenus, BOOK_MENU_SCENES } from './book-menus-promotion.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
const source = JSON.parse(readFileSync(new URL('exemplo-gba.gba-project', root)));
const manifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/book-menu-manifest.json', import.meta.url)));
const actions = room => room.runtime.config.items.map(({ label, clickBox, detailLines, valueLabels, ...item }) => item);

it('preserves campaign data, events, bindings, actions and the three save slots', () => {
  const result = promoteApprovedBookMenus(source);
  for (const key of ['events', 'variables', 'dialogues', 'triggers']) expect(result[key]).toEqual(source[key]);
  expect(result.rooms.filter(r => !BOOK_MENU_SCENES.includes(r.name))).toEqual(source.rooms.filter(r => !BOOK_MENU_SCENES.includes(r.name)));
  expect(result.actors.filter(a => !BOOK_MENU_SCENES.includes(a.roomName))).toEqual(source.actors.filter(a => !BOOK_MENU_SCENES.includes(a.roomName)));
  for (const name of BOOK_MENU_SCENES) {
    const room = result.rooms.find(r => r.name === name);
    expect(actions(room)).toEqual(actions(source.rooms.find(r => r.name === name)));
    expect(result.scenas.find(r => r.name === name)).toEqual(room);
  }
  expect(promoteApprovedBookMenus(result)).toEqual(result);
});

it('promotes exactly the approved files and palette plans with no pixel preparation', () => {
  const result = promoteApprovedBookMenus(source);
  for (const entry of Object.values(manifest.assets)) {
    const bytes = readFileSync(new URL(entry.source, root));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    const asset = result.assets.find(a => a.name === entry.file);
    expect(asset.metadata.preparedSha256).toBe(entry.sha256);
    expect(asset.metadata.reviewStatus).toBe('approved');
  }
  expect(result.rooms.find(r => r.name === 'salvar').runtime.config.hudFeedbackInDetails).toBe(true);
  const save = buildEngineExportProjectContract(result).menu_project.screens.find(s => s.name === 'salvar');
  expect(save.hud_feedback_in_details).toBe(true);
  expect(save.items.map(item => item.save_slot)).toEqual([0, 1, 2, undefined]);
});

it('keeps every selection and page indicator tied to the actual menu item', () => {
  const result = promoteApprovedBookMenus(source);
  for (const name of BOOK_MENU_SCENES) {
    const room = result.rooms.find(r => r.name === name);
    const actors = result.actors.filter(a => a.roomName === name);
    for (const item of room.runtime.config.items) {
      expect(actors.some(a => a.menuItemID === item.id && a.menuActorSelectedOnly && a.name.startsWith('Selection'))).toBe(true);
    }
    const hud = result.settings.hudPresets.find(h => h.id === room.hudPresetId);
    expect(hud.components).toHaveLength(8);
    expect(hud.font).toBe('porto-hud-b-font.png');
    expect(hud.components.every(c => c.x + c.width <= 240 && c.y + c.height <= 160)).toBe(true);
    if (name !== 'inventario') expect(hud.components.some(c => /A.*DETALH|B.*VOLTAR/.test(c.text))).toBe(false);
  }
  for (const [name, rows] of [['missoes', 4], ['configuracoes', 5]]) {
    const room = result.rooms.find(r => r.name === name);
    for (const [i, item] of room.runtime.config.items.entries()) {
      const page = result.actors.find(a => a.roomName === name && a.menuItemID === item.id && a.name.startsWith('Page'));
      expect(page.animationName).toBe(`book-page-${Math.floor(i / rows)}`);
      expect(page.menuActorSelectedOnly).toBe(true);
    }
  }
  const portraits = result.actors.filter(a => a.roomName === 'menu_start' && a.menuVisibilityVariable);
  expect(portraits.map(a => a.menuVisibilityValue)).toEqual([0, 1]);
});
