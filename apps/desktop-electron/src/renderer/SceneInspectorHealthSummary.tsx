import { CheckCircle2, CircleAlert, TriangleAlert, ArrowUpRight } from "lucide-react";
import type { ScenePreflightReport } from "../shared/scenePreflight.js";
import { InspectorInfoTip } from "./InspectorControls";

interface SceneInspectorHealthSummaryProps {
  report: ScenePreflightReport;
  onOpenHealth?(): void;
}

function statusLabel(status: ScenePreflightReport["status"]): string {
  if (status === "blocked") return "Bloqueado";
  if (status === "review") return "Em revisão";
  return "Pronto";
}

function statusIcon(status: ScenePreflightReport["status"]): React.ReactElement {
  if (status === "blocked") return <TriangleAlert aria-hidden="true" size={15} />;
  if (status === "review") return <CircleAlert aria-hidden="true" size={15} />;
  return <CheckCircle2 aria-hidden="true" size={15} />;
}

export function SceneInspectorHealthSummary({ report, onOpenHealth }: SceneInspectorHealthSummaryProps): React.ReactElement {
  const pendingCount = report.issues.filter((issue) => issue.severity !== "info").length;
  const status = statusLabel(report.status);
  const detail = report.status === "blocked"
    ? `${pendingCount || "Há"} bloqueio(s) precisam de atenção antes da exportação.`
    : report.status === "review"
      ? `${pendingCount || "Há"} item(ns) aguardam revisão na Saúde do projeto.`
      : "Nenhuma pendência conhecida para esta cena.";

  return (
    <section
      aria-label="Saúde da cena"
      className="room-detail-section room-detail-editor-span-2 scene-inspector-health-summary"
      data-preflight-status={report.status}
      role="region"
    >
      <div className="scene-inspector-health-copy">
        <div className="scene-inspector-health-heading">
          <span className={`scene-inspector-health-icon ${report.status}`}>
            {statusIcon(report.status)}
          </span>
          <div>
            <h5>Saúde da cena</h5>
            <strong>{status}{pendingCount > 0 ? ` · ${pendingCount}` : ""}</strong>
          </div>
          <InspectorInfoTip label="Saúde da cena">{detail}</InspectorInfoTip>
        </div>
      </div>
      {onOpenHealth ? (
        <button
          aria-label="Abrir Saúde do projeto"
          className="scene-inspector-health-action"
          onClick={onOpenHealth}
          title="Abrir Saúde do projeto"
          type="button"
        >
          <ArrowUpRight aria-hidden="true" size={14} />
        </button>
      ) : null}
    </section>
  );
}
