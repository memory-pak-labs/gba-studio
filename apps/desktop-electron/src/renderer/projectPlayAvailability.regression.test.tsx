/** @vitest-environment happy-dom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createRoomInProject } from "../shared/roomsWorkspace";
import { summarizeGBAProject } from "../shared/projectFile";
import { deriveProjectActionMenuItems } from "../shared/projectActions";
import type { ProjectSession } from "./projectSession";
import { useWorkspacePresentations } from "./useWorkspacePresentations";
import { workspaceNames } from "./workspaceNavigation";

afterEach(cleanup);

describe("project Play availability across workspaces", () => {
  it.each(workspaceNames)("uses project scenes in %s even when its scene presentation is absent", (workspace) => {
    const blank = buildProjectFromTemplate("blank", { name: "Play availability" });
    const data = createRoomInProject(blank, { id: "first-scene", name: "Praia", sceneType: "topdown", width: 30, height: 20 });
    const session: ProjectSession = { path: "/tmp/play/project.gba-project", project: { data, summary: summarizeGBAProject(data) },
      dirty: false, undoStack: [], redoStack: [] };
    const { result, rerender } = renderHook(({ currentSession }) => useWorkspacePresentations(currentSession, workspace),
      { initialProps: { currentSession: session } });
    expect(result.current.projectHasScenes).toBe(true);
    const menu = deriveProjectActionMenuItems({ hasSession: true, hasProjectPath: true, contractDiagnosticsOK: true,
      hasEngineAssetc: true, hasEngineBuild: true, hasScenes: result.current.projectHasScenes, buildRunning: false, exportRunning: false });
    expect(menu.find(item => item.id === "export-rom-engine")?.disabled).toBe(false);
    rerender({ currentSession: { ...session, project: { data: blank, summary: summarizeGBAProject(blank) } } });
    expect(result.current.projectHasScenes).toBe(false);
    const emptyMenu = deriveProjectActionMenuItems({ hasSession: true, hasProjectPath: true, contractDiagnosticsOK: true,
      hasEngineAssetc: true, hasEngineBuild: true, hasScenes: result.current.projectHasScenes, buildRunning: false, exportRunning: false });
    expect(emptyMenu.find(item => item.id === "export-rom-engine")?.disabled).toBe(true);
  });
});
