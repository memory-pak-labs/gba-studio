import assert from 'node:assert/strict';
import {playLostSignalMission} from './lost-signal-playthrough.mjs';

/** Canonical quest, real controls and SRAM, with three native relay states. */
export async function playFarolRelay(driver,project,exported){
 const indices=Object.fromEntries(project.variables.map((v,i)=>[v.name,i]));
 const value=async name=>(await driver.state()).variables[indices[name]];
 async function room(){const s=await driver.state();assert.equal(s.runtimeKind,0);assert.equal(s.currentRoom,1);}
 async function enter(c){await c.walkTo(17,16);await driver.run(90,64);await driver.run(8,0);await c.tap(1,120);await room();await c.close();}
 async function leave(c){await c.walkTo(23,27);await driver.run(90,128);await driver.run(120,0);assert.equal((await driver.state()).currentRoom,0);}
 async function inspect(c){await c.walkTo(29,13);await driver.run(4,16);await driver.run(8,0);await c.tap(1,80);}
 async function picture(c,label){await c.walkTo(28,15);await driver.run(8,0);await driver.capture(label);}
 async function stairs(c,label){await c.walkTo(27,20);await driver.run(48,16);const x=(await driver.state()).player.x;await driver.run(24,16);assert.equal((await driver.state()).player.x,x);assert.ok(x<232,'the staircase opening is always protected');await driver.run(8,0);await driver.capture(label);}
 async function base(c,label){
  await c.walkTo(31,15);await driver.run(48,64);const y=(await driver.state()).player.y;
  const room=exported.topdown_project.rooms[1],relayActor=project.actors.find(a=>a.id==='farol-relay');
  const relay=room.npcs.find(a=>a.name===relayActor.name);assert.ok(relay);
  const baseBottom=relay.position.y+(relay.collision_offset?.y??0)+relay.size.y;
  const feetTop=y+(exported.topdown_project.player.collision_offset?.y??0);
  assert.equal(feetTop,baseBottom,'the physical foot box stops exactly below the relay base');
  await driver.run(16,64);assert.equal((await driver.state()).player.y,y);await driver.run(8,0);await driver.capture(label);await driver.run(8,128);await driver.run(24,32);await c.walkTo(28,15);
 }
 async function load(c,slot,label){await driver.reboot();await driver.run(180,0);await c.loadSlot(slot,label);await driver.capture(label+'-loaded');await c.close();await room();}
 const result=await playLostSignalMission(driver,project,exported,{
  beforeMission:async c=>{
   await enter(c);assert.equal(await value('var_farol_relay'),0);await picture(c,'relay-faulty');await stairs(c,'relay-stairs-faulty');await base(c,'relay-base-faulty');
   await inspect(c);assert.equal((await driver.ui()).dialogue?.key,'farol_relay_faulty');await driver.capture('relay-first-inspection');await c.close();assert.equal(await value('var_signal_stage'),0);
   // Keep the first manual slot occupied: native load navigation skips empty
   // slots. Slot 3 is used later, after both earlier slots contain real saves.
   await c.saveSlot(1,'relay-before-quest-save');await driver.checkpoint('relay-before-quest');await load(c,1,'relay-before-quest-load');assert.equal(await value('var_farol_relay'),0);await picture(c,'relay-before-quest-restored');await leave(c);
  },
  beforeTelescope:async c=>{
   // The integrated campaign first aligns the telescope, then reveals the clue.
   await c.hotspot('Telescópio');assert.equal(await value('var_telescope_alignment'),1);assert.equal(await value('var_signal_observation'),0);
   await driver.capture('relay-telescope-alignment');await c.close();
  },
  approachRepair:async c=>{
   assert.equal(await value('var_farol_relay'),0);await picture(c,'relay-ready-to-repair');await c.saveSlot(2,'relay-faulty-save');
   await c.walkTo(29,13);await driver.run(4,16);await driver.run(8,0);await driver.capture('relay-approach');
  },
  duringRepair:async()=>{assert.equal(await value('var_farol_relay'),1,'native installation state appears during the quest cinematic');await driver.capture('relay-installing');},
  afterRepair:async c=>{
   assert.equal(await value('var_farol_relay'),2);await picture(c,'relay-working');await stairs(c,'relay-stairs-working');await base(c,'relay-base-working');
   await c.saveSlot(1,'relay-working-save');await driver.checkpoint('relay-working');
   await load(c,2,'relay-faulty-load');assert.equal(await value('var_farol_relay'),0);assert.equal(await value('var_signal_stage'),1);assert.equal(await driver.item('zz_signal_relay'),1);await picture(c,'relay-faulty-restored');
   await load(c,1,'relay-working-load');assert.equal(await value('var_farol_relay'),2);assert.equal(await value('var_signal_stage'),2);assert.equal(await driver.item('zz_signal_relay'),0);await picture(c,'relay-working-restored');await c.saveSlot(1,'relay-resaved-after-load');
  },
  afterMission:async c=>{
   await enter(c);assert.equal(await value('var_farol_relay'),2);await picture(c,'relay-revisited');
   for(const [target,locale]of [[0,'pt-BR'],[1,'en'],[2,'es']]){
    const settingsIndex=project.rooms.find(r=>r.name==='menu_start').runtime.config.items.findIndex(i=>i.id==='settings');
    assert.ok(settingsIndex>=0,'pause settings option exists');
    await c.tap(8,55);for(let n=0;n<settingsIndex;n++)await c.tap(128);await c.tap(1,55);for(let n=0;n<4;n++)await c.tap(128);
    const current=await value('var_language');for(let n=current;n<target;n++)await c.tap(16);for(let n=current;n>target;n--)await c.tap(32);
    for(let n=0;n<5&&(await driver.state()).runtimeKind===3;n++)await c.tap(2,55);await room();
    await inspect(c);const d=(await driver.ui()).dialogue;assert.equal(d?.key,'signal_done');
    const actual=Buffer.from(d.text,'latin1').toString('utf8').replace(/\s+/g,' ').trim();
    const authored=project.dialogues.find(d=>d.key==='signal_done');
    // English is the source locale: the runtime reads dialogue.text directly.
    const expected=locale==='en'?authored.text:authored.translations?.[locale];
    assert.equal(actual,expected);await driver.capture('relay-dialogue-'+locale);await c.close();
   }
   await c.saveSlot(1,'relay-spanish-save');await load(c,1,'relay-spanish-load');assert.equal(await value('var_language'),2);assert.equal(await value('var_farol_relay'),2);await picture(c,'relay-final-restored');
   assert.equal((await driver.saveInfo()).slot?.status,'ok');return {relay:true};
  }
 });
 return {...result,relay:{states:[0,1,2],faultyAndWorkingSaved:true,rebootedAndLoaded:true,revisited:true,stairsPreserved:true,baseCollision:true,locales:['pt-BR','en','es'],localeRestored:true,realQuestInventory:true}};
}
