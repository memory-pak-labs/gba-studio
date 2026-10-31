import type { RomPlayerEventTrace } from "../shared/hardwareProfiler";
import { BuildDiagnosticReportPanel } from "./BuildDiagnosticReportPanel";
import type { EnginePackBuildResult, EnginePackDoctorSummary } from "../shared/ipc";
import { readStoredLocale } from "./i18n";
import { uiText as ui, useStudioUiText } from "./studioUiText";
import { Activity, CheckCircle2, GitBranch, Plus, Wrench, X } from "lucide-react";

import type {
  AdvancedToolCard,
  AdvancedToolID,
  AdvancedToolsPresentation
} from "../shared/advancedTools";
import {
  compareHardwareProfilerSessions,
  type HardwareProfilerSession
} from "../shared/hardwareProfilerSessions";
import type { InputReplay } from "../shared/inputReplay";
import type { ProjectMemoryReport } from "../shared/projectMemory";
import type { GBAProjectData } from "../shared/projectFile";
import type { RomOccupancyReport } from "../shared/romOccupancy";
import type { RomPlayerAudioTelemetry } from "../shared/hardwareProfiler";
import { sceneDisplayName } from "../shared/sceneDisplayName";
import { AdvancedToolEditors } from "./advancedToolEditors";
import { advancedToolsForSurface } from "./advancedToolsPlacement";

interface TestingDiagnosticsDrawerProps {
  buildResult?: EnginePackBuildResult | null;
  doctorSummary?: EnginePackDoctorSummary | null;
  inputRecording?: boolean;
  inputReplay?: InputReplay | null;
  isOpen: boolean;
  memoryReport?: ProjectMemoryReport | null;
  onChangeProjectData(data: GBAProjectData): void;
  onClose(): void;
  onEnableTool(toolID: AdvancedToolID): void;
  onRunReplay?(replay: InputReplay): void;
  onToggleInputRecording?(): void;
  presentation: AdvancedToolsPresentation;
  profilerHistory?: HardwareProfilerSession[];
  profilerSession?: HardwareProfilerSession | null;
  projectData: GBAProjectData;
  romOccupancy?: RomOccupancyReport | null;
  eventTrace?: RomPlayerEventTrace | null;
  onOpenEvent?(eventID: string): void;
  runtimeAudio?: RomPlayerAudioTelemetry | null;
}

function DiagnosticToolCard({
  onEnable,
  tool
}: {
  onEnable(toolID: AdvancedToolID): void;
  tool: AdvancedToolCard;
}): React.ReactElement {
  const ui = useStudioUiText();
  return (
    <article className={`advanced-tool-card${tool.enabled ? " enabled" : ""}`}>
      <div className="advanced-tool-card-title">
        {tool.enabled ? <CheckCircle2 aria-hidden="true" /> : <Wrench aria-hidden="true" />}
        <strong>{ui(tool.title)}</strong>
      </div>
      <p>{ui(tool.detail)}</p>
      {tool.enabled ? (
        <span className="advanced-tool-status">{tool.resourceCount} {ui(" recurso(s) no projeto")}</span>
      ) : (
        <button onClick={() => onEnable(tool.id)} type="button">
          <Plus aria-hidden="true" /> {ui(" Adicionar ao projeto")}</button>
      )}
    </article>
  );
}

export function TestingDiagnosticsDrawer({
  buildResult,
  doctorSummary,
  inputRecording = false,
  inputReplay,
  isOpen,
  memoryReport,
  onChangeProjectData,
  onClose,
  onEnableTool,
  onRunReplay,
  onToggleInputRecording,
  presentation,
  profilerHistory = [],
  profilerSession,
  projectData,
  romOccupancy,
  runtimeAudio,
  eventTrace,
  onOpenEvent
}: TestingDiagnosticsDrawerProps): React.ReactElement | null {
  const ui = useStudioUiText();
  if (!isOpen) return null;
  const lastComparison = profilerHistory.length >= 2
    ? compareHardwareProfilerSessions(profilerHistory.at(-2)!, profilerHistory.at(-1)!)
    : null;
  const profiledScenes = profilerSession && profilerSession.frames.length > 0
    ? profilerSession.scenePeaks
    : profilerHistory.at(-1)?.scenePeaks ?? [];
  const tools = advancedToolsForSurface("Diagnosticos")
    .map((toolID) => presentation.tools.find((tool) => tool.id === toolID))
    .filter((tool): tool is AdvancedToolCard => Boolean(tool));

  return (
    <aside aria-label={ui("Testes e diagnóstico")} className="testing-diagnostics-drawer">
      <header>
        <div>
          <Activity aria-hidden="true" />
          <span>
            <strong>{ui("Testes e diagnóstico")}</strong>
            <small>{ui("Execução reproduzível e limites reais do projeto.")}</small>
          </span>
        </div>
        <button aria-label={ui("Fechar testes e diagnóstico")} onClick={onClose} type="button">
          <X aria-hidden="true" />
        </button>
      </header>
      <section className="testing-diagnostics-section" aria-label={ui("Rastro de eventos da ROM")}>
        <h3>{ui("Rastro de eventos da ROM")}</h3>
        <label><input type="checkbox" checked={projectData.eventDiagnostics === true} onChange={e => onChangeProjectData({ ...projectData, eventDiagnostics: e.target.checked })} />{ui("Incluir origem dos eventos no próximo build")}</label>
        {eventTrace?.entries.map((entry, index) => <p key={`${eventTrace.sequence}-${index}`}>
          {entry.eventID ? <button type="button" onClick={() => onOpenEvent?.(entry.eventID!)}>{entry.eventID} / {entry.stepID}</button> : <code>0x{entry.commandAddress.toString(16)}</code>}
          {` · frame ${entry.frame} · op ${entry.op} · ${entry.status === 2 ? "pause" : entry.status === 1 ? "stop" : "continue"} · wait ${entry.waitFrames}`}
        </p>)}
      </section>


      <div className="testing-diagnostics-content">
        <div className="advanced-tools-grid">
          {tools.map((tool) => (
            <DiagnosticToolCard key={tool.id} onEnable={onEnableTool} tool={tool} />
          ))}
        </div>

        <section className="advanced-flow-report" aria-label={ui("Gravação e reprodução de inputs")}>
          <h3>{ui("Replay determinístico")}</h3>
          <p>
            {inputReplay
              ? ui("{0} frames · {1} blocos comprimidos · seed {2}", { 0: inputReplay.frameCount, 1: inputReplay.runs.length, 2: inputReplay.seed })
              : ui("A gravação captura seed, estado inicial, inputs e checkpoints do runtime.")}
          </p>
          {onToggleInputRecording ? (
            <button className={inputRecording ? "danger" : ""} onClick={onToggleInputRecording} type="button">
              {inputRecording ? ui("Parar e salvar replay") : ui("Gravar sessão de Play")}
            </button>
          ) : null}
        </section>

        <AdvancedToolEditors
          onChangeProjectData={onChangeProjectData}
          onRunReplay={onRunReplay}
          projectData={projectData}
          visibleEditors={["inputReplay", "saveLab"]}
        />

        <section className="advanced-flow-report">
          <h3>{ui("Análise condicional do fluxo")}</h3>
          <p>
            {ui("Início: ")}<strong>{presentation.flow.startScene ?? ui("não definido")}</strong> {ui(" · Bloqueadas: ")}<strong>{presentation.flow.blockedTransitions.length}</strong> {ui(" · Inválidas: ")}<strong>{presentation.flow.invalidTransitions.length}</strong> {ui(" · Loops: ")}<strong>{presentation.flow.loops.length}</strong>
          </p>
          {presentation.flow.unreachableScenes.length > 0
            ? <p>{ui("Cenas não alcançáveis: ")}{presentation.flow.unreachableScenes.join(", ")}</p>
            : <p>{ui("Todas as cenas são alcançáveis pelo fluxo atual.")}</p>}
        </section>

        <BuildDiagnosticReportPanel result={buildResult} doctor={doctorSummary} />

        <section className="advanced-flow-report" aria-label={ui("Sessões do perfil de hardware")}>
          <h3>{ui("Sessões do perfil de hardware")}</h3>
          <p>{profilerHistory.length} {ui(" execução(ões) concluída(s) · ")}{profilerSession?.frames.length ?? 0} {ui(" frames na sessão atual.")}</p>
          {lastComparison ? (
            <p>
              {ui("Comparação mais recente: CPU ")}<strong>{lastComparison.deltas.cpu >= 0 ? "+" : ""}{lastComparison.deltas.cpu.toFixed(1)}</strong> {ui(" · DMA ")}<strong>{lastComparison.deltas.dma >= 0 ? "+" : ""}{lastComparison.deltas.dma.toFixed(0)}</strong> {ui(" · VRAM ")}<strong>{lastComparison.deltas.vram >= 0 ? "+" : ""}{lastComparison.deltas.vram.toFixed(0)}</strong> {ui(" · OAM ")}<strong>{lastComparison.deltas.oam >= 0 ? "+" : ""}{lastComparison.deltas.oam.toFixed(0)}</strong>
            </p>
          ) : <p>{ui("Conclua duas sessões de Play para comparar os frames de pico.")}</p>}
          <p>{ui("Subsistemas: tempos inclusivos em µs. Escopos sobrepostos não devem ser somados. Picos nativos reiniciam ao entrar em outra cena.")}</p>
          {profiledScenes.map((scene) => (
            <article className="hardware-profiler-scene-peak" key={`${scene.runtime}:${scene.roomIndex}`}>
              <strong>{sceneDisplayName(scene.sceneName)}</strong>
              <small>
                {scene.runtime} · {scene.frameCount} {scene.frameCount === 1 ? ui("frame medido") : ui("frames medidos")}
              </small>
              <span>
                {ui("CPU ")}{scene.peaks.cpu.value.toLocaleString(readStoredLocale(), { maximumFractionDigits: 1 })}{ui("% · VRAM ")}{scene.peaks.vram.value.toLocaleString(readStoredLocale())} {ui(" B · OAM ")}{scene.peaks.oam.value.toLocaleString(readStoredLocale())} {ui(" · DMA ")}{scene.peaks.dma.value.toLocaleString(readStoredLocale())} {ui(" ticks")}</span>
              {scene.subsystems ? (
                <span aria-label={ui("Picos por subsistema")}>
                  {Object.entries(scene.subsystems).map(([label, peak]) => `${label}: ${((peak?.value ?? 0) * 1_000_000 / 262144).toLocaleString(readStoredLocale(), { maximumFractionDigits: 1 })} µs`).join(" · ")}
                </span>
              ) : <small>{ui("Execute uma ROM com o profiler para medir os subsistemas.")}</small>}
            </article>
          ))}
        </section>

        <section className="advanced-flow-report" aria-label={ui("Telemetria de áudio no Play")}>
          <h3>{ui("Telemetria de áudio no Play")}</h3>
          {runtimeAudio ? (
            <p>
              {runtimeAudio.pcmSourceBytes.toLocaleString(readStoredLocale())} {ui(" B de fontes PCM ·")}{runtimeAudio.mixerBufferBytes.toLocaleString(readStoredLocale())} {ui(" B de buffer ·")}{runtimeAudio.activeVoiceCount} {ui(" vozes ativas ·")}{runtimeAudio.pcmUnderrunCount} {ui(" underruns ·")}{runtimeAudio.pcmSubmittedBlocks} {ui(" blocos enviados")}</p>
          ) : <p>{ui("Execute a ROM para receber a telemetria de áudio do runtime.")}</p>}
        </section>

        <section className="advanced-flow-report" aria-label={ui("Explorador de ocupação da ROM")}>
          <h3>{ui("Ocupação pós-link da ROM")}</h3>
          {memoryReport ? (
            <>
              <p>
                {ui("Arquivo: ")}<strong>{memoryReport.rom.fileBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong>
              </p>
              <div className="rom-occupancy-map" aria-label={ui("RAM: uso e margem estática")}>
                {(["ewram", "iwram"] as const).map((region) => {
                  const usage = memoryReport.ram[region];
                  const number = (value: number) => value.toLocaleString(readStoredLocale());
                  return <article key={region} aria-label={region.toUpperCase()}>
                    <div>
                      <strong>{region.toUpperCase()}</strong>
                      <span>{number(usage.usedBytes)} / {number(usage.capacityBytes)} {ui(" bytes")}</span>
                    </div>
                    <meter aria-label={ui("Ocupação de {0}", { 0: region.toUpperCase() })} max={usage.capacityBytes}
                      high={usage.capacityBytes * 0.9} optimum={0} value={Math.min(usage.usedBytes, usage.capacityBytes)} />
                    <small>{ui("Dados vinculados: {0} bytes · Alinhamento e lacunas: {1} bytes", { 0: number(usage.linkedBytes), 1: number(usage.paddingBytes) })}</small>
                    <small>{ui("Reservas: {0} bytes · Margem estática: {1} bytes", { 0: number(usage.reservedBytes), 1: number(usage.remainingBytes) })}</small>
                    {region === "iwram" ? <small>{ui("Pilhas reservadas — sistema: {0}, IRQ: {1}, supervisor: {2} bytes", {
                      0: number(memoryReport.ram.iwram.stacks.systemBytes), 1: number(memoryReport.ram.iwram.stacks.irqBytes), 2: number(memoryReport.ram.iwram.stacks.supervisorBytes)
                    })}</small> : null}
                    <small>{number(usage.percent)}% · {ui(usage.severity === "error" ? "Limite de RAM excedido" : usage.severity === "warning" ? "Margem de RAM reduzida" : "RAM dentro do limite")}</small>
                  </article>;
                })}
              </div>
              <p>{ui("A margem estática desconta as reservas do linker. O uso das pilhas em execução não é medido.")}</p>
              <div className="rom-occupancy-map">
                {Object.entries(memoryReport.resources).map(([id, usage]) => (
                  <article key={id}>
                    <div>
                      <strong>{id.replaceAll("_", " ")}</strong>
                      <span>{usage.used.toLocaleString(readStoredLocale())} / {usage.capacity.toLocaleString(readStoredLocale())}</span>
                    </div>
                    <meter max={Math.max(1, usage.capacity)} value={usage.used} />
                    <small>{usage.percent.toLocaleString(readStoredLocale())}% · {usage.severity}</small>
                  </article>
                ))}
              </div>
              {memoryReport.peakGroups[0] ? (
                <p>
                  {ui("Pico por cena: ")}<strong>{memoryReport.peakGroups[0].name}</strong> · {memoryReport.peakGroups[0].peakPercent.toLocaleString(readStoredLocale())}%
                </p>
              ) : null}
            </>
          ) : null}
          {romOccupancy ? (
            <>
              <p>
                {ui("ROM: ")}<strong>{romOccupancy.romBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong> {ui("· RAM vinculada (endereços únicos):")} <strong>{romOccupancy.ramBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong> {ui(" · removidos pelo linker: ")}<strong>{romOccupancy.discardedBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong>
              </p>
              <div className="rom-occupancy-map">
                {romOccupancy.categories.map((category) => (
                  <article key={category.id}>
                    <div>
                      <strong>{ui(category.label)}</strong>
                      <span>{category.bytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</span>
                    </div>
                    <meter max={Math.max(1, romOccupancy.romBytes)} value={category.bytes} />
                    <small>{category.entries[0]?.source ?? ui("Sem símbolo detalhado")}</small>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p>{ui("Gere ou execute a ROM para ler o mapa real produzido pelo linker.")}</p>
          )}
        </section>
      </div>
    </aside>
  );
}
