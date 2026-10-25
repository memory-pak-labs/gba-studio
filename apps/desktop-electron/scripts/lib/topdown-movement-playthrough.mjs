import assert from 'node:assert/strict';
import { playCampaignEvolutions } from './campaign-evolutions-playthrough.mjs';

/** Controller-only regression on the complete canonical campaign, shared by
 * rendered Electron Play and the independent native ROM runner. */
export async function playTopdownMovement(driver, project, exported, context = {}) {
  const movementProofs = [];
  const movementChecks = async (name, c) => {
    await c.close();
    const entry = (await driver.state()).player;
    const axis = async (name, target) => {
      let stalled = 0;
      for (let n = 0; n < 600; n++) {
        const before = (await driver.state()).player[name], delta = target - before;
        if (!delta) { await driver.run(4, 0); return; }
        const key = name === 'x' ? delta < 0 ? 32 : 16 : delta < 0 ? 64 : 128;
        await driver.run(Math.min(4, Math.abs(delta)), key);
        if ((await driver.state()).player[name] === before) assert.ok(++stalled < 24, 'movement probe axis is accessible');
        else stalled = 0;
      }
      assert.fail('movement probe axis target');
    };
    // The archive's gate is opened by events. Cross its real collision with
    // controller input; static authored-route data still describes a closed OBJ.
    if (name === 'galeria_das_mares') await axis('y', 160);
    const point = name === 'porto_lumen' ? [55, 48] : [14, 23];
    const geometry = exported.topdown_project.player;
    assert.deepEqual(geometry.size, { x: 16, y: 8 });
    assert.deepEqual(geometry.collision_offset, { x: 0, y: 0 });
    assert.equal(geometry.allow_diagonal, true);
    let walkAnimation;
    if (context.walkAnimation) {
      // Capture a full stride away from the Gallery's crates and lower wall.
      const probe = name === 'farol_interior' ? [14, 20] : name === 'galeria_das_mares' ? [16, 16] : point;
      const poses = [];
      for (const [direction, keys] of [['right',16],['left',32],['up',64],['down',128]]) {
        await c.walkTo(...probe); await driver.run(4,0);
        await driver.recordMovement?.(name+'_walk_'+direction);
        const seen = new Set(), trace = [], captures = [];
        let previous;
        for (let n=0;n<64;n+=4) {
          await driver.run(4,keys);
          const animation=await driver.animation();
          assert.equal(animation.frameCount,4,name+': four authored '+direction+' frames');
          assert.ok(animation.frame<4);
          trace.push({nativeFrame:n+4,animation,player:(await driver.state()).player});
          // The renderer draws before advancing the animator. Capture after
          // a stable sample so the screenshot contains the reported pose.
          if (previous?.frame===animation.frame&&!seen.has(animation.frame)) {
            seen.add(animation.frame);
            const label=name+'-walk-'+direction+'-phase-'+animation.frame;
            captures.push({frame:animation.frame,label,camera:await driver.camera(),player:(await driver.state()).player});
            await driver.capture(label);
          }
          previous=animation;
        }
        await driver.recordMovement?.(null);
        assert.deepEqual([...seen].sort(),[0,1,2,3],name+': all four '+direction+' poses rendered');
        await driver.run(4,0);
        assert.equal((await driver.animation()).frameCount,1,name+': release returns to idle');
        poses.push({direction,frames:[...seen].sort(),trace,captures});
      }
      let cadence;
      if (name==='porto_lumen') {
        const traces=[];
        for (const [label,keys] of [['cardinal',16],['diagonal',144]]) {
          await c.walkTo(50,47);await driver.run(4,16);await driver.run(4,0);
          const trace=[];
          for(let n=0;n<128;n+=2){await driver.run(2,keys);trace.push({nativeFrame:n+2,animation:await driver.animation(),player:(await driver.state()).player});}
          const changes=trace.filter((r,i)=>i>0&&r.animation.frame!==trace[i-1].animation.frame);
          const intervals=changes.slice(1).map((r,i)=>({nativeFrames:r.nativeFrame-changes[i].nativeFrame,distance:Math.hypot(r.player.x-changes[i].player.x,r.player.y-changes[i].player.y)}));
          assert.ok(intervals.length>=10);
          const mean=key=>intervals.reduce((sum,r)=>sum+r[key],0)/intervals.length;
          traces.push({label,trace,intervals,meanNativeFrames:mean('nativeFrames'),meanDistance:mean('distance')});
          await driver.run(4,0);
        }
        const ratio=traces[1].meanNativeFrames/traces[0].meanNativeFrames;
        assert.ok(Math.abs(ratio-1)<0.1,'walk cadence agrees on cardinal and diagonal travel: '+ratio);
        for(const t of traces)assert.ok(Math.abs(t.meanDistance-4)<0.3,'pose advances every four travelled pixels: '+t.meanDistance);
        cadence={traces,ratio};
      }
      walkAnimation={poses,cadence};
    }
    const measure = async keys => {
      await c.walkTo(...point);
      await driver.run(4, 16); // Establish a right-facing body before adding down.
      const before = (await driver.state()).player;
      await driver.recordMovement?.(name);
      await driver.run(64, keys);
      await driver.recordMovement?.(null);
      const after = (await driver.state()).player;
      await driver.run(4, 0);
      const delta = [after.x - before.x, after.y - before.y];
      await driver.capture(name + (keys === 16 ? '-movement-cardinal' : '-movement-diagonal'));
      return { before, after, delta, distance: Math.hypot(...delta) };
    };
    const cardinal = await measure(16), diagonal = await measure(16 | 128);
    const ratio = diagonal.distance / cardinal.distance;
    assert.ok(cardinal.distance >= 20, name + ': meaningful cardinal displacement');
    assert.ok(Math.abs(ratio - 1) < 0.06, name + ': diagonal keeps the same speed, ratio=' + ratio);
    assert.equal(diagonal.after.direction, 3, name + ': diagonal preserves right facing');
    const directions = [];
    for (const [keys, sx, sy] of [[16,1,0],[32,-1,0],[64,0,-1],[128,0,1],[80,1,-1],[144,1,1],[96,-1,-1],[160,-1,1]]) {
      await c.walkTo(...point);
      const before = (await driver.state()).player;
      await driver.recordMovement?.(name);
      await driver.run(16, keys);
      await driver.recordMovement?.(null);
      const after = (await driver.state()).player;
      const delta = [after.x - before.x, after.y - before.y];
      assert.equal(Math.sign(delta[0]), sx, name + ': horizontal input');
      assert.equal(Math.sign(delta[1]), sy, name + ': vertical input');
      directions.push({ keys, delta, facing: after.direction });
      await driver.run(4, 0);
    }
    // Save an off-grid diagonal position through the game's own save menu.
    await c.walkTo(...point); await driver.run(18, 16 | 128); await driver.run(4, 0);
    const savedFacingKey = name === 'porto_lumen' ? 32 : name === 'farol_interior' ? 64 : 128;
    await driver.run(4, savedFacingKey); await driver.run(4, 0);
    await c.saveSlot(1, name + '-movement-save');
    const saved = (await driver.state()).player;
    await driver.checkpoint(name + '-movement');
    await driver.reboot(); await driver.run(180, 0);
    await c.loadSlot(1, name + '-movement-load'); await c.close();
    const restored = (await driver.state()).player;
    assert.deepEqual(restored, saved, name + ': SRAM restores position and facing');
    await driver.capture(name + '-movement-restored');
    await driver.run(16, 16 | 128);
    const resumed = (await driver.state()).player;
    assert.ok(resumed.x > restored.x && resumed.y > restored.y, name + ': diagonal works after loading');
    if (context.walkAnimation) assert.equal((await driver.animation()).frameCount,4,name+': walk resumes after SRAM load');
    let rightFacingSave;
    if (name === 'porto_lumen') {
      await driver.run(4, 16); await driver.run(4, 0);
      await c.saveSlot(1, 'porto-right-facing-save');
      const before = (await driver.state()).player;
      assert.equal(before.direction, 3);
      await driver.reboot(); await driver.run(180, 0); await c.loadSlot(1, 'porto-right-facing-load'); await c.close();
      const after = (await driver.state()).player;
      assert.deepEqual(after, before, 'SRAM also retains right-facing orientation');
      await driver.capture('porto-right-facing-restored');
      rightFacingSave = { saved: before, restored: after };
    }
    let stairs;
    if (name === 'porto_lumen') {
      await c.walkTo(23, 21); await driver.capture('porto-stairs-before');
      await driver.run(80, 128); await driver.run(4, 0);
      const bend = (await driver.state()).player;
      assert.equal(bend.x, 184); assert.equal(bend.y, 200, 'first stair bend follows the visible landing');
      await driver.capture('porto-stairs-bend');
      await driver.run(40, 32); await driver.run(4, 0);
      assert.equal((await driver.state()).player.x, 184, 'cliff beside the landing remains solid');
      if (context.walkAnimation) {
        assert.equal((await driver.animation()).frameCount,1,'fully blocked input returns to grounded idle');
        await driver.capture('porto-wall-idle');
      }
      await c.walkTo(26, 32); await driver.capture('porto-stairs-descended');
      await c.walkTo(23, 21); await driver.capture('porto-stairs-ascended');
      stairs = { bend, descended: true, ascended: true, cliffBlocked: true };
    }
    movementProofs.push({ name, cardinal, diagonal, ratio, directions, saved, restored, resumed, stairs, rightFacingSave, walkAnimation });
    if (name === 'galeria_das_mares') {
      await c.walkTo(35, 20); await axis('x', entry.x); await axis('y', entry.y);
    }
  };
  const campaign = await playCampaignEvolutions(driver, project, exported, 'mission', { ...context, movementChecks });
  assert.deepEqual(movementProofs.map(p => p.name), ['porto_lumen', 'farol_interior', 'galeria_das_mares']);
  return { ...campaign, movementProofs };
}
