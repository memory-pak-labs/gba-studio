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
  return (
    <article className={`advanced-tool-card${tool.enabled ? " enabled" : ""}`}>
      <div className="advanced-tool-card-title">
        {tool.enabled ? <CheckCircle2 aria-hidden="true" /> : <Wrench aria-hidden="true" />}
        <strong>{tool.title}</strong>
      </div>
      <p>{tool.detail}</p>
      {tool.enabled ? (
        <span className="advanced-tool-status">{tool.resourceCount} recurso(s) no projeto</span>
      ) : (
        <button onClick={() => onEnable(tool.id)} type="button">
          <Plus aria-hidden="true" /> Adicionar ao projeto
        </button>
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
    <aside aria-label="Testes e diagnóstico" className="testing-diagnostics-drawer">
      <header>
        <div>
          <Activity aria-hidden="true" />
          <span>
            <strong>Testes e diagnóstico</strong>
            <small>Execução reproduzível e limites reais do projeto.</small>
          </span>
        </div>
        <button aria-label="Fechar testes e diagnóstico" onClick={onClose} type="button">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="testing-diagnostics-content">
        <div className="advanced-tools-grid">
          {tools.map((tool) => (
            <DiagnosticToolCard key={tool.id} onEnable={onEnableTool} tool={tool} />
          ))}
        </div>

        <section className="advanced-flow-report" aria-label="Gravação e reprodução de inputs">
          <h3>Replay determinístico</h3>
          <p>
            {inputReplay
              ? `${inputReplay.frameCount} frames · ${inputReplay.runs.length} blocos comprimidos · seed ${inputReplay.seed}`
              : "A gravação captura seed, estado inicial, inputs e checkpoints do runtime."}
          </p>
          {onToggleInputRecording ? (
            <button className={inputRecording ? "danger" : ""} onClick={onToggleInputRecording} type="button">
              {inputRecording ? "Parar e salvar replay" : "Gravar sessão de Play"}
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
          <h3>Análise condicional do fluxo</h3>
          <p>
            Início: <strong>{presentation.flow.startScene ?? "não definido"}</strong> ·
            Bloqueadas: <strong>{presentation.flow.blockedTransitions.length}</strong> ·
            Inválidas: <strong>{presentation.flow.invalidTransitions.length}</strong> ·
            Loops: <strong>{presentation.flow.loops.length}</strong>
          </p>
          {presentation.flow.unreachableScenes.length > 0
            ? <p>Cenas não alcançáveis: {presentation.flow.unreachableScenes.join(", ")}</p>
            : <p>Todas as cenas são alcançáveis pelo fluxo atual.</p>}
        </section>

        <section className="advanced-flow-report" aria-label="Sessões do perfil de hardware">
          <h3>Sessões do perfil de hardware</h3>
          <p>{profilerHistory.length} execução(ões) concluída(s) · {profilerSession?.frames.length ?? 0} frames na sessão atual.</p>
          {lastComparison ? (
            <p>
              Comparação mais recente: CPU <strong>{lastComparison.deltas.cpu >= 0 ? "+" : ""}{lastComparison.deltas.cpu.toFixed(1)}</strong> ·
              DMA <strong>{lastComparison.deltas.dma >= 0 ? "+" : ""}{lastComparison.deltas.dma.toFixed(0)}</strong> ·
              VRAM <strong>{lastComparison.deltas.vram >= 0 ? "+" : ""}{lastComparison.deltas.vram.toFixed(0)}</strong> ·
              OAM <strong>{lastComparison.deltas.oam >= 0 ? "+" : ""}{lastComparison.deltas.oam.toFixed(0)}</strong>
            </p>
          ) : <p>Conclua duas sessões de Play para comparar os frames de pico.</p>}
          {profiledScenes.map((scene) => (
            <article className="hardware-profiler-scene-peak" key={`${scene.runtime}:${scene.roomIndex}`}>
              <strong>{sceneDisplayName(scene.sceneName)}</strong>
              <small>
                {scene.runtime} · {scene.frameCount} {scene.frameCount === 1 ? "frame medido" : "frames medidos"}
              </small>
              <span>
                CPU {scene.peaks.cpu.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% ·
                VRAM {scene.peaks.vram.value.toLocaleString("pt-BR")} B ·
                OAM {scene.peaks.oam.value.toLocaleString("pt-BR")} ·
                DMA {scene.peaks.dma.value.toLocaleString("pt-BR")} ticks
              </span>
            </article>
          ))}
        </section>

        <section className="advanced-flow-report" aria-label="Telemetria de áudio no Play">
          <h3>Telemetria de áudio no Play</h3>
          {runtimeAudio ? (
            <p>
              {runtimeAudio.pcmSourceBytes.toLocaleString("pt-BR")} B de fontes PCM ·
              {runtimeAudio.mixerBufferBytes.toLocaleString("pt-BR")} B de buffer ·
              {runtimeAudio.activeVoiceCount} vozes ativas ·
              {runtimeAudio.pcmUnderrunCount} underruns ·
              {runtimeAudio.pcmSubmittedBlocks} blocos enviados
            </p>
          ) : <p>Execute a ROM para receber a telemetria de áudio do runtime.</p>}
        </section>

        <section className="advanced-flow-report" aria-label="Explorador de ocupação da ROM">
          <h3>Ocupação pós-link da ROM</h3>
          {memoryReport ? (
            <>
              <p>
                Arquivo: <strong>{memoryReport.rom.fileBytes.toLocaleString("pt-BR")} bytes</strong> ·
                EWRAM: <strong>{memoryReport.ram.ewram.usedBytes.toLocaleString("pt-BR")} / {memoryReport.ram.ewram.capacityBytes.toLocaleString("pt-BR")}</strong> ·
                IWRAM: <strong>{memoryReport.ram.iwram.usedBytes.toLocaleString("pt-BR")} / {memoryReport.ram.iwram.capacityBytes.toLocaleString("pt-BR")}</strong>
              </p>
              <div className="rom-occupancy-map">
                {Object.entries(memoryReport.resources).map(([id, usage]) => (
                  <article key={id}>
                    <div>
                      <strong>{id.replaceAll("_", " ")}</strong>
                      <span>{usage.used.toLocaleString("pt-BR")} / {usage.capacity.toLocaleString("pt-BR")}</span>
                    </div>
                    <meter max={Math.max(1, usage.capacity)} value={usage.used} />
                    <small>{usage.percent.toLocaleString("pt-BR")}% · {usage.severity}</small>
                  </article>
                ))}
              </div>
              {memoryReport.peakGroups[0] ? (
                <p>
                  Pico por cena: <strong>{memoryReport.peakGroups[0].name}</strong> · {memoryReport.peakGroups[0].peakPercent.toLocaleString("pt-BR")}%
                </p>
              ) : null}
            </>
          ) : null}
          {romOccupancy ? (
            <>
              <p>
                ROM: <strong>{romOccupancy.romBytes.toLocaleString("pt-BR")} bytes</strong> ·
                RAM: <strong>{romOccupancy.ramBytes.toLocaleString("pt-BR")} bytes</strong> ·
                removidos pelo linker: <strong>{romOccupancy.discardedBytes.toLocaleString("pt-BR")} bytes</strong>
              </p>
              <div className="rom-occupancy-map">
                {romOccupancy.categories.map((category) => (
                  <article key={category.id}>
                    <div>
                      <strong>{category.label}</strong>
                      <span>{category.bytes.toLocaleString("pt-BR")} bytes</span>
                    </div>
                    <meter max={Math.max(1, romOccupancy.romBytes)} value={category.bytes} />
                    <small>{category.entries[0]?.source ?? "Sem símbolo detalhado"}</small>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p>Gere ou execute a ROM para ler o mapa real produzido pelo linker.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
