import { useEffect, useState } from 'react';
import type { GBAProjectData } from '../shared/projectFile.js';
import type { SceneAnalysisResult } from '../shared/sceneAnalysis.js';
import { eligibleSceneActions, SCENE_REVIEW_ACTION_IDS, type SceneActionHandler } from '../shared/sceneActionRouting.js';

export function SceneActionPanel({ data, sceneName, result, onOpenAction, disabled = false }: {
  data: GBAProjectData; sceneName: string; result: SceneAnalysisResult; onOpenAction?: SceneActionHandler; disabled?: boolean;
}): React.ReactElement {
  const [selected, setSelected] = useState(result.routing.suggested as string);
  const [message, setMessage] = useState('');
  useEffect(() => { setSelected(result.routing.suggested); setMessage(''); }, [result]);
  const eligible = eligibleSceneActions(data, sceneName, onOpenAction ? SCENE_REVIEW_ACTION_IDS : [])
    .filter(action => result.routing.eligible.some(offered => offered.id === action.id));
  const action = eligible.find(candidate => candidate.id === selected) ?? eligible.find(candidate => candidate.id === 'pedir_detalhe')!;
  function open() {
    const current = eligibleSceneActions(data, sceneName, onOpenAction ? SCENE_REVIEW_ACTION_IDS : []).find(candidate => candidate.id === action.id);
    if (!current || current.permission !== 'navigate' || !onOpenAction) {
      setMessage('Escolha uma ferramenta disponível ou analise a cena novamente.'); return;
    }
    try { setMessage(onOpenAction({ sceneName, action: current.id }).message); }
    catch { setMessage('Não foi possível abrir a ferramenta. A ação não foi repetida.'); }
  }
  return <section aria-label="Escolha da próxima ferramenta">
    <h6>Próxima ferramenta</h6>
    <p>{result.routing.source === 'jev' ? 'Sugestão do Jev' : 'Sugestão local'} · você decide o que abrir.</p>
    {result.decision?.nextAction ? <details>
      <summary>Confiança da sugestão: {(result.decision.nextAction.confidence * 100).toFixed(0)}%</summary>
      <ul>{Object.entries(result.decision.nextAction.probabilities).map(([id, probability]) => <li key={id}>
        {result.routing.eligible.find(candidate => candidate.id === id)?.label ?? id}: {(probability * 100).toFixed(1)}%
      </li>)}</ul>
    </details> : null}
    <label style={{ display: 'grid', gap: 'var(--studio-space-2)' }}>Próxima ferramenta
      <select aria-label="Próxima ferramenta" disabled={disabled} value={action.id} onChange={event => { setSelected(event.target.value); setMessage(''); }}>
        {eligible.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
      </select>
    </label>
    <p>{action.effect}</p>
    {action.permission === 'navigate' ? <button type="button" disabled={disabled} onClick={open}>Abrir ferramenta</button> : null}
    <p role="status">{message || (action.id === 'pedir_detalhe' ? 'Escolha no seletor qual parte da cena deseja revisar. Se não houver ferramenta disponível, complete a especificação no Editor e analise novamente.' : action.id === 'nenhuma' ? 'Nenhuma ferramenta será aberta.' : '')}</p>
  </section>;
}
