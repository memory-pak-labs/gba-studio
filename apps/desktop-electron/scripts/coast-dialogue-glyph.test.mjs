import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { unsupportedDialogueCharacters } from '../src/shared/dialogueFont.ts';
import { deepenExampleCampaign } from './coast-depth-project.mjs';

const project = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));

function checkValveDialogue(data) {
  const dialogue = data.dialogues.find(item => item.key === 'coast_usina_order');
  expect(dialogue).toBeDefined();
  for (const [locale, value] of Object.entries({ source: dialogue.text, ...dialogue.translations })) {
    expect(unsupportedDialogueCharacters(value), locale).toEqual([]);
  }
  expect(dialogue.text).toMatch(/INTAKE.*TURBINE.*OUTPUT/);
  expect(dialogue.translations.en).toBe(dialogue.text);
  expect(dialogue.translations['pt-BR']).toMatch(/ADMISSÃO.*TURBINA.*SAÍDA/);
  expect(dialogue.translations.es).toMatch(/ADMISIÓN.*TURBINA.*SALIDA/);
}

describe('power station valve instructions', () => {
  it('uses supported glyphs and preserves the valve sequence in every locale', () => {
    checkValveDialogue(project());
  });

  it('keeps those instructions compatible when the coastal campaign is regenerated', () => {
    const before = project();
    const assets = before.assets.filter(asset => asset.id?.startsWith('coast-'));
    before.events = before.events.filter(event => event.name !== 'coast_port_clock_tick');
    checkValveDialogue(deepenExampleCampaign(before, { assets }));
  });
});
