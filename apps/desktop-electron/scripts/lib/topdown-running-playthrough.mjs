import assert from 'node:assert/strict';
import {playTideAnnex} from './tide-annex-playthrough.mjs';

/** Same controller-only regression in rendered Play and the independent ROM. */
export async function playTopdownRunning(driver,project,exported,context={}) {
 const proofs=[];
 const runningChecks=async(name,c)=>{
  await c.close();const entry=(await driver.state()).player;
  const point=name==='porto_lumen'?[55,48]:name==='farol_interior'?[15,22]:name==='galeria_das_mares'?[16,16]:[22,23];
  const poses=[];
  for(const [direction,key]of [['right',16],['left',32],['up',64],['down',128]]) {
   await c.walkTo(...point);await driver.run(8,0);const idle=(await driver.state()).player;
   await driver.run(32,256);assert.deepEqual((await driver.state()).player,idle,'R without a direction stays idle');
   assert.equal((await driver.animation()).frameCount,1);
   await driver.run(4,key);const walk=await driver.animation();
   await c.walkTo(...point);const start=(await driver.state()).player,walkTick=await driver.logicTick();
   await driver.run(24,key);const end=(await driver.state()).player;
   const walkTicks=(await driver.logicTick())-walkTick,walkDistance=Math.hypot(end.x-start.x,end.y-start.y);
   await c.walkTo(...point);await driver.run(4,key|256);const before=(await driver.state()).player;
   const runTick=await driver.logicTick(),frames=new Set(),trace=[];let runAddress;
   await driver.recordMovement?.(name+'-run-'+direction);
   for(let n=0;n<24;n+=2) {
    await driver.run(2,key|256);const animation=await driver.animation();
    assert.equal(animation.frameCount,4,name+': four running frames');
    assert.notEqual(animation.address,walk.address,name+': running selects a distinct clip');runAddress=animation.address;
    trace.push({frame:n+2,animation,player:(await driver.state()).player});
    if(!frames.has(animation.frame)){frames.add(animation.frame);await driver.capture(name+'-run-'+direction+'-'+animation.frame);}
   }
   await driver.recordMovement?.(null);
   const runTicks=(await driver.logicTick())-runTick,after=(await driver.state()).player,runDistance=Math.hypot(after.x-before.x,after.y-before.y),ratio=(runDistance/runTicks)/(walkDistance/walkTicks);
   assert.deepEqual([...frames].sort(),[0,1,2,3],name+': complete '+direction+' stride');
   assert.ok(runDistance>walkDistance,name+': held R moves faster in '+direction);
   await driver.run(4,key);assert.equal((await driver.animation()).address,walk.address,'Releasing R while moving immediately restores the walk clip');
   await driver.run(8,0);assert.equal((await driver.animation()).frameCount,1);
   poses.push({direction,walkDistance,runDistance,walkTicks,runTicks,ratio,runAddress,trace});
  }
  const measureSpeed=async running=>{
   await c.walkTo(...point);const tick=await driver.logicTick();let distance=0;
   // Alternate along the same short corridor, measuring many steps without
   // meeting the room's walls. Authored NPC scripts can occupy individual ticks.
   for(let part=0;part<10;part++) {
    const before=await driver.actualPlayer();await driver.run(16,(part%2?32:16)|(running?256:0));
    const after=await driver.actualPlayer();distance+=Math.hypot(after.x-before.x,after.y-before.y);
   }
   return {distance,ticks:(await driver.logicTick())-tick};
  };
  const walkSpeed=await measureSpeed(false),runSpeed=await measureSpeed(true),speedRatio=(runSpeed.distance/runSpeed.ticks)/(walkSpeed.distance/walkSpeed.ticks);
  assert.ok(speedRatio>1.55&&speedRatio<1.85,name+': sustained run speed matches the 170% profile: '+JSON.stringify({walkSpeed,runSpeed,speedRatio}));
  await c.walkTo(...point);await driver.run(12,272);await c.saveSlot(2,name+'-run-save');
  const saved=(await driver.state()).player;await driver.reboot();await driver.run(180,0);await c.loadSlot(2,name+'-run-load');await c.close();
  assert.deepEqual((await driver.state()).player,saved,'Save/load preserves the running position');
  await driver.run(12,0);assert.equal((await driver.animation()).frameCount,1,'Loading without R returns to idle');
  await driver.run(4,16);const walk=await driver.animation();await driver.run(4,272);assert.notEqual((await driver.animation()).address,walk.address,'Running configuration is reapplied after loading');await driver.run(8,0);
  await c.walkTo(Math.floor(entry.x/8),Math.floor(entry.y/8));
  proofs.push({name,poses,walkSpeed,runSpeed,speedRatio,saveLoad:true});
 };
 const journey=await playTideAnnex(driver,project,exported,'room',{...context,runningChecks});
 assert.deepEqual(proofs.map(p=>p.name),['porto_lumen','farol_interior','galeria_das_mares','sala_mare_vazante']);
 return {...journey,runningProofs:proofs};
}
