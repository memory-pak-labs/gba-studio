import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { prepareCouncilDialogueV5, promoteApprovedCouncilDialogueV5 } from './council-dialogue-v5.mjs';

test('council stages two speakers without world actors and preserves the campaign choice', () => {
  const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
  const before = JSON.stringify(source);
  const result = prepareCouncilDialogueV5(source);
  assert.equal(JSON.stringify(source), before);
  const room = result.rooms.find(room => room.name === 'conselho_guardia');
  assert.equal(room.playerActorName, '');
  assert.equal(result.scenas.find(scene => scene.name === room.name).playerActorName, '');
  if (result.scena?.name === room.name) assert.equal(result.scena.playerActorName, '');
  assert.equal(result.actors.filter(actor => actor.roomName === room.name).length, 0);
  assert.equal(room.runtime.config.dialogueKey, 'conselho');
  const enter = result.events.find(event => event.name === room.eventBindings.onInit);
  assert.deepEqual(enter.steps.filter(step => step.command.startsWith('show_dialogue ')).map(step => step.command), ['show_dialogue conselho_nara']);
  assert(enter.steps.some(step => step.command === 'choice_event conselho 0 conselho_confirmar_alianca'));
  assert.deepEqual(result.events.find(event => event.name === 'conselho_confirmar_alianca'), source.events.find(event => event.name === 'conselho_confirmar_alianca'));
  assert.deepEqual(result.rooms.filter(room => room.name !== 'conselho_guardia'), source.rooms.filter(room => room.name !== 'conselho_guardia'));
  const nara = result.dialogues.find(dialogue => dialogue.key === 'conselho_nara');
  const guardian = result.dialogues.find(dialogue => dialogue.key === 'conselho');
  assert.equal(nara.portraitSlot, 'left');
  assert.equal(guardian.portraitSlot, 'right');
  assert.equal(nara.choices.length, 0);
  assert.equal(guardian.choices.length, 1);
  for (const name of [nara.portrait, guardian.portrait]) {
    const { metadata } = result.assets.find(asset => asset.name === name);
    assert.equal(metadata.width, 48);
    assert.equal(metadata.height, 48);
    assert.equal(metadata.frameWidth, 48);
    assert.equal(metadata.frameHeight, 48);
    const animation = result.animations.find(animation => animation.spriteSheet === name);
    assert.equal(animation.frameWidth, 48);
    assert.equal(animation.frameHeight, 48);
    assert.equal(animation.frameCount, 1);
  }
  for (const dialogue of [nara, guardian]) {
    assert(dialogue.translations['pt-BR']);
    assert(dialogue.translations.es);
    assert.notEqual(dialogue.translations.es, dialogue.translations['pt-BR']);
  }
  assert.deepEqual(prepareCouncilDialogueV5(result), result);
});

test('approved council promotion is idempotent and leaves other scenes intact', () => {
  const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
  const result = promoteApprovedCouncilDialogueV5(source);
  assert.deepEqual(promoteApprovedCouncilDialogueV5(result), result);
  assert.deepEqual(result.rooms.filter(room => room.name !== 'conselho_guardia'), source.rooms.filter(room => room.name !== 'conselho_guardia'));
  assert.deepEqual(result.scenas.filter(scene => scene.name !== 'conselho_guardia'), source.scenas.filter(scene => scene.name !== 'conselho_guardia'));
  assert.deepEqual(result.actors.filter(actor => actor.roomName !== 'conselho_guardia'), source.actors.filter(actor => actor.roomName !== 'conselho_guardia'));
  for (const name of ['council-v5-background.png', 'council-v5-nara.png', 'council-v5-guardian.png']) {
    const asset = result.assets.find(candidate => candidate.name === name);
    assert.equal(asset.metadata.reviewStatus, 'approved');
    assert.match(asset.metadata.preparedSha256, /^[a-f0-9]{64}$/);
  }
});
