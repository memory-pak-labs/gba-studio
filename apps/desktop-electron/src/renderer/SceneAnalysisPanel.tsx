import { SceneActionPanel } from './SceneActionPanel.js';
import { SCENE_REVIEW_ACTION_IDS, type SceneActionHandler } from '../shared/sceneActionRouting.js';
import { useEffect, useRef, useState } from 'react';
import { analyzeSceneLocally, classificationOptions, priorityLevels, reviewOptions, type SceneAnalysisResult } from '../shared/sceneAnalysis.js';
import type { GBAProjectData } from '../shared/projectFile.js';

export function SceneAnalysisPanel({ data, sceneName, projectPath, onOpenAction }: { data: GBAProjectData; sceneName: string; projectPath?: string; onOpenAction?: SceneActionHandler }): React.ReactElement {
  const [result, setResult] = useState<SceneAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [external, setExternal] = useState(false);
  const [classification, setClassification] = useState('insufficient');
  const [steps, setSteps] = useState('');
  const [status, setStatus] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++; setResult(null); setBusy(false); setReviewed(false); setStatus(''); setExternal(false);
    return () => { revision.current++; };
  }, [data, sceneName, projectPath]);
  async function analyze(useJev: boolean) {
    const current = ++revision.current;
    setBusy(true); setStatus('Analisando a cena…'); setReviewed(false);
    try {
      const response = window.gbaStudio?.analyzeScene
        ? await window.gbaStudio.analyzeScene({ data, sceneName, projectPath, useJev, availableActions: onOpenAction ? [...SCENE_REVIEW_ACTION_IDS] : [] })
        : analyzeSceneLocally(data, sceneName, onOpenAction ? SCENE_REVIEW_ACTION_IDS : []);
      if (current !== revision.current) return;
      setResult(response); setClassification(response.classification); setSteps(response.nextSteps.join('\n'));
      setStatus(response.notice);
    } catch {
      if (current !== revision.current) return;
      setStatus('Não foi possível analisar esta cena. O projeto permanece disponível; tente novamente.');
    } finally { if (current === revision.current) setBusy(false); }
  }
  return <section className="scene-preflight-panel" aria-label={`Análise prévia · ${sceneName}`} aria-busy={busy}>
    <h5>Análise prévia da cena</h5>
    <p>Revise classificação, componentes e lacunas antes de configurar a cena.</p>
    <button type="button" disabled={busy} onClick={() => void analyze(false)}>Analisar localmente</button>
    <p aria-label="Resultado da análise" role="status">{status}</p>
    {result ? <>
      <p><strong>Componentes existentes:</strong> {result.existing.join(' · ')}</p>
      <details><summary>Diagnósticos locais · {result.diagnostics.length}</summary>
        <ul>{result.diagnostics.map((d, i) => <li key={i}><strong>{d.severity === 'error' ? 'Erro' : d.severity === 'warning' ? 'Aviso' : 'Informação'}:</strong> {d.message}</li>)}</ul>
      </details>
      <details><summary>Lacunas · {result.gaps.length}</summary><ul>{result.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>
      <label style={{ display: 'grid', gap: 'var(--studio-space-2)', marginBlock: 'var(--studio-space-3)' }}>Classificação proposta <select aria-label="Classificação proposta" value={classification} disabled={reviewed || busy} onChange={e => setClassification(e.target.value)}>
        {Object.entries(classificationOptions).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
      </select></label>
      <label style={{ display: 'grid', gap: 'var(--studio-space-2)', marginBlock: 'var(--studio-space-3)' }}>Próximos passos <textarea aria-label="Próximos passos" rows={4} style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', padding: 'var(--studio-space-3)'  }} value={steps} disabled={reviewed || busy} onChange={e => setSteps(e.target.value)} /></label>
      {result.decision ? <details open><summary>Avaliação do Jev · {result.decision.model}</summary>
        <p>Classificação do modelo: {classificationOptions[result.decision.classification.choice]} · confiança {(result.decision.classification.confidence * 100).toFixed(0)}%.</p>
        <p>Componente a revisar: {reviewOptions[result.decision.review.choice as keyof typeof reviewOptions]} · confiança {(result.decision.review.confidence * 100).toFixed(0)}%.</p>
        <p>Probabilidade de especificação completa: {(result.decision.completeness * 100).toFixed(0)}%.</p>
        <p>Prioridade: {result.decision.priority.score.toFixed(2)}/3 · confiança {(result.decision.priority.confidence * 100).toFixed(0)}%.</p>
        <ul>{priorityLevels.map(level => <li key={level}>{level}</li>)}</ul>
        <details><summary>Distribuições de probabilidade</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ classification: result.decision.classification.probabilities, review: result.decision.review.probabilities, priority: result.decision.priority.probabilities }, null, 2)}</pre></details>
      </details> : null}
      <SceneActionPanel data={data} sceneName={sceneName} result={result} onOpenAction={onOpenAction} disabled={busy} />
      <p>Aceitar registra a proposta apenas nesta sessão. Alterações na cena são feitas no Editor. A revisão expira se o projeto mudar.</p>
      <button type="button" disabled={busy || reviewed} onClick={() => { setReviewed(true); setStatus(`Proposta aceita nesta sessão: ${classificationOptions[classification]}. Nenhuma configuração da cena foi alterada.`); }}>Aceitar proposta</button>{' '}
      <button type="button" disabled={busy} onClick={() => { setResult(null); setExternal(false); setStatus('Sugestão dispensada. A cena permanece igual.'); }}>Dispensar</button>
      <details><summary>Consulta opcional ao Jev</summary>
        <p>Envia contagens, regras numéricas e requisitos do perfil à TypeSafe AI. Nomes, caminhos, arte, diálogos e texto do objetivo ficam locais. Requer acesso configurado ao iniciar o aplicativo.</p>
        <label><input type="checkbox" checked={external} onChange={e => setExternal(e.target.checked)} disabled={busy} />Permitir o envio deste resumo ao Jev</label>
        <button type="button" disabled={!external || busy} onClick={() => void analyze(true)}>Consultar Jev</button>
      </details>
      <small>Análise v{result.audit.questionsVersion} · {result.audit.elapsedMs} ms · {result.audit.calls} chamada(s){result.audit.stateId ? ` · estado ${result.audit.stateId}` : ''}. {result.decision?.usage ? `${result.decision.usage.input_tokens} tokens de entrada; custo monetário não calculado.` : ''}</small>
    </> : null}
  </section>;
}
