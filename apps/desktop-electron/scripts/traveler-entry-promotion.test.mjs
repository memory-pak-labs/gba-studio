import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {promoteApprovedTravelerEntry,TRAVELER_ENTRY_SCENES} from './traveler-entry-promotion.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {decodePngRgba} from './lib/png-icons.mjs';
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const source=JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/traveler-entry-manifest.json',import.meta.url)));
const unaffected=r=>!TRAVELER_ENTRY_SCENES.includes(r.name??r.roomName);

it('preserves the exact approved visual font in the two fixed gender labels',()=>{
 const labels=decodePngRgba(readFileSync(new URL(manifest.assets['gender-labels'].source,root)));
 const font=decodePngRgba(readFileSync(new URL('Assets/fonts/porto-hud-b-font.png',root)));
 for(const [frame,value,padding]of [[0,'HOMEM',4],[1,'MULHER',0]])for(let y=0;y<8;y++)for(let x=0;x<48;x++){
  const at=(y*labels.width+frame*48+x)*4,letter=Math.floor((x-padding)/8),xx=(x-padding)%8;
  let expected=false;
  if(letter>=0&&letter<value.length){const c=value.codePointAt(letter)-32,src=(((Math.floor(c/16)*8+y)*font.width)+(c%16)*8+xx)*4;expected=font.pixels[src]!==16||font.pixels[src+1]!==28||font.pixels[src+2]!==48;}
  expect(labels.pixels[at+3]>0,`${value} pixel ${x},${y}`).toBe(expected);
 }
});

it('preserves the campaign and all other scenes, actors, HUDs and approved animations',()=>{
 const before=structuredClone(source),result=promoteApprovedTravelerEntry(source);
 expect(source).toEqual(before);
 for(const key of ['events','variables','dialogues','triggers','audioItems','sceneRouteTables','settings','editorState'])expect(result[key]).toEqual(source[key]);
 expect(result.rooms.filter(unaffected)).toEqual(source.rooms.filter(unaffected));
 expect(result.actors.filter(a=>!TRAVELER_ENTRY_SCENES.includes(a.roomName))).toEqual(source.actors.filter(a=>!TRAVELER_ENTRY_SCENES.includes(a.roomName)));
 for(const animation of source.animations.filter(a=>!a.id.startsWith('traveler-entry-')))expect(result.animations.find(a=>a.id===animation.id)).toEqual(animation);
 expect(promoteApprovedTravelerEntry(result)).toEqual(result);
});

it('promotes the six approved native files and their consumer palette contracts',()=>{
 const result=promoteApprovedTravelerEntry(source);
 for(const e of Object.values(manifest.assets)){
  expect(createHash('sha256').update(readFileSync(new URL(e.source,root))).digest('hex')).toBe(e.sha256);
  const a=result.assets.find(a=>a.name===e.file);expect(a?.metadata).toMatchObject({reviewStatus:'approved',preparedSha256:e.sha256,colorMode:`${e.bpp}bpp`});
 }
 for(const [name,bg]of [['escolha_genero','traveler-gender-bg-240x160.png'],['nome_jogador','traveler-name-bg-240x160.png']]){
  expect(result.rooms.find(r=>r.name===name).backgroundAssetName).toBe(bg);
  expect(result.scenas.find(r=>r.name===name)).toEqual(result.rooms.find(r=>r.name===name));
 }
});

it('keeps portraits and every focus corner aligned with the approved cards and keyboard clearance',()=>{
 const result=promoteApprovedTravelerEntry(source);
 const actors=result.actors.filter(a=>a.roomName==='escolha_genero');
 expect(actors.filter(a=>a.menuActorRole==='cursor').map(a=>a.menuCursorOffsetPixels)).toEqual([{x:-12,y:-16},{x:68,y:-16},{x:-12,y:88},{x:68,y:88}]);
 expect(actors.filter(a=>a.menuCharacterVariant).map(a=>a.menuPositionPixels)).toEqual([{x:36,y:48},{x:140,y:48}]);
 const room=result.rooms.find(r=>r.name==='nome_jogador');
 expect(room.runtime.config.textInput).toMatchObject({x:15,y:5,width:8,maxLength:8,keyboard:{x:11,y:8,width:16,height:10,controlLayout:'bottom_grid',surface:'background'}});
 expect(result.actors.filter(a=>a.roomName==='nome_jogador').map(a=>[a.menuPositionPixels,a.menuVisibilityValue])).toEqual([[{x:20,y:40},0],[{x:20,y:40},1]]);
 for(let i=0;i<29;i++){
  const [x,y,w,h]=i<26?[88+i%8*16,64+Math.floor(i/8)*16,16,16]:[88+[0,48,96][i-26],128,40,16];
  expect(Math.min(x-84,y-60,228-x-w,148-y-h)).toBeGreaterThanOrEqual(4);
 }
});

it('exports frame indices, visibility, option bindings and cursor offsets without changing events',()=>{
 const result=promoteApprovedTravelerEntry(source),p=buildEngineExportProjectContract(result);
 const gender=p.menu_project.screens.find(s=>s.name==='escolha_genero'),name=p.menu_project.screens.find(s=>s.name==='nome_jogador');
 expect(gender.actors.filter(a=>a.role==='cursor')).toHaveLength(4);
 expect(gender.actors.filter(a=>a.role==='cursor').map(a=>[a.cursor_follows_option,a.cursor_for_menu,a.cursor_offset_pixels])).toEqual(
  [{x:-12,y:-16},{x:68,y:-16},{x:-12,y:88},{x:68,y:88}].map(offset=>[true,'escolha_genero',offset]));
 expect(gender.actors.filter(a=>a.role==='option').map(a=>a.position)).toEqual([{x:36,y:48},{x:140,y:48}]);
 expect(name.text_input).toMatchObject({x:15,y:5,width:8,keyboard_x:11,keyboard_y:8,max_length:8});
 expect(name.actors.map(a=>a.visibility_value)).toEqual([0,1]);
 expect(gender.items.map(i=>i.action)).toEqual(['select','select']);
});
