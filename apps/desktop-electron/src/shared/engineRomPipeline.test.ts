import { describe, expect, it } from "vitest";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import {
  canGenerateRom,
  canPlayProject,
  generateRomBlockedReason,
  playProjectBlockedReason,
  projectDataForPlay,
  readProjectEnginePackPath,
  readProjectEmulatorPath,
  readProjectExportFolder,
  resolveRomExportRoot
} from "./engineRomPipeline.js";

describe("engineRomPipeline", () => {
  it("reads export folder and engine pack path from project settings", () => {
    const project = buildFunctionalP0Project();

    expect(readProjectExportFolder(project)).toBe("build/electron-p0");
    expect(readProjectEnginePackPath(project)).toBe("GBAStudioEnginePack");
  });

  it("resolves relative export folders beside the saved project file", () => {
    const project = buildFunctionalP0Project();
    const exportRoot = resolveRomExportRoot("/tmp/demo/game.gba-project", project);

    expect(exportRoot).toBe("/tmp/demo/build/electron-p0");
  });

  it("blocks generate ROM until prerequisites are satisfied", () => {
    expect(
      generateRomBlockedReason({
        hasSession: false,
        hasProjectPath: false,
        contractDiagnosticsOK: null,
        hasEngineAssetc: false,
        hasEngineBuild: false,
        buildRunning: false,
        exportRunning: false
      })
    ).toBe("Abra ou crie um projeto antes de gerar a ROM.");

    expect(
      canGenerateRom({
        hasSession: true,
        hasProjectPath: true,
        contractDiagnosticsOK: true,
        hasEngineAssetc: true,
        hasEngineBuild: true,
        buildRunning: false,
        exportRunning: false
      })
    ).toBe(true);
  });

  it("allows play without an external emulator because Play Window uses the embedded player", () => {
    expect(
      playProjectBlockedReason({
        hasSession: true,
        hasProjectPath: true,
        contractDiagnosticsOK: true,
        hasEngineAssetc: true,
        hasEngineBuild: true,
        buildRunning: false,
        exportRunning: false,
        emulatorPath: "",
        platform: "win32"
      })
    ).toBeUndefined();

    expect(
      canPlayProject({
        hasSession: true,
        hasProjectPath: true,
        contractDiagnosticsOK: true,
        hasEngineAssetc: true,
        hasEngineBuild: true,
        buildRunning: false,
        exportRunning: false,
        emulatorPath: "",
        platform: "darwin"
      })
    ).toBe(true);
  });

  it("blocks ROM generation only when the shared project health report is blocked", () => {
    const prerequisites = {
      hasSession: true,
      hasProjectPath: true,
      contractDiagnosticsOK: true,
      hasEngineAssetc: true,
      hasEngineBuild: true,
      buildRunning: false,
      exportRunning: false
    };

    expect(generateRomBlockedReason({ ...prerequisites, projectHealthExportReady: false })).toBe(
      "Corrija os bloqueios de saude do projeto antes de gerar a ROM."
    );
    expect(generateRomBlockedReason({ ...prerequisites, projectHealthExportReady: true })).toBeUndefined();
    expect(generateRomBlockedReason({ ...prerequisites, projectHealthExportReady: null })).toBeUndefined();
  });

  it("builds an ephemeral Play snapshot from the active room without changing the persisted start scene", () => {
    const base = buildFunctionalP0Project();
    const baseSettings = base.settings as Record<string, unknown>;
    const baseGeneral = baseSettings.general as Record<string, unknown>;
    const project = {
      ...base,
      scenas: [
        { id: "room-1", name: "room_1", sceneType: "topdown", width: 20, height: 18 },
        { id: "room-2", name: "room_2", sceneType: "topdown", width: 20, height: 18 }
      ],
      scena: { id: "room-2", name: "room_2", sceneType: "topdown", width: 20, height: 18 },
      settings: {
        ...baseSettings,
        general: {
          ...baseGeneral,
          startScene: "room_1",
          startSceneType: "topdown"
        }
      }
    };

    const playSnapshot = projectDataForPlay(project);

    expect((playSnapshot.settings as Record<string, unknown>).general).toMatchObject({
      startScene: "room_2",
      startSceneType: "topdown"
    });
    expect((project.settings as Record<string, unknown>).general).toMatchObject({ startScene: "room_1" });

    const explicitRoomSnapshot = projectDataForPlay(project, {
      roomID: "room-1",
      startX: 7,
      startY: 9,
      startDirection: "left"
    });
    expect((explicitRoomSnapshot.settings as Record<string, unknown>).general).toMatchObject({
      startScene: "room_1",
      startSceneType: "topdown",
      startX: 7,
      startY: 9,
      startDirection: "left"
    });
    expect((project.settings as Record<string, Record<string, unknown>>).general).not.toHaveProperty("startX");
  });

  it("reads emulator path from preview settings", () => {
    const project = buildFunctionalP0Project();
    expect(readProjectEmulatorPath(project)).toBe("");
    expect(readProjectEmulatorPath({
      ...project,
      settings: {
        ...(project.settings ?? {}),
        preview: {
          emulatorPath: "/Applications/mGBA.app"
        }
      }
    })).toBe("/Applications/mGBA.app");
  });
});
