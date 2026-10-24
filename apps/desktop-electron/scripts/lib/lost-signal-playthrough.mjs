import assert from 'node:assert/strict';

export function lostSignalInventoryIndices(project) {
  const names = new Set(project.events.flatMap(e => (e.steps ?? []).flatMap(s => {
    const [verb,item] = s.command.split(/\s+/);
    return ['add_item','has_item'].includes(verb) ? [item] : verb === 'set_equipped_item' && s.command.split(/\s+/)[2] !== 'none' ? [s.command.split(/\s+/)[2]] : [];
  })));
  return Object.fromEntries([...names].sort().map((name,i)=>[name,i]));
}

/** Same controller-only journey for a native core and the rendered Play window.
 * Driver diagnostics are read-only; all mission and save mutations use GBA inputs. */
export async function playLostSignalMission(driver, project, exported, options = {}) {
  const indices = Object.fromEntries(project.variables.map((v, i) => [v.name, i]));
  const telemetry = () => driver.telemetry ? driver.telemetry() : driver.state();
  const value = async key => (await driver.state()).variables[indices[`var_signal_${key}`]];
  const tap = async (keys, settle = 35) => { await driver.run(4, keys); await driver.run(settle, 0); };
  const expect = async (kind, room, label) => {
    const s = await driver.state();
    assert.equal(s.runtimeKind, kind, `${label}: runtime`);
    assert.equal(s.currentRoom, room, `${label}: room`);
    await driver.capture(label);
    return s;
  };
  const close = async () => {
    for (let n = 0; n < 28; n++) {
      if (!(await driver.dialogue())) { await driver.run(12, 0); if (!(await driver.dialogue())) return; }
      await tap(2, 15);
    }
    assert.fail('Dialogue must close through B, without repeating an interaction');
  };
  const chooseFirstDestination = async (kind, room) => {
    for (let n = 0; n < 8; n++) {
      const s = await driver.state();
      if (s.runtimeKind === kind && s.currentRoom === room) return;
      await tap(1, 100);
    }
    assert.fail(`First travel choice must reach ${kind}/${room}`);
  };
  const openCodeLock = async () => {
    for (let n = 0; n < 20 && !(await driver.modal()); n++) {
      await tap(await driver.dialogue() ? 2 : 1, 25);
    }
    assert.ok(await driver.modal(), 'Real code lock opens');
  };
  async function axis(target, name) {
    let stalled = 0;
    for (let n = 0; n < 400; n++) {
      const before = (await telemetry()).player[name], delta = target - before;
      if (Math.abs(delta) <= ((await telemetry()).runtimeKind === 0 ? 0 : 1)) return;
      const key = name === 'x' ? delta < 0 ? 32 : 16 : delta < 0 ? 64 : 128;
      const speed = (await telemetry()).runtimeKind === 5 ? 2 : 1;
      await driver.run(Math.min(4, Math.ceil(Math.abs(delta) / speed)), key);
      const after = (await telemetry()).player[name];
      if (after === before) { if (++stalled > 12) throw Error(`Blocked ${name} at ${before}, target ${target}`); }
      else stalled = 0;
    }
    assert.fail(`Movement did not reach ${name}=${target}`);
  }
  async function walkTo(tx, ty) {
    for (let attempt=0;attempt<10;attempt++) {
      try { return await walkRoute(tx,ty); } catch(error) {
        if(attempt===9 || !/Blocked |Reachable authored path/.test(String(error)))throw error;
        await driver.run(20,0);
      }
    }
  }
  async function walkRoute(tx, ty) {
    const s = await telemetry();
    assert.equal(s.runtimeKind, 0, 'pathfinding requires the authored topdown world');
    const room = exported.topdown_project.rooms[s.currentRoom], width = room.width_tiles, height = room.height_tiles;
    const start = [Math.round(s.player.x / 8), Math.round(s.player.y / 8)], goal = [tx, ty];
    const valid = (x, y) => {
      // Native player: 16x16, collision offset (0,-8). Keep the whole foot box free.
      for (let yy = y - 1; yy <= y; yy++) for (let xx = x; xx <= x + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height || (room.collision_flags[yy * width + xx] & 1)) return false;
      }
      return !room.npcs.some((npc, i) => {
        const position = i === 0 ? s.firstActor : npc.position;
        return Math.abs(position.x - x * 8) < 16 && Math.abs(position.y - y * 8) < 16;
      });
    };
    const queue = [start], previous = new Map([[start.join(','), null]]);
    for (let i = 0; i < queue.length && !previous.has(goal.join(',')); i++) {
      const [x, y] = queue[i];
      for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
        const next = [x + dx, y + dy], key = next.join(',');
        if (!previous.has(key) && valid(...next)) { previous.set(key, [x, y]); queue.push(next); }
      }
    }
    assert.ok(previous.has(goal.join(',')), `Reachable authored path: ${start} -> ${goal}`);
    await axis(start[0] * 8, 'x'); await axis(start[1] * 8, 'y');
    const route = []; let cell = goal;
    while (previous.get(cell.join(',')) !== null) { route.push(cell); cell = previous.get(cell.join(',')); }
    for (const [x, y] of route.reverse()) { await axis(x * 8, 'x'); await axis(y * 8, 'y'); }
    await driver.run(8, 0);
  }
  async function mechanic() {
    // Her native wander stays in the existing eastern dock. Approach her actual position.
    for (let n = 0; n < 12; n++) {
      const s = await telemetry(), npc = s.firstActor;
      const dx = npc.x - s.player.x, dy = npc.y - s.player.y;
      if (Math.abs(dx) + Math.abs(dy) <= 32) {
        await driver.run(1, Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 32 : 16 : dy < 0 ? 64 : 128);
        await driver.run(4, 0); await tap(1, 70);
        if (await driver.dialogue()) return;
      }
      const room = exported.topdown_project.rooms[0], x = Math.round(npc.x / 8), y = Math.round(npc.y / 8);
      const candidates = [[x,y+2],[x-2,y],[x+2,y],[x,y-2]].filter(([x,y]) =>
        [0,1].every(dx => [-1,0].every(dy => !(room.collision_flags[(y+dy)*room.width_tiles+x+dx] & 1)))
      ).sort((a,b) => Math.abs(a[0]*8-s.player.x)+Math.abs(a[1]*8-s.player.y)-Math.abs(b[0]*8-s.player.x)-Math.abs(b[1]*8-s.player.y));
      assert.ok(candidates.length, 'Mechanic has an accessible adjacent floor');
      try { await walkTo(...candidates[0]); } catch (error) {
        // A wandering NPC may cross the route while we approach; replan using
        // her new native position instead of freezing or moving the actor.
        if (n === 11) throw error;
      }
    }
    assert.fail('The existing mechanic must be interactable');
  }
  async function hotspot(name, keys = 1) {
    const s = await telemetry(); assert.equal(s.runtimeKind, 5);
    const h = exported.point_click_project.scenes[s.currentRoom].hotspots.find(h => h.name === name);
    assert.ok(h, `authored hotspot ${name}`);
    await axis(Math.floor(h.area.x + h.area.width / 2), 'x');
    await axis(Math.floor(h.area.y + h.area.height / 2), 'y');
    await driver.run(6, 0); await tap(keys, 100);
  }
  async function loadSlot(slot, label) {
    await tap(8, 45); await expect(3, 1, `${label}-title-menu`);
    await tap(16); await tap(1, 70); await expect(3, 4, `${label}-slots`);
    for (let i = 0; i < slot; i++) await tap(128);
    await tap(1, 160);
  }
  async function saveSlot(slot, label) {
    await tap(8, 55); await expect(3, 11, `${label}-start-menu`);
    for (let n = 0; n < 3; n++) await tap(128);
    await tap(1, 55); await expect(3, 10, `${label}-save-menu`);
    for (let n = 0; n < slot; n++) await tap(128);
    await tap(1); await tap(1); await tap(2); await tap(2); await tap(2, 70);
    assert.equal((await driver.state()).runtimeKind, 0, 'Saving returns to the gameplay family');
    await driver.capture(label);
  }
  await driver.run(180, 0); await expect(3, 0, 'title');
  await tap(8); await tap(1); await expect(3, 2, 'new-game-gender');
  await tap(1); await expect(3, 3, 'new-game-name');
  await tap(1); await tap(2); await tap(128); await tap(1, 100);
  await expect(8, 2, 'prologue'); await tap(8, 120);
  await expect(0, 0, 'port-start');
  const controls={tap,close,walkTo,expect,loadSlot,saveSlot,mechanic};
  await options.beforeMission?.(controls);
  await mechanic(); assert.equal(await value('stage'), 1); await driver.capture('mission-request'); await close();
  await walkTo(61, 64); await driver.run(1, 64); await driver.run(4, 0); await tap(1, 150); await driver.capture('cartographer-destinations');
  await chooseFirstDestination(5, 0); await expect(5, 0, 'warehouse-arrival');
  await hotspot('Baú Vermelho'); assert.equal(await value('part'), 0); await driver.capture('chest-before-chart'); await close();
  await hotspot('Carta Náutica'); assert.equal(await value('chart'), 1); await driver.capture('chart-collected'); await close();
  assert.equal(await driver.item('zz_signal_chart'),1);
  await hotspot('Baú Vermelho'); assert.equal(await value('part'), 1); await driver.capture('relay-collected'); await close();
  await hotspot('Baú Vermelho'); assert.equal(await value('part'), 1); await close();
  assert.equal(await driver.item('zz_signal_relay'),1,'Repeated chest interaction does not duplicate the real inventory item');
  const partial = await driver.saveInfo();
  assert.equal(partial.slot?.status, 'ok', 'Partial autosave checksum');
  await driver.checkpoint('partial-warehouse');
  await driver.reboot(); await driver.run(180, 0); await expect(3, 0, 'partial-reboot');
  assert.equal(await value('stage'), 0, 'Hardware reboot clears volatile progress');
  await loadSlot(0, 'partial-load'); await expect(5, 0, 'partial-restored-warehouse');
  assert.equal(await value('stage'), 1); assert.equal(await value('chart'), 1); assert.equal(await value('part'), 1);
  assert.equal(await driver.item('zz_signal_chart'),1);assert.equal(await driver.item('zz_signal_relay'),1);
  await close();
  await hotspot('Saída do Armazém',257); await expect(0,0,'return-shortcut-after-load');
  assert.equal(await value('stage'),1);assert.equal(await driver.item('zz_signal_relay'),1);
  await walkTo(61,64);await driver.run(1,64);await driver.run(4,0);await tap(1,150);await chooseFirstDestination(5,0);
  await expect(5,0,'warehouse-reentry');
  assert.equal(await driver.item('zz_signal_chart'),1);assert.equal(await driver.item('zz_signal_relay'),1);
  await hotspot('Saída do Armazém'); await chooseFirstDestination(5, 1); await expect(5, 1, 'observatory-arrival');
  await hotspot('Mesa da Maré'); assert.equal(await value('code'), 0); await driver.capture('table-before-telescope'); await close();
  await hotspot('Telescópio'); assert.equal(await value('observation'), 1); await driver.capture('telescope-clue'); await close();
  await hotspot('Mesa da Maré'); assert.equal(await value('code'), 1); await driver.capture('code-314'); await close();
  await hotspot('Saída do Observatório'); await chooseFirstDestination(0, 1); await expect(0, 1, 'lighthouse-arrival'); await close();
  if(options.approachRepair)await options.approachRepair(controls);
  else {await walkTo(17, 16); await driver.run(1, 64); await driver.run(8, 0);}
  // Advance only the help text: the next interaction is the native numeric modal.
  await driver.capture('lens-approach'); await openCodeLock(); await driver.capture('code-lock');
  await tap(1, 90); assert.equal(await value('lock'), 0); assert.equal(await value('stage'), 1); assert.equal(await value('part'), 1);
  await driver.capture('wrong-code-preserves-piece'); await close();
  await openCodeLock();
  assert.ok(await driver.modal()); await tap(2, 90); assert.equal(await value('lock'), -1); assert.equal(await value('part'), 1); await close();
  await openCodeLock();
  assert.ok(await driver.modal());
  for (const digit of [3,1,4]) { for (let n = 0; n < digit; n++) await tap(64, 8); if (digit !== 4) await tap(16, 8); }
  await tap(1, 65); await driver.capture('repair-cinematic'); await options.duringRepair?.(controls); await driver.run(250, 0);
  assert.equal(await value('stage'), 2); assert.equal(await value('part'), 0); await driver.capture('lighthouse-repaired'); await close();
  assert.equal(await driver.item('zz_signal_relay'),0,'Repair consumes the actual inventory piece');
  await options.afterRepair?.(controls);
  await walkTo(23, 27); await driver.run(90, 128); await driver.run(120, 0); await expect(0, 0, 'return-to-port');
  await mechanic(); await driver.capture('mission-reward'); assert.equal(await value('stage'), 3); await close();
  const complete = await driver.state(), currencyBeforeRepeat = await driver.currency();
  await mechanic(); await close(); assert.equal(await driver.currency(), currencyBeforeRepeat, 'Reward cannot be collected twice');
  await tap(8, 50); await tap(1, 50); await expect(3, 7, 'mission-journal');
  await tap(1, 80); await driver.capture('journal-complete'); await close(); await tap(2); await tap(2, 80);
  await saveSlot(1, 'manual-slot-two'); await driver.checkpoint('complete-manual');
  await driver.reboot(); await driver.run(180, 0); await loadSlot(1, 'manual-load');
  await expect(0, 0, 'completion-restored');
  assert.equal(await value('stage'), 3); assert.equal(await value('code'), 1); assert.equal(await value('part'), 0);
  assert.equal(await driver.item('zz_signal_relay'),0,'Manual load retains the consumed inventory state');
  assert.equal(await driver.currency(), currencyBeforeRepeat, 'Manual load restores the earned currency');
  await mechanic(); await close(); assert.equal(await driver.currency(), currencyBeforeRepeat, 'Loaded completion still prevents duplicate reward');
  const showcase=await options.afterMission?.(controls);
  return { showcase, passed: true, variableIndices: indices, partialSave: partial, completeState: complete, rewardCurrency: currencyBeforeRepeat };
}
