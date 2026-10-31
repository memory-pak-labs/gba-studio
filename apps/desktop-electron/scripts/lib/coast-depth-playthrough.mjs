import assert from 'node:assert/strict';
import { playLostSignalMission } from './lost-signal-playthrough.mjs';

/** Shared, controller-only journeys. Native ELF diagnostics only read state;
 * saves are written by the authored menus and read after a fresh core boot. */
export async function playCoastDepth(driver, project, exported, feature, context={}) {
  const indices=Object.fromEntries(project.variables.map((v,i)=>[v.name,i]));
  const value=async name=>(await driver.state()).variables[indices[name]];
  const tap=async(key,settle=24)=>{await driver.run(6,key);await driver.run(settle,0);};
  const close=async()=>{for(let i=0;i<50;i++){if(!await driver.dialogue()){await driver.run(8,0);if(!await driver.dialogue())return;}await tap(2,12);}assert.fail('Dialogue closes through controller input');};
  const shot=label=>driver.capture('coast-'+label);
  const screen=name=>{const index=exported.menu_project.screens.findIndex(entry=>entry.name===name);assert.notEqual(index,-1,`Exported menu ${name} exists`);return index;};
  async function saveSlot(slot,label){
    await close();const kind=(await driver.state()).runtimeKind;
    await tap(kind===6?256:8,55);assert.equal((await driver.state()).runtimeKind,3,'The runtime menu shortcut opens the authored menu');
    assert.equal((await driver.state()).currentRoom,screen('menu_start'));
    for(let i=0;i<3;i++)await tap(128);
    await tap(1,55);assert.equal((await driver.state()).currentRoom,screen('salvar'),'Save screen opens');
    for(let i=0;i<slot;i++)await tap(128);
    await tap(1);await tap(1);await driver.checkpoint(label);
    await tap(2);await tap(2);await tap(2,70);
    assert.equal((await driver.state()).runtimeKind,kind,'Save returns to the same runtime');
    await shot(label);return await driver.coast();
  }
  async function reload(label,kind){
    await driver.reboot();await driver.run(240,0);await close();
    if(feature==='clock_boot')await shot(label+'-fresh');
    await tap(kind===6?256:8,55);
    assert.equal((await driver.state()).runtimeKind,3,'Fresh boot can reopen the authored menu');
    for(let i=0;i<4;i++)await tap(128);
    await tap(1,55);assert.equal((await driver.state()).currentRoom,4,'The existing load screen opens');
    // A direct scene boot has no autosave: the load screen already selects
    // the only occupied slot (slot 2), skipping the empty slot 1.
    if(feature!=='clock_boot')await tap(128);
    if(feature==='clock_boot')await shot(label+'-selected-slot');
    await tap(1,160);if(feature==='clock_boot')await shot(label+'-after-load');await close();
    assert.equal((await driver.state()).runtimeKind,kind,'Fresh boot loads the actual battery slot');
    await shot(label);return await driver.coast();
  }
  const cursor=async()=>{const s=await driver.state(),b=s.flagBits;return[b>>>23&15,b>>>27&15];};
  async function point(x,y){for(let i=0;i<90;i++){const [a,b]=await cursor();if(a===x&&b===y)return;await tap(a<x?144:a>x?96:b<y?160:80,16);}assert.fail('Tactical cursor reaches '+[x,y]);}
  const tactical=async()=>(await driver.coast()).tactical;
  async function ready(){for(let i=0;i<150;i++){const t=await tactical();if(t.outcome||t.team===0&&!t.moving)return t;await driver.run(8,0);}assert.fail('Player turn becomes ready');}

  if(feature==='audio')return playLostSignalMission(driver,project,exported,{journey:async c=>{
    await c.close();await driver.run(60,0);
    const music=async()=>(await driver.audioMixer()).find(s=>s.channel==='music');
    assert.equal((await music()).current,12,'Default 80% preference applies to outdoor music');
    async function settings(){await tap(8,55);for(let i=0;i<5;i++)await tap(128);await tap(1,55);assert.equal((await driver.state()).currentRoom,5);}
    async function returnToGame(){
      await tap(2,55);await driver.run(6,2);await driver.run(1,0);
      for(let i=0;i<240&&(await driver.telemetry()).runtimeKind!==0;i++)await driver.run(1,0);
      await driver.run(4,0);assert.equal((await driver.state()).runtimeKind,0);
    }
    await settings();await tap(128);for(let i=0;i<8;i++)await tap(32);assert.equal(await value('var_audio_music_volume'),0);await shot('audio-music-zero');await returnToGame();
    await driver.run(60,0);assert.equal((await music()).current,0);
    await c.walkTo(17,16);await driver.run(90,64);await driver.run(8,0);await c.tap(1,120);await c.close();assert.equal((await driver.state()).currentRoom,1);
    await driver.run(60,0);assert.equal((await music()).current,0,'An interior transition does not undo zero volume');await shot('audio-farol-silent');
    await settings();await tap(128);for(let i=0;i<5;i++)await tap(16);assert.equal(await value('var_audio_music_volume'),50);await returnToGame();
    const fade=[];for(let i=0;i<12;i++){fade.push(await music());await driver.run(5,0);}
    assert.ok(fade.every(s=>s.current<=8),'No frame exceeds the saved 50% preference');
    await driver.run(90,0);
    assert.equal((await music()).current,6,'Interior envelope scales the saved 50% preference');assert.ok(new Set(fade.map(s=>s.current)).size>=2,'The real native volume changes gradually');
    await saveSlot(1,'coast-audio-half-save');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'coast-audio-half-load');await c.close();await driver.run(60,0);
    assert.equal(await value('var_audio_music_volume'),50);assert.equal((await music()).current,6);await shot('audio-half-restored');
    await settings();for(let i=0;i<10;i++)await tap(32);assert.equal(await value('var_audio_master_volume'),0);await returnToGame();await driver.run(60,0);
    assert.equal((await music()).current,0);assert.ok((await driver.audioMixer()).every(s=>s.muted),'Master zero stays silent after leaving settings');
    await saveSlot(1,'coast-audio-master-zero-save');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'coast-audio-master-zero-load');await c.close();await driver.run(60,0);
    assert.equal(await value('var_audio_master_volume'),0);assert.equal((await music()).current,0);assert.ok((await driver.audioMixer()).every(s=>s.muted));await shot('audio-master-zero-restored');
    await settings();for(let i=0;i<5;i++)await tap(16);assert.equal(await value('var_audio_master_volume'),50);await returnToGame();await driver.run(60,0);
    assert.equal((await music()).current,3,'Interior music scales both saved 50% preferences');
    await saveSlot(1,'coast-audio-master-half-save');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'coast-audio-master-half-load');await c.close();await driver.run(60,0);
    assert.equal(await value('var_audio_master_volume'),50);assert.equal(await value('var_audio_music_volume'),50);assert.equal((await music()).current,3);await shot('audio-master-half-restored');
    await settings();for(let i=0;i<3;i++)await tap(128);await tap(1);assert.equal(await value('var_audio_enabled'),0);await returnToGame();
    assert.ok((await driver.audioMixer()).every(s=>s.muted),'Global silence reaches all four native channels');
    await saveSlot(1,'coast-audio-muted-save');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'coast-audio-muted-load');await c.close();await driver.run(60,0);
    assert.equal(await value('var_audio_enabled'),0);assert.ok((await driver.audioMixer()).every(s=>s.muted),'Global silence survives a fresh boot and load');await shot('audio-muted-restored');
    return{passed:true,feature,zeroAcrossTransition:true,savedHalfVolume:true,masterZeroRestored:true,masterHalfRestored:true,muteRestored:true,fade};
  }});

  if(feature==='porto')return playLostSignalMission(driver,project,exported,{journey:async c=>{
    await c.close();await c.walkTo(37,68);await shot('porto-day');
    const initial=await value('var_coast_minute');assert.ok(initial>=1020);
    for(let i=0;i<180&&await value('var_coast_evening')<1;i++)await driver.run(60,0);
    assert.equal(await value('var_coast_evening'),1);await shot('porto-shift');
    await c.saveSlot(1,'coast-porto-save');const savedMinute=await value('var_coast_minute');
    await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'coast-porto-load');await c.close();
    const loadedMinute=await value('var_coast_minute');await shot('porto-clock-restored');assert.ok(Math.abs(loadedMinute-savedMinute)<8,'Clock resumes the saved minute rather than resetting: '+JSON.stringify({savedMinute,loadedMinute}));
    for(let i=0;i<100&&await value('var_coast_evening')<2;i++)await driver.run(60,0);
    assert.equal(await value('var_coast_evening'),2);await shot('porto-lanterns-on');
    const phase=await value('var_coast_evening');await c.saveSlot(1,'coast-porto-night-save');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'coast-porto-night-load');await c.close();
    assert.equal(await value('var_coast_evening'),phase);await shot('porto-night-restored');
    return{passed:true,feature,clock:{initial,savedMinute,loadedMinute},nightRestored:true};
  }});

  await driver.run(180,0);await close();
  if(feature==='clock_boot'){
    assert.equal((await driver.state()).runtimeKind,0);
    assert.equal(await value('var_coast_clock_ready'),1);
    const initial=await value('var_coast_minute');assert.ok(initial>=1020&&initial<1030,'Direct scene Play initializes the harbor evening');
    await shot('clock-direct-boot');await saveSlot(1,'clock-direct-save');const saved=await value('var_coast_minute');
    await reload('clock-direct-load',0);assert.equal(await value('var_coast_clock_ready'),1);assert.ok(Math.abs(await value('var_coast_minute')-saved)<8);
    return{passed:true,feature,initial,clockRestored:true};
  }
  if(feature==='lift'){
    // Physics advances on the ROM's gameplay clock. Waiting a fixed number of
    // video frames changes the jump trajectory when rendering becomes faster.
    const step=async(frames,keys)=>{
      const before=await driver.state();
      for(let i=0;i<frames*20+60;i++){
        const state=await driver.state();
        assert.equal(state.runtimeKind,1,'The platform route stays in its runtime');
        assert.equal(state.currentRoom,before.currentRoom,'The platform route stays in its room');
        if(state.frame-before.frame>=frames)return;
        await driver.run(1,keys);
      }
      assert.fail('The platform gameplay clock advances');
    };
    assert.equal((await driver.state()).runtimeKind,1);await shot('lift-initial');
    await tap(8,55);assert.equal((await driver.state()).currentRoom,screen('menu_start'));
    for(let i=0;i<4;i++)await tap(128);await shot('pause-load-cursor');
    await tap(128);await shot('pause-settings-cursor');
    await tap(128);await shot('pause-resume-second-page');
    await tap(1,70);assert.equal((await driver.state()).runtimeKind,1,'Seventh pause entry resumes the suspended platform scene');
    await step(8,16);
    for(const [frames,keys]of [[14,17],[2,16],[9,17],[16,272],[32,0]])await step(frames,keys);
    await shot('lift-after-first-gap');
    for(let i=0;i<50;i++){
      const s=await driver.coast(),crab=s.actors.find(a=>a.index===1);
      if(!crab?.visible)break;
      const dx=crab.x-(s.platform.x+s.platform.width/2);
      if(Math.abs(dx)>28)await driver.run(1,dx>0?16:32);
      else {await driver.run(1,dx>0?16:32);await tap(512,35);}
      if(i===49)assert.fail('Defeat the existing western crab before crossing the ladder pit');
    }
    await shot('lift-west-crab-cleared');
    for(let i=0;i<40&&(await driver.coast()).platform.x<188;i++)await driver.run(1,16);
    for(const [frames,keys]of [[7,17],[2,16],[6,17],[19,272],[61,0]]){await step(frames,keys);if(await driver.dialogue())await close();}
    await shot('lift-after-checkpoint-pit');
    // A short landing can reach the approved ladder instead of the ledge.
    // Climb it with the authored input before continuing toward the operator.
    if((await driver.coast()).platform.y>248){
      for(let n=0;n<100&&(await driver.coast()).platform.y>248;n++)await step(1,64);
      assert.ok((await driver.coast()).platform.y<=248,'The existing ladder returns to the upper path');
      await driver.run(4,0);await shot('lift-ladder-recovery');
    }
    for(let n=0;n<120;n++){
      const s=await driver.coast();if(s.platform.x>=288)break;
      await driver.run(2,16);if(n%10===0)await driver.run(2,512);
      if(n===119)assert.fail('Walk to the lift operator: '+JSON.stringify(await driver.coast()));
    }
    await driver.run(25,0);await shot('lift-operator-approach');await driver.run(6,1);await shot('lift-operator-action');await driver.run(80,0);await close();
    assert.equal(await value('var_coast_lift'),1,'Operator starts the optional lift');await shot('lift-running');
    const before=await driver.coast(),lift=s=>s.actors.find(a=>a.group===2);assert.ok(lift(before));
    await driver.run(30,0);assert.notEqual(lift(await driver.coast()).y,lift(before).y,'The separate platform actor moves through its event');
    // Jump before entering the operator's interaction radius, then board the
    // separate lift. The approved bridge and its existing collision stay intact.
    for(let i=0;i<80&&(await driver.coast()).platform.x>276;i++)await driver.run(1,32);
    await driver.run(30,0);await shot('lift-boarding-start');driver.recordMovement?.('freight_lift_ride');
    await step(14,17);await step(2,16);await step(9,17);await shot('lift-boarding-jump');
    for(let i=0;i<100&&(await driver.coast()).platform.x<344;i++)await driver.run(1,272);
    await shot('lift-boarding-cross');await driver.run(35,256);
    const onLift=s=>s.platform.onGround&&s.platform.x+s.platform.width>lift(s).x-32&&s.platform.x<lift(s).x+32&&s.platform.y+s.platform.height===lift(s).y-16;
    for(let i=0;i<600;i++){const s=await driver.coast();if(s.platform.y<248&&onLift(s))break;await driver.run(2,0);}
    const ride=await driver.coast();await shot('lift-rider');
    assert.ok(onLift(ride),'Player stands on the authored moving platform');
    await driver.run(16,0);const carried=await driver.coast();
    assert.notEqual(carried.platform.y,ride.platform.y);assert.equal(carried.platform.y-ride.platform.y,lift(carried).y-lift(ride).y,'The platform carries the rider by the same native delta');
    driver.recordMovement?.(null);
    const saved=await saveSlot(1,'lift-ride-save'),loaded=await reload('lift-ride-load',1);
    assert.equal(await value('var_coast_lift'),1);assert.equal(loaded.platform.x,saved.platform.x);
    assert.equal(loaded.platform.y+loaded.platform.height,lift(loaded).y-16,'Loading preserves the rider on the running lift');
    await shot('lift-ride-restored');
    return{passed:true,feature,operatorToggle:true,rideRestored:true,ride,carried};
  }
  if(feature==='market'){
    assert.equal((await driver.state()).runtimeKind,2);
    const map=exported.isometric_project.rooms.find(r=>r.name==='mercado_suspenso');
    const actor=async index=>(await driver.coast()).actors.find(a=>a.index===index);
    async function go(x,y){
      const s=await actor(0),start=[s.x,s.y],queue=[start],previous=new Map([[start.join(','),null]]),others=(await driver.coast()).actors.slice(1);
      const at=(xx,yy)=>yy*map.width_tiles+xx;
      function allowed(a,b,xx,yy){
        if(xx<0||yy<0||xx>=map.width_tiles||yy>=map.height_tiles||map.collision_flags[at(xx,yy)]&1||others.some(o=>o.visible&&o.x===xx&&o.y===yy))return false;
        const delta=(map.height_levels?.[at(xx,yy)]??0)-(map.height_levels?.[at(a,b)]??0);
        if(!delta)return true;if(Math.abs(delta)>1)return false;
        const ramp=map.ramp_flags?.[delta>0?at(xx,yy):at(a,b)]??0,dx=xx-a,dy=yy-b,sign=delta>0?1:-1;
        return !!(ramp&2&&dx===sign&&!dy||ramp&4&&dy===sign&&!dx||ramp&8&&dy===-sign&&!dx||ramp&16&&dx===-sign&&!dy);
      }
      for(let i=0;i<queue.length&&!previous.has(x+','+y);i++)for(const[dx,dy]of [[1,0],[0,1],[-1,0],[0,-1]]){const[a,b]=queue[i],xx=a+dx,yy=b+dy,key=xx+','+yy;if(!previous.has(key)&&allowed(a,b,xx,yy)){previous.set(key,[a,b]);queue.push([xx,yy]);}}
      assert.ok(previous.has(x+','+y),'Market route is reachable through the authored ramps');
      const route=[];let p=[x,y];while(previous.get(p.join(','))){route.push(p);p=previous.get(p.join(','));}
      for(const[xx,yy]of route.reverse())for(const[field,target]of [['x256',xx*256],['y256',yy*256]]){
        for(let n=0;n<100;n++){const a=await actor(0),delta=target-a[field];if(Math.abs(delta)<16)break;const key=field==='x256'?(delta>0?144:96):(delta>0?160:80);await driver.run(Math.min(4,Math.floor(Math.abs(delta)/16)),key);if(n===99){await shot('market-route-blocked');assert.fail('Market player reaches '+[xx,yy]+' '+JSON.stringify({coast:await driver.coast(),ui:await driver.ui()}));}}
      }
      await driver.run(8,0);
    }
    await shot('market-before-delivery');assert.equal(await value('var_market_shortcut'),0);
    const guardBefore=await actor(2);await go(41,24);
    driver.recordMovement?.('market_guard_step');await tap(1,40);await close();await driver.run(24,0);driver.recordMovement?.(null);
    assert.equal(await value('var_market_shortcut'),1);const guardAfter=await actor(2);
    assert.equal(guardBefore.x,24);assert.equal(guardAfter.x,23);assert.equal(guardAfter.x256,23*256);await shot('market-delivery-complete');
    const saved=await saveSlot(1,'market-save'),loaded=await reload('market-load',2);
    assert.deepEqual(loaded.actors.map(a=>[a.x,a.y]),saved.actors.map(a=>[a.x,a.y]));assert.equal(await value('var_market_shortcut'),1);
    await go(19,18);await tap(1,50);assert.ok(await driver.dialogue());await shot('market-merchant-reaction');await close();
    await go(41,24);await tap(1,50);await close();assert.equal((await actor(2)).x256,23*256,'Repeated delivery never moves the guard twice');
    await go(25,3);await tap(1,100);await close();assert.equal((await driver.state()).runtimeKind,6,'The released exit reaches the power station');await shot('market-exit-open');
    return{passed:true,feature,guardBefore,guardAfter,deliveryRestored:true};
  }
  if(feature==='arena'){
    assert.equal((await driver.state()).runtimeKind,2);await shot('arena-four-units');
    const initial=await driver.coast();assert.equal(initial.tactical.units.length,4);
    assert.equal(initial.tactical.units.filter(u=>u.team===0).length,2);
    assert.equal(initial.tactical.units.filter(u=>u.team===1).length,2);
    const actor=(s,i)=>s.actors.find(a=>a.index===i),unit=(s,i)=>s.tactical.units.find(u=>u.actor===i);
    await point(5,11);await shot('arena-support-label');
    async function attack(attacker,target){
      await ready();let s=await driver.coast();const a=actor(s,attacker),b=actor(s,target),u=unit(s,attacker);
      await point(a.x,a.y);await tap(1,4);
      assert.equal((await tactical()).selected,initial.tactical.units.findIndex(u=>u.actor===attacker),'Choose the real allied unit');
      if(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)>u.attackRange){
        await tap(1,4);
        const cells=[];
        for(let x=a.x-u.moveRange;x<=a.x+u.moveRange;x++)for(let y=a.y-u.moveRange;y<=a.y+u.moveRange;y++){
          if(Math.abs(x-a.x)+Math.abs(y-a.y)>u.moveRange||Math.abs(x-b.x)+Math.abs(y-b.y)>u.attackRange||s.actors.some(o=>o.visible&&o.index!==attacker&&o.x===x&&o.y===y))continue;
          const r=exported.isometric_project.rooms.find(r=>r.name==='arena_tatica');
          if(x>=0&&y>=0&&x<r.width_tiles&&y<r.height_tiles&&!(r.collision_flags[y*r.width_tiles+x]&1))cells.push([x,y]);
        }
        cells.sort((x,y)=>Math.abs(x[0]-a.x)+Math.abs(x[1]-a.y)-Math.abs(y[0]-a.x)-Math.abs(y[1]-a.y));assert.ok(cells.length,'Reachable tactical attack approach');
        await point(...cells[0]);await tap(1,4);await driver.run(100,0);assert.equal((await tactical()).moving,false);
      }
      const before=await driver.coast();
      assert.ok(before.tactical.menu,'Actions stay available after selection or movement');
      for(let i=0;i<3&&(await tactical()).menuIndex!==1;i++)await tap(128,4);
      await tap(1,4);assert.equal((await tactical()).attack,true);const actual=actor(await driver.coast(),target);
      await point(actual.x,actual.y);await tap(1,8);const after=await driver.coast();
      assert.ok(unit(after,target).hp<unit(before,target).hp,'An authored attack reduces the selected enemy HP');
      await ready();return await driver.coast();
    }
    await attack(2,3);await shot('arena-support-attack');
    const saved=await saveSlot(1,'arena-mid-save');const loaded=await reload('arena-mid-load',2);
    assert.deepEqual(loaded.tactical.units.map(u=>u.hp),saved.tactical.units.map(u=>u.hp));
    assert.equal(loaded.tactical.turn,saved.tactical.turn);assert.deepEqual(loaded.actors.map(a=>[a.x,a.y]),saved.actors.map(a=>[a.x,a.y]));
    await attack(0,1);await attack(0,1);assert.equal((await tactical()).outcome,0,'One defeated enemy does not end a two-enemy battle');
    for(let i=0;i<6&&!(await tactical()).outcome;i++)await attack(2,3);
    assert.equal((await tactical()).outcome,1);await driver.run(80,0);await shot('arena-duo-victory');
    const finished=await saveSlot(1,'arena-victory-save'),restored=await reload('arena-victory-load',2);
    assert.equal(restored.tactical.outcome,1);assert.deepEqual(restored.tactical.units.map(u=>u.hp),finished.tactical.units.map(u=>u.hp));
    return{passed:true,feature,midBattleRestored:true,victoryRestored:true,units:restored.tactical.units};
  }
  if(feature==='usina'){
    assert.equal((await driver.state()).runtimeKind,6);await shot('usina-initial');
    const map=exported.dungeon_crawler_project.rooms.find(r=>r.name==='usina_submersa');
    async function face(direction){for(let i=0;i<4&&(await driver.state()).player.direction!==direction;i++)await tap(16,24);assert.equal((await driver.state()).player.direction,direction);}
    async function go(x,y){
      const start=(await driver.state()).player,queue=[[start.x,start.y]],previous=new Map([[start.x+','+start.y,null]]);
      for(let i=0;i<queue.length&&!previous.has(x+','+y);i++)for(const[dX,dY]of [[0,-1],[1,0],[0,1],[-1,0]]){const[a,b]=queue[i],xx=a+dX,yy=b+dY,key=xx+','+yy;if(xx<0||yy<0||xx>=map.width_tiles||yy>=map.height_tiles||map.collision_flags[yy*map.width_tiles+xx]&1||previous.has(key))continue;previous.set(key,[a,b]);queue.push([xx,yy]);}
      assert.ok(previous.has(x+','+y));const route=[];let p=[x,y];while(previous.get(p.join(','))){route.push(p);p=previous.get(p.join(','));}
      for(const[xx,yy]of route.reverse()){const before=(await driver.state()).player;await face(xx>before.x?1:xx<before.x?3:yy>before.y?2:0);await tap(64,28);assert.deepEqual([(await driver.state()).player.x,(await driver.state()).player.y],[xx,yy]);}
    }
    async function valve(key,point,direction){await go(...point);await face(direction);await tap(1,60);await close();await shot('usina-valve-'+key);}
    await valve('b-wrong',[5,6],3);assert.equal(await value('var_coast_usina'),0);
    await valve('a',[1,8],1);assert.equal(await value('var_coast_usina'),1);
    await saveSlot(1,'usina-partial-save');await reload('usina-partial-load',6);assert.equal(await value('var_coast_usina'),1);
    await valve('a-repeat',[1,8],1);assert.equal(await value('var_coast_usina'),1);
    await valve('b',[5,6],3);assert.equal(await value('var_coast_usina'),2);
    await valve('c',[9,4],3);assert.equal(await value('var_coast_usina'),3);
    const quiet=await driver.audioEnvelope();assert.equal(quiet.target,0);
    await saveSlot(1,'usina-complete-save');await reload('usina-complete-load',6);assert.equal(await value('var_coast_usina'),3);
    await go(9,2);await face(0);await tap(64,100);assert.equal((await driver.state()).currentRoom,1,'Stable valves unlock the existing core room');await close();await shot('usina-core-unlocked');
    return{passed:true,feature,partialRestored:true,completeRestored:true,wrongOrderResets:true,quiet};
  }
  if(context.customJourney)return context.customJourney({tap,close,shot,saveSlot,reload,value});
  throw Error('Unknown coastal journey: '+feature);
}
