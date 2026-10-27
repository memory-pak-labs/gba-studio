import assert from 'node:assert/strict';

/** Shared controller-only journey for the live Player and direct ROM. */
export async function playBattleDialogue(driver) {
  await driver.run(180, 0);
  assert.equal((await driver.state()).runtimeKind, 11, 'Start in the battle runtime');
  assert.equal(await driver.dialogue(), true, 'The scripted opening dialogue is visible');
  await driver.capture('battle-dialogue-open');

  const pixels = await driver.frame();
  let white = 0, lightInk = 0;
  for (let y = 120; y < 144; y++) for (let x = 16; x < 224; x++) {
    const index = (y * 240 + x) * 4;
    const [r,g,b] = pixels.subarray(index, index + 3);
    if (r > 240 && g > 240 && b > 240) white++;
    if (r > 180 && g > 165 && b > 110) lightInk++;
  }
  assert.ok(white < 1200, `Dialogue text area must not become a solid white block: ${white}`);
  assert.ok(lightInk > 60, `Dialogue must contain readable glyph pixels: ${lightInk}`);
  const before = await driver.battle();
  await driver.run(4, 128);
  await driver.run(4, 0);
  assert.equal((await driver.battle()).page, before.page, 'Battle commands ignore input while dialogue is open');
  for (let attempt = 0; attempt < 12 && await driver.dialogue(); attempt++) {
    await driver.run(4, 1);
    await driver.run(20, 0);
  }
  assert.equal(await driver.dialogue(), false, 'Dialogue closes through the controller');
  await driver.run(40, 0);
  const after = await driver.battle();
  assert.deepEqual(after.partyHp, before.partyHp, 'Closing dialogue does not consume a battle action');
  assert.equal(after.enemyHp, before.enemyHp, 'Closing dialogue does not attack the enemy');
  await driver.capture('battle-dialogue-closed');
  await driver.run(4, 1);
  await driver.run(25, 0);
  assert.notEqual((await driver.battle()).page, after.page, 'The restored battle commands accept input');
  await driver.capture('battle-command-selected');
  return { passed: true, feature: 'battle-dialogue-hud', whitePixels: white, glyphPixels: lightInk, before, after };
}

/** Verify the presented dungeon HUD is restored after an authored line. */
export async function playDungeonDialogue(driver) {
  await driver.run(180, 0);
  assert.equal((await driver.state()).runtimeKind, 6, 'Start in the dungeon runtime');
  assert.equal(await driver.dialogue(), true, 'The dungeon opening dialogue is visible');
  await driver.capture('usina-dialogue-open');
  const pixels = await driver.frame();
  let white = 0, lightInk = 0;
  for (let y=120; y<144; y++) for (let x=16; x<224; x++) {
    const i=(y*240+x)*4, r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    if (r>240 && g>240 && b>240) white++;
    if (r>180 && g>165 && b>110) lightInk++;
  }
  assert.ok(white<1200, `Dungeon dialogue must not be a white block: ${white}`);
  assert.ok(lightInk>60, `Dungeon dialogue must contain visible glyphs: ${lightInk}`);
  for(let i=0;i<12 && await driver.dialogue();i++) {
    await driver.run(4,1); await driver.run(20,0);
  }
  assert.equal(await driver.dialogue(),false,'The dialogue closes through the controller');
  await driver.run(40,0);
  await driver.capture('usina-dialogue-closed');
  return {passed:true,feature:'dungeon-dialogue-hud',whitePixels:white,glyphPixels:lightInk};
}
