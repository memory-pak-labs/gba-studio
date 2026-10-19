/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBlankProjectData } from "../shared/newProject";
import { createAdvancedHudPresetInProject, DEFAULT_HUD_PRESET, resolveExplicitHudPresetBinding } from "../shared/hudPresets";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import { DungeonSceneEditor } from "./DungeonSceneEditor";
import { RoomHudOverlay } from "./roomsWorkspace";
vi.mock("./DungeonScenePreview", () => ({
  dungeonStart: () => ({x:1,y:1,direction:0}),
  DungeonScenePreview: ({hud}: {hud: React.ReactNode}) => <div>{hud}</div>
}));
afterEach(cleanup);
it("moves the HUD in logical pixels at 3x magnification", () => {
  const data = createAdvancedHudPresetInProject(createBlankProjectData({name:"Dungeon HUD drag"}),DEFAULT_HUD_PRESET.id,"dungeon-hud","Dungeon HUD");
  const room = deriveRoomsWorkspacePresentation(data).rooms[0]!;
  const binding = resolveExplicitHudPresetBinding(data,{roomID:room.id,roomPresetId:"dungeon-hud"})!;
  const original = binding.preset.components.find(c=>c.id==="hud-status")!;
  const update = vi.fn();
  render(<DungeonSceneEditor room={room} entities={[]} projectData={data} mode="hud" tool="brush" collision="solid" locked={false} selected={[]} viewMode="viewport" previewVisible={false} onClosePreview={()=>{}}
    onSelect={()=>{}} onCell={()=>{}} onCollision={()=>{}} onUpdate={()=>{}} onEntity={()=>{}}
    renderHud={(_camera,scale)=><RoomHudOverlay binding={binding} viewportScale={scale} editable canEdit onUpdateHudPreset={update}/>} />);
  fireEvent.change(screen.getByLabelText("Ampliação da câmera"),{target:{value:"3"}});
  const status=screen.getByRole("button",{name:"Editar Status"});
  fireEvent.pointerDown(status,{button:0,pointerId:1,clientX:100,clientY:100});
  fireEvent.pointerMove(status,{pointerId:1,clientX:148,clientY:100});
  fireEvent.pointerUp(status,{pointerId:1,clientX:148,clientY:100});
  expect(update).toHaveBeenCalledWith("dungeon-hud",expect.objectContaining({components:expect.arrayContaining([expect.objectContaining({id:original.id,x:original.x+16,y:original.y})])}));
});
