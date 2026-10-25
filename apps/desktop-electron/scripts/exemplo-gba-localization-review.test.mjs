import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reviewExemploLocalization, reviewedPortuguese } from './exemplo-gba-localization-review.mjs';

const canonical = () => JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
describe('canonical dialogue localization review', () => {
  it('makes the English source explicit and keeps complete Portuguese/Spanish text and choices', () => {
    const result = reviewExemploLocalization(canonical());
    expect(result.localization.sourceLocale).toBe('en');
    for (const d of result.dialogues) {
      for (const locale of ['en', 'pt-BR', 'es']) {
        expect(d.translations[locale]?.trim(), `${d.key}/${locale}`).toBeTruthy();
        expect(d.choiceTranslations?.[locale] ?? [], `${d.key}/${locale} choices`).toHaveLength(d.choices?.length ?? 0);
      }
      expect(d.text).toBe(d.translations.en);
    }
    expect(result.dialogues.find(d => d.key === 'prologo_frame_1')).toMatchObject({
      text: 'The coastal lighthouses go dark one by one. The last beam still cuts across the pier.',
      translations: { es: 'Los faros de la costa se apagan uno a uno. El último haz de luz aún cruza el muelle.' }
    });
    expect(result.dialogues.find(d => d.key === 'ingame-item-frame')).toMatchObject({
      text: 'Airship frame obtained in Lumen Port. OK: obtained. NO: not yet obtained.',
      translations: { 'pt-BR': reviewedPortuguese['ingame-item-frame'], es: 'Estructura de la aeronave obtenida en el Puerto de Lumen. OK: obtenida. NO: aún falta.' }
    });
  });
  it('preserves Portuguese story, portraits, event identifiers and all other work; remains idempotent', () => {
    const before = canonical(), result = reviewExemploLocalization(before);
    expect(before).toEqual(canonical());
    for (const d of before.dialogues) {
      const revised = result.dialogues.find(x => x.key === d.key);
      expect(revised.translations['pt-BR']).toBe(reviewedPortuguese[d.key] ?? d.translations['pt-BR']);
      expect(revised.character).toBe(d.character);
      expect(revised.portrait).toBe(d.portrait);
    }
    const { dialogues: _before, ...rest } = before;
    const { dialogues: _after, ...other } = result;
    expect(other).toEqual(rest);
    expect(reviewExemploLocalization(result)).toEqual(result);
  });
  it('does not silently mark new translations as human approved', () => {
    const result = reviewExemploLocalization(canonical());
    expect(result.dialogues.find(d => d.key === 'prologo_frame_1').translationStatus.es).toBe('draft-ai');
  });
});
