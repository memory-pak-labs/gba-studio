import { useEffect, useRef, useState } from "react";
import type {
  DevelopmentSceneLaunch,
  EnginePackBuildDryRunResult,
  EnginePackBuildResult,
  EnginePackDoctorResult,
  EnginePackStatus
} from "../shared/ipc";
import type { ProjectBudgetAnalysisResult } from "../shared/projectBudget";
import type { InputReplay } from "../shared/inputReplay";
import { deriveGBAKeyboardBindings } from "../shared/gbaControls";
import {
  canGenerateRom,
  canPlayProject,
  generateRomBlockedReason,
  playProjectBlockedReason,
  readProjectEnginePackPath,
  resolveRomExportRoot
} from "../shared/engineRomPipeline";
import type { ProjectSession } from "./projectSession";

export type StatusTone = "info" | "success" | "error";

interface EngineExportOutcome {
  destination: string;
  warnings: string[];
}

interface RomBuildOutcome {
  romPath: string;
  warnings: string[];
}

interface UseEngineActionsOptions {
  contractDiagnosticsOK: boolean | null;
  projectHealthExportReady?: boolean | null;
  publishStatus?(message: string, tone?: StatusTone): void;
  session: ProjectSession | null;
  setStatus: (status: string) => void;
}

export function useEngineActions({ contractDiagnosticsOK, projectHealthExportReady = null, publishStatus, session, setStatus }: UseEngineActionsOptions) {
  const sessionRef = useRef<ProjectSession | null>(session);
  const [engineStatus, setEngineStatus] = useState<EnginePackStatus | null>(null);
  const [doctorResult, setDoctorResult] = useState<EnginePackDoctorResult | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [buildDryRunResult, setBuildDryRunResult] = useState<EnginePackBuildDryRunResult | null>(null);
  const [buildDryRunRunning, setBuildDryRunRunning] = useState(false);
  const [buildResult, setBuildResult] = useState<EnginePackBuildResult | null>(null);
  const [buildRunning, setBuildRunning] = useState(false);
  const [exportRunning, setExportRunning] = useState(false);
  const [audioPreviewStopRequest, setAudioPreviewStopRequest] = useState(0);
  const [lastEngineExportPath, setLastEngineExportPath] = useState<string | null>(null);
  const [lastEngineExportSource, setLastEngineExportSource] = useState<{
    path: string | undefined;
    data: ProjectSession["project"]["data"];
  } | null>(null);
  const [projectBudgetAnalysis, setProjectBudgetAnalysis] = useState<ProjectBudgetAnalysisResult | null>(null);
  const [projectBudgetAnalysisRunning, setProjectBudgetAnalysisRunning] = useState(false);

  const hasEngineAssetc = Boolean(engineStatus?.selected?.hasAssetc);
  const hasEngineBuild = Boolean(engineStatus?.selected?.hasGbsbuild);
  const hasCurrentEngineExport = Boolean(lastEngineExportPath && session
    && lastEngineExportSource?.path === session.path
    && lastEngineExportSource?.data === session.project.data);
  const configuredEnginePackPath = session ? readProjectEnginePackPath(session.project.data) : "";
  const engineExportDisabled = !session || exportRunning || contractDiagnosticsOK === false || projectHealthExportReady === false || !hasEngineAssetc;
  const romPipelineState = {
    hasSession: Boolean(session),
    hasProjectPath: Boolean(session?.path),
    contractDiagnosticsOK,
    projectHealthExportReady,
    hasEngineAssetc,
    hasEngineBuild,
    buildRunning,
    exportRunning,
    platform: window.gbaStudio.platform
  };
  const generateRomDisabled = !canGenerateRom(romPipelineState);
  const playProjectBlockedReasonText = playProjectBlockedReason(romPipelineState);
  const playProjectDisabled = !canPlayProject(romPipelineState);
  const playRunning = buildRunning || exportRunning;

  sessionRef.current = session;

  function reportStatus(message: string, tone: StatusTone = "info"): void {
    if (publishStatus) {
      publishStatus(message, tone);
      return;
    }
    setStatus(message);
  }

  useEffect(() => {
    void refreshEnginePack();
  }, [configuredEnginePackPath, session?.path]);

  useEffect(() => {
    setProjectBudgetAnalysis(null);
    setBuildDryRunResult(null);
  }, [session?.path, session?.project.data]);

  function projectEnginePackPath(): string | undefined {
    const currentSession = sessionRef.current;
    if (!currentSession) return undefined;
    const configured = readProjectEnginePackPath(currentSession.project.data);
    return configured || undefined;
  }

  async function refreshEnginePack(): Promise<void> {
    const nextEngineStatus = await window.gbaStudio.inspectEnginePack(projectEnginePackPath());
    setEngineStatus(nextEngineStatus);
    if (nextEngineStatus.selected) {
      await runDoctor();
    }
  }

  async function runDoctor(projectDir?: string): Promise<void> {
    setDoctorRunning(true);
    try {
      const result = await window.gbaStudio.runEnginePackDoctor({
        projectDir,
        enginePackPath: projectEnginePackPath()
      });
      setDoctorResult(result);
    } finally {
      setDoctorRunning(false);
    }
  }

  async function runBuildDryRun(): Promise<void> {
    const currentSession = sessionRef.current;
    const projectDir = hasCurrentEngineExport ? lastEngineExportPath : null;
    if (!projectDir || !currentSession) {
      setStatus("Exporte o projeto atual antes de rodar gbsbuild dry-run.");
      return;
    }

    setBuildDryRunRunning(true);
    try {
      const result = await window.gbaStudio.runEnginePackBuildDryRun(projectDir, projectEnginePackPath());
      setBuildDryRunResult(result);
      reportStatus(
        result.summary ? `gbsbuild dry-run pronto para target ${result.summary.target ?? "game"}.` : result.error ?? "gbsbuild dry-run concluido.",
        result.summary && !result.error ? "success" : result.error ? "error" : "info"
      );
    } finally {
      setBuildDryRunRunning(false);
    }
  }

  async function analyzeProjectBudget(): Promise<void> {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    setProjectBudgetAnalysisRunning(true);
    try {
      const result = await window.gbaStudio.analyzeProjectBudget({
        project: currentSession.project,
        projectPath: currentSession.path
      });
      setProjectBudgetAnalysis(result);
      reportStatus(
        result.ok
          ? "Orçamento GBA atualizado pelo compilador."
          : result.error ?? "Falha ao analisar o orçamento GBA.",
        result.ok ? "success" : "error"
      );
    } finally {
      setProjectBudgetAnalysisRunning(false);
    }
  }

  async function runBuildRom(projectDir?: string): Promise<void> {
    const currentSession = sessionRef.current;
    const resolvedProjectDir = projectDir ?? (hasCurrentEngineExport ? lastEngineExportPath : null);
    if (!resolvedProjectDir) {
      setStatus("Exporte, salve ou abra um projeto antes de gerar a ROM.");
      return;
    }

    setBuildRunning(true);
    try {
      const result = await window.gbaStudio.runEnginePackBuild(
        resolvedProjectDir,
        projectEnginePackPath(),
        currentSession?.path
      );
      setBuildResult(result);
      reportStatus(
        result.summary && !result.error ? `ROM gerada: ${result.summary.romPath}` : result.error ?? "Build de ROM concluido.",
        result.summary && !result.error ? "success" : "error"
      );
    } finally {
      setBuildRunning(false);
    }
  }

  async function exportEngineProject(options?: {
    destinationRoot?: string;
    developmentStartScene?: DevelopmentSceneLaunch;
    interactive?: boolean;
    projectData?: ProjectSession["project"]["data"];
    skipPostExportChecks?: boolean;
  }): Promise<EngineExportOutcome | null> {
    const currentSession = sessionRef.current;
    if (!currentSession) return null;

    setExportRunning(true);
    try {
      const result = await window.gbaStudio.exportEngineProject({
        project: options?.projectData
          ? { ...currentSession.project, data: options.projectData }
          : currentSession.project,
        projectPath: currentSession.path,
        destinationRoot: options?.destinationRoot,
        developmentStartScene: options?.developmentStartScene
      });
      if (result.canceled) {
        if (options?.interactive !== false) {
          setStatus("Exportacao Engine Pack cancelada.");
        }
        return null;
      }
      if (result.error || !result.destination) {
        setStatus(result.error ?? "Falha ao exportar projeto Engine Pack.");
        return null;
      }

      setLastEngineExportPath(result.destination);
      setLastEngineExportSource({ path: currentSession.path, data: options?.projectData ?? currentSession.project.data });
      const warnings = result.warnings ?? [];
      if (options?.interactive !== false) {
        reportStatus(
          `Projeto Engine Pack exportado: ${result.destination}${warnings.length ? ` Aviso: ${warnings.join(" ")}` : ""}`,
          "success"
        );
      }
      if (!options?.skipPostExportChecks) {
        const doctor = await window.gbaStudio.runEnginePackDoctor({
          projectDir: result.destination,
          enginePackPath: projectEnginePackPath()
        });
        setDoctorResult(doctor);
        if (hasEngineBuild) {
          setBuildDryRunRunning(true);
          try {
            const dryRun = await window.gbaStudio.runEnginePackBuildDryRun(result.destination, projectEnginePackPath());
            setBuildDryRunResult(dryRun);
          } finally {
            setBuildDryRunRunning(false);
          }
        }
      }
      return { destination: result.destination, warnings };
    } finally {
      setExportRunning(false);
    }
  }

  async function buildProjectRomArtifact(
    projectData?: ProjectSession["project"]["data"],
    developmentStartScene?: DevelopmentSceneLaunch
  ): Promise<RomBuildOutcome | null> {
    const currentSession = sessionRef.current;
    if (!currentSession?.path) return null;

    const destinationRoot = resolveRomExportRoot(currentSession.path, currentSession.project.data);
    setStatus(`Exportando projeto para ${destinationRoot}...`);
    const exported = await exportEngineProject({
      destinationRoot,
      developmentStartScene,
      interactive: false,
      projectData,
      skipPostExportChecks: true
    });
    if (!exported) return null;
    const exportPath = exported.destination;

    const doctor = await window.gbaStudio.runEnginePackDoctor({
      projectDir: exportPath,
      enginePackPath: projectEnginePackPath()
    });
    setDoctorResult(doctor);
    if (doctor.error || (doctor.exitCode !== null && doctor.exitCode !== 0)) {
      setStatus(doctor.error ?? `gbsdoctor falhou com codigo ${doctor.exitCode ?? "desconhecido"}. Corrija o contrato antes de gerar a ROM.`);
      return null;
    }

    setStatus("Compilando ROM...");
    const result = await window.gbaStudio.runEnginePackBuild(
      exportPath,
      projectEnginePackPath(),
      currentSession.path
    );
    setBuildResult(result);
    if (result.error || !result.summary?.romPath) {
      reportStatus(result.error ?? "Falha ao gerar ROM.", "error");
      return null;
    }

    return { romPath: result.summary.romPath, warnings: exported.warnings };
  }

  async function generateRom(): Promise<void> {
    const blockedReason = generateRomBlockedReason(romPipelineState);
    if (blockedReason) {
      setStatus(blockedReason);
      return;
    }
    setBuildRunning(true);
    try {
      const built = await buildProjectRomArtifact();
      if (!built) return;
      reportStatus(
        `ROM gerada: ${built.romPath}${built.warnings.length ? ` Aviso: ${built.warnings.join(" ")}` : ""}`,
        "success"
      );
      await window.gbaStudio.revealPath(built.romPath);
    } finally {
      setBuildRunning(false);
    }
  }

  async function playProject(target?: {
    roomID?: string;
    roomName?: string;
    startX?: number;
    startY?: number;
    startDirection?: string;
    replay?: InputReplay;
  }): Promise<void> {
    const currentSession = sessionRef.current;
    const blockedReason = playProjectBlockedReason(romPipelineState);
    if (blockedReason) {
      setStatus(blockedReason);
      return;
    }
    if (!currentSession) return;
    const sourceSnapshot = JSON.stringify(currentSession.project.data);

    setAudioPreviewStopRequest(request => request + 1);
    setBuildRunning(true);
    try {
      const developmentStartScene = target && (target.roomID || target.roomName)
        ? {
            id: target.roomID,
            name: target.roomName,
            x: target.startX,
            y: target.startY,
            direction: target.startDirection
          }
        : undefined;
      const built = await buildProjectRomArtifact(
        JSON.parse(sourceSnapshot),
        developmentStartScene
      );
      if (!built) return;
      if (sessionRef.current?.path !== currentSession.path
        || JSON.stringify(sessionRef.current?.project.data) !== sourceSnapshot) {
        setStatus("O projeto mudou durante o build. Execute Play novamente para usar a versão atual.");
        return;
      }

      setStatus("Abrindo ROM no Play Window...");
      const launch = await window.gbaStudio.openRomPlayerWindow({
        romPath: built.romPath,
        title: currentSession?.project.summary.name ?? "GBA Studio",
        replay: target?.replay,
        keyboardBindings: deriveGBAKeyboardBindings(currentSession.project.data)
      });
      if (!launch.ok) {
        reportStatus(launch.error ?? "Falha ao abrir a ROM no Play Window.", "error");
        return;
      }

      reportStatus(
        `Play Window aberto: ${built.romPath}${built.warnings.length ? ` Aviso: ${built.warnings.join(" ")}` : ""}`,
        "success"
      );
    } finally {
      setBuildRunning(false);
    }
  }

  async function exportWebProject(): Promise<void> {
    const currentSession = sessionRef.current;
    if (!currentSession) return;

    setExportRunning(true);
    try {
      const result = await window.gbaStudio.exportWebProject({ project: currentSession.project, projectPath: currentSession.path });
      if (result.canceled) {
        setStatus("Exportacao Web / itch.io cancelada.");
        return;
      }
      if (result.error || !result.destination) {
        setStatus(result.error ?? "Falha ao exportar Web / itch.io.");
        return;
      }

      reportStatus(
        result.romWarning
          ? `Pacote Web exportado com aviso: ${result.romWarning}`
          : result.romResolved
            ? `Pacote Web / itch.io exportado com ROM${result.romSource === "built" ? " compilada" : ""}: ${result.destination}`
            : `Pacote Web / itch.io exportado: ${result.destination}`,
        result.error ? "error" : "success"
      );
    } finally {
      setExportRunning(false);
    }
  }

  function clearEngineSessionState(): void {
    setDoctorResult(null);
    setBuildDryRunResult(null);
    setBuildResult(null);
    setLastEngineExportPath(null);
    setLastEngineExportSource(null);
    setProjectBudgetAnalysis(null);
  }

  return {
    analyzeProjectBudget,
    audioPreviewStopRequest,
    buildDryRunResult,
    buildDryRunRunning,
    buildResult,
    buildRunning,
    clearEngineSessionState,
    doctorResult,
    doctorRunning,
    engineExportDisabled,
    engineStatus,
    exportEngineProject,
    exportRunning,
    exportWebProject,
    generateRom,
    generateRomDisabled,
    hasEngineAssetc,
    hasEngineBuild,
    hasCurrentEngineExport,
    lastEngineExportPath,
    playProject,
    playProjectBlockedReasonText,
    playProjectDisabled,
    playRunning,
    projectBudgetAnalysis,
    projectBudgetAnalysisRunning,
    runBuildDryRun,
    runBuildRom,
    runDoctor
  };
}
