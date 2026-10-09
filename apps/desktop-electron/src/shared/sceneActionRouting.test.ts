import { describe, expect, it, vi } from 'vitest';
import { SCENE_REVIEW_ACTION_IDS, eligibleSceneActions, suggestLocalSceneAction, executeSceneReviewAction } from './sceneActionRouting.js';
const scene = { name: 'Scene', sceneType: 'platformer', width: 30, height: 20 };
const data = { scenas: [scene] };

describe('scene action registry', () => {
  it('only exposes registered implemented actions; missing navigation leaves human choice', () => {
    expect(eligibleSceneActions(data, 'Scene', []).map(a => a.id)).toEqual(['pedir_detalhe', 'nenhuma']);
    expect(eligibleSceneActions(data, 'missing', SCENE_REVIEW_ACTION_IDS).map(a => a.id)).toEqual(['pedir_detalhe', 'nenhuma']);
    expect(eligibleSceneActions(data, 'Scene', [...SCENE_REVIEW_ACTION_IDS, 'compilar', 'gerar_sprite']).map(a => a.id)).not.toContain('compilar');
  });
  it('filters collision when the profile or dimensions do not allow editing', () => {
    expect(eligibleSceneActions(data, 'Scene', SCENE_REVIEW_ACTION_IDS).map(a => a.id)).toContain('revisar_colisao');
    expect(eligibleSceneActions({ scenas: [{ ...scene, width: 0 }] }, 'Scene', SCENE_REVIEW_ACTION_IDS).map(a => a.id)).not.toContain('revisar_colisao');
    expect(eligibleSceneActions({ scenas: [{ ...scene, sceneType: 'visualNovel' }] }, 'Scene', SCENE_REVIEW_ACTION_IDS).map(a => a.id)).not.toContain('revisar_colisao');
  });
  it('uses explicit incomplete state rather than interpreting a scene type as a full design', () => {
    expect(suggestLocalSceneAction({ declaredType: null, playerMissing: false, hudMissing: false, collisionMissing: false }, ['revisar_logica', 'pedir_detalhe', 'nenhuma'])).toBe('pedir_detalhe');
    expect(suggestLocalSceneAction({ declaredType: 'platformer', playerMissing: true, hudMissing: false, collisionMissing: false }, ['revisar_player', 'pedir_detalhe', 'nenhuma'])).toBe('revisar_player');
  });
  it('revalidates before executing, rejects missing/unknown actions and never mutates the project', () => {
    const navigate = vi.fn(); const before = JSON.stringify(data);
    const request = { action: 'revisar_colisao', sceneName: 'Scene' };
    expect(executeSceneReviewAction(data, request, navigate).status).toBe('opened');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(executeSceneReviewAction({ scenas: [] }, request, navigate).status).toBe('rejected');
    expect(executeSceneReviewAction(data, { ...request, action: 'compilar' }, navigate).status).toBe('rejected');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(data)).toBe(before);
  });
});
