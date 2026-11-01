import type {RacingTopdownTrackConfig} from './sceneTypeProfiles.js';
export type RacingTrackSelection={kind:'gate';id:string}|{kind:'point';index:number};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,Math.round(v)));
export function racingGateLabel(track:RacingTopdownTrackConfig,index:number):string {
 return track.finishAtZero && index===0 ? 'Linha de chegada' : `Checkpoint ${track.finishAtZero?index:index+1}`;
}
export function changeRacingTrackGeometry(track:RacingTopdownTrackConfig,selection:RacingTrackSelection,dx:number,dy:number,width:number,height:number,resize=false):RacingTopdownTrackConfig {
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return track;
 if(selection.kind==='point'){
  if(!track.pathPoints?.[selection.index])return track;
  return {...track,pathPoints:track.pathPoints.map((p,i)=>i===selection.index?{x:clamp(p.x+dx,0,width-1),y:clamp(p.y+dy,0,height-1)}:p)};
 }
 if(!track.checkpoints.some(g=>g.id===selection.id))return track;
 return {...track,checkpoints:track.checkpoints.map(g=>{
  if(g.id!==selection.id)return g;
  if(!resize)return {...g,x:clamp(g.x+dx,0,width-1),y:clamp(g.y+dy,0,height-1)};
  const left=g.x-Math.floor(g.width/2),top=g.y-Math.floor(g.height/2);
  const w=clamp(g.width+dx,1,Math.min(256,width-left)),h=clamp(g.height+dy,1,Math.min(256,height-top));
  return {...g,x:clamp(left+Math.floor(w/2),0,width-1),y:clamp(top+Math.floor(h/2),0,height-1),width:w,height:h};
 })};
}
export function insertRacingRoutePoint(track:RacingTopdownTrackConfig,after:number):RacingTopdownTrackConfig {
 const points=track.pathPoints??[];if(points.length<2||points.length>=32)return track;
 const index=clamp(after,0,points.length-1),a=points[index],b=points[(index+1)%points.length];
 return {...track,pathPoints:[...points.slice(0,index+1),{x:Math.round((a.x+b.x)/2),y:Math.round((a.y+b.y)/2)},...points.slice(index+1)]};
}
export function removeRacingTrackElement(track:RacingTopdownTrackConfig,selection:RacingTrackSelection):RacingTopdownTrackConfig {
 if(selection.kind==='point')return (track.pathPoints?.length??0)>2 ? {...track,pathPoints:track.pathPoints!.filter((_,i)=>i!==selection.index)} : track;
 const index=track.checkpoints.findIndex(g=>g.id===selection.id);
 return index<0||track.checkpoints.length<=1||(index===0&&track.finishAtZero) ? track : {...track,checkpoints:track.checkpoints.filter(g=>g.id!==selection.id)};
}
