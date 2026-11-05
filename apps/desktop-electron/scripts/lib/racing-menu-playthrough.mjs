import assert from 'node:assert/strict';

/** Same controller-only acceptance on the independent core and rendered Play.
 * ABI diagnostics and snapshots are read-only; no state injection is used. */
export async function playRacingMenus(driver,project,exported,options={}) {
 const report={feature:'racing-menus',checks:[],races:[]};
 const screen=name=>exported.menu_project.screens.findIndex(s=>s.name===(name==='titulo'?'title':name));
 const config=name=>{for(const room of project.rooms){const c=room.runtime?.config;if(c?.screens?.some(s=>s.id===name))return c.screens.find(s=>s.id===name);if(room.name===name)return c;}throw Error('Missing menu '+name);};
 const raceIndex=name=>exported.racing_project.rooms.findIndex(r=>r.name===name);
 const tap=async(key,settle=24)=>{await driver.run(3,key);await driver.run(settle,0);};
 const shot=label=>driver.capture('race-'+label);
 const check=(condition,label)=>{assert.ok(condition,label);report.checks.push(label);};
 async function inspectArrivalPixels(){
  const pixels=await driver.frame();
  const near=(x,y,r,g,b)=>{const i=(y*240+x)*4;return [r,g,b].every((v,c)=>Math.abs(pixels[i+c]-v)<=8);};
  check([108,124,140].every(y=>near(10,y+5,40,104,104))&&near(15,93,232,224,184),'All three arrival buttons and the full scoreboard render without fallback rectangles');
  check([65,180,190].every(x=>near(x,147,0,56,80)), 'Third action preserves the teal surface under transparent lettering');
 }
 async function expectMenu(name){const s=await driver.state();assert.equal(s.runtimeKind,3,name+': menu runtime');assert.equal(s.currentRoom,screen(name),name+': screen');}
 async function select(name,id,{settle=45,activate=true}={}) {
  await expectMenu(name);const index=config(name).items.findIndex(i=>i.id===id);assert.ok(index>=0,name+'/'+id);
  for(let n=0;n<30;n++) {const selected=(await driver.sceneMenu()).selected;if(selected===index){if(activate)await tap(1,settle);return;}await tap(selected<index?128:64,12);}
  assert.fail('Menu selection reaches '+name+'/'+id);
 }
 async function close(){for(let n=0;n<60;n++){const ui=await driver.ui();if(!ui.dialogue){await driver.run(10,0);if(!(await driver.ui()).dialogue)return;}await tap(2,10);}assert.fail('Close authored dialogue with B');}
 async function waitRace(){for(let n=0;n<180;n++){const live=await driver.telemetry();if(live?.runtimeKind===7 && live.currentRoom>=0 && live.player.x>0)return;await driver.run(1,0);}assert.fail('Enter the racing runtime after the real transition');}
 async function resume(){await tap(2,0);await waitRace();}
 async function pause(){await tap(8,35);await expectMenu('menu_start');}
 async function start(mode){await select('corrida_preparacao',mode==='circuito_final'?'topdown':'perspective');await driver.run(360,0);const s=await driver.state();assert.equal(s.runtimeKind,7);assert.equal(s.currentRoom,raceIndex(mode));await shot(mode+'-start');}
 let saveOrdinal=0;
 async function checkpointSave(){
  const before=await driver.saveInfo();
  await select('menu_start','save');await expectMenu('salvar');await select('salvar','slot-2');if(saveOrdinal>0)await tap(1,35);
  const after=await driver.saveInfo();assert.notEqual(after.contentChecksum,before.contentChecksum,'Slot 2 is actually written, including explicit overwrite confirmation');
  saveOrdinal++;await driver.checkpoint('race-midpoint-'+saveOrdinal);await shot('saved-slot-2-'+saveOrdinal);
  await tap(2);await expectMenu('menu_start');
 }
 function target(r,points){
  let best;
  for(let i=0;i<points.length;i++){
   const p=points[i],q=points[(i+1)%points.length],dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy),t=Math.max(0,Math.min(1,((r.x-p.x)*dx+(r.y-p.y)*dy)/(length*length))),x=p.x+dx*t,y=p.y+dy*t,d=(r.x-x)**2+(r.y-y)**2;
   if(!best||d<best.d)best={i,t,length,d};
  }
  let i=best.i,d=best.t*best.length+44;
  for(let n=0;n<points.length;n++){const p=points[i],q=points[(i+1)%points.length],length=Math.hypot(q.x-p.x,q.y-p.y);if(d<=length)return {x:p.x+(q.x-p.x)*d/length,y:p.y+(q.y-p.y)*d/length};d-=length;i=(i+1)%points.length;}
  return points[0];
 }
 async function finish(mode,label,boostUnlocked=true){
  const points=config(mode).topdownTrack.pathPoints;let last,refilled=false,maxSpeed=0,completedFrames=0;
  for(let n=0;n<18000;n++){
   const s=await driver.telemetry();
   if(s.runtimeKind<0 || s.currentRoom<0){await driver.run(1,0);if(++completedFrames>600)assert.fail("Native result transition publishes a valid scene");continue;}
   if(s.runtimeKind===3 && s.currentRoom!==screen('corrida_resultados')){await driver.run(1,0);if(++completedFrames>600)assert.fail('Result screen transition completes');continue;}
   if(s.runtimeKind===3){
    await expectMenu('corrida_resultados');assert.ok(last);
    // Native runtime overlays can be replaced before the next published video
    // telemetry frame. Read the race captured by the real scene-stack action,
    // rather than treating the outgoing runtime's reused RAM as live state.
    const completed=await driver.pausedRace();
    check(completed.result===1&&completed.laps===3&&completed.gates===12,label+': three laps through all ordered gates: '+JSON.stringify({last,completed}));
    last=completed;break;
   }
   assert.equal(s.runtimeKind,7);const r=await driver.race();last=r;maxSpeed=Math.max(maxSpeed,r.speed);
   if(r.result!==0 && ++completedFrames>600)assert.fail("A completed race must open its result page, including after loading an older attempt");
   if(r.gates>0&&!refilled){refilled=true;check(boostUnlocked?r.charges>0:r.charges===0,label+(boostUnlocked?': ordered checkpoint refills boost':': checkpoint respects the unacquired module'));await shot(label+'-checkpoint');}
   const point=target(r,points),desired=(Math.atan2(point.x-r.x,-(point.y-r.y))*8/Math.PI+16)%16,current=mode==='circuito_final'?r.heading:r.angle/256,error=(desired-current+24)%16-8;
   const steer=Math.abs(error)>(mode==='circuito_final'?.35:.16)?(error>0?16:32):0;
   await driver.run(1,1|steer);
   if(n===17999)assert.fail('Complete '+label+' through controller driving');
  }
  await driver.run(60,0);
  const best=await driver.textSlot(mode==='circuito_final'?1:2),time=await driver.textSlot(3),position=await driver.textSlot(4),rating=await driver.textSlot(5);
  check(/^\d\d:\d\d\.\d\d$/.test(best),label+': formatted record exists');await shot(label+'-results');await inspectArrivalPixels();
  report.races.push({label,mode,last,best,time,position,rating,refilled,maxSpeed});return{best,time,position,rating};
 }
 await driver.run(180,0);await expectMenu('corrida_preparacao');await shot('preparation');
 await select('corrida_preparacao','controls');await shot('preparation-controls');await close();
 if(options.perspectiveOnly){
  await start('circuito_perspectiva');await driver.run(24,1);
  await pause();const saved=await driver.pausedRace();await driver.run(180,0);
  assert.deepEqual(await driver.pausedRace(),saved);await shot('perspective-paused');
  await checkpointSave();await resume();await driver.run(20,0);await shot('perspective-after-pause');
  await driver.reboot();await driver.run(180,0);await select('corrida_preparacao','load');
  await select('carregar_jogo','load-slot-2',{settle:0});await waitRace();
  const loaded=await driver.race();
  check(Math.abs(loaded.x-saved.x)<12 && Math.abs(loaded.y-saved.y)<12 && loaded.laps===saved.laps && loaded.gates===saved.gates,'Perspective fresh boot restores position, lap and checkpoints');
  await driver.run(20,0);await shot('perspective-after-load');
  const result=await finish('circuito_perspectiva','perspective-complete',false);
  await select('corrida_resultados','retry');await driver.run(360,0);
  const restarted=await driver.race();check(restarted.laps===0 && restarted.gates===0,'Perspective retry starts a new attempt');await shot('perspective-retry');
  await pause();await checkpointSave();await resume();
  await driver.reboot();await driver.run(180,0);await select('corrida_preparacao','load');await select('carregar_jogo','load-slot-2',{settle:0});await waitRace();
  check((await driver.textSlot(2))===result.best,'Perspective record persists after save, fresh boot and load');await driver.run(20,0);await shot('perspective-record-loaded');
  return {...report,passed:true,controllerOnly:true,saveLoad:true,canonical:true,perspectiveOnly:true};
 }
 if(options.campaignEntry){
  const variable=name=>project.variables.findIndex(v=>v.name===name);
  check((await driver.state()).variables[variable('var_boost')]===0,'Canonical project starts without a QA unlock event');
  await start('circuito_final');check((await driver.race()).charges===0,'Unacquired campaign module starts with no boost charges');
  await driver.run(90,513);const locked=await driver.race();check(locked.charges===0&&locked.boost===0&&locked.speed<=4,'L cannot activate an unacquired module');await shot('locked-module');
  const result=await finish('circuito_final','canonical-first-win',false);
  await select('corrida_resultados','continue');let epilogue=false,title=false;
  for(let n=0;n<500;n++){
   const t=await driver.telemetry();
   if(t.runtimeKind<0||t.currentRoom<0){await driver.run(1,0);continue;}
   if(t.runtimeKind===0){if(!epilogue){await driver.run(90,0);await shot('canonical-epilogue');epilogue=true;}}
   if(epilogue&&t.runtimeKind===3&&t.currentRoom===screen('titulo')){title=true;break;}
   await tap(2,25);
  }
  check(epilogue&&title,'Continue on the first victory reaches the existing epilogue and returns to the title');
  await driver.reboot();await driver.run(180,0);await select('corrida_preparacao','load');await select('carregar_jogo','load-slot-1',{settle:180});
  check((await driver.state()).variables[variable('var_campaign_finished')]===1,'Original campaign completion survives automatic save and fresh boot');
  check((await driver.textSlot(1))===result.best,'The first record survives the campaign epilogue and automatic save');
  await pause();check(config('menu_start').items.map(i=>i.id).join(',')==='missions,inventory,map,save,load,settings,back','Approved pause retains exactly seven original entries');await shot('canonical-pause');
  await select('menu_start','inventory');await expectMenu('inventario');await shot('canonical-modules');
  await tap(256);await expectMenu('inventario_modulos_2');await shot('canonical-stabilizer');
  await tap(256);await expectMenu('inventario_ferramentas');check(await driver.item('zzz_lumen_tool')===0,'The toolcase shows zero for a tool not acquired during this development start');
  await select('inventario_ferramentas','tool');await close();check(await driver.item('zzz_lumen_tool')===0&&await driver.equipped()===-1,'An absent tool cannot be equipped or created by the menu');await shot('canonical-empty-toolcase');
  await tap(2);await expectMenu('menu_start');
  return {...report,passed:true,controllerOnly:true,saveLoad:true,canonical:true,fixture:false};
 }
 await start('circuito_final');
 check((await driver.race()).charges===1,'Acquired module grants one starting charge');
 for(let n=0;n<100&&(await driver.race()).speed<4;n++)await driver.run(2,1);
 await driver.run(3,513);await driver.run(6,1);
 const boosted=await driver.race();check(boosted.charges===0&&boosted.boost>0&&boosted.speed>4,'L consumes one charge and actually exceeds the normal speed');await shot('topdown-boost');
 const beforeR=await driver.race();await tap(256,2);const afterR=await driver.race();check(afterR.elapsed>=beforeR.elapsed&&afterR.distance>=beforeR.distance,'R leaves the current race intact');
 await pause();const paused=await driver.pausedRace();await driver.run(600,0);assert.deepEqual(await driver.pausedRace(),paused);report.checks.push('Pause freezes position, time, laps, speed and boost duration');await shot('pause');
 await select('menu_start','inventory');await expectMenu('inventario');await shot('modules-page-1');
 await tap(256);await expectMenu('inventario_modulos_2');await shot('modules-page-2');
 await tap(256);await expectMenu('inventario_ferramentas');check(await driver.item('zzz_lumen_tool')===1,'Tool quantity is real');await shot('tools-unequipped');
 await tap(256);await expectMenu('inventario');await tap(512);await expectMenu('inventario_ferramentas');
 assert.deepEqual(await driver.pausedRace(),paused);report.checks.push('L/R cycles through the same toolcase without changing the suspended race or return stack');
 await select('inventario_ferramentas','tool');await close();check(await driver.equipped()===6,'Tool action equips the existing reusable tool');check(await driver.item('zzz_lumen_tool')===1,'Equipping does not consume the tool');await shot('tools-equipped');
 await select('inventario_ferramentas','tool');await close();check(await driver.equipped()===-1&&await driver.item('zzz_lumen_tool')===1,'Unequip leaves the reusable tool in the bag');await shot('tools-removed');
 await select('inventario_ferramentas','tool');await close();assert.equal(await driver.equipped(),6);
 await tap(2);await expectMenu('menu_start');await checkpointSave();
 const saved=await driver.pausedRace();await resume();const resumed=await driver.race();check(resumed.elapsed-saved.elapsed<20&&Math.abs(resumed.x-saved.x)<20,'Resume excludes the time spent in menus');await shot('resumed');
 await driver.reboot();await driver.run(180,0);await expectMenu('corrida_preparacao');
 await select('corrida_preparacao','load');await expectMenu('carregar_jogo');await select('carregar_jogo','load-slot-2',{settle:0});
 await waitRace();
 const loaded=await driver.race();check(loaded.laps===saved.laps&&loaded.gates===saved.gates&&loaded.charges===saved.charges&&Math.abs(loaded.elapsed-saved.elapsed)<15,'Fresh boot loads the saved race, charges, laps and elapsed time');
 check(await driver.equipped()===6&&await driver.item('zzz_lumen_tool')===1,'Tool quantity and equipped state survive a fresh boot and load');await shot('race-loaded');
 let first=await finish('circuito_final','topdown-first');check((await driver.textSlot(6))===first.best,'Result screen shows this race record');
 await select('corrida_resultados','choose');await select('corrida_preparacao','load');await select('carregar_jogo','load-slot-2',{settle:0});
 await waitRace();
 first=await finish('circuito_final','topdown-loaded-after-finish');report.checks.push('Loading a mid-race save after a completed attempt still dispatches results');
 await select('corrida_resultados','retry');await driver.run(360,0);await driver.run(600,0);const slower=await finish('circuito_final','topdown-slower');check(slower.best===first.best,'A slower completed race preserves the better record');
 await select('corrida_resultados','choose');await expectMenu('corrida_preparacao');await start('circuito_perspectiva');await shot('perspective-minimap');
 await driver.run(24,1);const perspectiveSaved=await driver.race();
 await pause();await checkpointSave();await resume();await shot('perspective-after-pause');
 await driver.reboot();await driver.run(180,0);await select('corrida_preparacao','load');
 await select('carregar_jogo','load-slot-2',{settle:0});await waitRace();
 const perspectiveLoaded=await driver.race();
 check(Math.abs(perspectiveLoaded.x-perspectiveSaved.x)<12 && Math.abs(perspectiveLoaded.y-perspectiveSaved.y)<12 && perspectiveLoaded.gates===perspectiveSaved.gates && perspectiveLoaded.laps===perspectiveSaved.laps,'Perspective save survives a fresh boot with position, lap and checkpoints');
 await driver.run(20,0);await shot('perspective-after-load');
 const perspective=await finish('circuito_perspectiva','perspective-first');check((await driver.textSlot(1))===first.best,'Perspective results preserve the independent top-down record');
 await select('corrida_resultados','choose');await expectMenu('corrida_preparacao');await shot('independent-records');
 await select('corrida_preparacao','topdown');await driver.run(360,0);await pause();await checkpointSave();await resume();
 await driver.reboot();await driver.run(180,0);await select('corrida_preparacao','load');await select('carregar_jogo','load-slot-2',{settle:0});
 await waitRace();
 check((await driver.textSlot(1))===first.best&&(await driver.textSlot(2))===perspective.best,'Both independent records survive saving and a fresh boot');
 await driver.run(20000,0);await expectMenu('corrida_resultados');check(['TREINO','PRACTICE','PRACTICA'].includes(await driver.textSlot(5)),'A lost race is evaluated as practice');check((await driver.textSlot(1))===first.best,'A defeat never replaces a valid record');await shot('practice-result');
 await select('corrida_resultados','retry');await driver.run(360,0);
 const restarted=await driver.race();check(restarted.laps===0&&restarted.gates===0&&restarted.charges===1,'Retry after the result creates a fresh race with one charge');await shot('retry-fresh');
 await pause();check(config('menu_start').items.map(i=>i.id).join(',')==='missions,inventory,map,save,load,settings,back','Pause has the seven approved entries, with one Inventory access');await resume();
 await driver.run(20000,0);await expectMenu('corrida_resultados');await shot('return-map-action');
 await select('corrida_resultados','continue');
 for(let n=0;n<60&&(await driver.state()).runtimeKind!==10;n++)await driver.run(6,0);
 check((await driver.state()).runtimeKind===10,'Continue after a replay returns to the route map: '+JSON.stringify(await driver.state()));await shot('returned-to-map');
 check((await driver.textSlot(1))===first.best&&(await driver.textSlot(2))===perspective.best,'Returning to the map preserves both records');
 return{...report,passed:true,controllerOnly:true,saveLoad:true};
}
