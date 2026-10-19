import { validateAudioSchemaCoverage } from '../../../../packages/project-contract/src/index.js';
import { normalizeAudioInProject } from '../shared/audioWorkspace.js';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildEngineExportProjectContract } from './exportEngineProject.js';
import { normalizeRacingSceneConfig, normalizeSceneRuntime } from '../shared/sceneTypeProfiles.js';
import { deriveHudPresetsWorkspacePresentation } from '../shared/hudPresets.js';
const sounds = { accelerate: 'corrida_motor', brake: 'corrida_freio', collision: 'corrida_impacto', checkpoint: 'corrida_checkpoint' };
describe('approved racing feedback authoring', () => {
    it('preserves optional sounds through config and sparse scene normalization', () => {
        expect(normalizeRacingSceneConfig({ actionSounds: sounds }).actionSounds).toEqual(sounds);
        expect((normalizeSceneRuntime('racing', { type: 'racing', config: { actionSounds: sounds } }) as any).config.actionSounds).toEqual(sounds);
    });
    it('exports only PSG sounds and preserves seven-pixel HUD text', () => {
        const p = JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project', 'utf8'));
        const audio = JSON.parse(readFileSync('fixtures/asset-provenance/racing-approved-manifest.json', 'utf8')).audioItems;
        p.audioItems.push(...audio.filter((a: any) => !p.audioItems.some((b: any) => b.id === a.id)));
        expect(validateAudioSchemaCoverage(p)).toEqual([]);
        expect((normalizeAudioInProject(p, 'corrida_motor').audioItems as any[]).find(a => a.id === 'corrida_motor').bpm).toBe(360);
        for (const rows of [p.rooms, p.scenas])
            rows.find((r: any) => r.name === 'circuito_final').runtime.config.actionSounds = structuredClone(sounds);
        const hud = { id: 'seven', name: 'Seven', mode: 'advanced', width: 240, height: 160, components: [{ id: 'time', kind: 'text', text: '0:00.0', x: 0, y: 0, width: 49, height: 8, pixelPosition: true, textAdvance: 7 }] };
        p.settings.hudPresets.push(hud);
        expect(deriveHudPresetsWorkspacePresentation(p).presets.find(h => h.id === 'seven')!.components[0].textAdvance).toBe(7);
        const c = buildEngineExportProjectContract(p), room = c.racing_project!.rooms.find(r => r.name === 'circuito_final')!;
        expect(Object.keys(room.action_sounds!)).toEqual(Object.keys(sounds));
        expect(Object.values(room.action_sounds!).every(i => Number.isInteger(i) && i >= 0)).toBe(true);
        for (const rows of [p.rooms, p.scenas])
            rows.find((r: any) => r.name === 'circuito_final').runtime.config.actionSounds.accelerate = 'corrida_circuito_dos_farois';
        expect(() => buildEngineExportProjectContract(p)).toThrow(/SFX PSG/);
    });
});
