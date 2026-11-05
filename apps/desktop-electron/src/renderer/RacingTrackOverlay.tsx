import {useEffect,useRef,useState,type CSSProperties,type PointerEvent,type KeyboardEvent} from 'react';
import type {RacingTopdownTrackConfig} from '../shared/sceneTypeProfiles';
import {changeRacingTrackGeometry,racingGateLabel,type RacingTrackSelection} from '../shared/racingTrackEditing';
import {useStudioUiText} from './studioUiText';

type Gesture={track:RacingTopdownTrackConfig;draft:RacingTopdownTrackConfig;selection:RacingTrackSelection;resize:boolean;x:number;y:number;sx:number;sy:number;pointer:number;element:HTMLButtonElement};
export function RacingTrackOverlay({track,width,height,mode,selection,readOnly=false,showGates=true,onSelect,onChange}:{
 track:RacingTopdownTrackConfig;width:number;height:number;mode:'gates'|'route'|'none';selection:RacingTrackSelection|null;readOnly?:boolean;showGates?:boolean;
 onSelect(selection:RacingTrackSelection):void;onChange?(track:RacingTopdownTrackConfig):void;
}){
 const ui=useStudioUiText(),root=useRef<HTMLDivElement>(null),gesture=useRef<Gesture|null>(null);
 const [draft,setDraft]=useState<RacingTopdownTrackConfig|null>(null);const signature=JSON.stringify(track);const current=draft??track;
 useEffect(()=>{gesture.current=null;setDraft(null);},[signature,mode,readOnly]);
 const finish=(pointer:number,cancel=false)=>{const g=gesture.current;if(!g||g.pointer!==pointer)return;gesture.current=null;setDraft(null);if(g.element.hasPointerCapture(pointer))g.element.releasePointerCapture(pointer);if(!cancel&&g.draft!==g.track)onChange?.(g.draft);};
 useEffect(()=>{const release=(e:globalThis.PointerEvent)=>{if(gesture.current?.pointer===e.pointerId){e.stopPropagation();finish(e.pointerId,e.type==='pointercancel');}};window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);return()=>{window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true);};},[onChange]);
 const start=(e:PointerEvent<HTMLButtonElement>,item:RacingTrackSelection,resize=false)=>{e.stopPropagation();if(e.button!==0)return;e.preventDefault();e.currentTarget.focus();onSelect(item);if(readOnly||!onChange)return;const b=root.current!.getBoundingClientRect();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={track,draft:track,selection:item,resize,x:e.clientX,y:e.clientY,sx:b.width/width||1,sy:b.height/height||1,pointer:e.pointerId,element:e.currentTarget};};
 const move=(e:PointerEvent<HTMLButtonElement>)=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;e.stopPropagation();const snap=e.altKey?1:8;g.draft=changeRacingTrackGeometry(g.track,g.selection,Math.round((e.clientX-g.x)/g.sx/snap)*snap,Math.round((e.clientY-g.y)/g.sy/snap)*snap,width,height,g.resize);setDraft(g.draft);};
 const key=(e:KeyboardEvent<HTMLButtonElement>,item:RacingTrackSelection,resize=false)=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();if(gesture.current)finish(gesture.current.pointer,true);return;}const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.stopPropagation();e.preventDefault();if(!readOnly&&onChange)onChange(changeRacingTrackGeometry(track,item,delta[0]*(e.shiftKey?8:1),delta[1]*(e.shiftKey?8:1),width,height,resize));};
 const events=(item:RacingTrackSelection,resize=false)=>({onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>start(e,item,resize),onPointerMove:move,onPointerUp:(e:PointerEvent<HTMLButtonElement>)=>{e.stopPropagation();finish(e.pointerId);},onPointerCancel:(e:PointerEvent<HTMLButtonElement>)=>finish(e.pointerId,true),onLostPointerCapture:(e:PointerEvent<HTMLButtonElement>)=>finish(e.pointerId,true),onKeyDown:(e:KeyboardEvent<HTMLButtonElement>)=>key(e,item,resize),onFocus:()=>onSelect(item),onClick:(e:React.MouseEvent)=>{e.stopPropagation();onSelect(item);}});
 const pointStyle=(x:number,y:number):CSSProperties=>({left:`${x/width*100}%`,top:`${y/height*100}%`});
 const points=current.pathPoints??[];
 return <div ref={root} className="racing-track-editor" aria-label={ui('Guias do circuito')}>
  <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} className="racing-track-guides">
   {points.length>1?<polygon points={points.map(p=>`${p.x},${p.y}`).join(' ')} className="racing-track-route"/>:null}
   {points.map((p,i)=>{const next=points[(i+1)%points.length];if(!next)return null;const x=(p.x+next.x)/2,y=(p.y+next.y)/2,angle=Math.atan2(next.y-p.y,next.x-p.x)*180/Math.PI;return <path key={i} d="M -4 -3 L 0 0 L -4 3" transform={`translate(${x} ${y}) rotate(${angle})`} className="racing-track-direction"/>;})}
   {showGates?current.checkpoints.map((g,i)=><g key={g.id} className={i===0&&current.finishAtZero?'racing-track-gate is-finish':'racing-track-gate'}><rect x={g.x-Math.floor(g.width/2)} y={g.y-Math.floor(g.height/2)} width={g.width} height={g.height}/><text fontSize="8" x={g.x} y={g.y-4} textAnchor="middle">{i===0&&current.finishAtZero?ui('Chegada'):i+(current.finishAtZero?0:1)}</text></g>):null}
  </svg>
  {showGates&&mode==='gates'?current.checkpoints.map((g,i)=>{const item:RacingTrackSelection={kind:'gate',id:g.id},label=ui(racingGateLabel(current,i)),selected=selection?.kind==='gate'&&selection.id===g.id;return <div key={g.id}>
   <button type="button" aria-label={ui('Selecionar {0}',{0:label})} aria-pressed={selected} aria-disabled={readOnly} className={`racing-track-gate-handle${selected?' is-selected':''}`} style={{...pointStyle(g.x-Math.floor(g.width/2),g.y-Math.floor(g.height/2)),width:`${g.width/width*100}%`,height:`${g.height/height*100}%`}} {...events(item)}/>
   {selected?<button type="button" className="racing-track-resize" aria-label={ui('Redimensionar {0}',{0:label})} aria-disabled={readOnly} style={pointStyle(g.x-Math.floor(g.width/2)+g.width,g.y-Math.floor(g.height/2)+g.height)} {...events(item,true)}/>:null}
  </div>;}):null}
  {mode==='route'?points.map((p,i)=><button key={i} type="button" className="racing-track-point" aria-label={ui('Mover ponto {0} da rota',{0:i+1})} aria-pressed={selection?.kind==='point'&&selection.index===i} aria-disabled={readOnly} style={pointStyle(p.x,p.y)} {...events({kind:'point',index:i})}>{i+1}</button>):null}
 </div>;
}
