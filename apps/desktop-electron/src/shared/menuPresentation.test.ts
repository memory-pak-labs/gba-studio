import {describe,expect,it} from 'vitest';
import {normalizeMenuSceneConfig} from './menuScene.js';

describe('authored menu pages and read-only HUD fields',()=>{
 it('retains shoulder navigation and independent live values on regular and embedded screens',()=>{
  const extra={pageNavigation:{previousScreenID:'tools',nextScreenID:'modules-2'},hudBindings:[{slot:4,binding:{source:'text',index:3,format:'number'}},{slot:3,selectedItem:true}]};
  const config=normalizeMenuSceneConfig({screenType:'menu',role:'inventory',...extra,screens:[{id:'modules',screenType:'menu',title:'MÓDULOS',items:[],...extra}]}) as any;
  expect(config.pageNavigation).toEqual(extra.pageNavigation);
  expect(config.hudBindings).toEqual(extra.hudBindings);
  expect(config.screens[0].pageNavigation).toEqual(extra.pageNavigation);
  expect(config.screens[0].hudBindings).toEqual(extra.hudBindings);
 });
 it('rejects out-of-range HUD slots and invalid bindings without changing ordinary menus',()=>{
  const config=normalizeMenuSceneConfig({screenType:'menu',hudBindings:[{slot:8,binding:{source:'text',index:3}},{slot:0,binding:{source:'text',index:99}}]}) as any;
  expect(config.hudBindings??[]).toEqual([]);
  expect(config.pageNavigation).toBeUndefined();
 });
});
