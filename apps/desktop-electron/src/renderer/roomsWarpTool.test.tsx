/** @vitest-environment happy-dom */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createBlankProjectData } from "../shared/newProject";
import { createRoomInProject, deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import { RoomsWorkspace } from "./roomsWorkspace";

function handlers() {
  return {
    onCreateRoom: vi.fn(() => "room-2"),
    onSetActiveRoom: vi.fn(),
    onUpdateRoomFields: vi.fn(),
    onApplyTileBrush: vi.fn(),
    onSetActiveTileLayerMapping: vi.fn(),
    onToggleCollisionCell: vi.fn(),
    onSetCollisionType: vi.fn(),
    onApplyCollisionFill: vi.fn(),
    onSetHeightLevel: vi.fn(),
    onCreateRoomConnection: vi.fn(() => 0),
    onCreateRoomWarpConnection: vi.fn(() => 1),
    onRemoveRoomConnection: vi.fn(),
    onUpdateRoomConnection: vi.fn(),
    onUpdateRoomEntity: vi.fn(),
    onPlaceRoomEntity: vi.fn(),
    onResizeRoomTrigger: vi.fn(),
    onCreateTrigger: vi.fn(),
    onCreateActor: vi.fn(),
    onNudgeRoomEntities: vi.fn(),
    onAlignRoomEntities: vi.fn(),
    onDistributeRoomEntities: vi.fn(),
    onDuplicateRoomEntities: vi.fn(),
    onRemoveRoomEntities: vi.fn(),
    onUpdateSceneMapPosition: vi.fn(),
    onUpdateSceneMapZoom: vi.fn(),
    onUpdateSceneOrganization: vi.fn(),
    onUpdateRoomBackgroundTilesetGrid: vi.fn(),
    onRenameRoom: vi.fn(),
    onRemoveRoom: vi.fn(),
    onSetStartRoom: vi.fn(),
    onRunRoom: vi.fn(),
    onCreateEventReference: vi.fn(),
    onSynchronizePrefabs: vi.fn(),
    onCreatePrefabFromEntity: vi.fn(),
    onInstantiatePrefab: vi.fn(),
    onUpdatePrefab: vi.fn(),
    onImportTileset: vi.fn(async () => undefined),
    onImportTiledMap: vi.fn(async () => undefined)
  };
}

describe("RoomsWorkspace warp tool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("separates warp placement from selection and exposes the connection workflow", async () => {
    const user = userEvent.setup();
    const project = createRoomInProject(createBlankProjectData({ name: "Warp tool" }), {
      anchorRoomID: "room-1",
      height: 8,
      id: "room-2",
      name: "shop",
      sceneType: "topdown",
      width: 8
    });

    const actionHandlers = handlers();
    render(
      <RoomsWorkspace
        presentation={deriveRoomsWorkspacePresentation(project)}
        projectData={project}
        {...actionHandlers}
      />
    );

    await user.click(screen.getAllByRole("button", { name: /^Editar cena / })[0]!);
    const warpButton = screen.getByRole("button", { name: "Chegada avançada - Portais" });
    await user.click(warpButton);

    expect(warpButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("arraste no grid");
    expect(screen.getByRole("tab", { name: "Conexões" })).toHaveAttribute("aria-selected", "true");

    const firstCell = screen.getByRole("gridcell", { name: "Pintar tile 1" });
    fireEvent.pointerDown(firstCell, { button: 0, buttons: 1, pointerId: 9 });
    fireEvent.pointerUp(firstCell, { button: 0, buttons: 0, pointerId: 9 });

    expect(actionHandlers.onCreateRoomWarpConnection).toHaveBeenCalledWith(
      "cena_1",
      "shop",
      "",
      "exit",
      { height: 1, width: 1, x: 0, y: 0 },
      expect.any(String)
    );
  });
});
