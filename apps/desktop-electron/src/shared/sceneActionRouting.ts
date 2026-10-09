import type { GBAProjectData } from './projectFile.js';
import type { RoomInspectorTabID } from './roomInspectorTabs.js';
import { buildScenePreflightReport } from './scenePreflight.js';
import { sceneTypeProfile } from './sceneTypeProfiles.js';

export const SCENE_REVIEW_ACTION_IDS = ['revisar_player', 'revisar_colisao', 'abrir_editor_hud', 'revisar_camadas', 'revisar_logica'] as const;
export type SceneReviewActionID = typeof SCENE_REVIEW_ACTION_IDS[number];
export type SceneActionID = SceneReviewActionID | 'pedir_detalhe' | 'nenhuma';
export interface SceneActionDefinition {
  id: SceneActionID;
  label: string;
  precondition: string;
  permission: 'navigate' | 'local_decision';
  effect: string;
  changesFiles: false;
  inspectorTab?: RoomInspectorTabID;
}
export const SCENE_ACTION_REGISTRY: readonly SceneActionDefinition[] = [
  { id: 'revisar_player', label: 'Revisar player', precondition: 'Cena existente com player requerido ou presente e navegação disponível.', permission: 'navigate', effect: 'Seleciona a cena e abre sua configuração de jogador.', changesFiles: false, inspectorTab: 'scene' },
  { id: 'revisar_colisao', label: 'Revisar colisão', precondition: 'Cena existente, dimensões válidas, ferramenta de colisão permitida pelo perfil e navegação disponível.', permission: 'navigate', effect: 'Seleciona a cena e abre a ferramenta de colisão, sem pintar células.', changesFiles: false, inspectorTab: 'collision' },
  { id: 'abrir_editor_hud', label: 'Abrir editor de HUD', precondition: 'Cena existente e navegação disponível.', permission: 'navigate', effect: 'Seleciona a cena e abre a aba HUDs; não cria componentes.', changesFiles: false, inspectorTab: 'hud' },
  { id: 'revisar_camadas', label: 'Revisar fundo e camadas', precondition: 'Cena existente e navegação disponível.', permission: 'navigate', effect: 'Seleciona a cena e abre a aba Fundo.', changesFiles: false, inspectorTab: 'background' },
  { id: 'revisar_logica', label: 'Revisar eventos', precondition: 'Cena existente e navegação disponível.', permission: 'navigate', effect: 'Seleciona a cena e abre a aba Eventos, sem criar scripts.', changesFiles: false, inspectorTab: 'events' },
  { id: 'pedir_detalhe', label: 'Escolher o próximo passo', precondition: 'Sempre disponível para revisão humana.', permission: 'local_decision', effect: 'Solicita uma escolha explícita entre as ferramentas disponíveis.', changesFiles: false },
  { id: 'nenhuma', label: 'Não abrir ferramenta', precondition: 'Sempre disponível.', permission: 'local_decision', effect: 'Mantém a análise aberta sem executar uma ação.', changesFiles: false }
];
function scenes(data: GBAProjectData): Record<string, unknown>[] {
  const valid = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object' && !Array.isArray(v)) : [];
  const primary = valid(data.scenas);
  return primary.length ? primary : valid(data.rooms);
}
export function eligibleSceneActions(data: GBAProjectData, sceneName: string, available: readonly string[]): SceneActionDefinition[] {
  const scene = scenes(data).find(s => s.name === sceneName);
  const report = scene ? buildScenePreflightReport(data, sceneName) : null;
  const dimensionsValid = scene && [scene.width, scene.height].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0);
  return SCENE_ACTION_REGISTRY.filter(action => {
    if (action.permission === 'local_decision') return true;
    if (!scene || !report || !available.includes(action.id)) return false;
    if (action.id === 'revisar_player') return report.player.required || report.player.present;
    if (action.id === 'revisar_colisao') return Boolean(dimensionsValid && (report.collision.required || report.collision.declared) && sceneTypeProfile(report.sceneType).editorTools.includes('collision'));
    return true;
  });
}
export interface SceneActionRouting {
  eligible: SceneActionDefinition[];
  suggested: SceneActionID;
  source: 'local' | 'jev';
}
export function suggestLocalSceneAction(facts: { declaredType: string | null; playerMissing: boolean; hudMissing: boolean; collisionMissing: boolean }, eligible: readonly string[]): SceneActionID {
  if (!facts.declaredType || facts.declaredType === 'insufficient') return 'pedir_detalhe';
  const candidates: SceneActionID[] = [];
  if (facts.playerMissing) candidates.push('revisar_player');
  if (facts.collisionMissing) candidates.push('revisar_colisao');
  if (facts.hudMissing) candidates.push('abrir_editor_hud');
  return candidates.find(id => eligible.includes(id)) ?? 'pedir_detalhe';
}
export function sceneActionQuestion(eligible: readonly SceneActionDefinition[]) {
  return {
    type: 'choice',
    instructions: 'Qual é a próxima ferramenta útil para revisar esta cena? Escolha apenas entre as opções oferecidas. A sugestão nunca executa a ação. Use pedir_detalhe quando faltarem dados; nenhuma quando não houver revisão útil.',
    criteria: Object.fromEntries(eligible.map(action => [action.id, `${action.label}. ${action.effect}`]))
  };
}
export interface SceneActionRequest { sceneName: string; action: string }
export interface SceneActionOutcome { status: 'opened' | 'rejected' | 'failed'; message: string }
export interface SceneActionAuditEntry extends SceneActionRequest, SceneActionOutcome { timestamp: string }
export type SceneActionHandler = (request: SceneActionRequest) => SceneActionOutcome;
export function executeSceneReviewAction(data: GBAProjectData, request: SceneActionRequest,
  navigate: (target: { sceneName: string; inspectorTab: RoomInspectorTabID }) => void): SceneActionOutcome {
  const action = eligibleSceneActions(data, request.sceneName, SCENE_REVIEW_ACTION_IDS).find(a => a.id === request.action && a.permission === 'navigate');
  if (!action?.inspectorTab) return { status: 'rejected', message: 'Esta ferramenta não está disponível para a cena atual. Analise novamente.' };
  try {
    navigate({ sceneName: request.sceneName, inspectorTab: action.inspectorTab });
    return { status: 'opened', message: `${action.label}: ${request.sceneName}.` };
  } catch {
    return { status: 'failed', message: 'Não foi possível abrir a ferramenta. A ação não foi repetida.' };
  }
}
