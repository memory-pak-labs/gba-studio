import {describe,expect,it} from 'vitest';
import {playLostSignalMission} from './lib/lost-signal-playthrough.mjs';

function titleDriver({acceptStart=true,initialSelection=0}={}){
  let state={runtimeKind:3,currentRoom:0},selected=initialSelection,pending=0,starts=0;
  return {
    state:()=>state,
    sceneMenu:()=>({selected}),
    capture:()=>{},
    starts:()=>starts,
    run(_frames,keys){
      if(keys){pending=keys;return;}
      if(pending===8&&state.currentRoom===0){
        // The first edge belongs to the title's entry transition, exactly as
        // in the ROM failure; a later, fresh edge reaches the menu handler.
        if(++starts>1&&acceptStart)state={runtimeKind:3,currentRoom:1};
      } else if(pending===1&&state.currentRoom===1)state={runtimeKind:3,currentRoom:4};
      else if(pending===128&&state.currentRoom===4)selected++;
      else if(pending===1&&state.currentRoom===4)state={runtimeKind:0,currentRoom:3};
      pending=0;
    }
  };
}

describe('controller-only save/load title entry',()=>{
  const project={variables:[]};
  const exported={menu_project:{screens:[{name:'carregar_jogo',items:[0,1,2].map(save_slot=>({save_slot}))}]}};
  it('loads the requested manual slot after a Start edge is consumed by title entry',async()=>{
    const driver=titleDriver();
    const controls=await playLostSignalMission(driver,project,exported,{resume:true});
    await controls.loadSlot(2,'manual');
    expect(driver.starts()).toBe(2);
    expect(driver.sceneMenu().selected).toBe(2);
    expect(driver.state()).toEqual({runtimeKind:0,currentRoom:3});
  });
  it('fails within a bounded number of fresh presses when title input stays unavailable',async()=>{
    const driver=titleDriver({acceptStart:false});
    const controls=await playLostSignalMission(driver,project,exported,{resume:true});
    await expect(controls.loadSlot(2,'manual')).rejects.toThrow();
    expect(driver.starts()).toBeGreaterThan(1);
    expect(driver.starts()).toBeLessThanOrEqual(4);
  });
  it('keeps a requested slot that is already selected after empty entries were skipped',async()=>{
    const driver=titleDriver({initialSelection:1});
    const controls=await playLostSignalMission(driver,project,exported,{resume:true});
    await controls.loadSlot(1,'manual');
    expect(driver.sceneMenu().selected).toBe(1);
  });
});
