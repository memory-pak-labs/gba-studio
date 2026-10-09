/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeSceneLocally } from '../shared/sceneAnalysis.js';
import { SCENE_REVIEW_ACTION_IDS } from '../shared/sceneActionRouting.js';
import { SceneActionPanel } from './SceneActionPanel.js';
const data = { scenas: [{ name: 'Scene', sceneType: 'platformer', width: 30, height: 20 }] };
const result = analyzeSceneLocally(data, 'Scene', SCENE_REVIEW_ACTION_IDS);
afterEach(cleanup);
describe('scene next action confirmation', () => {
  it('does not execute a suggestion until explicitly requested and allows a different choice', async () => {
    const onOpenAction = vi.fn(() => ({ status: 'opened' as const, message: 'HUD aberto.' }));
    render(<SceneActionPanel data={data} sceneName="Scene" result={result} onOpenAction={onOpenAction} />);
    expect(onOpenAction).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Próxima ferramenta'), 'abrir_editor_hud');
    await user.click(screen.getByRole('button', { name: 'Abrir ferramenta' }));
    expect(onOpenAction).toHaveBeenCalledWith({ sceneName: 'Scene', action: 'abrir_editor_hud' });
    expect(screen.getByRole('status').textContent).toBe('HUD aberto.');
  });
  it('asks for human input when navigation is absent, without offering impossible tools', async () => {
    render(<SceneActionPanel data={data} sceneName="Scene" result={result} />);
    expect(screen.queryByRole('option', { name: 'Revisar player' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Escolha');
    expect(screen.queryByRole('button', { name: 'Abrir ferramenta' })).toBeNull();
  });
  it('removes an action when current scene prerequisites change', () => {
    const handler = vi.fn();
    const view = render(<SceneActionPanel data={data} sceneName="Scene" result={result} onOpenAction={handler} />);
    expect(screen.getByRole('option', { name: 'Revisar colisão' })).toBeTruthy();
    view.rerender(<SceneActionPanel data={{ scenas: [{ ...data.scenas[0], width: 0 }] }} sceneName="Scene" result={result} onOpenAction={handler} />);
    expect(screen.queryByRole('option', { name: 'Revisar colisão' })).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });
  it('handles navigation failure without retrying the action', async () => {
    const handler = vi.fn(() => { throw new Error('private error'); });
    render(<SceneActionPanel data={data} sceneName="Scene" result={result} onOpenAction={handler} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir ferramenta' }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).not.toContain('private');
    expect(screen.getByRole('status').textContent).toContain('Não foi possível');
  });
});
