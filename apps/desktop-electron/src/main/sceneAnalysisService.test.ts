import { describe, expect, it, vi } from 'vitest';
import { classificationOptions, priorityLevels, reviewOptions, type DecisionProvider } from '../shared/sceneAnalysis.js';
import { createSceneAnalysisService, JevDecisionProvider } from './sceneAnalysisService.js';
const request = { data: { scenas: [{ name: 'Scene', sceneType: 'platformer', width: 30, height: 20 }] }, sceneName: 'Scene', useJev: true };
function choice(options: Record<string, string>, selected: string, confidence = 0.9) {
  return { type: 'choice', choice: selected, confidence, probabilities: Object.fromEntries(Object.keys(options).map(k => [k, k === selected ? 1 : 0])) };
}
export function answer(confidence = 0.9) {
  return { model: 'jev-test', answers: { classification: choice(classificationOptions, 'platformer', confidence), review: choice(reviewOptions, 'player'), completeness: { type: 'noul', noul: 0.2 },
    priority: { type: 'score', score: 3, confidence: 0.9, probabilities: { 0: 0, 1: 0, 2: 0, 3: 1 }, legend: Object.fromEntries(priorityLevels.map((s, i) => [i, s])) } }, usage: { input_tokens: 42, output_tokens: 12 } };
}
describe('optional scene provider', () => {
  it('works offline and requires explicit consent for external calls', async () => {
    const evaluate = vi.fn().mockResolvedValue(answer());
    const analyze = createSceneAnalysisService({ provider: { evaluate } });
    expect((await analyze({ ...request, useJev: false })).source).toBe('local');
    expect(evaluate).not.toHaveBeenCalled();
    expect((await createSceneAnalysisService() (request)).audit.fallback).toBe('not-configured');
  });
  it.each(['invalid', 'unavailable', 'low-confidence', 'timeout'])('falls back for %s without changing the project', async reason => {
    const before = JSON.stringify(request);
    const provider: DecisionProvider = { evaluate: vi.fn(() => reason === 'timeout' ? new Promise(() => {}) : reason === 'unavailable' ? Promise.reject(new Error('secret response')) : Promise.resolve(reason === 'invalid' ? {} : answer(0.2))) };
    const result = await createSceneAnalysisService({ provider, timeoutMs: 10 })(request);
    expect(result.source).toBe('local');
    expect(result.notice).not.toContain('secret');
    expect(result.audit.fallback).toBeTruthy();
    expect(JSON.stringify(request)).toBe(before);
  });
  it('uses one call and validates independently typed answers', async () => {
    const evaluate = vi.fn().mockResolvedValue(answer());
    const result = await createSceneAnalysisService({ provider: { evaluate } })(request);
    expect(result.source).toBe('jev');
    expect(result.decision?.completeness).toBe(0.2);
    expect(result.audit.calls).toBe(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('sends only minimized facts, not names, paths or authored prose', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));
    const provider = new JevDecisionProvider('test-key', 'jev-1.13.0', fetcher);
    await createSceneAnalysisService({ provider })({ ...request, data: { scenas: [{ ...request.data.scenas[0], objective: 'private objective' }] } });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.state).not.toHaveProperty('sceneName');
    expect(JSON.stringify(body)).not.toContain('private objective');
    expect(body.questions.priority.type).toBe('score');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
  });
  it('checks missing files before querying the provider', async () => {
    const evaluate = vi.fn().mockResolvedValue(answer());
    const result = await createSceneAnalysisService({ provider: { evaluate } })({ ...request, projectPath: '/tmp/scene-analysis-test.gba-project',
      data: { ...request.data, scenas: [{ ...request.data.scenas[0], backgroundAssetName: 'missing.png' }], assets: [{ name: 'missing.png', metadata: { source: 'Assets/missing.png' } }] } });
    expect(result.diagnostics.some(d => d.code === 'analysis.fileMissing')).toBe(true);
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe('provider bounds', () => {
  it.each(['probability', 'choice', 'score', 'legend', 'confidence'])('rejects an invalid %s in a complete response', async field => {
    const response = answer();
    if (field === 'probability') response.answers.classification.probabilities.platformer = 2;
    if (field === 'choice') response.answers.classification.choice = 'execute-tool';
    if (field === 'score') response.answers.priority.score = 1;
    if (field === 'legend') response.answers.priority.legend['0'] = 'wrong rubric';
    if (field === 'confidence') response.answers.priority.confidence = NaN;
    const result = await createSceneAnalysisService({ provider: { evaluate: async () => response } })(request);
    expect(result.source).toBe('local');
    expect(result.audit.fallback).toBe('invalid-response');
  });
  it('limits calls and refuses concurrent provider evaluations', async () => {
    let resolve!: (value: unknown) => void;
    const evaluate = vi.fn(() => new Promise(r => { resolve = r; }));
    const analyze = createSceneAnalysisService({ provider: { evaluate }, maxCalls: 1 });
    const first = analyze(request);
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(1));
    expect((await analyze(request)).audit.fallback).toBe('busy');
    resolve(answer()); await first;
    expect((await analyze(request)).audit.fallback).toBe('call-limit');
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it('checks catalog references even for an unsaved project', async () => {
    const result = await createSceneAnalysisService()({ ...request, data: { scenas: [{ ...request.data.scenas[0], backgroundAssetName: 'unknown' }] } });
    expect(result.diagnostics.some(d => d.code === 'analysis.assetMissing')).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'analysis.filesUnchecked')).toBe(true);
  });
  it('rejects oversized and redirected responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(' '.repeat(65537)));
    const provider = new JevDecisionProvider('test-key', 'jev-1.13.0', fetcher);
    expect((await createSceneAnalysisService({ provider })(request)).source).toBe('local');
  });
});

describe('next action decisions', () => {
  const routed = { ...request, availableActions: ['revisar_player', 'revisar_colisao', 'abrir_editor_hud', 'revisar_camadas', 'revisar_logica'] };
  it('filters choices before the transport and never offers generation or compilation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(answer()), { status: 200 }));
    await createSceneAnalysisService({ provider: new JevDecisionProvider('test', 'jev-1.13.0', fetcher) })({ ...routed, availableActions: [...routed.availableActions, 'compilar'] });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.questions.nextAction.type).toBe('choice');
    expect(Object.keys(body.questions.nextAction.criteria)).toContain('revisar_colisao');
    expect(Object.keys(body.questions.nextAction.criteria)).not.toContain('compilar');
  });
  it.each(['unavailable-action', 'low-confidence', 'valid'])('keeps execution separate for %s', async mode => {
    const evaluate = vi.fn(async (_snapshot, _signal, routing) => {
      const criteria = Object.fromEntries(routing.eligible.map((a: { id: string; label: string }) => [a.id, a.label]));
      return { ...answer(), answers: { ...answer().answers, nextAction: choice(criteria, mode === 'unavailable-action' ? 'compilar' : 'revisar_colisao', mode === 'low-confidence' ? 0.1 : 0.9) } };
    });
    const before = JSON.stringify(routed);
    const result = await createSceneAnalysisService({ provider: { evaluate } })(routed);
    expect(result.routing.suggested).toBe(mode === 'valid' ? 'revisar_colisao' : 'revisar_player');
    expect(result.routing.source).toBe(mode === 'valid' ? 'jev' : 'local');
    expect(JSON.stringify(routed)).toBe(before);
  });
});
