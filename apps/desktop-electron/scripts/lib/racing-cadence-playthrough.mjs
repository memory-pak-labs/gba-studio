import assert from 'node:assert/strict';

// Video cadence and engine updates are different clocks. Exercise normal keys
// and measure the native state, rather than the browser's animation callback rate.
export async function playRacingCadence(driver) {
  for(let n=0;n<6000;++n) {
    const state=await driver.telemetry();
    if(state?.runtimeKind===7 && state.frame>=260)break;
    await driver.run(1,0);
  }
  const initial=await driver.telemetry();
  assert.equal(initial.runtimeKind,7); assert.ok(initial.frame>=260);
  const windows=[];
  for(const [name,keys] of [['idle',0],['accelerate',1],['steer-left',33],['steer-right',17],['brake',2]]) {
    const before=await driver.telemetry(),video=await driver.videoFrame();
    let latency=null,previous=before.frame,repeats=0,longestRepeat=0;
    for(let n=0;n<120;++n) {
      await driver.run(1,keys);
      const state=await driver.telemetry();
      assert.equal(state.runtimeKind,7);assert.equal(state.currentRoom,initial.currentRoom);
      if(latency===null && state.input.held===keys)latency=n+1;
      if(state.frame===previous)longestRepeat=Math.max(longestRepeat,++repeats);else repeats=0;
      previous=state.frame;
    }
    const after=await driver.telemetry(),frames=((await driver.videoFrame())-video)>>>0;
    assert.ok(frames>=118 && frames<=121,'Play advances the native video clock');
    const hz=(after.frame-before.frame)*59.7275/frames;
    windows.push({name,frames,updates:after.frame-before.frame,hz,inputLatencyVideoFrames:latency,longestRepeat});
    await driver.capture('cadence-'+name);
    assert.ok(hz>=55 && latency<=2,JSON.stringify(windows.at(-1)));
  }
  await driver.run(1,0);
  const wallClock=await driver.liveCadence(5000);
  assert.ok(wallClock.hz>=55,'Rendered Play sustains real wall-clock cadence: '+JSON.stringify(wallClock));
  return {passed:true,feature:'racing-cadence',windows,wallClock,controllerOnly:true};
}
