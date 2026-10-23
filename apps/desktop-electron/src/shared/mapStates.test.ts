import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent, rebootPreviewRuntimePreservingSaves, tickPreviewRuntime } from "./previewRuntime.js";
import { updateRoomFieldsInProject, deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { readMapStates } from "./mapStates.js";

export const doorMapState = {
  id: "door", name: "Porta", variable: "map.door", variants: [
    { id: "closed", name: "Fechada", value: 0, tiles: [{ x: 4, y: 6, tile: 1, count: 1, layer: "bg2", collision: "solid" }] },
    { id: "open", name: "Aberta", value: 1, tiles: [{ x: 4, y: 6, tile: 17, count: 1, layer: "bg2", collision: "free" }] }
  ]
};

export function mapStateProject() {
  const project = createBlankProjectData({ name: "Map states", sceneType: "topdown" });
  const room = (project.rooms as Record<string, unknown>[])[0];
  room.tilemap = Array(600).fill(1);
  room.mapStates = [structuredClone(doorMapState)];
  project.events = [
    { id: "open", name: "open", roomName: room.name, command: "set_map_state door open" },
    { id: "close", name: "close", roomName: room.name, command: "set_map_state door closed" },
    { id: "save", name: "save", command: "save_game 0" },
    { id: "load", name: "load", command: "load_game 0" }
  ];
  return project;
}

describe("persistent map state authoring", () => {
  it("loads into another room without replaying its user initialization", () => {
    const project = mapStateProject();
    const room = (project.rooms as Record<string, unknown>[])[0];
    room.eventBindings = { onInit: "boot" };
    const other = { ...structuredClone(room), id: "other", name: "other", mapStates: [], eventBindings: {} };
    project.rooms = project.scenas = [room, other];
    project.events = [...project.events as Record<string, unknown>[],
      { id: "boot", name: "boot", command: "add_variable boots 1" },
      { id: "leave", name: "leave", command: "change_scene other 1 1" }];
    let state = createPreviewRuntime(project);
    expect(state.variables.boots).toBe(1);
    state = runPreviewRuntimeEvent(state, "open");
    state = runPreviewRuntimeEvent(state, "save");
    state = runPreviewRuntimeEvent(state, "leave");
    expect(state.currentRoom?.name).toBe("other");
    state = runPreviewRuntimeEvent(state, "load");
    state = tickPreviewRuntime(state, 1000 / 60);
    expect(state.variables.boots).toBe(1);
    expect(state.currentRoom?.tileCells[184]).toBe(17);
    expect(state.currentRoom?.collisionTypes[184]).toBe("free");
  });
  it("reports an unknown definition without interrupting preview", () => {
    const project = mapStateProject();
    project.events = [...project.events as Record<string, unknown>[], { id: "missing", name: "missing", command: "set_map_state missing open" }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(project), "missing");
    expect(state.eventLog.at(-1)).toMatchObject({ result: "skipped", detail: "Estado de mapa inexistente ou ambíguo: missing" });
    expect(state.currentRoom?.collisionTypes[184]).toBe("solid");
  });
  it("rejects resizing or changing scene type when definitions would become invalid", () => {
    const project = mapStateProject();
    const room = (project.rooms as Record<string, unknown>[])[0];
    room.width = 64;
    const state = (room.mapStates as typeof doorMapState[])[0];
    state.variants.forEach(variant => { variant.tiles[0].x = 50; });
    const id = deriveRoomsWorkspacePresentation(project).rooms[0].id;
    expect(() => updateRoomFieldsInProject(project, id, { width: 30 })).toThrow();
    expect(() => updateRoomFieldsInProject(project, id, { sceneType: "menu" })).toThrow(/Topdown e Platformer/);
    expect(room.width).toBe(64);
    expect(state.variants[0].tiles[0].x).toBe(50);
  });

  it("loads an unrelated saved variable value using the original map, as the ROM does", () => {
    let state = createPreviewRuntime(mapStateProject());
    state = { ...state, variables: { ...state.variables, "map.door": 99 } };
    state = runPreviewRuntimeEvent(state, "save");
    state = runPreviewRuntimeEvent(state, "open");
    state = runPreviewRuntimeEvent(state, "load");
    expect(state.variables["map.door"]).toBe(99);
    expect(state.currentRoom?.tileCells[184]).toBe(1);
    expect(state.currentRoom?.collisionTypes[184]).toBe("free");
  });

  it("changes visual, collision and saved variable together, including after reboot/load", () => {
    let state = createPreviewRuntime(mapStateProject());
    expect(state.currentRoom?.collisionTypes[184]).toBe("solid");
    state = runPreviewRuntimeEvent(state, "open");
    expect(state.currentRoom?.tileCells[184]).toBe(17);
    expect(state.currentRoom?.collisionTypes[184]).toBe("free");
    expect(state.variables["map.door"]).toBe(1);
    state = runPreviewRuntimeEvent(state, "save");
    state = runPreviewRuntimeEvent(state, "close");
    expect(state.currentRoom?.collisionTypes[184]).toBe("solid");
    state = runPreviewRuntimeEvent(state, "load");
    expect(state.currentRoom?.tileCells[184]).toBe(17);
    expect(state.currentRoom?.collisionTypes[184]).toBe("free");
    state = rebootPreviewRuntimePreservingSaves(state);
    state = runPreviewRuntimeEvent(state, "load");
    expect(state.currentRoom?.tileCells[184]).toBe(17);
    expect(state.variables["map.door"]).toBe(1);
  });

  it("preserves definitions through scene editing and rejects mismatched footprints", () => {
    const project = mapStateProject();
    const room = deriveRoomsWorkspacePresentation(project).rooms[0];
    const updated = updateRoomFieldsInProject(project, room.id, { mapStates: [doorMapState] });
    expect(deriveRoomsWorkspacePresentation(updated).rooms[0].mapStates).toEqual([doorMapState]);
    const invalid = structuredClone(doorMapState);
    invalid.variants[1].tiles[0].x = 5;
    expect(() => readMapStates([invalid], 30, 20)).toThrow(/mesmas células/);
  });
});
