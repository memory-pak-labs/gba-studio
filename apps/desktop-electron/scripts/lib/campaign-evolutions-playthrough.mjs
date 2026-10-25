import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decodePngRgba } from './png-icons.mjs';
import { playLostSignalMission } from './lost-signal-playthrough.mjs';

/** Native and rendered-Play journeys share real controller input. Read-only
 * state checks observe mechanics; they never set flags, HP, positions or SRAM. */
export async function playCampaignEvolutions(driver,project,exported,feature='mission',context={}){
 const index=Object.fromEntries(project.variables.map((v,i)=>[v.name,i]));
 const value=async key=>(await driver.state()).variables[index[key]];
 const tap=async(key,settle=24)=>{await driver.run(4,key);await driver.run(settle,0);};
 const close=async()=>{for(let i=0;i<24&&await driver.dialogue();i++)await tap(2,15);await driver.run(12,0);assert.equal(await driver.dialogue(),false);};
 const galleryRoom=project.rooms.find(r=>r.name==='galeria_das_mares');
 const actor=id=>project.actors.find(a=>a.id===id);
 // The integrated project carries ordinary actors/events, without review-only
 // navigation metadata. Derive the journey from those authored positions.
 const authoredLayout=galleryRoom&&actor('gallery-gate')?{
  version:2,crateApproach:[actor('gallery-crate').x-2,actor('gallery-crate').y],
  plate:[actor('gallery-plate').x,actor('gallery-plate').y],
  gateApproach:[actor('gallery-gate').x,actor('gallery-crate').y],
  archiveApproach:[actor('gallery-gate').x,actor('gallery-record').y-1],
  exitApproach:[actor('gallery-nara').x,actor('gallery-nara').y],
  pushCount:actor('gallery-plate').x-actor('gallery-crate').x,gateActor:'gallery-gate',lanternShape:'circle'
 }:null;
 const galleryLayout=authoredLayout??galleryRoom?.galleryLayout??{version:1,crateApproach:[5,12],plate:[12,12],gateApproach:[22,12],archiveApproach:[22,6],exitApproach:[14,14],pushCount:5};
 const galleryCameraPath=[];
 const galleryGateProof={};let lanternReference=null;
 async function galleryCapture(label){if(galleryLayout.version===2){const camera=await driver.camera();assert.equal(camera.follow,true);assert.deepEqual(camera.bounds,[0,0,384,256]);assert.ok(camera.x>=0&&camera.x<=144&&camera.y>=0&&camera.y<=96);galleryCameraPath.push({label,...camera});}await driver.capture(label);}
 const axis=async(name,target)=>{let stalled=0;for(let n=0;n<600;n++){const before=(await driver.state()).player[name],delta=target-before;if(!delta){await driver.run(4,0);return;}const key=name==='x'?delta<0?32:16:delta<0?64:128;await driver.run(Math.min(4,Math.abs(delta)),key);if((await driver.state()).player[name]===before){if(++stalled>20)throw Error('Blocked '+name+' at '+before+' toward '+target);}else stalled=0;}assert.fail('Axis target not reached');};
 async function pushGalleryCrate(tapInput){
  for(let n=0;n<galleryLayout.pushCount;n++){
   await tapInput(1);
   if(n===galleryLayout.pushCount-1&&galleryLayout.gateActor){
    assert.equal((await driver.camera()).follow,false,'gate event presents its animation');await driver.capture('gallery-gate-opening');
    assert.ok((await driver.hardware()).objects.some(o=>o.width===64&&o.height===64&&o.x===120&&o.y===52),'gate sprite is anchored to the doorway floor');
    const frames=new Set();
    for(let i=0;i<180;i++){
     const camera=await driver.camera();if(camera.follow)break;
     const rgba=await driver.frame(),crop=Buffer.alloc(64*64*4);
     for(let y=0;y<64;y++)crop.set(rgba.subarray(((52+y)*240+120)*4,((52+y)*240+184)*4),y*64*4);
     const key=crop.toString('base64');if(!frames.has(key)){frames.add(key);await driver.capture('gallery-gate-phase-'+frames.size);await driver.capture('gallery-gate-open-camera');}
     await driver.run(2,0);
    }
    assert.equal((await driver.camera()).follow,true,'camera returns to Nara');
    assert.ok(frames.size>=4,'the gate passes through all four distinct rendered poses');
    galleryGateProof.animationFrames=frames.size;
   }
   await axis('x',(await driver.state()).firstActor.x-16);
  }
 }
 if(feature==='gallery'){
  await driver.run(180,0);await close();await galleryCapture('gallery-initial');
  const [x,y]=galleryLayout.crateApproach.map(n=>n*8);await axis('y',y-16);await axis('x',x);await axis('y',y);await driver.run(1,16);await driver.run(8,0);
  await galleryCapture('gallery-crate-approach');
  await pushGalleryCrate(tap);
  await galleryCapture('gallery-gate-open');assert.equal(await value('var_gallery_gate'),1);
  return {passed:true,feature,gateOpened:true,galleryCameraPath};
 }
 if(feature==='relay'){
  await driver.run(180,0);await close();await driver.capture('relay-support-initial');
  const screen=await driver.frame(),video=await driver.hardware(),art=(folder,name)=>decodePngRgba(fs.readFileSync(path.join(context.projectRoot,'Assets',folder,'relay-approved-'+name+'.png'))),rgb=(a,i)=>(a[i]>>3)|((a[i+1]>>3)<<5)|((a[i+2]>>3)<<10),fidelity=[];
  for(const [name,x]of [['nara',24],['guardian',152]]){const source=art('sprites',name),own=video.objects.find(o=>o.width===64&&o.height===64&&o.x===x&&o.y===52);assert.ok(own);let best={mismatch:Infinity};for(let f=0;f<8;f++){let mismatch=0,count=0;for(let y=0;y<64;y++)for(let xx=0;xx<64;xx++){const i=(y*source.width+f*64+xx)*4,dx=x+xx,dy=52+y;if(!source.pixels[i+3]||video.objects.some(o=>o.index!==own.index&&dx>=o.x&&dx<o.x+o.width&&dy>=o.y&&dy<o.y+o.height))continue;count++;if(rgb(source.pixels,i)!==rgb(screen,(dy*240+dx)*4))mismatch++;}if(mismatch<best.mismatch)best={mismatch,count,frame:f};}assert.equal(best.mismatch,0,'Approved '+name+' keeps its RGB555 pixels');assert.ok(best.count>200);fidelity.push({consumer:name,...best});}
  const bg=art('backgrounds','background');let bgPixels=0;for(let y=24;y<120;y++)for(let x=0;x<240;x++){if(video.objects.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height))continue;assert.equal(rgb(screen,(y*240+x)*4),rgb(bg.pixels,(y*240+x)*4),'Approved relay background');bgPixels++;}assert.ok(bgPixels>10000);fidelity.push({consumer:'background',count:bgPixels,mismatch:0});
  const ready=async()=>{for(let i=0;i<240;i++){const b=await driver.battle();if(!b.pending&&b.page===0)return;if(b.page===5&&!b.pending)await tap(1,2);else await driver.run(1,0);}assert.fail('Battle menu must become ready');};
  const action=async magic=>{await ready();await tap(1,2);assert.equal((await driver.battle()).page,1);if(magic)await tap(128,2);await tap(1,2);};
  await action(false);await driver.run(100,0);await ready();assert.ok((await driver.battle()).partyHp[0]<96,'Nara takes actual enemy damage');
  await tap(128,2);await tap(1,2);assert.equal((await driver.battle()).page,3);await tap(128,2);await tap(1,2);assert.equal((await driver.battle()).selectedParty,1);
  await ready();await tap(64,2);await tap(1,2);assert.equal((await driver.battle()).page,1);await tap(1,2);assert.equal((await driver.battle()).page,2);const before=await driver.battle();await driver.capture('relay-heal-target');await tap(1,2);await driver.run(2,0);await driver.capture('relay-healing');
  const healed=await driver.battle();assert.ok(healed.partyHp[0]>before.partyHp[0],'Real Heal increases the selected ally HP');assert.deepEqual(healed.effectPosition,[56,84],'healing effect follows Nara rather than the enemy');for(let n=0;n<100;n++){await driver.run(1,0);const status=await driver.battle();if(status.page===5)assert.match(status.prompt,/ACAO EXECUTADA/,'a successful heal notice must remain positive through the enemy turn');}await driver.capture('relay-action-complete');await ready();await driver.capture('relay-healed');
  await action(true);await driver.run(2,0);assert.deepEqual((await driver.battle()).effectPosition,[104,60],'support defense follows the mechanic');await driver.capture('relay-support-defense');await driver.run(100,0);await ready();
  await tap(128,2);await tap(1,2);await tap(64,2);await tap(1,2);assert.equal((await driver.battle()).selectedParty,0);await ready();await tap(64,2);
  for(let turn=0;turn<20&&(await driver.battle()).outcome===0;turn++){await action(true);await driver.run(90,0);}
  assert.equal((await driver.battle()).outcome,1);await driver.run(36,0);await driver.capture('relay-duo-victory');await driver.run(300,0);assert.equal((await driver.state()).runtimeKind,12);
  return {passed:true,feature,healing:{before:before.partyHp,after:healed.partyHp},victory:true,fidelity};
 }
 if(feature==='storm'){
  for(let n=0;n<600&&(await driver.state())?.runtimeKind!==4;n++)await driver.run(1,0);await driver.run(4,0);assert.equal((await driver.state()).runtimeKind,4);
  const bg=decodePngRgba(fs.readFileSync(path.join(context.projectRoot,'Assets/backgrounds/tempestade-approved-background.png')));
  const rgb=(a,i)=>(a[i]>>3)|((a[i+1]>>3)<<5)|((a[i+2]>>3)<<10);
  const proof=[];
  async function inspect(label){const screen=await driver.frame(),video=await driver.hardware(),flight=await driver.flight();let best=Infinity,count=0;for(const camera of [Math.min(flight.tick-1,528),Math.min(flight.tick,528)]){let mismatch=0,n=0;for(let y=45;y<120;y++)for(let x=0;x<240;x++){if(video.objects.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height))continue;n++;if(rgb(screen,(y*240+x)*4)!==rgb(bg.pixels,(y*bg.width+camera+x)*4))mismatch++;}if(mismatch<best){best=mismatch;count=n;}}assert.equal(best,0,'Approved sky stays exact in the unobstructed playfield');assert.ok(count>10000);assert.equal(video.bg[3].cnt&3,1);assert.equal(video.bg[2].cnt&3,2);proof.push({label,flight,backgroundPixels:count,mismatch:best,video});await driver.capture(label);}
  await inspect('storm-layered-sky');await driver.run(14,64);await driver.run(90,1);assert.ok((await driver.flight()).score>=100);await driver.run(32,128);await driver.run(90,1);assert.ok((await driver.flight()).score>=200);
  for(let f=0;f<200&&(await driver.flight()).wave===0;f++)await driver.run(1,1);assert.equal((await driver.flight()).wave,1);await driver.run(18,64);await inspect('storm-second-wave');await driver.run(50,1);for(let f=0;f<450&&(await driver.state()).runtimeKind===4;f++)await driver.run(1,1);await driver.run(120,0);assert.equal((await driver.state()).runtimeKind,11);assert.equal(await value('var_shield'),1);await close();await driver.capture('storm-arrival-at-relay');return {passed:true,feature,proof,wavesCompleted:2,shieldReward:true};
 }
 if(feature!=='mission')throw Error('Unknown evolution journey: '+feature);
 const galleryIndex=exported.topdown_project.rooms.findIndex(r=>r.name==='galeria_das_mares');
 return playLostSignalMission(driver,project,exported,{
  beforeMission:async c=>{
   if(context.movementChecks)await context.movementChecks('porto_lumen',c);
   await c.walkTo(17,16);await driver.run(90,64);await driver.run(8,0);await c.tap(1,120);await c.close();assert.equal((await driver.state()).currentRoom,1);
   if(context.movementChecks)await context.movementChecks('farol_interior',c);
   await c.walkTo(27,20);await driver.run(1,16);await driver.run(8,0);await c.tap(1,100);
   for(let n=0;n<300&&(await driver.telemetry())?.currentRoom!==galleryIndex;n++)await driver.run(1,0);
   assert.equal((await driver.state()).currentRoom,galleryIndex);await c.close();await galleryCapture('gallery-lantern');
   if(galleryLayout.lanternShape==='circle')lanternReference={frame:await driver.frame(),video:await driver.hardware(),camera:await driver.camera(),player:(await driver.state()).player};
   await c.saveSlot(1,'gallery-before-puzzle');await driver.checkpoint('gallery-before-puzzle');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'gallery-before-load');assert.equal((await driver.state()).currentRoom,galleryIndex);assert.equal(await value('var_gallery_gate'),0);await c.close();await galleryCapture('gallery-restored-incomplete');
   if(galleryLayout.version===2){
    await c.walkTo(...galleryLayout.crateApproach);await driver.run(1,16);await driver.run(8,0);await c.tap(1);
    await axis('x',(await driver.state()).firstActor.x-16);
    await c.saveSlot(1,'gallery-mid-attempt-save');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'gallery-mid-attempt-load');await c.close();await driver.capture('gallery-mid-attempt-restored');
    await c.walkTo(...galleryLayout.exitApproach);await galleryCapture('gallery-mid-attempt-recovered');galleryGateProof.incompleteAttemptRecovered=true;
   }
   if(galleryLayout.gateActor){
    await c.walkTo(...galleryLayout.gateApproach);await driver.run(48,64);assert.ok((await driver.state()).player.y>=128,'closed gate actor blocks entry');await driver.capture('gallery-gate-closed');galleryGateProof.blockedWhileClosed=true;
    await axis('y',144);await axis('x',galleryLayout.crateApproach[0]*8);await axis('y',galleryLayout.crateApproach[1]*8);
   }else await c.walkTo(...galleryLayout.crateApproach);
   await driver.run(1,16);await driver.run(8,0);await galleryCapture('gallery-crate-approach');
   await pushGalleryCrate(c.tap);
   assert.equal(await value('var_gallery_gate'),1);await galleryCapture('gallery-gate-open');
   if(lanternReference){
    await axis('y',192);await axis('x',lanternReference.player.x);await axis('y',lanternReference.player.y);
    const frame=await driver.frame(),video=await driver.hardware(),camera=await driver.camera(),ref=lanternReference;
    assert.deepEqual(camera,ref.camera);const size=exported.topdown_project.player.size;const cx=ref.player.x+Math.floor(size.x/2)-camera.x,cy=ref.player.y+Math.floor(size.y/2)-camera.y;
    let lit=0,dark=0,mismatch=0;const objects=[...video.objects,...ref.video.objects],mismatches=[];
    for(let y=22;y<160;y++)for(let x=0;x<240;x++){
     if(objects.some(o=>x>=o.x&&x<o.x+o.width&&y>=o.y&&y<o.y+o.height))continue;
     const distance=(x-cx)**2+(y-cy)**2;if(distance>57**2&&distance<63**2)continue;
     const inside=distance<=57**2;let differs=false;
     // The emulator's expanded color blend can round by one RGB555 level.
     for(let c=0;c<3;c++){const i=(y*240+x)*4+c,bright=frame[i]>>3,actual=ref.frame[i]>>3,expected=inside?bright:Math.round(bright*7/16);if(Math.abs(actual-expected)>(inside?0:1))differs=true;}
     if(differs){mismatch++;mismatches.push([x,y,inside]);}if(inside)lit++;else dark++;
    }
    await driver.capture('gallery-light-restored');
    if(mismatch&&context.output)fs.writeFileSync(path.join(context.output,'circle-differences.json'),JSON.stringify({pixels:mismatches,objects,referencePlayer:ref.player,player:(await driver.state()).player}));
    assert.ok(lit>2000&&dark>10000);assert.equal(mismatch,0,'actual framebuffer follows a circle, including dark corners');
    galleryGateProof.circularLight={litPixels:lit,darkPixels:dark,mismatch};
   }
   // Cross the newly opened native collision cells, not the authored closed grid.
   await c.walkTo(...galleryLayout.gateApproach);
   if(galleryLayout.gateActor){await axis('x',272);await driver.run(40,64);assert.ok((await driver.state()).player.y>=128,'open gate keeps fixed side-post collision');galleryGateProof.fixedPostsRemainSolid=true;await axis('y',160);await axis('x',280);}
   await axis('y',galleryLayout.archiveApproach[1]*8);await galleryCapture('gallery-archive-reached');assert.ok((await driver.state()).player.y<galleryLayout.gateApproach[1]*8,'native gate collision was removed');
   await driver.run(1,16);await driver.run(8,0);await c.tap(1,80);assert.equal(await value('var_gallery_record'),1);await driver.capture('gallery-record');await c.close();await c.tap(1,70);await c.close();assert.equal(await value('var_gallery_record'),1);
   await c.saveSlot(1,'gallery-complete-save');await driver.checkpoint('gallery-complete');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'gallery-complete-load');assert.equal(await value('var_gallery_gate'),1);assert.equal(await value('var_gallery_record'),1);await c.close();await galleryCapture('gallery-restored-complete');
   if(context.movementChecks)await context.movementChecks('galeria_das_mares',c);
   if(galleryLayout.version===2){assert.ok(Math.max(...galleryCameraPath.map(c=>c.x))-Math.min(...galleryCameraPath.map(c=>c.x))>=128,'camera follows across the horizontal world');assert.ok(Math.max(...galleryCameraPath.map(c=>c.y))-Math.min(...galleryCameraPath.map(c=>c.y))>=64,'camera follows across the vertical world');}
   await axis('y',galleryLayout.gateApproach[1]*8);await axis('x',galleryLayout.exitApproach[0]*8);for(let n=0;n<120&&(await driver.state()).currentRoom===galleryIndex;n++)await driver.run(4,128);await driver.run(60,0);assert.equal((await driver.state()).currentRoom,1);await c.close();await c.walkTo(23,27);await driver.run(90,128);await driver.run(120,0);assert.equal((await driver.state()).currentRoom,0);
  },
  beforeTelescope:async c=>{
   await c.hotspot('Telescópio');assert.equal(await value('var_telescope_alignment'),1);assert.equal(await value('var_signal_observation'),0);await driver.capture('telescope-unfocused');await c.close();await driver.checkpoint('telescope-partial');await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'telescope-partial-load');assert.equal((await driver.state()).runtimeKind,5);assert.equal(await value('var_telescope_alignment'),1);await c.close();await driver.capture('telescope-partial-restored');
  },
  afterMission:async()=>{assert.equal(await value('var_gallery_gate'),1);assert.equal(await value('var_gallery_record'),1);assert.equal(await value('var_telescope_alignment'),2);return {gallerySavedAndLoaded:true,telescopeSavedAndLoaded:true,galleryCameraPath,galleryGateProof};}
 });
}
