/** @vitest-environment happy-dom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject";
import { summarizeGBAProject } from "../shared/projectFile";
import { createInputReplay } from "../shared/inputReplay";
import type { EnginePackStatus, GBAStudioDesktopAPI } from "../shared/ipc";
import { selectProjectSessionRoom, type ProjectSession } from "./projectSession";
import { useEngineActions } from "./useEngineActions";
import { buildAssetPackVideoBudget } from "../shared/assetPackVideoBudget.js";

const inspectEnginePack = vi.fn<(preferredPath?: string) => Promise<EnginePackStatus>>();

function projectSession(enginePackPath: string): ProjectSession {
  const data = createBlankProjectData({ name: "Somente Player" });
  const settings = data.settings as Record<string, Record<string, unknown>>;
  settings.build.enginePackPath = enginePackPath;
  return {
    path: "/tmp/somente-player/somente-player.gba-project",
    project: { data, summary: summarizeGBAProject(data) },
    dirty: false,
    redoStack: [],
    undoStack: []
  };
}

describe("useEngineActions", () => {
  it.each(["analysis", "build"])("accepts a late %s budget after navigation to another unchanged scene", async operation => {
    const session = projectSession("/packs/EnginePack");
    const scenes = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    session.project.data.scenas = scenes;
    session.project.data.scena = scenes[0];
    let finish!: (value: unknown) => void;
    const request = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    if (operation === "analysis") window.gbaStudio.analyzeProjectBudget = request;
    else window.gbaStudio.runEnginePackBuild = request;
    const { result, rerender } = renderHook(({ session }) => useEngineActions({ contractDiagnosticsOK: true, session, setStatus: vi.fn() }), { initialProps: { session } });
    let pending!: Promise<void>;
    act(() => { pending = operation === "analysis" ? result.current.analyzeProjectBudget() : result.current.runBuildRom("/tmp/export"); });
    rerender({ session: selectProjectSessionRoom(session, "b") });
    const videoBudget = buildAssetPackVideoBudget([], { schema: 11, ok: true, allocations: [] });
    videoBudget.linkedRomBytes = 12345;
    await act(async () => { finish(operation === "analysis" ? { ok: true, videoBudget }
      : { ran: true, exitCode: 0, summary: { romPath: "/tmp/export/build/test.gba", videoBudget } }); await pending; });
    expect(result.current.projectBudgetAnalysis?.videoBudget?.linkedRomBytes).toBe(12345);
    rerender({ session });
    expect(result.current.projectBudgetAnalysis?.videoBudget?.linkedRomBytes).toBe(12345);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("invalidates measured budgets when the current project's external assets change", async () => {
    let changed!: Parameters<GBAStudioDesktopAPI["onExternalAssetChange"]>[0];
    window.gbaStudio.onExternalAssetChange = listener => { changed = listener; return vi.fn(); };
    window.gbaStudio.analyzeProjectBudget = vi.fn().mockResolvedValue({ ok: true, report: { schema: 11 } });
    const session = projectSession("/packs/EnginePack");
    const { result } = renderHook(() => useEngineActions({ contractDiagnosticsOK: true, session, setStatus: vi.fn() }));
    await act(() => result.current.analyzeProjectBudget());
    act(() => changed({ projectPath: "/other.gba-project", relativePaths: ["tile.png"] }));
    expect(result.current.projectBudgetAnalysis?.ok).toBe(true);
    act(() => changed({ projectPath: session.path!, relativePaths: ["tile.png"] }));
    expect(result.current.projectBudgetAnalysis).toBeNull();
  });

  it.each(["edit", "switch"])("discards a late budget result after a project %s", async change => {
    let finish!: (result: { ok: boolean; report: { schema: number } }) => void;
    window.gbaStudio.analyzeProjectBudget = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const session = projectSession("/packs/EnginePack");
    const publishStatus = vi.fn();
    const { result, rerender } = renderHook(({ session }) => useEngineActions({ contractDiagnosticsOK: true,
      session, setStatus: vi.fn(), publishStatus }), { initialProps: { session } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.analyzeProjectBudget(); });
    rerender({ session: change === "switch" ? { ...session, path: "/tmp/another.gba-project" }
      : { ...session, project: { ...session.project, data: { ...session.project.data, name: "Edited" } } } });
    await act(async () => { finish({ ok: true, report: { schema: 11 } }); await pending; });
    expect(result.current.projectBudgetAnalysis).toBeNull();
    expect(result.current.projectBudgetAnalysisRunning).toBe(false);
    expect(publishStatus).not.toHaveBeenCalledWith("Orçamento GBA atualizado pelo compilador.", "success");
  });

  it("keeps the latest budget when overlapping analyses finish out of order", async () => {
    const finishes: Array<(value: { ok: boolean; generatedAt: string; report: { schema: number } }) => void> = [];
    window.gbaStudio.analyzeProjectBudget = vi.fn().mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
    const session = projectSession("/packs/EnginePack");
    const { result } = renderHook(() => useEngineActions({ contractDiagnosticsOK: true, session, setStatus: vi.fn() }));
    let older!: Promise<void>, newer!: Promise<void>;
    act(() => { older = result.current.analyzeProjectBudget(); newer = result.current.analyzeProjectBudget(); });
    await act(async () => { finishes[1]!({ ok: true, generatedAt: "new", report: { schema: 11 } }); await newer; });
    await act(async () => { finishes[0]!({ ok: true, generatedAt: "old", report: { schema: 11 } }); await older; });
    expect(result.current.projectBudgetAnalysis?.generatedAt).toBe("new");
  });

  it.each(["saved", "unsaved"])("publishes the measured ROM budget after building the current %s project", async saved => {
    const session = projectSession("/packs/EnginePack");
    if (saved === "unsaved") session.path = undefined;
    const videoBudget = buildAssetPackVideoBudget([], { schema: 11, ok: true, allocations: [] });
    videoBudget.linkedRomBytes = 12345;
    window.gbaStudio.runEnginePackBuild = vi.fn().mockResolvedValue({ ran: true, exitCode: 0,
      summary: { projectDir: "/tmp/export", buildDir: "/tmp/export/build", target: "test", romPath: "/tmp/export/build/test.gba", videoBudget } });
    const { result } = renderHook(() => useEngineActions({ contractDiagnosticsOK: true, session, setStatus: vi.fn() }));
    await act(() => result.current.runBuildRom("/tmp/export"));
    expect(result.current.projectBudgetAnalysis?.videoBudget?.linkedRomBytes).toBe(12345);
  });

  it.each(["edit", "switch", "assets"])("does not publish a late ROM budget after a project %s", async change => {
    const session = projectSession("/packs/EnginePack");
    let assetChanged!: Parameters<GBAStudioDesktopAPI["onExternalAssetChange"]>[0];
    window.gbaStudio.onExternalAssetChange = listener => { assetChanged = listener; return vi.fn(); };
    let finish!: (result: unknown) => void;
    window.gbaStudio.runEnginePackBuild = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result, rerender } = renderHook(({ session }) => useEngineActions({ contractDiagnosticsOK: true, session, setStatus: vi.fn() }), { initialProps: { session } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.runBuildRom("/tmp/export"); });
    if (change === "assets") act(() => assetChanged({ projectPath: session.path!, relativePaths: ["tile.png"] }));
    else rerender({ session: change === "switch" ? { ...session, path: "/tmp/other.gba-project" }
      : { ...session, project: { ...session.project, data: { ...session.project.data, name: "edited" } } } });
    const videoBudget = buildAssetPackVideoBudget([], { schema: 11, ok: true, allocations: [] });
    videoBudget.linkedRomBytes = 12345;
    await act(async () => { finish({ ran: true, exitCode: 0, summary: { romPath: "/tmp/export/build/test.gba", videoBudget } }); await pending; });
    expect(result.current.projectBudgetAnalysis).toBeNull();
  });
  it.each([
    ["Engine Pack", "exportEngineProject", "Exportando projeto Engine Pack..."],
    ["Web", "exportWebProject", "Exportando pacote Web / itch.io..."]
  ] as const)("mostra o início da exportação %s enquanto aguarda o IPC e encerra ao cancelar", async (_label, method, message) => {
    let finish!: (value: { canceled: true }) => void;
    const pending = new Promise<{ canceled: true }>(resolve => { finish = resolve; });
    const setStatus = vi.fn();
    window.gbaStudio[method] = vi.fn().mockReturnValue(pending);
    const { result } = renderHook(() => useEngineActions({
      contractDiagnosticsOK: true, session: projectSession("/packs/EnginePack"), setStatus
    }));
    let exporting!: Promise<unknown>;
    act(() => { exporting = result.current[method](); });
    expect(setStatus).toHaveBeenLastCalledWith(message);
    expect(result.current.exportRunning).toBe(true);
    await act(async () => { finish({ canceled: true }); await exporting; });
    expect(result.current.exportRunning).toBe(false);
    expect(setStatus).toHaveBeenLastCalledWith(expect.stringContaining("cancelada"));
  });

  it("opens a verified cached Play ROM without doctor or compilation and keeps warnings", async () => {
    inspectEnginePack.mockResolvedValue({ platform: "darwin", candidates: [], selected: {
      label: "Engine Pack", path: "/packs/EnginePack", exists: true, hasAssetc: true, hasGbsbuild: true, hasGbsdoctor: true,
      assetcPath: "/pack/assetc", gbsbuildPath: "/pack/gbsbuild"
    } });
    window.gbaStudio.exportEngineProject = vi.fn().mockResolvedValue({ canceled: false, destination: "/tmp/export",
      romPath: "/tmp/verified.gba", warnings: ["asset warning"],
      playBuildResult: { ran: true, exitCode: 0, summary: { romPath: "/tmp/verified.gba", romBytes: 4096 } },
      playDoctorResult: { ran: true, exitCode: 0 } });
    window.gbaStudio.runEnginePackDoctor = vi.fn(); window.gbaStudio.runEnginePackBuild = vi.fn();
    window.gbaStudio.openRomPlayerWindow = vi.fn().mockResolvedValue({ ok: true });
    const publishStatus = vi.fn();
    const { result } = renderHook(() => useEngineActions({ contractDiagnosticsOK: true,
      session: projectSession("/packs/EnginePack"), setStatus: vi.fn(), publishStatus,
      recordInput: true, recordingID: "record-1" }));
    await waitFor(() => expect(result.current.playProjectDisabled).toBe(false));
    vi.mocked(window.gbaStudio.runEnginePackDoctor).mockClear();
    await act(() => result.current.playProject({ roomName: "porto_lumen", startX: 12, startY: 8, startDirection: "left" }));
    expect(window.gbaStudio.exportEngineProject).toHaveBeenCalledWith(expect.objectContaining({ reusePlayRom: true }));
    expect(window.gbaStudio.runEnginePackDoctor).not.toHaveBeenCalled();
    expect(window.gbaStudio.runEnginePackBuild).not.toHaveBeenCalled();
    expect(window.gbaStudio.openRomPlayerWindow).toHaveBeenCalledWith(expect.objectContaining({ romPath: "/tmp/verified.gba", saveScope: "name:porto_lumen" }));
    expect(window.gbaStudio.openRomPlayerWindow).toHaveBeenCalledWith(expect.objectContaining({ recordInput: true, recordingID: "record-1", recordingLaunch: { roomName: "porto_lumen", startX: 12, startY: 8, startDirection: "left" } }));
    expect(result.current.buildResult?.summary?.romBytes).toBe(4096);
    expect(result.current.doctorResult?.exitCode).toBe(0);
    expect(publishStatus).toHaveBeenLastCalledWith(expect.stringContaining("asset warning"), "success");
  });
  it("requires an export before dry-run instead of passing the editable project folder", async () => {
    const runEnginePackBuildDryRun = vi.fn();
    const setStatus = vi.fn();
    window.gbaStudio.runEnginePackBuildDryRun = runEnginePackBuildDryRun;
    const { result } = renderHook(() => useEngineActions({ contractDiagnosticsOK: true, session: projectSession("/packs/EnginePack"), setStatus }));
    await act(() => result.current.runBuildDryRun());
    expect(runEnginePackBuildDryRun).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith(expect.stringContaining("Exporte"));
  });

  beforeEach(() => {
    inspectEnginePack.mockReset();
    inspectEnginePack.mockResolvedValue({ platform: "darwin", candidates: [] });
    window.gbaStudio = {
      platform: "darwin",
      inspectEnginePack,
      runEnginePackDoctor: vi.fn()
    } as unknown as GBAStudioDesktopAPI;
  });

  afterEach(cleanup);

  it("uses the exported directory and invalidates it after edits or a project switch", async () => {
    window.gbaStudio.exportEngineProject = vi.fn().mockResolvedValue({ canceled: false, destination: "/tmp/settings-test/export" });
    const dryRun = vi.fn().mockResolvedValue({ ran: true, exitCode: 0 });
    window.gbaStudio.runEnginePackBuildDryRun = dryRun;
    const session = projectSession("/packs/EnginePack");
    const { result, rerender } = renderHook(({ session }) => useEngineActions({ contractDiagnosticsOK: true, session, setStatus: vi.fn() }), { initialProps: { session } });
    await act(() => result.current.exportEngineProject({ skipPostExportChecks: true }));
    expect(result.current.hasCurrentEngineExport).toBe(true);
    await act(() => result.current.runBuildDryRun());
    expect(dryRun).toHaveBeenLastCalledWith("/tmp/settings-test/export", "/packs/EnginePack");
    rerender({ session: { ...session, project: { ...session.project, data: { ...session.project.data, name: "Edited" } } } });
    expect(result.current.hasCurrentEngineExport).toBe(false);
    await act(() => result.current.runBuildDryRun());
    expect(dryRun).toHaveBeenCalledTimes(1);
    rerender({ session: { ...session, path: "/tmp/another-project/game.gba-project" } });
    expect(result.current.hasCurrentEngineExport).toBe(false);
    await act(() => result.current.runBuildDryRun());
    expect(dryRun).toHaveBeenCalledTimes(1);
  });

  it("inspeciona novamente o Engine Pack preferido quando o projeto muda", async () => {
    const initialSession = projectSession("/packs/EnginePack-A");
    const { rerender } = renderHook(
      ({ session }) => useEngineActions({
        contractDiagnosticsOK: true,
        session,
        setStatus: vi.fn()
      }),
      { initialProps: { session: initialSession } }
    );

    await waitFor(() => expect(inspectEnginePack).toHaveBeenLastCalledWith("/packs/EnginePack-A"));

    rerender({ session: projectSession("/packs/EnginePack-B") });

    await waitFor(() => expect(inspectEnginePack).toHaveBeenLastCalledWith("/packs/EnginePack-B"));
  });

  it("expoe o motivo exato quando o Play esta bloqueado", async () => {
    const { result } = renderHook(() => useEngineActions({
      contractDiagnosticsOK: true,
      session: projectSession("/packs/ausente"),
      setStatus: vi.fn()
    }));

    await waitFor(() => expect(result.current.playProjectBlockedReasonText).toBe(
      "GBAStudio Engine Pack com assetc nao localizado."
    ));
    await act(async () => result.current.playProject());
    expect(result.current.audioPreviewStopRequest).toBe(0);
  });

  it("aplica o preflight de Saúde ao Play sem bloquear avisos", async () => {
    inspectEnginePack.mockResolvedValue({
      platform: "darwin",
      candidates: [],
      selected: {
        label: "Engine Pack",
        path: "/packs/EnginePack",
        exists: true,
        assetcPath: "/packs/EnginePack/tools/assetc",
        hasAssetc: true,
        gbsdoctorPath: "/packs/EnginePack/tools/gbsdoctor",
        hasGbsdoctor: true,
        gbsbuildPath: "/packs/EnginePack/tools/gbsbuild",
        hasGbsbuild: true
      }
    });
    const session = projectSession("/packs/EnginePack");
    const { result, rerender } = renderHook(
      ({ projectHealthExportReady }) => useEngineActions({
        contractDiagnosticsOK: true,
        projectHealthExportReady,
        session,
        setStatus: vi.fn()
      }),
      { initialProps: { projectHealthExportReady: false as boolean | null } }
    );

    await waitFor(() => expect(result.current.generateRomDisabled).toBe(true));
    rerender({ projectHealthExportReady: true });
    await waitFor(() => expect(result.current.generateRomDisabled).toBe(false));
  });

  it("mantem o aviso de conversao automatica visivel na barra depois de abrir o Play", async () => {
    inspectEnginePack.mockResolvedValue({
      platform: "darwin",
      candidates: [],
      selected: {
        label: "Engine Pack",
        path: "/packs/EnginePack",
        exists: true,
        assetcPath: "/packs/EnginePack/tools/assetc",
        hasAssetc: true,
        gbsdoctorPath: "/packs/EnginePack/tools/gbsdoctor",
        hasGbsdoctor: true,
        gbsbuildPath: "/packs/EnginePack/tools/gbsbuild",
        hasGbsbuild: true
      }
    });
    const publishStatus = vi.fn();
    const exportEngineProject = vi.fn().mockResolvedValue({
      canceled: false,
      destination: "/tmp/somente-player/build/somente_player",
      warnings: ["player.png: paleta RGBA reduzida automaticamente para 16 cores."]
    });
    window.gbaStudio = {
      platform: "darwin",
      inspectEnginePack,
      exportEngineProject,
      runEnginePackDoctor: vi.fn().mockResolvedValue({ ran: true, exitCode: 0 }),
      runEnginePackBuild: vi.fn().mockResolvedValue({
        ran: true,
        exitCode: 0,
        summary: { romPath: "/tmp/somente-player/build/somente_player.gba" }
      }),
      openRomPlayerWindow: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as GBAStudioDesktopAPI;

    const session = projectSession("/packs/EnginePack");
    const settings = session.project.data.settings as Record<string, Record<string, unknown>>;
    settings.general.startScene = "farol_prologo";
    settings.general.startSceneType = "menu";
    session.project.data.scena = { id: "scene-cave", name: "scene_cave", sceneType: "topdown" };
    const { result } = renderHook(() => useEngineActions({
      contractDiagnosticsOK: true,
      publishStatus,
      session,
      setStatus: vi.fn()
    }));
    await waitFor(() => expect(result.current.playProjectDisabled).toBe(false));

    expect(result.current.audioPreviewStopRequest).toBe(0);
    await act(async () => result.current.playProject());
    expect(result.current.audioPreviewStopRequest).toBe(1);
    await act(async () => result.current.playProject());
    expect(result.current.audioPreviewStopRequest).toBe(2);

    expect(publishStatus).toHaveBeenLastCalledWith(
      expect.stringContaining("Aviso: player.png: paleta RGBA reduzida automaticamente para 16 cores."),
      "success"
    );
    expect(exportEngineProject).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({
        data: expect.objectContaining({
          settings: expect.objectContaining({
            general: expect.objectContaining({ startScene: "farol_prologo", startSceneType: "menu" })
          })
        })
      })
    }));
  });

  it("envia a cena escolhida como override de desenvolvimento para o exportador", async () => {
    inspectEnginePack.mockResolvedValue({
      platform: "darwin",
      candidates: [],
      selected: {
        label: "Engine Pack",
        path: "/packs/EnginePack",
        exists: true,
        assetcPath: "/packs/EnginePack/tools/assetc",
        hasAssetc: true,
        gbsdoctorPath: "/packs/EnginePack/tools/gbsdoctor",
        hasGbsdoctor: true,
        gbsbuildPath: "/packs/EnginePack/tools/gbsbuild",
        hasGbsbuild: true
      }
    });
    const exportEngineProject = vi.fn().mockResolvedValue({
      canceled: false,
      destination: "/tmp/somente-player/build/somente_player",
      warnings: []
    });
    window.gbaStudio = {
      platform: "darwin",
      inspectEnginePack,
      exportEngineProject,
      runEnginePackDoctor: vi.fn().mockResolvedValue({ ran: true, exitCode: 0 }),
      runEnginePackBuild: vi.fn().mockResolvedValue({
        ran: true,
        exitCode: 0,
        summary: { romPath: "/tmp/somente-player/build/somente_player.gba" }
      }),
      openRomPlayerWindow: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as GBAStudioDesktopAPI;

    const { result } = renderHook(() => useEngineActions({
      contractDiagnosticsOK: true,
      session: projectSession("/packs/EnginePack"),
      setStatus: vi.fn()
    }));
    await waitFor(() => expect(result.current.playProjectDisabled).toBe(false));

    await act(async () => result.current.playProject({
      roomID: "room-1",
      roomName: "overworld",
      startX: 7,
      startY: 9,
      startDirection: "left"
    }));

    expect(exportEngineProject).toHaveBeenCalledWith(expect.objectContaining({
      developmentStartScene: { id: "room-1", name: "overworld", x: 7, y: 9, direction: "left" }
    }));
    expect(window.gbaStudio.openRomPlayerWindow).toHaveBeenCalledWith(expect.objectContaining({ saveScope: "id:room-1" }));
  });

  it("não abre uma ROM antiga quando o projeto muda durante o build", async () => {
    inspectEnginePack.mockResolvedValue({platform:"darwin",candidates:[],selected:{
      label:"Engine Pack",path:"/packs/EnginePack",exists:true,hasAssetc:true,hasGbsbuild:true,hasGbsdoctor:true,
      assetcPath:"/pack/assetc",gbsbuildPath:"/pack/gbsbuild",gbsdoctorPath:"/pack/gbsdoctor"
    }});
    let finish!: (value: unknown) => void;
    const build = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const open = vi.fn().mockResolvedValue({ok:true}); const setStatus = vi.fn();
    window.gbaStudio = {platform:"darwin",inspectEnginePack,
      exportEngineProject:vi.fn().mockResolvedValue({canceled:false,destination:"/tmp/export"}),
      runEnginePackDoctor:vi.fn().mockResolvedValue({ran:true,exitCode:0}),runEnginePackBuild:build,
      openRomPlayerWindow:open} as unknown as GBAStudioDesktopAPI;
    const session = projectSession("/packs/EnginePack");
    const {result,rerender}=renderHook(({session})=>useEngineActions({session,setStatus,contractDiagnosticsOK:true}),{initialProps:{session}});
    await waitFor(()=>expect(result.current.playProjectDisabled).toBe(false));
    let playing!: Promise<void>;
    act(()=>{playing=result.current.playProject();});
    await waitFor(()=>expect(build).toHaveBeenCalled());
    rerender({session:{...session,project:{...session.project,data:{...session.project.data,name:"edited"}}}});
    await act(async()=>{finish({ran:true,exitCode:0,summary:{romPath:"/tmp/old.gba"}});await playing;});
    expect(open).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/mudou.*Play novamente/i));
  });

  it("envia replay para a janela de Play quando solicitado", async () => {
    inspectEnginePack.mockResolvedValue({
      platform: "darwin",
      candidates: [],
      selected: {
        label: "Engine Pack",
        path: "/packs/EnginePack",
        exists: true,
        assetcPath: "/packs/EnginePack/tools/assetc",
        hasAssetc: true,
        gbsdoctorPath: "/packs/EnginePack/tools/gbsdoctor",
        hasGbsdoctor: true,
        gbsbuildPath: "/packs/EnginePack/tools/gbsbuild",
        hasGbsbuild: true
      }
    });
    const exportEngineProject = vi.fn().mockResolvedValue({
      canceled: false,
      destination: "/tmp/somente-player/build/somente_player",
      warnings: []
    });
    const openRomPlayerWindow = vi.fn().mockResolvedValue({ ok: true });
    window.gbaStudio = {
      platform: "darwin",
      inspectEnginePack,
      exportEngineProject,
      runEnginePackDoctor: vi.fn().mockResolvedValue({ ran: true, exitCode: 0 }),
      runEnginePackBuild: vi.fn().mockResolvedValue({
        ran: true,
        exitCode: 0,
        summary: { romPath: "/tmp/somente-player/build/somente_player.gba" }
      }),
      openRomPlayerWindow
    } as unknown as GBAStudioDesktopAPI;

    const session = projectSession("/packs/EnginePack");
    const replay = createInputReplay({ id: "replay-qa", seed: 777 });
    const { result } = renderHook(() => useEngineActions({
      contractDiagnosticsOK: true,
      session,
      setStatus: vi.fn()
    }));
    await waitFor(() => expect(result.current.playProjectDisabled).toBe(false));

    await act(async () => result.current.playProject({ replay }));

    expect(exportEngineProject.mock.calls[0]?.[0]?.developmentStartScene).toBeUndefined();
    expect(openRomPlayerWindow).toHaveBeenCalledWith(expect.objectContaining({
      romPath: "/tmp/somente-player/build/somente_player.gba",
      replay: expect.objectContaining({ id: "replay-qa", schema: 1, seed: 777 })
    }));
  });
});
