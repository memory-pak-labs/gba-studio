import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { refineInGameMenus } from './in-game-menu-project.mjs';
import { unsupportedDialogueCharacters } from '../src/shared/dialogueFont.ts';
const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
const names = new Set(['menu_start', 'missoes', 'inventario', 'mapa_menu', 'salvar', 'configuracoes', 'carregar_jogo', 'perfil_equipe']);
test('legacy authored menu text fits inside the frame and uses the native selection marker', () => {
  for (const project of [refineInGameMenus(source)]) {
    const presets = project.settings.hudPresets.filter(preset => preset.id.startsWith('hud-ingame-'));
    assert.equal(presets.length, 7);
    for (const preset of presets) {
      const frame = preset.components.find(component => component.kind === 'frame');
      for (const component of preset.components.filter(component => component.kind === 'text')) {
        assert.ok(component.y + component.height <= frame.y + frame.height - 8, `${component.id}: text overlaps bottom frame tile`);
        assert.deepEqual(unsupportedDialogueCharacters(component.text || component.label), [], component.id);
      }
      assert.ok(preset.components.find(component => component.id.endsWith('-row-0')).text.startsWith('! '));
      assert.ok(preset.components.find(component => component.id.endsWith('-row-1')).text.startsWith('  '));
      if (['hud-ingame-salvar', 'hud-ingame-carregar_jogo'].includes(preset.id)) {
        assert.equal(preset.components.find(component => component.id.endsWith('-row-4')).text, ' ');
      }
    }
  }
});
test('selection removes only Perfil/Equipe and preserves all gameplay scenes and assets', () => {
  const result = refineInGameMenus(source);
  assert.equal(result.rooms.length, source.rooms.filter(r => r.name !== 'perfil_equipe').length);
  assert.ok(!result.rooms.some(r => r.name === 'perfil_equipe'));
  assert.deepEqual(result.rooms.filter(r => !names.has(r.name)), source.rooms.filter(r => !names.has(r.name)));
  assert.deepEqual(result.assets, source.assets);
  assert.ok(!result.actors.some(a => a.roomName === 'perfil_equipe'));
  assert.deepEqual(refineInGameMenus(result), result);
});
test('six menus have authored dynamic HUDs and load matches all three save slots', () => {
  const p = refineInGameMenus(source);
  const room = name => p.rooms.find(r => r.name === name);
  const start = room('menu_start').runtime.config;
  assert.deepEqual(start.items.map(i => i.id), ['missions', 'inventory', 'map', 'save', 'settings', 'back']);
  assert.equal(start.titleTextVariableName, 'var_character_name');
  const legacyPortraits = source.actors.filter(a => ['escolha_genero','menu_start'].includes(a.roomName) && /^gender-player-(male|female)-32x64\.png$/.test(a.spriteSheet));
  assert.equal(p.actors.filter(a => a.roomName === 'menu_start').length, legacyPortraits.length);
  assert.ok(p.actors.filter(a => a.roomName === 'menu_start').every(a => a.spriteSheet.startsWith('gender-player-')));
  for (const name of [...names].filter(n => !['perfil_equipe','carregar_jogo'].includes(n))) {
    const r = room(name);
    assert.equal(r.runtime.config.hudListRows, 6);
    assert.equal(r.backgroundAssetName, 'menu-inicial-v3-gba.png');
    assert.ok(p.settings.hudPresets.some(h => h.id === r.hudPresetId));
  }
  assert.deepEqual(room('carregar_jogo').runtime.config.items.filter(i => i.requiresSave).map(i => i.saveSlot), [0,1,2]);
  assert.deepEqual(room('salvar').runtime.config.items.filter(i => i.saveSlot !== undefined).map(i => i.saveSlot), [0,1,2]);
  assert.ok(room('salvar').runtime.config.items.every(i => i.saveSlot === undefined || i.action === 'select'));
  assert.ok(!room('mapa_menu').runtime.config.nodes?.some(n => n.eventName === 'mapa_escolher_penedos'));
  assert.ok(!JSON.stringify(start).includes('perfil_equipe'));
  assert.ok(room('configuracoes').runtime.config.items.find(i => i.id === 'controls').eventName);
  assert.ok(p.events.find(e => e.name === 'missoes_detalhar_proximo').steps.some(s => s.command.startsWith('if_variable')));
});

test('in-game menu dialogues include reviewable Spanish text supported by the native font', () => {
  const p = refineInGameMenus(source);
  const dialogues = p.dialogues.filter(dialogue => dialogue.key.startsWith('ingame-'));
  assert.ok(dialogues.length > 0);
  for (const dialogue of dialogues) {
    assert.ok(dialogue.translations.es?.trim(), dialogue.key);
    assert.notEqual(dialogue.translations.es, dialogue.translations['pt-BR'], dialogue.key);
    assert.equal(dialogue.translationStatus.es, 'draft', dialogue.key);
    assert.deepEqual(unsupportedDialogueCharacters(dialogue.translations.es), [], dialogue.key);
  }
});
