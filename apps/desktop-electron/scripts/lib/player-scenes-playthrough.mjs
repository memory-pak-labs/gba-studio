import assert from 'node:assert/strict';
import { playCampaignEvolutions } from './campaign-evolutions-playthrough.mjs';

const A = 1, B = 2, RIGHT = 16, LEFT = 32, UP = 64, DOWN = 128, R = 256, L = 512;
const inGameKinds = {
  topdown: [0, 'topdown_project', 'rooms'],
  platformer: [1, 'platformer_project', 'rooms'],
  isometric: [2, 'isometric_project', 'rooms'],
  shmup: [4, 'shmup_project', 'waves'],
  pointAndClick: [5, 'point_click_project', 'scenes'],
  dungeonCrawler: [6, 'dungeon_crawler_project', 'rooms'],
  racing: [7, 'racing_project', 'rooms'],
  worldMap: [10, 'world_map_project', 'nodes'],
  battleRpg: [11, 'battle_rpg_project', 'encounters'],
  luta: [12, 'luta_project', 'stages']
};

export async function playPlayerScenes(d, c) {
  const { project, exported } = c;
  const variableIndices = new Map(project.variables.map((variable, index) => [variable.name, index]));
  const variable = name => {
    assert.ok(variableIndices.has(name), 'Authored variable: ' + name);
    return d.state().variables[variableIndices.get(name)];
  };
  function until(predicate, limit, keys = 0) {
    for (let frame = 0; frame < limit; frame++) {
      if (predicate()) return;
      d.run(1, keys);
    }
    assert.fail(`Condition not reached after ${limit} frames: ${JSON.stringify(d.state().player)}`);
  }
  function observe(frames, keys, read, step = 2) {
    const trace = [];
    for (let i = 0; i < frames; i += step) {
      d.run(step, keys);
      trace.push(read());
    }
    d.run(4, 0);
    return trace;
  }
  function requireDistinctFrames(trace, matcher = () => true, description = 'Animation', minimum = 2) {
    const frames = new Set(trace.filter(matcher).map(sample => sample.frame));
    assert.ok(frames.size >= minimum, `${description} needs ${minimum} distinct frames, observed [${[...frames]}]`);
    return [...frames];
  }
  function talkToTopdown(npc, livePosition) {
    const { x, y } = livePosition ?? npc.position;
    const [tx, ty] = [Math.round(x / 8), Math.round(y / 8)];
    for (const [dx, dy, key] of [[-2, 0, RIGHT], [0, 2, UP], [0, -2, DOWN], [2, 0, LEFT], [0, 1, UP], [0, -1, DOWN]]) {
      try {
        c.moveTopdownTo(tx + dx, ty + dy);
      } catch (error) {
        if (!/authored walkable path reaches|controller movement is blocked/.test(String(error))) throw error;
        continue;
      }
      d.run(2, key);
      c.tap(A, 32);
      const dialogue = d.ui().dialogue;
      if (dialogue) return dialogue.key;
      if (d.state().runtimeKind !== 0) return 'scene transition';
    }
    assert.fail(`The player can reach and interact with ${npc.name}`);
  }
  async function topdown(name, room) {
    const origin = { porto_lumen: [55, 48], farol_interior: [14, 20], galeria_das_mares: [16, 23], sala_mare_vazante: [21, 24] }[name];
    const motions = {};
    for (const [label, key, axis, sign] of [['right', RIGHT, 'x', 1], ['left', LEFT, 'x', -1], ['up', UP, 'y', -1], ['down', DOWN, 'y', 1]]) {
      c.moveTopdownTo(...origin);
      const before = d.state().player[axis];
      const stride = observe(56, key, d.animation, 4);
      assert.equal(Math.sign(d.state().player[axis] - before), sign, label + ' moves Nara');
      motions[label] = requireDistinctFrames(stride, sample => sample.frameCount === 4, name + ' ' + label + ' walk', 4);
      assert.equal(d.animation().frameCount, 1, label + ' returns to idle');
    }
    c.moveTopdownTo(...origin);
    const run = observe(32, R | RIGHT, d.animation, 4);
    requireDistinctFrames(run, sample => /run_right/.test(sample.clip ?? ''), name + ' run');
    d.capture(name + '-movement');
    if (name === 'porto_lumen' || name === 'farol_interior') {
      const dialogue = {};
      const people = name === 'porto_lumen' ? room.npcs.filter(npc => npc.on_interact?.length) : room.npcs.slice(0, 1);
      for (const npc of people) {
        dialogue[npc.name] = talkToTopdown(npc, npc === room.npcs[0] ? d.state().firstActor : undefined);
        d.capture(name + '-npc-' + room.npcs.indexOf(npc));
        c.close();
      }
      if (name === 'porto_lumen') assert.equal(variable('var_frame'), 1, 'Mechanic awards the airframe');
      return { motions, dialogue };
    }
    if (name === 'galeria_das_mares') {
      const gate = await playCampaignEvolutions(d, project, exported, 'gallery', { projectRoot: c.projectRoot });
      assert.equal(gate.gateOpened, true);
      return { motions, gate: gate.gateOpened };
    }
    c.moveTopdownTo(16, 26);
    d.run(2, LEFT);
    c.tap(A, 16);
    assert.ok(variable('var_tide_state') > 0, 'The valve event starts draining the canal');
    d.capture('sala_mare_vazante-draining');
    until(() => variable('var_tide_state') === 2, 2400);
    d.run(60, 0);
    c.close();
    d.capture('sala_mare_vazante-drained');
    c.moveTopdownTo(23, 23);
    until(() => d.state().player.y <= 88, 550, UP);
    c.moveTopdownTo(33, 10);
    d.run(2, RIGHT);
    c.tap(A, 25);
    c.close();
    assert.equal(variable('var_stabilizer'), 1, 'The dried corridor gives access to the stabilizer');
    d.capture('sala_mare_vazante-stabilizer');
    return { motions, tideState: variable('var_tide_state'), stabilizer: true };
  }
  async function isometric(name) {
    if (name === 'mercado_suspenso') {
      const before = d.coast().actors[0];
      const walk = observe(48, RIGHT, () => d.isoAnimation(0));
      assert.notDeepEqual(d.coast().actors[0], before, 'Nara advances on the inclined plane');
      const frames = requireDistinctFrames(walk, sample => sample.mode === 1);
      const guard = () => d.coast().actors[2];
      const guardBefore = guard().x;
      c.moveIsoTo(41, 24);
      d.run(4, A);
      const response = observe(100, 0, () => d.isoAnimation(2));
      c.close();
      assert.equal(variable('var_market_shortcut'), 1);
      assert.equal(guard().x, guardBefore - 1, 'Delivery event moves the guard exactly one tile');
      d.capture(name + '-guard-moved');
      c.moveIsoTo(19, 18);
      c.tap(A, 32);
      assert.ok(d.ui().dialogue, 'Merchant interaction opens dialogue');
      d.capture(name + '-merchant');
      c.close();
      return { frames, guardMoved: true, guardFrames: [...new Set(response.map(s => s.frame))] };
    }
    const cursor = () => [d.state().flagBits >>> 23 & 15, d.state().flagBits >>> 27 & 15];
    const tactical = () => d.coast().tactical;
    const point = (x, y) => {
      for (let i = 0; i < 60; i++) {
        const [cx, cy] = cursor();
        if (cx === x && cy === y) return;
        d.run(4, cx < x ? 144 : cx > x ? 96 : cy < y ? 160 : 80);
        d.run(16, 0);
      }
      assert.fail('Tactical cursor reaches ' + [x, y]);
    };
    const [nara, sentinel] = d.coast().actors;
    point(nara.x, nara.y);
    c.tap(A, 8);
    assert.ok(tactical().menu, 'Nara is selectable');
    c.tap(A, 8);
    const destination = [nara.x + 1, nara.y];
    point(...destination);
    d.run(4, A);
    const captured = new Set();
    const capturePose = (label, state) => {
      const key = `${label}-${state.frame}`;
      if (!captured.has(key)) {
        captured.add(key);
        d.capture('arena_tatica-' + key);
      }
    };
    const walk = observe(75, 0, () => {
      const pose = d.isoAnimation(0);
      if (pose.mode === 1) capturePose('step', pose);
      return pose;
    }, 1);
    assert.deepEqual([d.coast().actors[0].x, d.coast().actors[0].y], destination);
    const walkFrames = requireDistinctFrames(walk, sample => sample.mode === 1, 'Nara tactical one-tile walk');
    c.enter(name);
    c.close();
    point(nara.x, nara.y);
    c.tap(A, 8);
    for (let i = 0; i < 3 && tactical().menuIndex !== 1; i++) c.tap(DOWN, 8);
    c.tap(A, 8);
    assert.ok(tactical().attack && !tactical().menu, 'Attack opens targeting when the Sentinela is in range');
    point(sentinel.x, sentinel.y);
    const hp = tactical().units.find(unit => unit.actor === sentinel.index).hp;
    d.run(4, A);
    const combat = observe(65, 0, () => {
      const player = d.isoAnimation(0), enemy = d.isoAnimation(1);
      if (player.mode === 2 && enemy.mode === 3) capturePose('attack', player);
      return [player, enemy];
    }, 1);
    assert.ok(tactical().units.find(unit => unit.actor === sentinel.index).hp < hp);
    const attackFrames = requireDistinctFrames(combat.map(sample => sample[0]), sample => sample.mode === 2, 'Nara tactical attack');
    const enemyPoses = combat.map(sample => sample[1]);
    const damageFrames = enemyPoses.filter(sample => sample.mode === 3);
    assert.ok(damageFrames.length >= 3, 'The Sentinela holds its authored hurt pose after taking damage');
    assert.ok(enemyPoses.slice(enemyPoses.findIndex(sample => sample.mode === 3) + 1)
      .some(sample => sample.mode === 0 || sample.mode === 1 || sample.mode === 2),
    'The Sentinela leaves hurt and can act on its turn');
    d.capture(name + '-combat');
    return { walkFrames, attackFrames, hurtSamples: damageFrames.length };
  }
  function pointAndClick(name, room) {
    d.run(160, DOWN);
    d.run(4, 0);
    const idle = d.cursorAnimation();
    const before = d.state().player;
    const hotspot = name === 'armazem_das_mares' ? 'Rádio de Lúmen' : 'Telescópio';
    const clicked = c.clickPointClickHotspot(hotspot, name + '-hotspot');
    assert.notDeepEqual(clicked.player, before);
    assert.ok(d.ui().dialogue, 'The active hotspot opens its authored dialogue');
    c.close();
    const hover = d.cursorAnimation();
    assert.ok(hover.address > 0 && idle.address > 0, 'The scene has visible cursor clips');
    assert.notEqual(hover.address, idle.address, 'The cursor changes pose at a hotspot');
    if (name === 'observatorio_do_farol') {
      assert.equal(variable('var_telescope_alignment'), 1);
      const props = room.props.filter(prop => prop.visible_variable === variableIndices.get('var_telescope_alignment'));
      assert.deepEqual(props.map(prop => prop.visible_value).sort(), [0, 1, 2], 'Each adjustment has an authored prop');
      c.clickPointClickHotspot(hotspot, name + '-aligned');
      c.close();
      assert.equal(variable('var_telescope_alignment'), 2);
    }
    return { hotspot, cursorIdle: idle.clip, cursorHover: hover.clip };
  }
  function dungeon(name) {
    const start = d.state().player;
    if (name === 'usina_submersa') {
      for (const [x, y, direction, value] of [[1, 8, 1, 1], [5, 6, 3, 2], [9, 4, 3, 3]]) {
        c.moveDungeonTo(x, y);
        c.faceDungeon(direction);
        c.tap(A, 30);
        c.close();
        assert.equal(variable('var_coast_usina'), value, 'Each valve event advances the authored sequence');
        d.capture(name + '-valve-' + value);
      }
    } else if (name === 'usina_combate') {
      c.tap(A, 40);
      assert.equal(d.state().collision.currentFlags, 3, 'The sentinel enters combat on interaction');
      for (let hp = 2; hp >= 0; hp--) {
        c.tap(A, 50);
        assert.equal(d.state().collision.currentFlags, hp);
        d.capture(name + '-attack-' + hp);
        c.close();
      }
      assert.equal(d.state().firstActor.visible, false, 'The defeated sentinel disappears');
    } else {
      c.tap(A, 30);
      c.close();
      assert.equal(d.state().firstActor.visible, false, 'The cell disappears after pickup');
      assert.equal(variable('var_energy_cell'), 1, 'The pickup event awards the energy cell');
      c.moveDungeonTo(6, 5);
    }
    if (name === 'usina_combate') c.moveDungeonTo(9, 4);
    assert.notDeepEqual(d.state().player, start, 'First-person controls move or turn the camera');
    d.capture(name + '-complete');
    return { initial: start, final: d.state().player };
  }
  function racing(name) {
    d.run(420, 0);
    const start = c.race();
    const idle = d.vehicleAnimation();
    d.run(24, A);
    const accelerating = c.race();
    assert.ok(accelerating.speed > 0 && accelerating.distance > start.distance);
    assert.ok(accelerating.rivalDistance > start.rivalDistance, 'The rival progresses during the race');
    const driving = d.vehicleAnimation();
    assert.ok(idle.address && driving.address, 'The vehicle uses authored poses stopped and driving');
    d.capture(name + '-acceleration');
    d.run(12, LEFT | A);
    const steered = c.race();
    const perspective = name === 'circuito_perspectiva';
    assert.notEqual(perspective ? steered.angle : steered.heading, perspective ? accelerating.angle : accelerating.heading);
    if (!perspective) {
      d.run(32, B);
      const braked = c.race();
      assert.equal(braked.speed, 0, 'Braking brings the top-down car to a stop');
      return { start, accelerating, steered, braked };
    }
    let reverse;
    until(() => (reverse = c.race()).speed < -0.15, 90, B);
    assert.notDeepEqual([reverse.x, reverse.y], [steered.x, steered.y]);
    d.capture(name + '-reverse');
    return { start, accelerating, steered, reverse };
  }
  async function fight() {
    const walk = observe(40, RIGHT, () => d.fighterAnimation(0), 2);
    const walkFrames = requireDistinctFrames(walk, sample => sample.visualState === 5);
    const jump = observe(36, UP, () => d.fighterAnimation(0), 1);
    assert.ok(jump.some(sample => sample.visualState === 6 && sample.address), 'The jump uses an authored pose');
    let attack, hurt;
    for (let i = 0; i < 8 && !(attack && hurt); i++) {
      d.run(8, RIGHT);
      d.run(4, A);
      const exchange = observe(24, 0, () => [d.fighterAnimation(0), d.fighterAnimation(1)], 1);
      attack ||= exchange.find(([nara]) => nara.visualState === 1 && nara.address)?.[0];
      hurt ||= exchange.find(([, rival]) => rival.visualState === 4 && rival.address)?.[1];
    }
    assert.ok(attack && hurt, 'Nara attacks and the rival responds with the authored hurt pose');
    d.capture('arena_arrancada-exchange');
    return { walkFrames, attack: attack.clip, hurt: hurt.clip };
  }
  const scenarios = {
    topdown,
    isometric,
    pointAndClick,
    dungeonCrawler: dungeon,
    racing,
    luta: fight,
    platformer() {
      const trace = observe(120, A, d.animation, 2);
      assert.ok(trace.some(sample => /jump/.test(sample.clip ?? '')));
      assert.ok(trace.some(sample => /fall/.test(sample.clip ?? '')));
      const dash = observe(12, RIGHT | L, d.animation, 1);
      assert.ok(dash.some(sample => /dash/.test(sample.clip ?? '')));
      return { jumpAndDash: true };
    },
    worldMap() {
      const start = d.state();
      c.tap(RIGHT, 30);
      const moved = d.state();
      assert.notEqual(moved.currentRoom, start.currentRoom, 'Directional input changes the selected map node');
      c.tap(A, 30);
      assert.equal(d.state().runtimeKind, 10, 'A locked node does not allow departure');
      d.capture('mapa_rota-locked-node');
      return { start: start.currentRoom, selected: moved.currentRoom };
    },
    shmup() {
      const start = d.state().player.y;
      const flight = observe(16, UP, d.aircraftAnimation, 1);
      assert.ok(d.state().player.y < start);
      assert.ok(flight.some(sample => /up/.test(sample.clip ?? '')));
      const fire = observe(20, A, d.aircraftAnimation, 1);
      assert.ok(fire.some(sample => sample.visualState === 1 && sample.address));
      return { bankAndShoot: true };
    },
    async battleRpg() {
      return playCampaignEvolutions(d, project, exported, 'relay', { projectRoot: c.projectRoot });
    }
  };
  const failed = [];
  for (const authored of project.rooms.filter(room => inGameKinds[room.sceneType])) {
    const { name, sceneType } = authored;
    try {
      c.enter(name);
      const [kind, family, collection] = inGameKinds[sceneType];
      const rooms = exported[family][collection];
      const room = sceneType === 'worldMap' ? rooms[0] : rooms.find(entry => (entry.name ?? entry.id) === name)
        ?? (sceneType === 'shmup' ? rooms[0] : null);
      assert.ok(room, 'Scene appears in the exported ROM contract');
      assert.equal(d.state().runtimeKind, kind);
      if (sceneType !== 'worldMap') assert.equal(d.state().currentRoom, rooms.indexOf(room), 'QA opens the intended scene');
      c.close();
      d.capture(name + '-entry');
      const result = await scenarios[sceneType](name, room);
      c.record({ name, passed: true, result });
      console.log('PASS', name);
    } catch (error) {
      failed.push(name);
      c.record({ name, passed: false, error: String(error) });
      d.capture(name + '-failure');
      console.error(error.stack);
      console.log('FAIL', name, String(error));
    }
  }
  return { failed };
}
