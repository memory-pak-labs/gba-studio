import { describe, expect, it } from "vitest";

import {
  createEditorSceneGroup,
  defaultEditorRailExpandState,
  deriveEditorSceneOrganization,
  moveEditorSceneToGroup,
  removeEditorSceneGroup,
  renameEditorSceneGroup,
  reorderEditorScene,
  roomTreeSubtitle,
  toggleEditorRailSection,
  updateEditorSceneOrganizationInProject
} from "./editorProjectRail.js";

describe("editorProjectRail", () => {
  it("toggles a single explorer section", () => {
    expect(toggleEditorRailSection(defaultEditorRailExpandState, "project")).toEqual({
      ...defaultEditorRailExpandState,
      project: false
    });
  });

  it("builds room subtitles with scene markers", () => {
    expect(roomTreeSubtitle({
      sceneType: "topdown",
      isStart: true,
      isActive: true
    })).toBe("topdown · inicial · ativa");
  });

  it("normalizes persisted scene order and groups without losing new scenes", () => {
    expect(deriveEditorSceneOrganization(
      [{ id: "scene-a" }, { id: "scene-b" }, { id: "scene-c" }],
      {
        sceneExplorer: {
          order: ["scene-c", "missing", "scene-c"],
          groups: [{ id: "story", name: "História", sceneIDs: ["scene-c", "missing"] }]
        }
      }
    )).toEqual({
      order: ["scene-c", "scene-a", "scene-b"],
      groups: [{ id: "story", name: "História", sceneIDs: ["scene-c"] }]
    });
  });

  it("reorders, groups, renames and removes scene groups", () => {
    const base = deriveEditorSceneOrganization([{ id: "scene-a" }, { id: "scene-b" }], undefined);
    const grouped = createEditorSceneGroup(base, "story", "História");
    const moved = moveEditorSceneToGroup(reorderEditorScene(grouped, "scene-b", "scene-a"), "scene-b", "story");
    expect(moved).toEqual({
      order: ["scene-b", "scene-a"],
      groups: [{ id: "story", name: "História", sceneIDs: ["scene-b"] }]
    });
    expect(renameEditorSceneGroup(moved, "story", "Prólogo").groups[0]?.name).toBe("Prólogo");
    expect(removeEditorSceneGroup(moved, "story").groups).toEqual([]);
  });

  it("persists organization in the editor-only project state", () => {
    const project = { editorState: { sceneMapZoom: 1 } };
    const organization = {
      order: ["scene-b", "scene-a"],
      groups: [{ id: "story", name: "História", sceneIDs: ["scene-b"] }]
    };
    const next = updateEditorSceneOrganizationInProject(project, organization);
    expect(next.editorState).toEqual({ sceneMapZoom: 1, sceneExplorer: organization });
    expect(project.editorState).toEqual({ sceneMapZoom: 1 });
  });
});
