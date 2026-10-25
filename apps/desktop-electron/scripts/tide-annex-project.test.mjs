import {expect,it} from 'vitest';
import {addTideAnnex,preserveTideAnnex} from './tide-annex-project.mjs';

const fixture=()=>({rooms:[{id:'gallery',name:'galeria_das_mares',width:48,height:32,backgroundAssetName:'approved.png',runtime:{type:'topdown',config:{}},eventBindings:{onInit:'gallery_enter'}},{id:'inventory',name:'inventario',runtime:{config:{items:[{id:'back',action:'pop_screen'}]}}}],scenas:[],actors:[{id:'gallery-nara',name:'Nara',roomName:'galeria_das_mares',spriteSheet:'porto-nara-animations48.png'}],variables:Array.from({length:63},(_,i)=>({name:i===5?'var_stabilizer':'existing_'+i,initialValue:0})),assets:[],animations:[{id:'coast-coast-valve-near-off',name:'off',spriteSheet:'coast-valve-near.png'},{id:'coast-coast-valve-near-on',name:'on',spriteSheet:'coast-valve-near.png'}],animationStates:[],triggers:[],dialogues:[],events:[{id:'new',name:'titulo_novo_jogo',steps:[]},{id:'enter',name:'gallery_enter',steps:[]}],settings:{hudPresets:[]},editorState:{sceneMapPositions:{},scenaConnections:[]}});
const manifest=()=>({approval:{room:true,stabilizer:true},assets:[{id:'tide-room',name:'tide-room.png',kind:'Background',metadata:{approved:true}},{id:'tide-stabilizer',name:'tide-stabilizer.png',kind:'Sprite',metadata:{approved:true}},{id:'tide-valve',name:'tide-valve.png',kind:'Sprite',metadata:{approved:true}},{id:'tide-stabilizer-menu',name:'tide-stabilizer-menu.png',kind:'Sprite',metadata:{approved:true}}],tilemaps:Object.fromEntries(['cheia','esvaziando','vazante'].map((s,n)=>[s,Array.from({length:1536},(_,i)=>(i+n)%800)])),attributes:Array.from({length:1024},(_,i)=>0x9000+i)});
const commands=(p,n)=>p.events.find(e=>e.name===n).steps.map(s=>s.command);
it('appends a separate optional room without changing the approved Gallery, existing actors or saved variable indices',()=>{
 const before=fixture(),copy=structuredClone(before),p=addTideAnnex(before,manifest());
 expect(before).toEqual(copy);expect(p.rooms.find(r=>r.name==='galeria_das_mares')).toEqual(before.rooms[0]);
 expect(p.actors.filter(a=>!a.id.startsWith('tide-'))).toEqual(before.actors);
 expect(p.variables.slice(0,63)).toEqual(before.variables);expect(p.variables).toHaveLength(64);
 expect(p.rooms.find(r=>r.name==='sala_mare_vazante').width).toBe(48);
 expect(p.triggers.find(t=>t.id==='tide-exit').eventBindings.onEnter).toBe('tide_leave');
 expect(addTideAnnex(p,manifest())).toEqual(p);
});
it('restores all 210 changed cells synchronously, and batches live tile changes below the eight-command queue limit',()=>{
 const p=addTideAnnex(fixture(),manifest()),restore=commands(p,'tide_restore');
 const tileCommands=restore.filter(c=>c.startsWith('replace_tile'));
 expect(tileCommands.reduce((sum,c)=>sum+(c.startsWith('replace_tile_sequence')?Number(c.split(' ')[4]):1),0)).toBe(210);
 expect(restore.some(c=>c.startsWith('wait '))).toBe(false);
 let queued=0;for(const c of commands(p,'tide_drain')){if(c.startsWith('replace_tile'))expect(++queued).toBeLessThanOrEqual(8);if(c.startsWith('wait '))queued=0;}
 expect(commands(p,'tide_collect')).toContain('set_variable var_stabilizer 1');
 expect(commands(p,'tide_collect')).toContain('save_game 0');
 expect(restore).toContain('set_actor_visible tide-stabilizer false');
});
it('uses a persistent optional upgrade to reduce real storm drift and preserves the authored room during regeneration',()=>{
 const p=addTideAnnex(fixture(),manifest());
 expect(commands(p,'tide_wind_setup')).toContain('if_variable var_stabilizer 1');
 expect(commands(p,'tide_wind_setup')).toContain('timer_attach 18 tide_wind_tick');
 expect(commands(p,'tide_wind_setup')).toContain('timer_attach 6 tide_wind_tick');
 expect(commands(p,'tide_wind_tick')).toContain('move_actor_relative player 0 0.125');
 const regenerated=preserveTideAnnex(p,fixture());
 expect(regenerated.rooms.find(r=>r.name==='sala_mare_vazante')).toEqual(p.rooms.find(r=>r.name==='sala_mare_vazante'));
 expect(commands(regenerated,'tide_collect')).toEqual(commands(p,'tide_collect'));
 expect(regenerated.variables.map(v=>v.name)).toEqual(p.variables.map(v=>v.name));
});
it('refuses to regenerate unapproved art or exceed the saved-variable capacity',()=>{
 const m=manifest();m.assets[0].metadata.approved=false;
 expect(()=>preserveTideAnnex(addTideAnnex(fixture(),m),fixture())).toThrow('explicit approval');
 const full=fixture();full.variables.push({name:'other_saved_state',initialValue:0});
 expect(()=>addTideAnnex(full,manifest())).toThrow('64 saved-variable slots');
});
it('builds its approved valve animations without requiring the separate coast feature',()=>{
 const p=fixture();p.animations=[];
 const m=manifest();m.animations=['off','on'].map(name=>({id:'tide-valve-'+name,name,spriteSheet:'tide-valve.png',frameCount:1}));
 const result=addTideAnnex(p,m);
 expect(result.animations.filter(a=>a.id.startsWith('tide-valve-')).map(a=>a.id)).toEqual(['tide-valve-off','tide-valve-on']);
});
