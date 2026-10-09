/** @vitest-environment happy-dom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createRacingCircuitTrack } from "../shared/racingAuthoring";
import { createRoomInProject, deriveRoomsWorkspacePresentation, updateRoomFieldsInProject } from "../shared/roomsWorkspace";
import { normalizeRacingSceneConfig } from "../shared/sceneTypeProfiles";
import { RacingCircuitCamera } from "./RacingCircuitCamera";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps the approved rear car visible while the author has not chosen a circuit floor", async () => {
  let data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Preview" }),
    { id: "race", name: "race", width: 64, height: 64, sceneType: "racing" });
  const config = normalizeRacingSceneConfig({ presentation: "pseudo3d", topdownTrack: createRacingCircuitTrack(64, 64) });
  data = updateRoomFieldsInProject(data, "race", { runtime: { type: "racing", config } });
  const presentation = deriveRoomsWorkspacePresentation(data);
  const room = presentation.rooms.find(item => item.name === "race")!;
  const player = presentation.entities.find(item => item.roomName === "race" && item.isPlayer)!;
  const drawImage = vi.fn();
  const context = { drawImage, fillRect: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(240 * 160 * 4) }), putImageData: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    set src(_url: string) { queueMicrotask(() => this.onload?.()); }
  });
  render(<RacingCircuitCamera room={room} config={config} floorURL={null} panoramaURL={null}
    player={player} playerURL="approved-rear.png" />);
  await waitFor(() => expect(drawImage).toHaveBeenCalled());
  // A centered 32x32 car projects at (120,120), with no floor image required.
  expect(drawImage.mock.calls.at(-1)?.slice(1)).toEqual([0, 0, 32, 32, 104, 104, 32, 32]);
});
