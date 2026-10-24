import assert from 'node:assert/strict';
import {playLostSignalMission,lostSignalInventoryIndices} from './lost-signal-playthrough.mjs';

/** Extends the existing mission journey using only ordinary controller inputs. */
export async function playShowcaseSystems(driver, project, exported) {
  const vi=Object.fromEntries(project.variables.map((v,i)=>[v.name,i])),items=lostSignalInventoryIndices(project);
  const value=async key=>(await driver.state()).variables[vi['var_'+key]];
  let controls;
  const shot=label=>driver.capture(label);
  async function choose(key,index) {
    for(let n=0;n<60;n++) {
      const ui=await driver.ui(),d=ui.dialogue;
      if(d?.key===key&&d.choice&&d.complete) {
        assert.ok(d.choiceCount>index,`${key} choice exists`);
        for(let n=0;n<index;n++)await controls.tap(128,12);
        assert.equal((await driver.ui()).dialogue.selected,index);
        await shot(key+'-choice-'+index);await controls.tap(1,100);return;
      }
      await controls.tap(1,25);
    }
    assert.fail(`Choice ${key} becomes visible: ${JSON.stringify(await driver.ui())}`);
  }
  async function actor(id) {
    const a=project.actors.find(a=>a.id===id);
    await controls.walkTo(a.x,a.y+2);await driver.run(1,64);await driver.run(6,0);await controls.tap(1,70);
  }
  async function trader(choice) {await actor('porto-lume-traveler-pilot');await choose('showcase_trader_menu',choice);}
  async function keeper(choice) {await controls.walkTo(17,16);await driver.run(4,64);await driver.run(6,0);await controls.tap(1,70);await choose('showcase_keeper_menu',choice);}
  async function openFarol() {
    await controls.walkTo(17,16);await driver.run(90,64);await driver.run(8,0);await controls.tap(1,150);
    await controls.expect(0,1,'showcase-farol-entry');await controls.close();
  }
  async function waitMenu() {
    for(let n=0;n<30;n++){const ui=await driver.ui();if(ui.menu)return ui.menu;await controls.tap(2,20);}
    assert.fail('Authored native menu opens');
  }
  async function equip() {
    const menu=await waitMenu();assert.match(menu.title,/EQUIP/);await controls.tap(1,15);
    const options=await waitMenu(),index=options.items.findIndex(i=>i.value===items.zzz_lumen_tool);
    assert.ok(index>=0,'Owned tool is listed in equipment menu');
    for(let n=0;n<index;n++)await controls.tap(128,10);
    await controls.tap(1,20);assert.equal(await driver.equipped(),items.zzz_lumen_tool);
    await shot('showcase-equipped-tool');await controls.tap(2,15);await controls.tap(2,80);await controls.close();
  }
  async function council(path) {
    await actor('porto-lume-captain-pilot');await choose('showcase_captain_menu',0);
    await controls.expect(9,0,'showcase-council-arrival');await choose('conselho',path-1);await controls.close();
    await controls.expect(0,0,'showcase-council-return-'+path);
    assert.equal(await value('council_path'),path);assert.equal(await value('council_visit'),0);
  }
  const result=await playLostSignalMission(driver,project,exported,{
    async beforeMission(c) {
      controls=c;await trader(0);const menu=await waitMenu();
      assert.match(menu.title,/LOJA/);assert.equal(menu.items[0].enabled,false,'Three starting coins cannot buy the four-coin tool');
      assert.equal(await driver.item('zzz_lumen_tool'),0);await shot('showcase-insufficient-coins');await controls.tap(2,70);
    },
    async afterMission(c) {
      controls=c;const branches=[];
      for(const path of [1,2]) {
        if(path===2){await driver.reboot();await driver.run(180,0);await controls.loadSlot(1,'showcase-baseline-load');await controls.close();}
        const baseCurrency=await driver.currency(),chapter=await value('chapter');await council(path);
        assert.equal(await driver.currency(),baseCurrency+(path===1?2:0));assert.equal(await value('chapter'),chapter);
        if(path===2)assert.equal(await driver.item('zzz_guardian_compass'),1);
        // Revisit is a report, without a second decision or reward.
        const currency=await driver.currency();await actor('porto-lume-captain-pilot');await choose('showcase_captain_menu',0);await controls.close();await driver.run(180,0);await controls.close();
        assert.equal((await driver.state()).runtimeKind,0);assert.equal(await driver.currency(),currency);
        await trader(0);const shop=await waitMenu();assert.equal(shop.items[0].enabled,true);await controls.tap(1,30);
        assert.equal(await driver.item('zzz_lumen_tool'),1);assert.equal(await driver.currency(),currency-4);
        assert.equal((await driver.ui()).menu.items[0].enabled,false,'Finite stock disables a second purchase');
        await shot('showcase-purchased-'+path);await controls.tap(2,80);
        await openFarol();await keeper(0);await shot('showcase-unequipped-denial-'+path);await controls.close();
        assert.equal(await value('trial_active'),0,'A carried tool does not satisfy equipment requirement');
        await keeper(1);await equip();await keeper(0);await controls.close();
        assert.equal(await value('trial_active'),1);assert.ok(await value('trial_charge')<=(path===1?12:18));
        await shot('showcase-active-timer-'+path);
        if(path===1) {
          for(let n=0;n<24&&await value('trial_result')===0;n++)await driver.run(120,0);await shot('showcase-expired');await controls.close();
          assert.equal(await value('trial_result'),-1);assert.equal(await driver.equipped(),items.zzz_lumen_tool);
          await keeper(0);await controls.close();assert.equal(await value('trial_active'),1);
          await controls.saveSlot(2,'showcase-mid-trial-save');await driver.checkpoint('showcase-mid-trial');
          await driver.reboot();await driver.run(180,0);await controls.loadSlot(2,'showcase-mid-trial-load');await controls.close();await driver.run(20,0);
          assert.equal(await value('trial_active'),0);assert.equal(await value('trial_result'),-2);
          assert.equal(await driver.equipped(),items.zzz_lumen_tool);await shot('showcase-interrupted-attempt');
          await keeper(0);await controls.close();
        }
        const beforeReward=await driver.currency();
        await controls.walkTo(23,27);await driver.run(90,128);await controls.close();await driver.run(120,0);
        await controls.expect(0,0,'showcase-calibration-return-'+path);
        assert.equal(await value('trial_result'),1);assert.equal(await value('trial_reward'),1);assert.equal(await driver.currency(),beforeReward+1);
        await actor('porto-lume-fisherchild-pilot');await shot('showcase-fisher-reaction-'+path);await controls.close();
        await controls.saveSlot(2,'showcase-final-save-'+path);await driver.checkpoint('showcase-final-'+path);
        const finalCurrency=await driver.currency();await driver.reboot();await driver.run(180,0);await controls.loadSlot(2,'showcase-final-load-'+path);await controls.close();
        assert.equal(await value('council_path'),path);assert.equal(await value('trial_result'),1);assert.equal(await value('trial_reward'),1);
        assert.equal(await driver.equipped(),items.zzz_lumen_tool);assert.equal(await driver.currency(),finalCurrency);
        await shot('showcase-final-restored-'+path);
        branches.push({path,currency:finalCurrency,state:await driver.state(),equipped:await driver.equipped()});
      }
      return {passed:true,branches};
    }
  });
  return result;
}
