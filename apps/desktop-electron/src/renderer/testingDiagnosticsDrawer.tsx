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
  runtimeAudio
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

        <section className="advanced-flow-report" aria-label={ui("Sessões do perfil de hardware")}>
          <h3>{ui("Sessões do perfil de hardware")}</h3>
          <p>{profilerHistory.length} {ui(" execução(ões) concluída(s) · ")}{profilerSession?.frames.length ?? 0} {ui(" frames na sessão atual.")}</p>
          {lastComparison ? (
            <p>
              {ui("Comparação mais recente: CPU ")}<strong>{lastComparison.deltas.cpu >= 0 ? "+" : ""}{lastComparison.deltas.cpu.toFixed(1)}</strong> {ui(" · DMA ")}<strong>{lastComparison.deltas.dma >= 0 ? "+" : ""}{lastComparison.deltas.dma.toFixed(0)}</strong> {ui(" · VRAM ")}<strong>{lastComparison.deltas.vram >= 0 ? "+" : ""}{lastComparison.deltas.vram.toFixed(0)}</strong> {ui(" · OAM ")}<strong>{lastComparison.deltas.oam >= 0 ? "+" : ""}{lastComparison.deltas.oam.toFixed(0)}</strong>
            </p>
          ) : <p>{ui("Conclua duas sessões de Play para comparar os frames de pico.")}</p>}
          {profiledScenes.map((scene) => (
            <article className="hardware-profiler-scene-peak" key={`${scene.runtime}:${scene.roomIndex}`}>
              <strong>{sceneDisplayName(scene.sceneName)}</strong>
              <small>
                {scene.runtime} · {scene.frameCount} {scene.frameCount === 1 ? ui("frame medido") : ui("frames medidos")}
              </small>
              <span>
                {ui("CPU ")}{scene.peaks.cpu.value.toLocaleString(readStoredLocale(), { maximumFractionDigits: 1 })}{ui("% · VRAM ")}{scene.peaks.vram.value.toLocaleString(readStoredLocale())} {ui(" B · OAM ")}{scene.peaks.oam.value.toLocaleString(readStoredLocale())} {ui(" · DMA ")}{scene.peaks.dma.value.toLocaleString(readStoredLocale())} {ui(" ticks")}</span>
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
                {ui("Arquivo: ")}<strong>{memoryReport.rom.fileBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong> {ui(" · EWRAM: ")}<strong>{memoryReport.ram.ewram.usedBytes.toLocaleString(readStoredLocale())} / {memoryReport.ram.ewram.capacityBytes.toLocaleString(readStoredLocale())}</strong> {ui(" · IWRAM: ")}<strong>{memoryReport.ram.iwram.usedBytes.toLocaleString(readStoredLocale())} / {memoryReport.ram.iwram.capacityBytes.toLocaleString(readStoredLocale())}</strong>
              </p>
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
                {ui("ROM: ")}<strong>{romOccupancy.romBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong> {ui(" · RAM: ")}<strong>{romOccupancy.ramBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong> {ui(" · removidos pelo linker: ")}<strong>{romOccupancy.discardedBytes.toLocaleString(readStoredLocale())} {ui(" bytes")}</strong>
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
