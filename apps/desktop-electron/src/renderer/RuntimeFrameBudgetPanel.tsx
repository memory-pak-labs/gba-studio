import type { RomPlayerFrameBudgetTelemetry } from "../shared/hardwareProfiler";
import { readStoredLocale } from "./i18n";
import { useStudioUiText } from "./studioUiText";

export function RuntimeFrameBudgetPanel({ sample, sceneName }: { sample?: RomPlayerFrameBudgetTelemetry | null; sceneName?: string | null }) {
  const ui = useStudioUiText();
  const number = (value: number | null | undefined) => value == null ? ui("Pendente") : value.toLocaleString(readStoredLocale());
  const bytes = (value: number | null | undefined) => value == null ? ui("Pendente") : `${number(value)} B`;
  const micros = (value: number | null | undefined) => value == null || !sample ? ui("Pendente") :
    (value * 1_000_000 / sample.ticksPerSecond).toLocaleString(readStoredLocale(), { maximumFractionDigits: 1 }) + " µs";
  return <section className="advanced-flow-report" aria-label={ui("Medição nativa por frame")}>
    <h3>{ui("Medição nativa por frame")}</h3>
    {!sample ? <p>{ui("Execute uma ROM com a medição por frame habilitada.")}</p> : <>
      <p>{ui("Frame {0} · cena {1} · {2} frames no trecho atual", {0:sample.frame,1:sceneName ?? sample.room,2:sample.sceneFrameCount})}</p>
      <dl className="runtime-frame-budget-metrics">
        <div><dt>{ui("DMA transferido no frame")}</dt><dd>{bytes(sample.dmaBytes)}</dd></div>
        <div><dt>{ui("DMA ainda na fila")}</dt><dd>{bytes(sample.dmaQueuedBytes)}</dd></div>
        <div><dt>{ui("Trabalho em VBlank")}</dt><dd>{micros(sample.vblankWorkTicks)}</dd></div>
        <div><dt>{ui("OAM habilitados")}</dt><dd>{sample.oamEnabled == null ? ui("Pendente") : `${number(sample.oamEnabled)} / 128`}</dd></div>
        <div><dt>{ui("Pico de DMA na cena")}</dt><dd>{sample.peaks.dma ? `${number(sample.peaks.dma.value)} B · ${ui("Frame {0}", {0:sample.peaks.dma.frame})}` : ui("Pendente")}</dd></div>
        <div><dt>{ui("Pico de trabalho em VBlank")}</dt><dd>{sample.peaks.vblank ? `${micros(sample.peaks.vblank.value)} · ${ui("Frame {0}", {0:sample.peaks.vblank.frame})}` : ui("Pendente")}</dd></div>
        <div><dt>{ui("Pico de OAM na cena")}</dt><dd>{sample.peaks.oam ? `${number(sample.peaks.oam.value)} · ${ui("Frame {0}", {0:sample.peaks.oam.frame})}` : ui("Pendente")}</dd></div>
        <div><dt>{ui("Transferências descartadas")}</dt><dd>{number(sample.dmaDroppedTotal)}</dd></div>
      </dl>
    </>}
    <p>{ui("Espera por VBlank não é trabalho. Picos nativos incluem frames entre amostras do Editor.")}</p>
    <small>{ui("DMA imediato da engine; repetições automáticas de áudio e HDMA ficam fora desta contagem. OAM habilitados não medem o limite por linha.")}</small>
  </section>;
}
