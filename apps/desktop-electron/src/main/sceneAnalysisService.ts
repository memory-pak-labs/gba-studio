import { sceneActionQuestion, type SceneActionID, type SceneActionRouting } from '../shared/sceneActionRouting.js';
import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeSceneLocally, findAnalysisScene, record, records, sceneDecisionQuestions, validateSceneDecision,
  type AnalyzeSceneRequest, type DecisionProvider, type SceneAnalysisResult, type SceneSnapshot
} from '../shared/sceneAnalysis.js';

// This module is main-process only. No credential, raw response or authored text is logged.
export class JevDecisionProvider implements DecisionProvider {
  constructor(private readonly apiKey: string, private readonly model = 'jev-1.13.0', private readonly fetcher: typeof fetch = fetch) {}
  async evaluate(snapshot: SceneSnapshot, signal: AbortSignal, routing?: SceneActionRouting): Promise<unknown> {
    const response = await this.fetcher('https://api.typesafe.ai/v1/systemone', {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, state: remoteSceneState(snapshot), questions: { ...sceneDecisionQuestions, ...(routing ? { nextAction: sceneActionQuestion(routing.eligible) } : {}) } })
    });
    if (!response.ok) throw new Error('unavailable');
    // Stream with a hard cap, including when Content-Length is absent.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('invalid-response');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) throw new Error('invalid-response');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
}
export function remoteSceneState(snapshot: SceneSnapshot) {
  return { schema: snapshot.schema, facts: snapshot.facts, profileExpectations: snapshot.profileExpectations,
    descriptions: { objectiveProvidedLocally: snapshot.descriptions.objective !== null, textOmitted: true } };
}
const referenceKeys = new Set(['backgroundAssetName', 'backgroundAsset', 'tilesetAssetName', 'spriteSheet', 'hudAssetName', 'hudAsset', 'assetName', 'fontAssetName']);
function references(value: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (depth > 16) return found;
  if (Array.isArray(value)) { for (const item of value) references(item, found, depth + 1); }
  else for (const [key, item] of Object.entries(record(value))) {
    if (referenceKeys.has(key) && typeof item === 'string' && item) found.add(item);
    else if (item && typeof item === 'object') references(item, found, depth + 1);
  }
  return found;
}
async function checkSceneFiles(request: AnalyzeSceneRequest, result: SceneAnalysisResult) {
  if (!request.projectPath) {
    result.diagnostics.push({ code: 'analysis.filesUnchecked', severity: 'info', message: 'Salve o projeto para verificar a existência dos arquivos vinculados.' });
  }
  const scene = findAnalysisScene(request.data, request.sceneName);
  const refs = references(scene);
  for (const actor of records(request.data.actors).filter(a => [a.roomName, a.sceneName, a.room].includes(request.sceneName))) references(actor, refs);
  const root = request.projectPath ? path.resolve(path.dirname(request.projectPath)) : null;
  for (const ref of refs) {
    const asset = records(request.data.assets).find(a => a.name === ref || a.id === ref);
    if (!asset) {
      result.diagnostics.push({ code: 'analysis.assetMissing', severity: 'error', message: `Referência sem asset no catálogo: ${ref}` });
      continue;
    }
    const source = record(asset.metadata).source;
    if (typeof source !== 'string' || !source) {
      result.diagnostics.push({ code: 'analysis.sourceUnchecked', severity: 'warning', message: `Asset sem arquivo fonte verificável: ${ref}` });
      continue;
    }
    if (!root) continue;
    const resolved = path.resolve(root, source);
    let exists = false;
    try {
      const relative = path.relative(root, resolved);
      if (!path.isAbsolute(source) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`)) {
        const actualRoot = await realpath(root), actualFile = await realpath(resolved);
        exists = actualFile.startsWith(`${actualRoot}${path.sep}`) && (await stat(actualFile)).isFile();
      }
    } catch { /* Missing/unreadable file remains an objective local diagnostic. */ }
    if (!exists) result.diagnostics.push({ code: 'analysis.fileMissing', severity: 'error', message: `Arquivo ausente, inacessível ou fora do projeto: ${ref}` });
  }
}
export function createSceneAnalysisService(options: { provider?: DecisionProvider; timeoutMs?: number; maxCalls?: number } = {}) {
  let calls = 0, pending = false;
  return async (request: AnalyzeSceneRequest): Promise<SceneAnalysisResult> => {
    if (!request || typeof request.sceneName !== 'string' || request.sceneName.length > 512 || !request.data || Array.isArray(request.data)
      || typeof request.data !== 'object' || (request.projectPath !== undefined && typeof request.projectPath !== 'string')
      || (request.availableActions !== undefined && (!Array.isArray(request.availableActions) || request.availableActions.length > 20 || request.availableActions.some(a => typeof a !== 'string' || a.length > 64)))
      || (request.useJev !== undefined && typeof request.useJev !== 'boolean') || JSON.stringify(request.data).length > 32 * 1024 * 1024) throw new Error('Solicitação de análise inválida.');
    const start = Date.now();
    const result = analyzeSceneLocally(request.data, request.sceneName, request.availableActions);
    await checkSceneFiles(request, result);
    result.audit.stateId = createHash('sha256').update(JSON.stringify({ state: remoteSceneState(result.snapshot), eligibleActions: result.routing.eligible.map(a => a.id) })).digest('hex').slice(0, 16);
    const finish = () => { result.audit.elapsedMs = Date.now() - start; return result; };
    if (!request.useJev) return finish();
    const fallback = !options.provider ? 'not-configured' : pending ? 'busy' : calls >= (options.maxCalls ?? 20) ? 'call-limit'
      : result.diagnostics.some(d => d.code.startsWith('analysis.') && d.severity === 'error') ? 'local-errors' : null;
    if (fallback) {
      result.audit.fallback = fallback;
      const reasons = {
        'not-configured': 'Jev não configurado neste aplicativo.',
        busy: 'Já existe uma consulta ao Jev em andamento.',
        'call-limit': 'O limite de consultas desta sessão foi atingido.',
        'local-errors': 'Corrija os erros locais antes de consultar o Jev.'
      };
      result.notice = `${reasons[fallback]} Análise local mantida; nenhum dado enviado ao Jev.`;
      return finish();
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    pending = true; calls++; result.audit.calls = 1;
    try {
      const raw = await Promise.race([
        options.provider!.evaluate(result.snapshot, controller.signal, request.availableActions === undefined ? undefined : result.routing),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, options.timeoutMs ?? 8000); })
      ]);
      const decision = validateSceneDecision(raw, request.availableActions === undefined ? undefined : result.routing);
      result.decision = decision;
      if ([decision.classification.confidence, decision.review.confidence, decision.priority.confidence, decision.nextAction?.confidence ?? 1].some(c => c < 0.65) || decision.classification.choice === 'insufficient') {
        result.audit.fallback = 'low-confidence';
        result.notice = 'Jev retornou incerteza. Proposta local mantida; revise as probabilidades antes de decidir.';
      } else {
        if (decision.nextAction) result.routing = { ...result.routing, suggested: decision.nextAction.choice as SceneActionID, source: 'jev' };
        result.source = 'jev'; result.classification = decision.classification.choice;
        result.notice = 'Sugestão Jev recebida. Os diagnósticos locais continuam válidos e a cena não foi alterada.';
      }
    } catch (error) {
      result.audit.fallback = controller.signal.aborted ? 'timeout' : error instanceof Error && error.message === 'invalid-response' ? 'invalid-response' : 'unavailable';
      result.notice = 'Jev indisponível ou resposta inválida. Análise local mantida; tente novamente se necessário.';
    } finally { clearTimeout(timer); controller.abort(); pending = false; }
    return finish();
  };
}
