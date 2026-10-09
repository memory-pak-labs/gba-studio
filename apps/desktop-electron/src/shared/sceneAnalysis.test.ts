import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGBAProjectFile } from './projectFile.js';
import { SCENE_TYPE_OPTIONS } from './sceneTypes.js';
import { analyzeSceneLocally, buildSceneSnapshot, sceneDecisionQuestions, validateSceneDecision } from './sceneAnalysis.js';

describe('scene analysis boundary', () => {
  it('never invents a type, objective or observed camera for missing data', () => {
    const data = { scenas: [{ name: 'Empty', width: 30, height: 20 }] };
    const result = analyzeSceneLocally(data, 'Empty');
    expect(result.snapshot.facts.declaredType).toBeNull();
    expect(result.snapshot.facts.cameraMode).toBeNull();
    expect(result.snapshot.descriptions.objective).toBeNull();
    expect(result.classification).toBe('insufficient');
    expect(() => buildSceneSnapshot(data, 'missing')).toThrow();
  });
  it.each(SCENE_TYPE_OPTIONS)('preserves $id without manufacturing confidence', ({ id }) => {
    const data = { scenas: [{ name: 'Scene', sceneType: id, width: 30, height: 20 }] };
    const before = JSON.stringify(data);
    const result = analyzeSceneLocally(data, 'Scene');
    expect(result.classification).toBe(id);
    expect(result.decision).toBeNull();
    expect(JSON.stringify(data)).toBe(before);
  });
  it('keeps hybrid profiles explicit and reports invalid dimensions before AI', () => {
    const result = analyzeSceneLocally({ scenas: [{ name: 'Hybrid', sceneType: 'custom', width: -1, height: 20,
      runtime: { type: 'custom', config: { preflightProfile: 'hybrid' } } }] }, 'Hybrid');
    expect(result.classification).toBe('hybrid');
    expect(result.diagnostics.some(d => d.code === 'analysis.dimensions')).toBe(true);
  });
  it('minimizes remote facts and separates free descriptions', () => {
    const snapshot = buildSceneSnapshot({ scenas: [{ name: 'private-name', width: 30, height: 20,
      objective: 'private objective', notes: 'secret', runtime: { type: 'platformer', config: { gravity: 1, apiKey: 'secret' } } }],
      actors: [{ roomName: 'private-name', name: 'private actor', spriteSheet: '/private/path' }] }, 'private-name');
    expect(JSON.stringify(snapshot.facts)).not.toMatch(/private|secret|apiKey/);
    expect(snapshot.descriptions.objective).toBe('private objective');
  });
  it('evaluates real canonical scenes without changing project data', () => {
    const parsed = parseGBAProjectFile(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project', 'utf8'));
    const before = JSON.stringify(parsed.data);
    const scenes = parsed.data.scenas as Array<{ name: string }>;
    for (const scene of scenes) {
      const result = analyzeSceneLocally(parsed.data, scene.name);
      expect(sceneDecisionQuestions.classification.criteria).toHaveProperty(result.classification);
    }
    expect(JSON.stringify(parsed.data)).toBe(before);
  });
  it('rejects malformed answers and out of range probabilities', () => {
    expect(() => validateSceneDecision({})).toThrow();
    expect(() => validateSceneDecision({ model: 'jev', answers: { completeness: { type: 'noul', noul: 2 } } })).toThrow();
  });
});
