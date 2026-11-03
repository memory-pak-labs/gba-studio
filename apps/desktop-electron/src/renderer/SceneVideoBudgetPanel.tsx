import React from "react";
import type { AssetPackVideoBudgetReport } from "../shared/assetPackVideoBudget.js";
import { readStoredLocale } from "./i18n.js";
import { useStudioUiText } from "./studioUiText.js";
import "./styles/scene-video-budget.css";

const labels = { bgVram: "Reserva BG", objVram: "VRAM OBJ", screenblocks: "Screenblocks", bgPalette: "Paleta BG", objPalette: "Paleta OBJ", oam: "OAM", romAssets: "ROM" };
const featureLabels: Record<string, string> = { ui_palettes: "Paletas da interface", hud_oam: "Área OAM do HUD", hud_text: "Texto do HUD em OBJ", hud_compact_text: "Texto compacto do HUD", hud_icons: "Imagens do HUD", dialogue_portrait: "Retratos de diálogo", portrait_tab: "Aba de retrato", name_input: "Campo do nome", name_keyboard: "Teclado do nome", event_text: "Texto de eventos", clock: "Relógio do jogo", status_text: "HUD padrão de luta" };
function bytes(value: number): string {
  const unit = value >= 1048576 ? "MiB" : value >= 1024 ? "KiB" : "B";
  const amount = value / (unit === "MiB" ? 1048576 : unit === "KiB" ? 1024 : 1);
  return `${amount.toLocaleString(readStoredLocale(), { maximumFractionDigits: 1 })} ${unit}`;
}

export function SceneVideoBudgetPanel({ report, sceneName }: {
  report?: AssetPackVideoBudgetReport | null;
  sceneName: string;
}): React.ReactElement {
  const ui = useStudioUiText();
  const scene = report?.scenes.find(scene => scene.scene === sceneName);
  return <section aria-label={ui("Vídeo compilado da cena {0}", { 0: sceneName })} className="room-project-budget-detail scene-video-budget">
    <h5>{ui("Vídeo compilado")}</h5>
    {!scene ? <p>{ui("Faça a análise para carregar as reservas de vídeo desta cena.")}</p> : <>
      <p>{scene.displayMode === null ? ui("Pendente") : ui("Modo de vídeo {0}", { 0: scene.displayMode })}</p>
      <p>{ui("Reservas e alocações; cobertura parcial.")}</p>
      <div className="room-project-budget-grid">
        {scene.metrics.filter(metric => metric.resource !== "romAssets").map(metric => {
          const tone = metric.status === "blocked" ? "error" : ["attention", "not_recommended"].includes(metric.status) ? "warning" : "";
          const percent = metric.used === null || !metric.capacity ? null : Math.round(metric.used / metric.capacity * 100);
          const format = metric.unit === "bytes" ? bytes : String;
          return <article aria-label={ui(labels[metric.resource])} className={tone} key={metric.resource}>
            <div><strong>{ui(labels[metric.resource])}</strong><span>{metric.status === "blocked" ? ui(scene.diagnostics.some(d => d.resource === metric.resource && d.code === "reservation_overlap") ? "Conflito de reserva" : "Limite excedido") : metric.status === "unknown" ? ui("Pendente") : `${percent ?? 0}%`}</span></div>
            <b>{metric.used === null ? "—" : format(metric.used)} / {metric.capacity === null ? "—" : format(metric.capacity)}</b>
            {percent !== null ? <div aria-hidden="true" className="room-project-budget-meter"><span style={{ width: `${Math.min(100, percent)}%` }} /></div> : null}
            <small>{metric.basis === "compiled_and_native" ? ui("Assets e reservas nativas") : metric.basis === "native_reservation" ? ui("Reserva nativa") : metric.used === null ? ui("Pendente") : ui("Assets compilados")}</small>
          </article>;
        })}
      </div>
      <p><strong>{ui("ROM total medida")}: </strong>{report?.linkedRomBytes == null ? ui("Gere a ROM para medir o arquivo final.") : bytes(report.linkedRomBytes)}</p>
      <div className="scene-video-budget-rom">
        <p><strong>{ui("ROM atribuída à cena")}: </strong>{scene.romAssetBytes === null ? ui("Gere a ROM para medir o arquivo final.") : bytes(scene.romAssetBytes)}</p>
        {scene.romAssets ? <p>{ui("Exclusivos: {0} · Compartilhados: {1}", { 0: bytes(scene.romAssets.exclusiveBytes), 1: bytes(scene.romAssets.sharedBytes) })}</p> : null}
        <small>{ui("Assets e dados nativos identificados no ELF; não some cenas com dados compartilhados.")}</small>
        {report?.romAssetsSummary ? <p>{ui("Código e demais dados não atribuídos: {0} (projeto).", { 0: bytes(report.romAssetsSummary.otherBytes) })}</p> : null}
      </div>
      <div className="scene-video-budget-reservations">
        <h5>{ui("Reservas dinâmicas da interface")}</h5>
        {scene.nativeLayout?.dynamicReservations ? <ul>{scene.nativeLayout.dynamicReservations.map(reservation => <li key={reservation.feature}>
          <strong>{ui(featureLabels[reservation.feature] ?? "Reserva de interface")}</strong>
          <small>{Object.entries(reservation.resources).map(([resource, ranges]) => {
            const count = ranges.reduce((total, range) => total + range.count, 0);
            return `${ui(labels[resource as keyof typeof labels])}: ${resource === "oam" ? count : bytes(count)}`;
          }).join(" · ")}</small>
        </li>)}</ul> : <p>{ui("Reservas dinâmicas pendentes.")}</p>}
        <small>{ui("Faixas compartilhadas contam uma vez; reservas não são picos medidos por frame.")}</small>
      </div>
    </>}
  </section>;
}
