import type { ScenePhysicalDiagnostics, ScenePhysicalMetric } from "../shared/scenePhysicalDiagnostics";
import type {
  ScenePreflightChecklistItem,
  ScenePreflightIssue,
  ScenePreflightReport
} from "../shared/scenePreflight";

interface ScenePreflightInspectorProps {
  report: ScenePreflightReport;
  physical?: ScenePhysicalDiagnostics | null;
}

function statusLabel(status: ScenePreflightReport["status"]): string {
  if (status === "blocked") return "Bloqueado";
  if (status === "review") return "Em revisão";
  return "Pronto";
}

function checklistStateLabel(state: ScenePreflightChecklistItem["state"]): string {
  if (state === "blocked") return "Bloqueado";
  if (state === "review") return "Revisar";
  return "Completo";
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function formatPhysicalValue(metric: ScenePhysicalMetric, value: number | null): string {
  if (value === null) return "—";
  if (metric.unit === "bytes") return formatBytes(value);
  if (metric.unit === "colors") return `${value} cores`;
  if (metric.unit === "objects") return `${value} objetos`;
  if (metric.unit === "tiles") return `${value} tiles`;
  return `${value} ticks`;
}

function issueClassName(issue: ScenePreflightIssue): string {
  return `scene-preflight-issue ${issue.severity}`;
}

export function ScenePreflightInspector({ report, physical = null }: ScenePreflightInspectorProps): React.ReactElement {
  const requiredAssets = report.assets.filter((asset) => asset.required);
  const missingIssues = report.issues.filter((issue) => issue.severity !== "info");
  const structuralFixture = report.fixture?.mode === "structural";
  return (
    <section
      aria-label="Preflight da cena"
      className={`room-detail-section room-detail-editor-span-2 scene-preflight-inspector ${report.status}`}
      data-preflight-fixture={structuralFixture ? "structural" : "production"}
      data-preflight-profile={report.profileId}
      data-preflight-status={report.status}
      role="region"
    >
      <div className="scene-preflight-heading">
        <div>
          <h5>Preflight da cena · {report.profileLabel}</h5>
          <p className="room-detail-section-help">Contrato da cena, camadas, dependências e prova física. Ausência de configuração não habilita recursos.</p>
          {structuralFixture ? (
            <div className="scene-preflight-fixture-notice" role="status">
              <strong>Fixture estrutural · não produtiva</strong>
              <span>Cobertura técnica apenas; a arte e a aprovação de produção permanecem separadas.</span>
            </div>
          ) : null}
        </div>
        <span className={`scene-preflight-status ${report.status}`}>{statusLabel(report.status)}</span>
      </div>

      <div aria-label="Resumo do preflight" className="scene-preflight-summary">
        <div><span>Perspectiva</span><strong>{report.perspective.orientation} · {report.perspective.projection}</strong></div>
        <div><span>Câmera</span><strong>{report.camera.mode}{report.camera.followsPlayer ? " · segue player" : ""}</strong></div>
        <div><span>Camadas</span><strong>{report.layers.filter((layer) => layer.present).length}/{report.layers.length} observadas</strong></div>
        <div><span>Colisão</span><strong>{report.collision.coverage * 100 >= 100 ? "100%" : `${Math.round(report.collision.coverage * 100)}%`} · independente da arte</strong></div>
        <div><span>Capabilities</span><strong>{report.enabledCapabilities.length > 0 ? report.enabledCapabilities.join(", ") : "Nenhuma opt-in"}</strong></div>
      </div>

      {report.hardware ? (
        <div aria-label="Contrato físico GBA" className="scene-preflight-panel scene-preflight-hardware">
          <div className="scene-preflight-panel-heading">
            <h6>Contrato físico GBA</h6>
            <small>{report.hardware.videoMode.label}</small>
          </div>
          <p>
            Viewport <strong>{report.hardware.viewport.widthPixels}×{report.hardware.viewport.heightPixels} px</strong>
            · grade <strong>{report.hardware.viewport.widthTiles}×{report.hardware.viewport.heightTiles} tiles de 8×8</strong>
            · mapa efetivo <strong>{report.hardware.effectiveMapSize.id}</strong>
            ({report.hardware.effectiveMapSize.widthPixels}×{report.hardware.effectiveMapSize.heightPixels} px · {report.hardware.screenblocks} screenblock{report.hardware.screenblocks === 1 ? "" : "s"}).
          </p>
          {report.hardware.mapSizeExpandedAutomatically ? (
            <small>O mapa configurado ({report.hardware.configuredMapSize.id}) foi ampliado automaticamente para comportar esta cena.</small>
          ) : null}
        </div>
      ) : null}

      <div className="scene-preflight-columns">
        <div className="scene-preflight-panel scene-preflight-runtime-panel">
          <h6>Composição e runtime</h6>
          <dl className="scene-preflight-facts">
            <div><dt>Player</dt><dd>{report.player.present ? report.player.actorName ?? "presente" : report.player.required ? "pendente" : "não aplicável"}</dd></div>
            <div><dt>Atores</dt><dd>{report.actors.count} · máximo {report.actors.maxVisible}</dd></div>
            <div><dt>HUD</dt><dd>{report.hud.present ? report.hud.presetId ?? "declarado" : report.hud.required ? "pendente" : "opcional"}</dd></div>
            <div><dt>Obstáculos</dt><dd>{report.obstacles.count} trigger(s) · {report.obstacles.collisionModel}</dd></div>
            <div><dt>Estados</dt><dd>{report.states.join(" · ")}</dd></div>
            <div><dt>Eventos</dt><dd>{report.events.declaredCount} declarados · {report.events.triggerCount} triggers</dd></div>
            <div><dt>Ferramentas exigidas</dt><dd>{report.requiredEditorTools.join(", ")}</dd></div>
            <div><dt>Ferramentas disponíveis</dt><dd>{report.editorTools.join(", ")}</dd></div>
            <div><dt>Fallback</dt><dd>{report.fallback}</dd></div>
          </dl>
        </div>

        <div className="scene-preflight-panel">
          <h6>Camadas exigidas</h6>
          <ul className="scene-preflight-layer-list">
            {report.layers.map((layer) => (
              <li className={layer.present ? "present" : layer.required ? "missing" : "optional"} key={layer.id}>
                <span>{layer.present ? "●" : "○"}</span>
                <strong>{layer.label}</strong>
                <small>{layer.hardwareLayer} · {layer.present ? "presente" : layer.required ? "pendente" : "opcional"}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="scene-preflight-panel scene-preflight-assets">
        <div className="scene-preflight-panel-heading">
          <h6>Assets e dependências existentes</h6>
          <small>{requiredAssets.filter((asset) => asset.present).length}/{requiredAssets.length} obrigatórios resolvidos</small>
        </div>
        <ul className="scene-preflight-asset-list">
          {report.assets.map((asset) => (
            <li className={asset.state} key={asset.id}>
              <strong>{asset.label}</strong>
              <span>{asset.state === "present" ? asset.resolvedReference ?? "presente" : asset.state === "missing" ? "ausente" : "não requerido"}</span>
              <small>{asset.detail}</small>
            </li>
          ))}
        </ul>
      </div>

      <details className="scene-preflight-checklist" open>
        <summary>Checklist da regra · {report.checklist.filter((item) => item.state === "complete").length}/{report.checklist.length} completos</summary>
        <div className="scene-preflight-checklist-grid">
          {report.checklist.map((item) => (
            <div className={`scene-preflight-checklist-item ${item.state}`} key={item.id}>
              <strong>{item.label}</strong>
              <span>{checklistStateLabel(item.state)}</span>
              <small>{item.detail}</small>
            </div>
          ))}
        </div>
      </details>

      {missingIssues.length > 0 ? (
        <div aria-label="Pendências do preflight" className="scene-preflight-issues" role="list">
          {missingIssues.map((item, index) => (
            <div className={issueClassName(item)} key={`${item.code}-${item.field ?? index}`} role="listitem">
              <strong>{item.code}</strong>
              <span>{item.message}</span>
              {item.resolution ? <small>{item.resolution}</small> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="scene-preflight-panel scene-preflight-verification">
        <div className="scene-preflight-panel-heading">
          <h6>Testes e evidências exigidos</h6>
          <small>{report.verification.tests.length} teste(s) · {report.verification.evidence.length} evidência(s)</small>
        </div>
        <p><strong>Testes:</strong> {report.verification.tests.join(" · ")}</p>
        <p><strong>Evidências:</strong> {report.verification.evidence.join(" · ")}</p>
      </div>

      <section aria-label="Diagnóstico físico do preflight" className="scene-preflight-physical" role="region">
        <div className="scene-preflight-panel-heading">
          <div>
            <h6>Diagnóstico físico</h6>
            <small>Estimativa do editor · plano do exportador · medição do runtime · limite seguro · excedente crítico</small>
          </div>
          <strong className={physical?.criticalOverflow ? "error" : "ok"}>
            {physical ? `${physical.measuredMetricCount}/10 medidos` : "aguardando medição"}
          </strong>
        </div>
        {physical ? (
          <div aria-label="Matriz física do preflight" className="scene-preflight-physical-table" role="table">
            <div className="scene-preflight-physical-row is-header" role="row">
              <span role="columnheader">Recurso</span>
              <span role="columnheader">Editor</span>
              <span role="columnheader">Exportador</span>
              <span role="columnheader">Runtime</span>
              <span role="columnheader">Limite seguro</span>
              <span role="columnheader">Crítico</span>
            </div>
            {physical.metrics.map((metric) => (
              <div className={`scene-preflight-physical-row ${metric.tone}`} key={metric.id} role="row">
                <strong role="rowheader">{metric.label}</strong>
                <span role="cell">{formatPhysicalValue(metric, metric.estimate)}</span>
                <span role="cell">{formatPhysicalValue(metric, metric.planned)}</span>
                <span role="cell">{formatPhysicalValue(metric, metric.measured)}</span>
                <span role="cell">{formatPhysicalValue(metric, metric.safeLimit)}</span>
                <span role="cell">{metric.criticalOverflow ? `+${formatPhysicalValue(metric, metric.overflow)}` : "—"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="room-detail-section-help">A execução do Play preencherá a coluna Runtime quando a ROM publicar telemetria correspondente.</p>
        )}
      </section>
    </section>
  );
}
