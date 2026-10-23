import { useMemo, useState } from "react";
import { buildDiagnosticReport } from "../shared/buildDiagnosticReport";
import type { EnginePackBuildResult, EnginePackDoctorSummary } from "../shared/ipc";
import { useStudioUiText } from "./studioUiText";

export function BuildDiagnosticReportPanel({ result, doctor }: { result?: EnginePackBuildResult | null; doctor?: EnginePackDoctorSummary | null }): React.ReactElement {
  const ui = useStudioUiText();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const report = useMemo(() => result ? buildDiagnosticReport(result, doctor) : null, [result, doctor]);
  const text = report ? JSON.stringify(report, null, 2) : "";
  return <section className="advanced-flow-report" aria-label={ui("Relatório compartilhável de build")}>
    <h3>{ui("Relatório compartilhável de build")}</h3>
    {report ? <>
      <p>{ui(report.probableCause.message)} {ui(report.probableCause.nextStep)}</p>
      <p>{ui("Inclui versões, configuração e diagnóstico. Caminhos locais, comandos e logs brutos ficam fora do relatório.")}</p>
      <details><summary>{ui("Revisar relatório")}</summary><textarea aria-label={ui("Conteúdo do relatório de build")} readOnly rows={14} value={text} /></details>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopyStatus(ui("Relatório copiado.")); }
        catch { setCopyStatus(ui("Não foi possível copiar. Selecione o conteúdo em Revisar relatório.")); }
      }}>{ui("Copiar relatório de build")}</button>
      {copyStatus ? <p role="status">{copyStatus}</p> : null}
    </> : <p>{ui("Compile uma ROM ou execute Play para gerar o relatório.")}</p>}
  </section>;
}
