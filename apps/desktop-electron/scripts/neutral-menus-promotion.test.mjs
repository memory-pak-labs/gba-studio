import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { promoteNeutralMenus, NEUTRAL_MENU_SCENES } from './neutral-menus-promotion.mjs';
import { deriveHudPresetsWorkspacePresentation } from '../src/shared/hudPresets.js';
const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
test('preserves gameplay, events, menu actions and save slots while replacing eight compositions', () => {
  const result = promoteNeutralMenus(source);
  expect(result.rooms.filter(r => !NEUTRAL_MENU_SCENES.includes(r.name))).toEqual(source.rooms.filter(r => !NEUTRAL_MENU_SCENES.includes(r.name)));
  expect(result.events).toEqual(source.events);
  expect(result.variables).toEqual(source.variables);
  for (const name of NEUTRAL_MENU_SCENES) {
    const before = source.rooms.find(r => r.name === name), after = result.rooms.find(r => r.name === name);
    const actions = r => r.runtime.config.items.map(({clickBox,detailLines,label,...item}) => item);
    expect(actions(after)).toEqual(actions(before));
    expect(after.backgroundAssetName).toBe(`neutral-${name}-gba.png`);
    expect(result.actors.filter(a => a.roomName === name && a.menuActorRole === 'cursor')).toHaveLength(1);
    expect(result.scenas.find(r => r.name === name)).toEqual(after);
  }
  expect(promoteNeutralMenus(result)).toEqual(result);
});
test('uses approved native actors and baked titles without duplicating HUD text', () => {
  const result = promoteNeutralMenus(source);
  for (const name of NEUTRAL_MENU_SCENES) {
    const room = result.rooms.find(r => r.name === name);
    const preset = result.settings.hudPresets.find(p => p.id === room.hudPresetId);
    expect(preset.components.some(c => c.id === `${name}-title`)).toBe(false);
    expect(room.runtime.config.title).toBe('');
    expect(result.assets.find(a => a.name === room.backgroundAssetName).metadata.generatedBy).toBe('approved-neutral-menus-v3');
    if (['menu_start', 'configuracoes', 'missoes'].includes(name)) {
      expect(preset.components.find(c => c.id === `${name}-row-0`).y).toBe(44);
    }
    if (['salvar', 'carregar_jogo'].includes(name)) {
      expect(room.runtime.config.items[0].clickBox.height).toBe(28);
      expect(result.actors.find(a => a.roomName === name && a.menuActorRole === 'option').menuPositionPixels.y).toBe(34);
    }
  }
  const pause = result.settings.hudPresets.find(p => p.id === 'hud-neutral-menu_start');
  expect(pause.components[0]).toMatchObject({id:'menu_start-player-name',x:16,y:116,width:64,runtimeText:true,text:'  Nara'});
  const normalized = deriveHudPresetsWorkspacePresentation(result).presets.find(p => p.id === pause.id);
  expect(normalized.components[0]).toMatchObject({x:16,y:116,pixelPosition:true});
  expect(normalized.components.find(c => c.id === 'menu_start-row-0').y).toBe(44);
  expect(normalized.components.find(c => c.id === 'menu_start-footer').x).toBe(36);
  const map = result.rooms.find(r => r.name === 'mapa_menu');
  expect(map.runtime.config.items[6].clickBox.y).toBe(100);
});
test('binds only actual runtime slots and fits every element into the GBA viewport', () => {
  const result = promoteNeutralMenus(source);
  for (const name of NEUTRAL_MENU_SCENES) {
    const room=result.rooms.find(r=>r.name===name);
    const preset=result.settings.hudPresets.find(p=>p.id===room.hudPresetId);
    expect(preset.components).toHaveLength(8);
    for(const component of preset.components) {
      expect(component.x+component.width).toBeLessThanOrEqual(240);
      expect(component.y+component.height).toBeLessThanOrEqual(160);
    }
    if(['salvar','carregar_jogo','creditos','configuracoes'].includes(name)) {
      const rows=room.runtime.config.hudListRows;
      expect(preset.components.slice(rows+2).every(c=>!c.runtimeText && c.text===' ')).toBe(true);
    }
  }
});
