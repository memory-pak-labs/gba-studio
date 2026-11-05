import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject } from "../shared/roomsWorkspace.js";

// Tests that edit or export a scene must author one explicitly, just as the editor does.
export function createBlankProjectWithScene(options: { name: string }) {
  return createRoomInProject(buildProjectFromTemplate("blank", options), {
    id: "room-1", name: "cena_1", sceneType: "topdown", width: 30, height: 20
  });
}
