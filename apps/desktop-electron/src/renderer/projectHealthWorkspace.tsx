import type { SceneActionHandler, SceneActionAuditEntry } from "../shared/sceneActionRouting.js";
import { SceneAnalysisPanel } from "./SceneAnalysisPanel.js";
import { CheckCircle2, CircleAlert, Info, Layers3, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { AssetPackBudgetReport } from "../shared/projectBudget.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import type { ProjectDiagnostic, ProjectHealthReport } from "../shared/projectHealth.js";
import { deriveScenePhysicalDiagnostics } from "../shared/scenePhysicalDiagnostics.js";
import type { ScenePreflightStatus } from "../shared/scenePreflight.js";
import type { RoomsWorkspacePresentation } from "../shared/roomsWorkspace.js";
import { sceneDisplayName } from "../shared/sceneDisplayName.js";
import { RoomGeometryDiagnosticsPanel, RoomVisualFidelityPanel } from "./roomsWorkspace.js";
import { ScenePreflightInspector } from "./ScenePreflightInspector.js";
import { StudioChip, WorkspaceEmptyState } from "./studioUi.js";

type ProjectHealthFilter = "all" | "error" | "warning" | "info";

interface ProjectHealthWorkspaceProps {
  report: ProjectHealthReport | null;
  onOpenDiagnostic?(diagnostic: ProjectDiagnostic): void;
  projectData?: GBAProjectData | null;
  roomsPresentation?: RoomsWorkspacePresentation | null;
  projectPath?: string;
  assetPackReport?: AssetPackBudgetReport | null;
  embedded?: boolean;
  onSceneAction?: SceneActionHandler;
  sceneActionHistory?: readonly SceneActionAuditEntry[];
}

function statusLabel(status: ProjectHealthReport["status"]): string {
  if (status === "blocked") return "Bloqueado";
  if (status === "warning") return "Atenção";
  return "Pronto";
}

function statusIcon(status: ProjectHealthReport["status"]): React.ReactElement {
  if (status === "blocked") return <TriangleAlert aria-hidden="true" size={15} />;
  if (status === "warning") return <CircleAlert aria-hidden="true" size={15} />;
  return <CheckCircle2 aria-hidden="true" size={15} />;
}

function diagnosticIcon(severity: ProjectDiagnostic["severity"]): React.ReactElement {
  if (severity === "error") return <TriangleAlert aria-hidden="true" size={14} />;
  if (severity === "warning") return <CircleAlert aria-hidden="true" size={14} />;
  return <Info aria-hidden="true" size={14} />;
}

function diagnosticClassName(severity: ProjectDiagnostic["severity"]): string {
  return `project-health-diagnostic ${severity}`;
}

function preflightStatusLabel(status: ScenePreflightStatus): string {
  if (status === "blocked") return "Bloqueado";
  if (status === "review") return "Em revisão";
  return "Pronto";
}

function budgetItems(scene: ProjectHealthReport["scenes"][number]): Array<[string, string]> {
  return [
    ["BG tiles", scene.budget.bgTiles.toLocaleString("pt-BR")],
    ["OBJ tiles", scene.budget.objTiles.toLocaleString("pt-BR")],
    ["OAM", scene.budget.oam.toLocaleString("pt-BR")],
    ["VRAM", `${Math.round(scene.budget.vramBytes / 1024)} KB`],
    ["Eventos", `${Math.round(scene.budget.eventBytes / 1024)} KB`]
  ];
}

function healthStatusReviewDetail(report: ProjectHealthReport): string {
  if (!report.exportReady) return " · corrija os bloqueios antes de exportar.";
  if (report.counts.warning === 0) return " · sem avisos.";
  const label = report.counts.warning === 1 ? "aviso para revisar" : "avisos para revisar";
  return ` · ${report.counts.warning} ${label}.`;
}

export function ProjectHealthWorkspace({
  report,
  onOpenDiagnostic,
  projectData = null,
  roomsPresentation = null,
  projectPath,
  assetPackReport = null,
  embedded = false,
  onSceneAction,
  sceneActionHistory = []
}: ProjectHealthWorkspaceProps): React.ReactElement {
  const [filter, setFilter] = useState<ProjectHealthFilter>("all");

  const diagnostics = useMemo(() => {
    if (!report) return [];
    return report.diagnostics.filter((diagnostic) => filter === "all" || diagnostic.severity === filter);
  }, [filter, report]);

  if (!report) {
    return (
      <section
        aria-label={embedded ? "Saúde e preflight de exportação" : "Workspace Saúde"}
        className={embedded ? "project-health-workspace embedded" : "project-health-workspace"}
      >
        <WorkspaceEmptyState
          description="Abra ou crie um projeto para calcular contrato, capacidades, HUDs e orçamento."
          hint="O relatório usa os mesmos dados consumidos pelo Editor, Play e exportação."
          icon={ShieldCheck}
          title="Saúde indisponível"
        />
      </section>
    );
  }

  return (
    <section
      aria-label={embedded ? "Saúde e preflight de exportação" : "Workspace Saúde"}
      className={embedded ? "project-health-workspace embedded" : "project-health-workspace"}
      data-project-health-status={report.status}
    >
      <h3 className="studio-visually-hidden">{embedded ? "Saúde do projeto · Preflight" : "Saúde do projeto"}</h3>

      {sceneActionHistory.length > 0 ? <details className="scene-preflight-panel">
        <summary>Ações de revisão nesta sessão · {sceneActionHistory.length}</summary>
        <ul>{sceneActionHistory.map((entry, index) => <li key={index}>{entry.message} · {entry.status === 'opened' ? 'Navegação solicitada' : entry.status === 'rejected' ? 'Não executada' : 'Falhou'}</li>)}</ul>
        <small>Últimas 20 ações. Histórico local, descartado ao trocar ou fechar o projeto.</small>
      </details> : null}
      <div aria-label="Resumo da saúde do projeto" className="project-health-summary-grid">
        <article className={`project-health-summary-card ${report.status}`}>
          <span>Status</span>
          <strong>
            <span
              aria-label={`Status do projeto: ${statusLabel(report.status)}`}
              className={`project-health-status ${report.status}`}
              data-project-health-status={report.status}
              data-testid="project-health-status"
            >
              {statusIcon(report.status)}
              {statusLabel(report.status)}
            </span>
          </strong>
          <small>
            <span>{report.exportReady ? "Exportação liberada" : "Exportação bloqueada"}</span>
            <span>{healthStatusReviewDetail(report)}</span>
          </small>
        </article>
        <article className="project-health-summary-card">
          <span>Cenas</span>
          <strong>{report.scenes.length}</strong>
          <small>perfis de capacidade</small>
        </article>
        <article className="project-health-summary-card error">
          <span>Bloqueios</span>
          <strong>{report.counts.error}</strong>
          <small>erros de contrato ou exportação</small>
        </article>
        <article className="project-health-summary-card warning">
          <span>Avisos</span>
          <strong>{report.counts.warning}</strong>
          <small>itens que pedem revisão</small>
        </article>
      </div>

      <div className="project-health-filter-bar" role="toolbar" aria-label="Filtrar saúde do projeto">
        <span>Exibir</span>
        <StudioChip active={filter === "all"} onClick={() => setFilter("all")}>Tudo</StudioChip>
        <StudioChip active={filter === "error"} onClick={() => setFilter("error")}>Bloqueios</StudioChip>
        <StudioChip active={filter === "warning"} onClick={() => setFilter("warning")}>Avisos</StudioChip>
        <StudioChip active={filter === "info"} onClick={() => setFilter("info")}>Informações</StudioChip>
      </div>

      <div className="project-health-layout">
        <section aria-labelledby="project-health-diagnostics-title" className="project-health-panel">
          <header className="project-health-panel-header">
            <div>
              <h4 id="project-health-diagnostics-title">Diagnósticos</h4>
              <p>{diagnostics.length} item(ns) neste filtro</p>
            </div>
            <Info aria-hidden="true" size={16} />
          </header>
          {diagnostics.length === 0 ? (
            <p className="project-health-empty" role="status">Nenhum item neste filtro.</p>
          ) : (
            <div className="project-health-diagnostic-list">
              {diagnostics.map((diagnostic) => (
                <button
                  aria-label={`Abrir ${diagnostic.message}`}
                  className={diagnosticClassName(diagnostic.severity)}
                  key={diagnostic.id}
                  onClick={() => onOpenDiagnostic?.(diagnostic)}
                  type="button"
                >
                  <span className="project-health-diagnostic-icon">{diagnosticIcon(diagnostic.severity)}</span>
                  <span className="project-health-diagnostic-copy">
                    <strong>{diagnostic.message}</strong>
                    <small>
                      {[diagnostic.workspace, diagnostic.sceneName ?? diagnostic.targetName].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="project-health-scenes-title" className="project-health-panel project-health-scenes-panel">
          <header className="project-health-panel-header">
            <div>
              <h4 id="project-health-scenes-title">Capacidades por cena</h4>
              <p>Perfil que Editor, Play e exportação devem respeitar.</p>
            </div>
            <Layers3 aria-hidden="true" size={16} />
          </header>
          <div className="project-health-scene-list">
            {report.scenes.map((scene) => {
              const sceneLabel = sceneDisplayName(scene.sceneName);
              const physical = projectData
                ? deriveScenePhysicalDiagnostics(projectData, scene.sceneName, { assetPackReport })
                : null;
              const room = roomsPresentation?.rooms.find((candidate) => candidate.name === scene.sceneName);
              const roomEntities = roomsPresentation?.entities.filter((entity) => entity.roomName === scene.sceneName) ?? [];
              return (
                <details className="project-health-scene-card" key={scene.sceneName}>
                  <summary className="project-health-scene-summary">
                    <div className="project-health-scene-heading">
                      <div>
                        <strong>{sceneLabel}</strong>
                        <span>{scene.sceneLabel}</span>
                        <small>Preview: {scene.previewMode}</small>
                        <small className={scene.preflight ? `project-health-preflight ${scene.preflight.status}` : "project-health-preflight unavailable"}>
                          Preflight: {scene.preflight ? preflightStatusLabel(scene.preflight.status) : "não calculado"}
                        </small>
                      </div>
                      <span className="project-health-scene-type">{scene.sceneType}</span>
                    </div>
                    <span className="project-health-scene-details-label">Ver detalhes</span>
                  </summary>
                  <div className="project-health-scene-details">
                    {projectData ? <SceneAnalysisPanel data={projectData} projectPath={projectPath} sceneName={scene.sceneName} onOpenAction={onSceneAction} /> : null}
                    <div className="project-health-tags" aria-label={`Módulos ativos de ${sceneLabel}`}>
                      {scene.enabledModules.length > 0 ? scene.enabledModules.map((module) => (
                        <span className="project-health-tag active" key={module}>{module}</span>
                      )) : <span className="project-health-tag">sem módulos</span>}
                    </div>
                    <div className="project-health-budget" aria-label={`Orçamento de ${sceneLabel}`}>
                      <span><b>Budget</b></span>
                      {budgetItems(scene).map(([label, value]) => <span key={label}><b>{label}</b> {value}</span>)}
                    </div>
                    {scene.preflight ? (
                      <div className="project-health-scene-preflight">
                        <ScenePreflightInspector physical={physical} report={scene.preflight} />
                      </div>
                    ) : (
                      <p className="project-health-empty">O preflight desta cena ainda não foi calculado.</p>
                    )}
                    {room ? (
                      <div className="project-health-scene-authoring-diagnostics">
                        <RoomGeometryDiagnosticsPanel room={room} />
                        <RoomVisualFidelityPanel entities={roomEntities} projectPath={projectPath} room={room} />
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
