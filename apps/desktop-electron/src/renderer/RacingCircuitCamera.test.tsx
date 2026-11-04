/** @vitest-environment happy-dom */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createRacingCircuitTrack } from "../shared/racingAuthoring";
import { createRoomInProject, deriveRoomsWorkspacePresentation, updateRoomFieldsInProject } from "../shared/roomsWorkspace";
import { normalizeRacingSceneConfig } from "../shared/sceneTypeProfiles";
import { desktopAssetURL, parseDesktopAssetURL } from "../shared/spriteAssetURL";
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

it("extends the panorama's lower edge behind the track instead of showing the editor placeholder", async () => {
  let data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Preview" }),
    { id: "race", name: "race", width: 64, height: 64, sceneType: "racing" });
  const config = normalizeRacingSceneConfig({ presentation: "pseudo3d", topdownTrack: createRacingCircuitTrack(64, 64) });
  data = updateRoomFieldsInProject(data, "race", { runtime: { type: "racing", config } });
  const room = deriveRoomsWorkspacePresentation(data).rooms.find(item => item.name === "race")!;
  const pixels = new Uint8ClampedArray(240 * 160 * 4);
  const horizon = config.pseudo3dVisuals?.horizonY ?? 48;
  pixels.set([0, 88, 208, 255], ((horizon - 1) * 240) * 4);
  const putImageData = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(), fillRect: vi.fn(), getImageData: () => ({ data: pixels }), putImageData
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("Image", class { width = 256; height = 64; onload: (() => void) | null = null;
    set src(_url: string) { queueMicrotask(() => this.onload?.()); } });
  render(<RacingCircuitCamera room={room} config={config} floorURL={null} panoramaURL="data:image/png;base64,AA=="
    player={null} playerURL={null} />);
  await waitFor(() => expect(putImageData).toHaveBeenCalled());
  expect(Array.from(pixels.slice((100 * 240 + 10) * 4, (100 * 240 + 10) * 4 + 4))).toEqual([0, 88, 208, 255]);
});

it.each([
  ["desktop protocol", desktopAssetURL("/tmp/game/Assets/race.png"), "/tmp/game/Assets/race.png"],
  ["Windows file URL", "file:///C%3A/Meu%20jogo/Assets/race.png", "C:/Meu jogo/Assets/race.png"]
])("renders the track and vehicle using canvas-readable local images (%s)", async (_label, url, expectedPath) => {
  let data = createRoomInProject(buildProjectFromTemplate("blank", { name: "Preview" }),
    { id: "race", name: "race", width: 64, height: 64, sceneType: "racing" });
  const config = normalizeRacingSceneConfig({ presentation: "pseudo3d", topdownTrack: createRacingCircuitTrack(64, 64) });
  data = updateRoomFieldsInProject(data, "race", { runtime: { type: "racing", config } });
  const presentation = deriveRoomsWorkspacePresentation(data);
  const room = presentation.rooms.find(item => item.name === "race")!;
  const player = presentation.entities.find(item => item.roomName === "race" && item.isPlayer)!;
  const loaded: { src: string; crossOrigin: string | null }[] = [];
  class LocalImage {
    width = 8; height = 8; crossOrigin: string | null = null; srcValue = "";
    onload: (() => void) | null = null;
    set src(src: string) { this.srcValue = src; loaded.push({ src, crossOrigin: this.crossOrigin }); queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal("Image", LocalImage);
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  const putImageData = vi.fn();
  const drawVehicle = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    let context = contexts.get(this);
    if (!context) {
      let tainted = false;
      context = {
        fillRect: vi.fn(), putImageData,
        drawImage: (image: LocalImage, ...args: number[]) => {
          if ((image.srcValue.startsWith("gba-asset:") || image.srcValue.startsWith("file:")) && image.crossOrigin !== "anonymous") tainted = true;
          if (args.length === 8 && args[6] === 32 && args[7] === 32) drawVehicle(...args);
        },
        getImageData: (_x: number, _y: number, width: number, height: number) => {
          if (tainted) throw new DOMException("The canvas has been tainted by cross-origin data.", "SecurityError");
          return { data: new Uint8ClampedArray(width * height * 4) };
        }
      } as unknown as CanvasRenderingContext2D;
      contexts.set(this, context);
    }
    return context;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  const { queryByRole } = render(<RacingCircuitCamera room={room} config={config} floorURL={url} panoramaURL={url}
    player={player} playerURL={url} />);
  await waitFor(() => expect(putImageData).toHaveBeenCalled());
  expect(drawVehicle).toHaveBeenCalled();
  expect(queryByRole("status")).toBeNull();
  expect(loaded).toHaveLength(3);
  expect(loaded.every(image => image.crossOrigin === "anonymous" && parseDesktopAssetURL(image.src) === expectedPath)).toBe(true);
});
