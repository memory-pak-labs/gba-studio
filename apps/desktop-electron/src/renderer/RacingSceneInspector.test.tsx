/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createRacingCircuitTrack } from "../shared/racingAuthoring";
import { normalizeRacingSceneConfig } from "../shared/sceneTypeProfiles";
import { RacingSceneInspector } from "./RacingSceneInspector";

afterEach(cleanup);

it("explains how to reverse in a perspective circuit", () => {
  render(<RacingSceneInspector config={normalizeRacingSceneConfig({presentation:"pseudo3d",topdownTrack:createRacingCircuitTrack(64,64)})}
    width={64} height={64} background="floor.png" assets={[]} onChange={vi.fn()} onPrepare={vi.fn()}/>);
  expect(screen.getByText(/B ou ↓ freia e engata a ré após parar/)).toBeTruthy();
});

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
  expect(screen.queryByText(/engata a ré após parar/)).toBeNull();
  expect(screen.getByRole("group",{name:"Checkpoint 1"})).toBeTruthy();
  expect(screen.getByText(/O último completa a volta/)).toBeTruthy();
});

it('shows the native circuit rival speed unchanged and links geometry to the map',()=>{
 const onChange=vi.fn(),onEditTrack=vi.fn();
 render(<RacingSceneInspector config={normalizeRacingSceneConfig({presentation:'topdown',rivalSpeed:105,topdownTrack:createRacingCircuitTrack(64,64)})} width={64} height={64} background="" assets={[]} onChange={onChange} onPrepare={vi.fn()} onEditTrack={onEditTrack}/>);
 expect(screen.getByRole('spinbutton',{name:'Velocidade dos rivais'})).toHaveValue(105);
 expect(onChange).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Editar checkpoints no mapa'}));expect(onEditTrack).toHaveBeenLastCalledWith('gates');
 fireEvent.click(screen.getByRole('button',{name:'Editar rota no mapa'}));expect(onEditTrack).toHaveBeenLastCalledWith('route');
 fireEvent.change(screen.getByRole('spinbutton',{name:'Velocidade dos rivais'}),{target:{value:'106'}});expect(onChange).toHaveBeenCalledWith({rivalSpeed:106});
});
