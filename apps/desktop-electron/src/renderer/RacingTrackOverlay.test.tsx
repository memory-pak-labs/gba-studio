/** @vitest-environment happy-dom */
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {createRacingCircuitTrack} from '../shared/racingAuthoring';
import {RacingTrackOverlay} from './RacingTrackOverlay';
afterEach(cleanup);
function setup(readOnly=false){const track=createRacingCircuitTrack(64,64),change=vi.fn(),select=vi.fn();const result=render(<RacingTrackOverlay track={track} width={512} height={512} mode="gates" selection={{kind:'gate',id:track.checkpoints[1].id}} onSelect={select} onChange={change} readOnly={readOnly}/>);
 result.container.firstElementChild!.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:1024,bottom:1024,width:1024,height:1024,toJSON(){}});
 for(const button of screen.getAllByRole('button')){button.setPointerCapture=vi.fn();button.releasePointerCapture=vi.fn();button.hasPointerCapture=()=>true;}
 return {...result,track,change,select,gate:screen.getByRole('button',{name:'Selecionar Checkpoint 1'})};}
it('commits a zoomed drag once on release outside the handle',()=>{const {gate,change}=setup();fireEvent.pointerDown(gate,{pointerId:2,button:0,clientX:100,clientY:100});fireEvent.pointerMove(gate,{pointerId:2,clientX:116,clientY:132});expect(change).not.toHaveBeenCalled();fireEvent.pointerUp(window,{pointerId:2});fireEvent.pointerUp(gate,{pointerId:2});expect(change).toHaveBeenCalledTimes(1);expect(change.mock.calls[0][0].checkpoints[1]).toMatchObject({x:392,y:144});});
it('cancels changes with Escape and respects locked geometry',()=>{const {gate,change}=setup();fireEvent.pointerDown(gate,{pointerId:2,button:0,clientX:100,clientY:100});fireEvent.pointerMove(gate,{pointerId:2,clientX:116,clientY:132});fireEvent.keyDown(gate,{key:'Escape'});fireEvent.pointerUp(window,{pointerId:2});expect(change).not.toHaveBeenCalled();cleanup();const locked=setup(true);fireEvent.keyDown(locked.gate,{key:'ArrowRight'});expect(locked.change).not.toHaveBeenCalled();});
it('offers resize and one-pixel keyboard precision',()=>{const {change}=setup();fireEvent.keyDown(screen.getByRole('button',{name:'Redimensionar Checkpoint 1'}),{key:'ArrowRight'});expect(change.mock.calls[0][0].checkpoints[1]).toMatchObject({width:33,x:384});});
it('edits route points and renders the closing segment',()=>{const track=createRacingCircuitTrack(64,64),change=vi.fn();const {container}=render(<RacingTrackOverlay track={track} width={512} height={512} mode="route" selection={null} onSelect={vi.fn()} onChange={change}/>);expect(container.querySelector('polygon')).toBeTruthy();fireEvent.keyDown(screen.getByRole('button',{name:'Mover ponto 1 da rota'}),{key:'ArrowDown',shiftKey:true});expect(change.mock.calls[0][0].pathPoints[0]).toEqual({x:128,y:136});});
