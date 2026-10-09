/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeSceneLocally } from '../shared/sceneAnalysis.js';
import { SCENE_TYPE_OPTIONS } from '../shared/sceneTypes.js';
import { SceneAnalysisPanel } from './SceneAnalysisPanel.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('scene analysis review', () => {
  it.each([...SCENE_TYPE_OPTIONS, { id: '', label: 'Ambiguous' }])('reviews, edits and dismisses $label without changing data', async ({ id }) => {
    const data = { scenas: [{ name: 'Scene', sceneType: id, width: 30, height: 20 }] };
    const before = JSON.stringify(data);
    const analyzeScene = vi.fn().mockResolvedValue(analyzeSceneLocally(data, 'Scene'));
    vi.stubGlobal('gbaStudio', { analyzeScene });
    const user = userEvent.setup();
    render(<SceneAnalysisPanel data={data} sceneName="Scene" />);
    await user.click(screen.getByRole('button', { name: 'Analisar localmente' }));
    await user.selectOptions(await screen.findByLabelText('Classificação proposta'), 'hybrid');
    await user.clear(screen.getByLabelText('Próximos passos'));
    await user.type(screen.getByLabelText('Próximos passos'), 'Revisar objetivo');
    await user.click(screen.getByRole('button', { name: 'Aceitar proposta' }));
    expect(screen.getByRole('status', { name: 'Resultado da análise' }).textContent).toContain('Proposta aceita');
    expect(JSON.stringify(data)).toBe(before);
    await user.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByLabelText('Classificação proposta')).toBeNull();
    expect(analyzeScene).toHaveBeenCalledWith(expect.objectContaining({ useJev: false }));
  });
  it('ignores a response after changing the project', async () => {
    let resolve!: (v: unknown) => void;
    vi.stubGlobal('gbaStudio', { analyzeScene: vi.fn(() => new Promise(r => { resolve = r; })) });
    const data = { scenas: [{ name: 'Scene', width: 30, height: 20 }] };
    const user = userEvent.setup();
    const view = render(<SceneAnalysisPanel data={data} sceneName="Scene" />);
    await user.click(screen.getByRole('button', { name: 'Analisar localmente' }));
    view.rerender(<SceneAnalysisPanel data={{ ...data }} sceneName="Scene" />);
    resolve(analyzeSceneLocally(data, 'Scene'));
    await Promise.resolve();
    expect(screen.queryByLabelText('Classificação proposta')).toBeNull();
  });
  it('requires consent and reports a bridge error without locking the UI', async () => {
    const data = { scenas: [{ name: 'Scene', width: 30, height: 20 }] };
    const analyzeScene = vi.fn().mockResolvedValueOnce(analyzeSceneLocally(data, 'Scene')).mockRejectedValueOnce(new Error('network'));
    vi.stubGlobal('gbaStudio', { analyzeScene });
    const user = userEvent.setup();
    render(<SceneAnalysisPanel data={data} sceneName="Scene" />);
    await user.click(screen.getByRole('button', { name: 'Analisar localmente' }));
    await user.click(screen.getByText('Consulta opcional ao Jev'));
    expect((screen.getByRole('button', { name: 'Consultar Jev' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Consultar Jev' }));
    expect(screen.getByRole('status', { name: 'Resultado da análise' }).textContent).toContain('Não foi possível');
    expect((screen.getByRole('button', { name: 'Analisar localmente' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
