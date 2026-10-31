import assert from 'node:assert/strict';
import {playLostSignalMission} from './lost-signal-playthrough.mjs';
import {playShowcaseEnding} from './showcase-ending-playthrough.mjs';
import {readFileSync} from 'node:fs';

/** Controller-only acceptance journeys shared by real Electron Play and ROM. */
export async function playExampleEncore(driver,project,exported,feature) {
  const index=Object.fromEntries(project.variables.map((v,i)=>[v.name,i]));
  const value=async name=>(await driver.state()).variables[index[name]];
  const pcm=async()=>driver.pcmTelemetry?driver.pcmTelemetry():(await driver.telemetry()).audio;
  const tap=async(keys,settle=24)=>{await driver.run(4,keys);await driver.run(settle,0);};
  const close=async()=>{for(let n=0;n<50;n++){if(!await driver.dialogue()){await driver.run(10,0);if(!await driver.dialogue())return;}await tap(2,16);}assert.fail('Dialogue closes');};
  const shot=label=>driver.capture('encore-'+label);
  async function choose(key,selection){for(let n=0;n<60;n++){const d=(await driver.ui()).dialogue;if(d?.key===key&&d.choice&&d.complete){for(let i=0;i<selection;i++)await tap(128,12);assert.equal((await driver.ui()).dialogue.selected,selection);await shot(key+'-'+selection);await tap(1,60);return;}await tap(1,25);}assert.fail('Choice opens: '+key+' '+JSON.stringify(await driver.ui()));}
  const screen=name=>{const id=exported.menu_project.screens.findIndex(entry=>entry.name===name);assert.notEqual(id,-1,`Exported menu ${name} exists`);return id;};
  async function saveSlot(slot){await close();await tap(8,55);assert.equal((await driver.state()).currentRoom,screen('menu_start'));for(let i=0;i<3;i++)await tap(128);await tap(1,55);assert.equal((await driver.state()).currentRoom,screen('salvar'));for(let i=0;i<slot;i++)await tap(128);await tap(1);await tap(1);await driver.checkpoint('encore-manual-slot-'+slot);await tap(2);await tap(2);await tap(2,70);}
  async function loadFromPause(slot){await tap(8,55);for(let i=0;i<4;i++)await tap(128);await tap(1,55);assert.equal((await driver.state()).currentRoom,4);for(let i=0;i<slot;i++)await tap(128);await tap(1,160);}
  async function axis(target,field){for(let n=0;n<120;n++){const d=target-(await driver.telemetry()).player[field];if(Math.abs(d)<=1)return;await driver.run(Math.min(4,Math.ceil(Math.abs(d)/2)),field==='x'?(d>0?16:32):(d>0?128:64));}assert.fail('Cursor reaches '+field+' '+target);}
  async function clickRadio(){await axis(198,'x');await axis(64,'y');await driver.run(4,0);await tap(1,80);}
  if(feature==='epilogue-video'){
    const c=await playLostSignalMission(driver,project,exported,{resume:true});
    await driver.run(180,0);await c.loadSlot(1,'encore-video-load');await close();assert.equal(await value('var_epilogue_phase'),1);
    driver.recordMovement?.('encore_epilogue_full');await driver.recordAudio?.('encore-epilogue-full');
    for(let n=0;n<900&&(await driver.telemetry()).runtimeKind!==3;n++)await driver.run(4,0);
    driver.recordMovement?.(null);await driver.stopAudio?.();await driver.run(60,0);assert.equal((await driver.state()).runtimeKind,3);assert.equal(await value('var_epilogue_phase'),3);await shot('epilogue-video-end');
    return{passed:true,feature,scope:'Uninterrupted movie from an actual saved game, loaded through the title menu after a fresh core boot.'};
  }
  if(feature==='radio')return playLostSignalMission(driver,project,exported,{journey:async c=>{
    await c.close();await c.mechanic();await c.close();await c.walkTo(61,64);await driver.run(1,64);await driver.run(4,0);await tap(1,100);
    for(let n=0;n<8&&(await driver.state()).runtimeKind!==5;n++)await tap(1,100);
    await close();assert.equal((await driver.state()).runtimeKind,5);await shot('radio-installed');
    await driver.recordAudio?.('encore-radio-output');await clickRadio();assert.equal((await driver.ui()).dialogue.key,'encore_radio_message');
    const active=await pcm();assert.ok(active?.activeVoiceCount>0,'A real native PCM voice starts');
    await shot('radio-playing');await driver.run(250,0);const ended=await pcm();await driver.stopAudio?.();
    assert.ok(ended.pcmSubmittedBlocks>active.pcmSubmittedBlocks,'The native mixer submits PCM blocks');
    assert.equal(ended.activeVoiceCount,0,'One-shot PCM finishes');await close();assert.equal(await value('var_radio_heard'),1);
    await driver.checkpoint('encore-radio-autosave');await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'encore-radio-load');await close();
    assert.equal((await driver.state()).runtimeKind,5);assert.equal(await value('var_radio_heard'),1,'Listening state survives a fresh core and battery load');await shot('radio-restored');
    await clickRadio();assert.ok((await pcm()).activeVoiceCount>0,'Listening can be repeated after load');await shot('radio-replay');await close();
    await axis(160,'x');await axis(64,'y');await driver.run(4,0);await tap(257,150);await close();assert.equal((await driver.state()).runtimeKind,0);
    await c.saveSlot(1,'encore-radio-manual-save');await driver.checkpoint('encore-radio-manual');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'encore-radio-manual-load');await close();assert.equal(await value('var_radio_heard'),1);await shot('radio-manual-restored');
    return{passed:true,feature,pcm:{active,ended},manualSaveLoad:true,autosaveLoad:true,transcript:true,replay:true};
  }});
  if(feature.startsWith('arena'))return playLostSignalMission(driver,project,exported,{journey:async c=>{
    await c.close();const a=project.actors.find(a=>a.id==='porto-lume-traveler-pilot');await c.walkTo(a.x,a.y+2);await driver.run(1,64);await driver.run(6,0);await tap(1,70);await choose('showcase_trader_menu',3);
    assert.equal((await driver.state()).runtimeKind,12);assert.equal(await value('var_arena_lesson'),1);await driver.run(180,0);await shot('arena-lesson-1');
    const tutorialVideo=await driver.hardware();
    const arena=exported.luta_project.stages[0];
    const fighterParts=arena.player1[0].animation_set.idle.frame_metasprites[0].parts.length+arena.player2[0].animation_set.idle.frame_metasprites[0].parts.length;
    const fighters=video=>video.objects.filter(o=>o.index<fighterParts);
    assert.equal(fighters(tutorialVideo).length,fighterParts,'The Arena tutorial keeps both fighters visible');
    assert.ok(fighters(tutorialVideo).every(o=>o.priority>(tutorialVideo.bg[0].cnt&3)), 'The complete dialogue box draws in front of both fighters');
    await close();await driver.run(10,0);
    const gameplayVideo=await driver.hardware();
    assert.ok(fighters(gameplayVideo).length===fighterParts&&fighters(gameplayVideo).every(o=>o.priority===0),'Normal fighter drawing priority returns after the dialogue');
    await tap(8,8);const paused=(await driver.telemetry()).player.direction;await driver.run(45,0);assert.equal((await driver.telemetry()).player.direction,paused,'Start still pauses native Luta when an inherited menu binding is unavailable');await tap(8,8);await driver.run(12,0);assert.ok((await driver.telemetry()).player.direction<paused,'Start resumes native Luta');
    if(feature==='arena-exit'){await driver.run(1,4);await shot('arena-select-pressed');await driver.run(150,0);assert.equal((await driver.state()).runtimeKind,0,'Select invokes the authored exit binding in native Luta');assert.equal(await value('var_arena_lesson'),0);return{passed:true,feature};}
    const first=(await driver.telemetry()).firstActor;await driver.run(60,16);await driver.run(260,128);const guarded=(await driver.telemetry()).firstActor;await shot('arena-guard');assert.ok(guarded.x>0,'The player survives sustained guard');
    async function winLesson(lesson){for(let n=0;n<450;n++){if(await value('var_arena_lesson')!==lesson)return;const ui=await driver.ui();if(ui.dialogue){await close();continue;}const s=await driver.telemetry();if(s.firstActor.x===0){await close();continue;}await driver.run(8,16);await driver.run(3,n%2?1:2);await driver.run(12,0);}assert.fail('Actual combat wins lesson '+lesson);}
    await winLesson(1);assert.equal(await value('var_arena_lesson'),2);await shot('arena-lesson-2');await close();await driver.run(10,0);assert.equal((await driver.telemetry()).player.x,100,'The advanced lesson starts with a full SUPER gauge');assert.notEqual((await driver.telemetry()).firstActor.direction,first.direction,'The native ISM style changes');
    await driver.checkpoint('encore-arena-lesson-2');await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'encore-arena-load');await close();await driver.run(10,0);assert.equal((await driver.state()).runtimeKind,12);assert.equal(await value('var_arena_lesson'),2);assert.equal((await driver.telemetry()).player.x,100);await shot('arena-restored');
    await driver.run(60,16);let hp=(await driver.telemetry()).firstActor.x,counter;
    for(let n=0;n<180;n++){await driver.run(1,0);const s=await driver.telemetry();if(s.firstActor.x<hp){await tap(256,8);counter=await driver.telemetry();break;}hp=s.firstActor.x;}
    assert.ok(counter&&counter.player.x<100,'The real R alpha counter consumes half the gauge after a hit');await shot('arena-counter');
    await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'encore-arena-special-load');await close();await driver.run(60,16);driver.recordMovement?.('encore_arena_special');await tap(512,45);driver.recordMovement?.(null);const special=await driver.telemetry();assert.ok(special.player.x<100,'The real L special consumes the SUPER gauge');await shot('arena-special');await winLesson(2);await close();await driver.run(100,0);assert.equal((await driver.state()).runtimeKind,0,'Training returns to Port');assert.equal(await value('var_arena_lesson'),0);assert.equal(await value('var_boost'),0,'Optional training does not grant the campaign reward');await shot('arena-return');
    await c.walkTo(a.x,a.y+2);await driver.run(1,64);await driver.run(6,0);await tap(1,70);await choose('showcase_trader_menu',3);await close();await tap(4,120);assert.equal((await driver.state()).runtimeKind,0,'Select exits a repeated training session');assert.equal(await value('var_arena_lesson'),0);await shot('arena-exit');
    return{passed:true,feature,guard:{first,guarded},special,counter,lessonSaveLoad:true,optionalCampaignIsolation:true,earlyExit:true,dialogueLayering:{tutorialVideo,gameplayVideo}};
  }});
  if(feature==='epilogue')return playShowcaseEnding(driver,project,JSON.parse(readFileSync(new URL('../../fixtures/asset-provenance/racing-approved-manifest.json',import.meta.url))),1,{exported,fromTitle:true,tour:async()=>{
    const c=await playLostSignalMission(driver,project,exported,{resume:true});
    await driver.run(12,0);assert.equal(await value('var_campaign_finished'),1);assert.equal(await value('var_epilogue_phase'),1);await close();
    driver.recordMovement?.('encore_epilogue_port');await driver.run(18,0);const camera=await driver.camera(),pos=(await driver.telemetry()).player;await driver.run(20,32);assert.deepEqual((await driver.telemetry()).player,pos,'Tour pauses player control');assert.equal((await driver.camera()).follow,false);assert.ok((await driver.camera()).x>camera.x,'The authored camera moves');driver.recordMovement?.(null);await shot('epilogue-port');
    await saveSlot(1);await driver.checkpoint('encore-epilogue-port');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'encore-epilogue-port-load');await close();assert.equal(await value('var_epilogue_phase'),1);assert.equal((await driver.camera()).follow,false);await shot('epilogue-port-restored');
    for(let n=0;n<400;n++){const s=await driver.telemetry();if(s.runtimeKind===0&&s.currentRoom===1)break;await driver.run(3,0);}await driver.run(12,0);assert.equal(await value('var_epilogue_phase'),2);assert.equal((await driver.state()).currentRoom,1);await shot('epilogue-lighthouse');await saveSlot(1);await driver.checkpoint('encore-epilogue-lighthouse');await driver.reboot();await driver.run(180,0);await c.loadSlot(1,'encore-epilogue-lighthouse-load');await close();assert.equal(await value('var_epilogue_phase'),2);await shot('epilogue-lighthouse-restored');
    for(let n=0;n<400&&(await driver.telemetry()).runtimeKind!==3;n++)await driver.run(3,0);await driver.run(60,0);assert.equal((await driver.state()).runtimeKind,3);assert.equal(await value('var_epilogue_phase'),3);await shot('epilogue-title');
    await driver.reboot();await driver.run(180,0);await c.loadSlot(0,'encore-epilogue-complete-load');await close();assert.equal(await value('var_epilogue_phase'),3);assert.equal((await driver.camera()).follow,true);const y=(await driver.telemetry()).player.y;await driver.run(8,128);assert.notEqual((await driver.telemetry()).player.y,y,'Completed epilogue restores control');
    await c.walkTo(23,27);await driver.run(90,128);await driver.run(120,0);await close();assert.equal((await driver.state()).currentRoom,0);await c.walkTo(37,68);await driver.run(1,64);await driver.run(6,0);await tap(1,70);await choose('encore_epilogue_menu',0);await driver.run(120,0);assert.equal((await driver.camera()).follow,false);assert.equal(await value('var_epilogue_phase'),4);await shot('epilogue-replay');await tap(2,150);assert.equal(await value('var_epilogue_phase'),3);assert.equal((await driver.state()).runtimeKind,0);assert.equal((await driver.camera()).follow,true);await shot('epilogue-skipped');await driver.run(1,64);await driver.run(4,0);await tap(1,60);await choose('encore_epilogue_menu',1);for(let n=0;n<20&&!['showcase_captain_menu','porto-captain-conversa'].includes((await driver.ui()).dialogue?.key);n++)await tap(2,20);if((await driver.ui()).dialogue?.key==='showcase_captain_menu')await choose('showcase_captain_menu',2);assert.equal((await driver.ui()).dialogue?.key,'porto-captain-conversa');await shot('epilogue-talk');await close();
    return{passed:true,feature,portSaveLoad:true,lighthouseSaveLoad:true,completedSaveLoad:true,replay:true,skip:true,talk:true,cameraAndControl:true};
  }});
  throw Error('Unknown encore acceptance journey: '+feature);
}
