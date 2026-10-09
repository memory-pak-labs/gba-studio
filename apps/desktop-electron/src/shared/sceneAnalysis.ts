import { eligibleSceneActions, suggestLocalSceneAction, type SceneActionRouting } from './sceneActionRouting.js';
import type { GBAProjectData } from './projectFile.js';
import { deriveProjectHealthReport } from './projectHealth.js';
import { buildScenePreflightReport } from './scenePreflight.js';
import { deriveScenePhysicalDiagnostics } from './scenePhysicalDiagnostics.js';
import { SCENE_TYPE_OPTIONS, normalizeSceneTypeId } from './sceneTypes.js';

export const SCENE_ANALYSIS_VERSION = 2;
export const classificationOptions: Record<string, string> = { ...Object.fromEntries(SCENE_TYPE_OPTIONS.map(o => [o.id, o.label])), hybrid: 'Cena híbrida com mais de uma regra principal', insufficient: 'Dados insuficientes para escolher' };
export const reviewOptions = { player: 'Player', hud: 'HUD', collision: 'Colisão', layers: 'Camadas', logic: 'Lógica', none: 'Nenhum' };
export const priorityLevels = ['0: sem pendências observadas', '1: revisão opcional', '2: especificação incompleta', '3: bloqueio objetivo ou incompatibilidade'];
export const sceneDecisionQuestions = {
  classification: { type: 'choice', instructions: 'Qual é o tipo principal desta cena? Use fatos observados; requisitos de perfil não são fatos. Use hybrid para regras combinadas, insufficient se faltam dados.', criteria: classificationOptions },
  review: { type: 'choice', instructions: 'Qual componente mais precisa de revisão independente da classificação?', criteria: reviewOptions },
  completeness: { type: 'noul', instructions: 'A especificação desta cena fornece objetivo, configuração e dependências suficientes para implementação? Descrições são intenção, não prova.' },
  priority: { type: 'score', instructions: 'Qual a prioridade de revisão desta cena segundo as pendências?', criteria: priorityLevels }
};
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(v => v !== null && typeof v === 'object' && !Array.isArray(v)) : [];
}
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;
const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const count = (v: unknown): number | null => Array.isArray(v) ? v.length : null;
export function findAnalysisScene(data: GBAProjectData, sceneName: string): Record<string, unknown> {
  const scenes = records(data.scenas).length ? records(data.scenas) : records(data.rooms);
  const scene = scenes.find(s => s.name === sceneName);
  if (!scene) throw new Error('Cena não encontrada. Atualize a análise.');
  return scene;
}
function rules(config: Record<string, unknown>): Record<string, number | boolean> {
  return Object.fromEntries(['gravity', 'jumpSpeed', 'walkSpeed', 'playerSpeed', 'fireCooldown', 'scrollSpeed', 'laps', 'autoAdvance', 'stepDurationFrames', 'navigable', 'turnBased'].flatMap(key => {
    const value = config[key];
    return typeof value === 'boolean' || finite(value) !== null ? [[key, value as number | boolean]] : [];
  }));
}
export function buildSceneSnapshot(data: GBAProjectData, sceneName: string) {
  const scene = findAnalysisScene(data, sceneName);
  const runtime = record(scene.runtime);
  const config = record(runtime.config ?? scene.config);
  const preflight = buildScenePreflightReport(data, sceneName);
  const physical = deriveScenePhysicalDiagnostics(data, sceneName);
  const declared = text(scene.sceneType) ?? text(scene.type) ?? text(runtime.type);
  return {
    schema: SCENE_ANALYSIS_VERSION,
    // Local identity and authored prose are never included in the remote payload by default.
    sceneName,
    facts: {
      declaredType: declared ? normalizeSceneTypeId(declared, 'insufficient') : null,
      runtimeType: text(runtime.type) ? normalizeSceneTypeId(text(runtime.type), 'insufficient') : null,
      widthTiles: finite(scene.width), heightTiles: finite(scene.height),
      cameraMode: ['fixed_center', 'follow_player', 'fixed', 'follow', 'side_scroll', 'step', 'pointer', 'sequence'].includes(String(scene.cameraMode)) ? scene.cameraMode as string : null,
      tileCount: count(scene.tilemap),
      tileLayerCount: count(scene.tileLayers),
      actors: { count: preflight.actors.count, playerPresent: preflight.player.present },
      hudPresent: preflight.hud.present,
      triggerCount: preflight.events.triggerCount,
      collision: { declared: preflight.collision.declared, actualCellCount: preflight.collision.actualCellCount, expectedCellCount: preflight.collision.expectedCellCount },
      metatilesDeclared: Object.keys(record(config.metatiles)).length > 0,
      audio: { musicDeclared: preflight.audio.musicReference !== null, sfxCount: preflight.audio.sfxCount },
      gameplayRules: rules(config),
      eventCount: preflight.events.declaredCount,
      preflightIssues: preflight.issues.map(({ code, severity }) => ({ code, severity })),
      physical: physical.metrics.map(({ id, estimate, planned, measured, safeLimit, criticalOverflow }) => ({ id, estimate, planned, measured, safeLimit, criticalOverflow }))
    },
    profileExpectations: {
      source: 'profile' as const, profileId: preflight.profileId,
      projection: preflight.perspective.projection, camera: preflight.camera.mode,
      layers: preflight.layers.map(({ role, required, present }) => ({ role, required, present })),
      playerRequired: preflight.player.required, hudRequired: preflight.hud.required
    },
    descriptions: { objective: text(scene.objective) ?? text(config.objective) }
  };
}
export type SceneSnapshot = ReturnType<typeof buildSceneSnapshot>;
export interface SceneAnalysisDiagnostic { code: string; severity: 'info' | 'warning' | 'error'; message: string }
export interface SceneDecision {
  nextAction?: { choice: string; confidence: number; probabilities: Record<string, number> };
  model: string;
  classification: { choice: string; confidence: number; probabilities: Record<string, number> };
  review: { choice: string; confidence: number; probabilities: Record<string, number> };
  completeness: number;
  priority: { score: number; confidence: number; probabilities: Record<string, number> };
  usage: { input_tokens: number; output_tokens: number } | null;
}
export interface SceneAnalysisResult {
  routing: SceneActionRouting;
  snapshot: SceneSnapshot;
  classification: string;
  diagnostics: SceneAnalysisDiagnostic[];
  existing: string[];
  gaps: string[];
  nextSteps: string[];
  source: 'local' | 'jev';
  decision: SceneDecision | null;
  notice: string;
  audit: { questionsVersion: number; elapsedMs: number; calls: number; stateId?: string; fallback?: string };
}
export interface AnalyzeSceneRequest { data: GBAProjectData; sceneName: string; projectPath?: string; useJev?: boolean; availableActions?: string[] }
export interface DecisionProvider { evaluate(snapshot: SceneSnapshot, signal: AbortSignal, routing?: SceneActionRouting): Promise<unknown> }
export function analyzeSceneLocally(data: GBAProjectData, sceneName: string, availableActions: readonly string[] = []): SceneAnalysisResult {
  const snapshot = buildSceneSnapshot(data, sceneName);
  const preflight = buildScenePreflightReport(data, sceneName);
  const diagnostics: SceneAnalysisDiagnostic[] = deriveProjectHealthReport(data).diagnostics
    .filter(d => d.sceneName === sceneName || d.scope === 'project').map(({ code, severity, message }) => ({ code, severity, message }));
  diagnostics.push(...preflight.issues.map(({ code, severity, message }) => ({ code, severity, message })));
  if (![snapshot.facts.widthTiles, snapshot.facts.heightTiles].every(v => v !== null && Number.isSafeInteger(v) && v > 0)) {
    diagnostics.push({ code: 'analysis.dimensions', severity: 'error', message: 'Largura e altura devem ser inteiros positivos em tiles.' });
  }
  if (snapshot.facts.runtimeType && snapshot.facts.declaredType && snapshot.facts.runtimeType !== snapshot.facts.declaredType) {
    diagnostics.push({ code: 'analysis.typeConflict', severity: 'error', message: 'O tipo declarado difere do tipo de runtime.' });
  }
  const existing = [
    `${snapshot.facts.actors.count} atores`, `${snapshot.facts.eventCount} eventos`,
    ...(snapshot.facts.actors.playerPresent ? ['Player'] : []), ...(snapshot.facts.hudPresent ? ['HUD'] : []),
    ...(snapshot.facts.collision.declared ? ['Grade de colisão'] : []),
    ...preflight.layers.filter(l => l.present).map(l => l.label)
  ];
  const gaps = preflight.checklist.filter(c => c.state !== 'complete').map(c => c.detail);
  if (!snapshot.descriptions.objective) gaps.unshift('Objetivo não declarado em campo próprio.');
  const classification = snapshot.profileExpectations.profileId === 'hybrid' ? 'hybrid' : snapshot.facts.declaredType ?? 'insufficient';
  const eligible = eligibleSceneActions(data, sceneName, availableActions);
  const suggested = suggestLocalSceneAction({ declaredType: snapshot.facts.declaredType,
    playerMissing: preflight.player.required && !preflight.player.present,
    hudMissing: preflight.hud.required && !preflight.hud.present,
    collisionMissing: preflight.collision.required && (!preflight.collision.declared || preflight.collision.coverage < 1)
  }, eligible.map(a => a.id));
  return { snapshot, classification, diagnostics, existing, gaps, routing: { eligible, suggested, source: 'local' },
    nextSteps: [...new Set(preflight.issues.flatMap(i => i.resolution ? [i.resolution] : [])), 'Revisar a proposta e configurar alterações no Editor.'],
    source: 'local', decision: null, notice: 'Análise local: tipo declarado, sem confiança estatística. Nenhum dado enviado.',
    audit: { questionsVersion: SCENE_ANALYSIS_VERSION, elapsedMs: 0, calls: 0 } };
}
function probability(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1; }
function distribution(v: unknown, keys: string[]): Record<string, number> {
  const p = record(v);
  if (Object.keys(p).length !== keys.length || !keys.every(k => probability(p[k])) || Math.abs(Object.values(p).reduce<number>((a, b) => a + Number(b), 0) - 1) > 0.01) throw new Error('invalid-response');
  return p as Record<string, number>;
}
export function validateSceneDecision(value: unknown, routing?: SceneActionRouting): SceneDecision {
  const response = record(value), answers = record(response.answers);
  function choice(key: string, options: Record<string, string>) {
    const a = record(answers[key]);
    if (a.type !== 'choice' || typeof a.choice !== 'string' || !Object.hasOwn(options, a.choice) || !probability(a.confidence)) throw new Error('invalid-response');
    const probabilities = distribution(a.probabilities, Object.keys(options));
    if (Object.values(probabilities).some(p => p > probabilities[a.choice as string] + 0.0001)) throw new Error('invalid-response');
    return { choice: a.choice, confidence: a.confidence, probabilities };
  }
  const priority = record(answers.priority), completeness = record(answers.completeness);
  if (!text(response.model) || String(response.model).length > 100 || completeness.type !== 'noul' || !probability(completeness.noul)
    || priority.type !== 'score' || finite(priority.score) === null || Number(priority.score) < 0 || Number(priority.score) > 3 || !probability(priority.confidence)) throw new Error('invalid-response');
  const probabilities = distribution(priority.probabilities, ['0', '1', '2', '3']);
  if (Math.abs(Object.entries(probabilities).reduce((sum, [key, p]) => sum + Number(key) * p, 0) - Number(priority.score)) > 0.02) throw new Error('invalid-response');
  const legend = record(priority.legend);
  if (!priorityLevels.every((label, i) => legend[String(i)] === label)) throw new Error('invalid-response');
  const usage = record(response.usage);
  return { ...(routing ? { nextAction: choice('nextAction', Object.fromEntries(routing.eligible.map(a => [a.id, a.label]))) } : {}), model: String(response.model), classification: choice('classification', classificationOptions), review: choice('review', reviewOptions),
    completeness: completeness.noul, priority: { score: Number(priority.score), confidence: priority.confidence, probabilities },
    usage: ['input_tokens', 'output_tokens'].every(k => Number.isSafeInteger(usage[k]) && Number(usage[k]) >= 0)
      ? { input_tokens: Number(usage.input_tokens), output_tokens: Number(usage.output_tokens) } : null };
}
