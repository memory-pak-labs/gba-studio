/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createRacingCircuitTrack } from "../shared/racingAuthoring";
import { normalizeRacingSceneConfig } from "../shared/sceneTypeProfiles";
import { RacingSceneInspector } from "./RacingSceneInspector";

afterEach(cleanup);

it("prepares positional checkpoints and a rival route for a new perspective circuit", () => {
  const onPrepare=vi.fn();
  render(<RacingSceneInspector config={normalizeRacingSceneConfig({presentation:"pseudo3d"})}
    width={30} height={20} background="floor.png" assets={[]}
    onChange={vi.fn()} onPrepare={onPrepare}/>);
  fireEvent.click(screen.getByRole("button",{name:"Preparar circuito 512 × 512"}));
  const track=onPrepare.mock.calls[0]![0];
  expect(track.finishAtZero).toBe(true);
  expect(track.checkpoints.map((gate:{x:number;y:number})=>[gate.x,gate.y]))
    .toEqual([[128,128],[384,128],[384,384],[128,384]]);
  expect(track.pathPoints).toHaveLength(4);
});

it("describes the preserved checkpoint order of older racing scenes", () => {
  const track={...createRacingCircuitTrack(64,64),finishAtZero:false};
  render(<RacingSceneInspector config={normalizeRacingSceneConfig({presentation:"topdown",topdownTrack:track})}
    width={64} height={64} background="floor.png" assets={[]}
    onChange={vi.fn()} onPrepare={vi.fn()}/>);
  expect(screen.queryByRole("group",{name:"Chegada"})).toBeNull();
  expect(screen.getByRole("group",{name:"Checkpoint 1"})).toBeTruthy();
  expect(screen.getByText(/O último completa a volta/)).toBeTruthy();
});
