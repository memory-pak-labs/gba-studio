/** @vitest-environment happy-dom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject";
import { summarizeGBAProject } from "../shared/projectFile";
import { createInputReplay } from "../shared/inputReplay";
import type { EnginePackStatus, GBAStudioDesktopAPI } from "../shared/ipc";
import type { ProjectSession } from "./projectSession";
import { useEngineActions } from "./useEngineActions";

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
