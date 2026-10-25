import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {decodePngRgba} from './png-icons.mjs';
import {playLostSignalMission} from './lost-signal-playthrough.mjs';

/** Controller-only acceptance through the actual Gallery puzzle and tide room.
 * The QA shortcut only compares Storm before/after the real item acquisition. */
export async function playTideAnnex(driver,project,exported,mode='all',context={}){
 const vi=Object.fromEntries(project.variables.map((v,i)=>[v.name,i]));
 const value=async key=>(await driver.state()).variables[vi[key]];
 const gallery=exported.topdown_project.rooms.findIndex(r=>r.name==='galeria_das_mares');
 const tide=exported.topdown_project.rooms.findIndex(r=>r.name==='sala_mare_vazante');
 const capture=s=>driver.capture('tide-'+s);
 const floorProof=[];
 const bg=decodePngRgba(fs.readFileSync(path.join(context.projectRoot,'Assets/backgrounds/tide-room.png')));
 const rgb=(pixels,i)=>(pixels[i]>>3)|((pixels[i+1]>>3)<<5)|((pixels[i+2]>>3)<<10);
 async function compareFloor(label){
  // A restored on-enter script reapplies the canal behind its authored fade.
  // Wait for that bounded transition before measuring the actual framebuffer.
  for(let n=0;n<30;n++){
   const frame=await driver.frame();let visible=0;
   for(let i=0;i<frame.length;i+=4)if(frame[i]+frame[i+1]+frame[i+2]>48)visible++;
   if(visible>10000){await driver.run(24,0);break;}await driver.run(12,0);
  }
  const frame=await driver.frame(),camera=await driver.camera(),video=await driver.hardware();let pixels=0,mismatch=0;
  assert.equal(camera.follow,true);assert.deepEqual(camera.bounds,[0,0,384,256]);
  for(let y=104;y<144;y++)for(let x=24;x<360;x++){
   const sx=x-camera.x,sy=y-camera.y;if(sx<0||sx>=240||sy<0||sy>=160||(sx<80&&sy<32))continue;
   if(video.objects.some(o=>sx>=o.x&&sx<o.x+o.width&&sy>=o.y&&sy<o.y+o.height))continue;
   const bx=24+(x-24)%24,by=64+(y-40)%24;
   pixels++;if(rgb(frame,(sy*240+sx)*4)!==rgb(bg.pixels,(by*bg.width+bx)*4))mismatch++;
  }
  assert.ok(pixels>2000);assert.equal(mismatch,0,'The exposed floor keeps the exact RGB555 pixels of the current Gallery texture');floorProof.push({label,pixels,mismatch,camera});
 }
 return playLostSignalMission(driver,project,exported,{journey:async c=>{
  await c.close();await c.walkTo(17,16);await driver.run(90,64);await driver.run(8,0);await c.tap(1,120);await c.close();
  assert.equal((await driver.state()).currentRoom,1,'Enter the Lighthouse through ordinary controls');
  await c.walkTo(27,20);await driver.run(1,16);await driver.run(8,0);await c.tap(1,100);await c.close();
  assert.equal((await driver.state()).currentRoom,gallery);assert.equal(await value('var_gallery_gate'),0);
  await capture('gallery-before');await c.walkTo(10,20);await driver.run(1,16);await driver.run(8,0);
  for(let n=0;n<8;n++){
   await c.tap(1,60);await driver.run(120,0);
   const crate=(await driver.telemetry()).firstActor;await c.walkTo(crate.x/8-2,20);await driver.run(1,16);await driver.run(8,0);
  }
  await driver.run(160,0);assert.equal(await value('var_gallery_gate'),1,'Open the approved Gallery gate by pushing its crate');
  await capture('gallery-open');
  // Reflect the authored open gate in the external path planner only.
  // The actual gate was opened above using A and the movable crate.
  const gate=exported.topdown_project.rooms[gallery].npcs.find(n=>n.name==='Portão do arquivo');
  if(gate)gate.position={x:-1000,y:-1000};
  await c.walkTo(40,10);await c.walkTo(41,11);
  await c.saveSlot(1,'tide-before-item-manual');await driver.checkpoint('tide-before-item');
  const wind=async label=>{
   await c.tap(4,100);await c.close();assert.equal((await driver.state()).runtimeKind,4,'QA shortcut enters Storm');
   await driver.run(6,0);const before=(await driver.telemetry()).player,start=(await driver.flight()).tick;
   let ticks=0;for(let n=0;n<60&&ticks<60;n++){await driver.run(6,0);ticks=((await driver.flight()).tick-start+65536)%65536;}
   assert.ok(ticks>=60&&ticks<66,'Compare wind over the same sixty simulation ticks');
   const after=(await driver.telemetry()).player;
   await capture(label);const result={before,after,ticks,drift:after.y-before.y,timers:await driver.timers?.()};console.log('tide-wind',JSON.stringify(result));return result;
  };
  let without;
  if(mode!=='room'){
   without=await wind('wind-without-module');assert.ok(without.drift>=8,'The authored timer causes real wind drift before acquiring the module');
   await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'tide-before-item-load');await c.close();assert.equal((await driver.state()).currentRoom,gallery);
  }
  const enter=async()=>{
   // A one-video-frame direction press can fall between native simulation ticks.
   // Hold it across a complete tick before interacting with the lamp.
   await c.walkTo(41,11);await c.tap(16,6);
   assert.equal((await driver.telemetry()).player.direction,3,'Face the maintenance lamp before pressing A');
   await c.tap(1,80);await c.close();
   assert.equal((await driver.state()).currentRoom,tide,'The maintenance lamp leads into the annex');
   if(await value('var_tide_state')===0){
    await driver.run(180,0);await c.close();
   }else {await driver.run(60,0);await compareFloor('reentry');}
   await capture('arrival');
  };
  await enter();assert.equal(await value('var_tide_state'),0);assert.equal(await value('var_stabilizer'),0);
  await c.walkTo(23,21);await driver.run(80,64);assert.ok((await driver.telemetry()).player.y>=144,'Full canal blocks the crossing');await capture('water-blocks');
  await c.walkTo(16,26);await driver.run(1,32);await driver.run(6,0);driver.recordMovement?.('tide_drain');await c.tap(1,16);await capture('draining');
  for(let n=0;n<100&&await value('var_tide_state')!==2;n++)await driver.run(12,0);
  await c.close();driver.recordMovement?.(null);
  assert.equal(await value('var_tide_state'),2);await compareFloor('drained');await capture('drained');await driver.checkpoint('tide-drained-autosave');
  await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'tide-drained-load');await c.close();
  assert.equal((await driver.state()).currentRoom,tide);assert.equal(await value('var_tide_state'),2);assert.equal(await value('var_stabilizer'),0);await compareFloor('restored');await capture('restored-before-pickup');
  // Update only the external route planner with the authored dry collision.
  // The ROM receives no memory or collision writes from this diagnostic code.
  for(let y=13;y<18;y++)for(let x=3;x<45;x++)exported.topdown_project.rooms[tide].collision_flags[y*48+x]=0;
  await c.walkTo(23,10);assert.ok((await driver.telemetry()).player.y<88,'The actual dry floor permits a complete crossing');await capture('crossed');
  await c.walkTo(33,10);await driver.run(1,16);await driver.run(6,0);await c.tap(1,80);await c.close();assert.equal(await value('var_stabilizer'),1);await capture('collected');await driver.checkpoint('tide-item-autosave');
  await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'tide-item-load');await c.close();assert.equal(await value('var_stabilizer'),1);assert.equal(await value('var_tide_state'),2);await capture('item-restored');
  await c.walkTo(23,27);await driver.run(64,128);await driver.run(100,0);await c.close();assert.equal((await driver.state()).currentRoom,gallery);await capture('gallery-return');
  await enter();assert.equal(await value('var_tide_state'),2);assert.equal(await value('var_stabilizer'),1);await capture('reentered-dry');
  await c.walkTo(23,10);await c.walkTo(33,10);await driver.run(1,16);await driver.run(8,0);await c.tap(1,60);await c.close();assert.equal(await value('var_stabilizer'),1,'The upgrade is never collected twice');
  await c.saveSlot(2,'tide-after-item-manual');await driver.reboot();await driver.run(180,0);await c.loadSlot(2,'tide-after-item-load');await c.close();assert.equal(await value('var_stabilizer'),1);assert.equal(await value('var_tide_state'),2);await capture('manual-restored');
  await c.tap(8,60);await c.tap(128,20);await c.tap(1,80);assert.equal((await driver.state()).runtimeKind,3);await capture('inventory');
  const inventoryRoom=exported.menu_project.screens.find(s=>s.name==='inventario');
  assert.ok(inventoryRoom.items.some(i=>i.binding?.source==='variable'&&i.binding.index===vi.var_stabilizer),'The inventory exposes the optional upgrade');
  for(let n=0;n<5;n++)await c.tap(16,12);await c.tap(1,60);assert.equal((await driver.ui()).dialogue?.key,'tide_owned');await capture('inventory-description');await c.close();await c.tap(2);await c.tap(2);await c.tap(2,80);
  await c.walkTo(23,27);await driver.run(64,128);await driver.run(100,0);await c.close();assert.equal((await driver.state()).currentRoom,gallery);
  let withModule;
  if(mode!=='room'){
   withModule=await wind('wind-with-module');assert.ok(withModule.drift>0&&withModule.drift<without.drift,'The collected stabilizer reduces actual wind drift');
  }
  return{passed:true,feature:'tide-annex',scope:mode==='room'?'Canonical project, actual Gallery puzzle, valve, pickup and save/load; no QA navigation shortcut or state injection.':'Actual Gallery puzzle, valve and pickup; only the optional Storm comparison uses a QA navigation shortcut.',autosaveBeforeItem:true,autosaveAfterItem:true,manualSaveLoad:true,returnAndReentry:true,oneTimePickup:true,inventory:true,floorProof,wind:{without,withModule}};
 }});
}
