import assert from 'node:assert/strict';

/** Real Play audio output and controller input; native PCM waveforms are
 * measured separately by smoke-initial-menu-audio.mjs. */
export async function playInitialMenuAudio(driver) {
  const tap=async(key)=>{await driver.run(4,key);await driver.run(80,0);};
  const screen=async expected=>{
    const state=await driver.state();
    assert.equal(state.runtimeKind,3);assert.equal(state.currentRoom,expected);
  };
  const cues={};
  const cue=async(name,action)=>{
    const before=await driver.audioOutput();await action();const after=await driver.audioOutput();
    assert.ok(after.emittedNonSilentSamples>before.emittedNonSilentSamples,name+' reaches the real Play audio output');
    cues[name]={nonSilentSamples:after.emittedNonSilentSamples-before.emittedNonSilentSamples,peak:after.peak};
    await driver.capture('menu-audio-'+name);
  };
  await driver.run(180,0);await screen(0);
  const idle=await driver.audioOutput();assert.equal(idle.state,'running');assert.equal(idle.emittedNonSilentSamples,0,'Title stays silent with the audio context running');
  await cue('abrir',()=>tap(8));await screen(1);
  await cue('navegar',async()=>{await driver.run(120,16);await driver.run(40,0);});await screen(1);
  await cue('indisponivel',()=>tap(1));await screen(1);
  await cue('voltar',()=>tap(2));await screen(0);
  await tap(8);
  await cue('confirmar',()=>tap(1));await screen(2);
  return {passed:true,feature:'initial-menu-audio',idle,cues};
}
