import { useRef, useState, type ReactNode } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import type { RoomsWorkspaceEntity, RoomsWorkspaceRoom, UpdateRoomEntityFields } from "../shared/roomsWorkspace/core";
import { dungeonViewportCells, pickDungeonViewportCell, type DungeonViewportCell } from "../shared/dungeonSceneEditing";
import { dungeonActorVisual, dungeonPlayerActor, dungeonPlayerVisual, projectDungeonActor, type DungeonCamera } from "../shared/dungeonSceneView";
import { useStudioUiText } from "./studioUiText";

interface Props {
  room: RoomsWorkspaceRoom; entities: RoomsWorkspaceEntity[]; projectData?: GBAProjectData | null;
  camera: DungeonCamera; scale: number; mode: string; locked: boolean; selected: string[];
  actorsLocked?: boolean; triggersLocked?: boolean;
  showBounds?: boolean; showGrid?: boolean; showActors?: boolean; showTriggers?: boolean; children?: ReactNode;
  onSelect: (keys: string[]) => void;
  onMove: (kind: "actor" | "trigger", id: string, fields: UpdateRoomEntityFields) => void;
  onPlace: (cell: {x:number;y:number}) => void;
}
/** Screen handles are projected from cells; only a valid cell is persisted on drop. */
export function DungeonViewportEditor(p: Props): React.ReactElement {
  const ui = useStudioUiText(), surface = useRef<HTMLDivElement>(null);
  const grid = {width:p.room.width,height:p.room.height,cells:p.room.collisionCells};
  const drag = useRef<{entity:RoomsWorkspaceEntity; pointer:number; x:number;y:number;footX:number;footY:number;anchor?:{x:number;y:number}} | null>(null);
  const [screenDrop,setScreenDrop]=useState<{x:number;y:number}|null>(null);
  const [destination, setDestination] = useState<DungeonViewportCell | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<DungeonViewportCell | null>(null);
  const config=p.room.runtime?.config as Record<string,unknown>|undefined;
  const projectionOptions={modern:Boolean(config?.presentation),viewDistance:Number(config?.viewDistance??8)};
  const editable = ["select","actor","trigger"].includes(p.mode);
  const targets = !p.locked && !drag.current?.anchor && (["actor","trigger","collision"].includes(p.mode) || dragging)
    ? dungeonViewportCells(grid,p.camera,p.mode==="collision",projectionOptions) : [];
  const entityLocked = (entity: RoomsWorkspaceEntity) => p.locked || (entity.kind==="actor" ? p.actorsLocked : p.triggersLocked);
  function dropCell(clientX:number,clientY:number) {
    const current=drag.current;
    if (!current) return null;
    const next=pickDungeonViewportCell(grid,p.camera,{x:current.footX+(clientX-current.x)/p.scale,y:current.footY+(clientY-current.y)/p.scale},projectionOptions);
    if (!next || next.x+current.entity.width>grid.width || next.y+current.entity.height>grid.height) return null;
    for(let y=next.y;y<next.y+current.entity.height;y++) for(let x=next.x;x<next.x+current.entity.width;x++) if(grid.cells[y*grid.width+x]!==false)return null;
    return next;
  }
  function cancel() { drag.current=null;setDragging(false);setDestination(null);setScreenDrop(null); }
  const playerActor=p.projectData?dungeonPlayerActor(p.projectData,p.room):null;
  const playerVisual=p.projectData&&p.showActors!==false?dungeonPlayerVisual(p.projectData,p.room):null;
  const playerEntity=playerVisual?p.entities.find(e=>e.kind==="actor"&&e.id===playerVisual.actorId):null;
  const screenAnchor=(current:NonNullable<typeof drag.current>,clientX:number,clientY:number)=>({
    x:Math.max(-128,Math.min(368,Math.round(current.anchor!.x+(clientX-current.x)/p.scale))),
    y:Math.max(-128,Math.min(288,Math.round(current.anchor!.y+(clientY-current.y)/p.scale)))
  });
  const projected = p.entities.filter(e=>e.kind==="actor" ? p.showActors!==false&&e.id!==playerActor?.id : p.showTriggers!==false).flatMap(entity=>{
    const raw=Array.isArray(p.projectData?.actors)?p.projectData.actors.find(a=>a && typeof a==="object" && (a as Record<string,unknown>).id===entity.id) as Record<string,unknown>|undefined:undefined;
    if(entity.kind==="actor" && raw?.dungeonViewAnchor && typeof raw.dungeonViewAnchor==="object")return [];
    const projection=projectDungeonActor(grid,p.camera,entity,entity.kind==="trigger"||Boolean(raw?.dungeonCell),entity.kind==="actor"?{...projectionOptions,wallMounted:raw?.dungeonWallMounted===true}:undefined);
    const visual=projection && entity.kind==="actor" && raw && p.projectData ? dungeonActorVisual(p.projectData,raw,projection,Boolean((p.room.runtime?.config as Record<string,unknown>)?.presentation)) : null;
    return projection ? [{entity,projection,visual}] : [];
  }).sort((a,b)=>b.projection.distance-a.projection.distance);
  return <div ref={surface} className={`dungeon-edit-surface${p.showBounds===false?" is-bounds-hidden":""}${dragging?" is-dragging":""}`} aria-label={ui("Canvas editável Dungeon · 240 × 160")} style={{width:240*p.scale,height:160*p.scale}}
    onPointerMove={event=>{if(drag.current?.pointer===event.pointerId){if(drag.current.anchor)setScreenDrop(screenAnchor(drag.current,event.clientX,event.clientY));else setDestination(dropCell(event.clientX,event.clientY));}}}
    onPointerUp={event=>{
      const current=drag.current;if(!current||current.pointer!==event.pointerId)return;
      if(current.anchor){
        const anchor=screenAnchor(current,event.clientX,event.clientY);cancel();
        if(!entityLocked(current.entity)&&editable&&(anchor.x!==current.anchor.x||anchor.y!==current.anchor.y))p.onMove("actor",current.entity.id,{dungeonViewAnchor:anchor});
        return;
      }
      const cell=dropCell(event.clientX,event.clientY);cancel();
      if(!entityLocked(current.entity) && editable && cell && (cell.x!==current.entity.x||cell.y!==current.entity.y))p.onMove(current.entity.kind,current.entity.id,{x:cell.x,y:cell.y});
    }} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event=>{if(event.key==="Escape"&&drag.current){event.preventDefault();event.stopPropagation();cancel();}}}>
    {p.children}
    {p.showGrid!==false?<div aria-label={ui("Grade de tiles · 8 × 8 px")} className="dungeon-tile-grid" style={{backgroundSize:`${8*p.scale}px ${8*p.scale}px`}}/>:null}
    <div className="dungeon-edit-handles" style={{height:128*p.scale}}>
      {targets.map(cell=><button key={`${cell.x},${cell.y}`} type="button" className={`dungeon-floor-cell${cell.blocked?" is-wall":""}`} style={{left:(cell.screenX- Math.min(18,40/cell.distance))*p.scale,top:(cell.screenY-3)*p.scale,width:Math.min(36,80/cell.distance)*p.scale,height:6*p.scale}}
        aria-label={ui("Célula {0}, {1} · {2}",{0:cell.x,1:cell.y,2:ui(cell.blocked?"parede":"passagem")})}
        onPointerEnter={()=>setHover(cell)} onPointerLeave={()=>setHover(null)}
        onClick={()=>{if(!p.locked&&!drag.current)p.onPlace({x:cell.x,y:cell.y});}}><span>{cell.x}, {cell.y}</span></button>)}
      {projected.map(({entity,projection,visual})=>{
        const selected=p.selected.includes(`${entity.kind}:${entity.id}`);
        return <button key={`${entity.kind}:${entity.id}`} type="button" className={`dungeon-entity-handle is-${entity.kind}${selected?" is-selected":""}`}
          aria-label={ui("Selecionar {0} · célula {1}, {2}",{0:entity.name,1:entity.x,2:entity.y})} aria-pressed={selected}
          style={{left:(visual?.x??projection.x)*p.scale,top:(visual?.y??projection.y)*p.scale,width:(visual?.width??projection.size)*p.scale,height:(visual?.height??projection.size)*p.scale,pointerEvents:editable?"auto":"none",zIndex:10+(8-projection.distance)*2+(entity.kind==="actor"?1:0)+(p.mode==="trigger"&&entity.kind==="trigger"?30:0)}}
          onClick={()=>{if(editable)p.onSelect([`${entity.kind}:${entity.id}`]);}}
          onPointerDown={event=>{
            if(event.button!==0||!editable)return;event.stopPropagation();p.onSelect([`${entity.kind}:${entity.id}`]);
            if(entityLocked(entity))return;
            drag.current={entity,pointer:event.pointerId,x:event.clientX,y:event.clientY,footX:projection.x+projection.size/2,footY:projection.y+projection.size};
            surface.current?.setPointerCapture?.(event.pointerId);setDragging(true);setDestination(null);
          }}><span>{entity.name} · {entity.x}, {entity.y}</span></button>;
      })}
      {playerVisual&&playerEntity?<button type="button" className={`dungeon-entity-handle is-actor${p.selected.includes("actor:"+playerEntity.id)?" is-selected":""}`}
        aria-label={ui("Selecionar {0} · primeira pessoa",{0:playerEntity.name})}
        aria-pressed={p.selected.includes("actor:"+playerEntity.id)}
        style={{left:(playerVisual.x+(screenDrop?screenDrop.x-playerVisual.anchorX:0))*p.scale,top:(playerVisual.y+(screenDrop?screenDrop.y-playerVisual.anchorY:0))*p.scale,width:playerVisual.width*p.scale,height:playerVisual.height*p.scale,zIndex:100,pointerEvents:editable?"auto":"none"}}
        onClick={()=>{if(editable)p.onSelect(["actor:"+playerEntity.id]);}}
        onPointerDown={event=>{
          if(event.button!==0||!editable)return;event.stopPropagation();p.onSelect(["actor:"+playerEntity.id]);if(entityLocked(playerEntity))return;
          drag.current={entity:playerEntity,pointer:event.pointerId,x:event.clientX,y:event.clientY,footX:0,footY:0,anchor:{x:playerVisual.anchorX,y:playerVisual.anchorY}};
          surface.current?.setPointerCapture?.(event.pointerId);setDragging(true);setDestination(null);
        }}><span>{ui("Jogador · primeira pessoa")}</span></button>:null}
      {dragging && destination?<div className="dungeon-drop-marker" style={{left:destination.screenX*p.scale,top:destination.screenY*p.scale}}>{destination.x}, {destination.y}</div>:null}
    </div>
    {hover||dragging?<output className="dungeon-cell-feedback">{drag.current?.anchor ? ui("Âncora no viewport: {0}, {1}",{0:screenDrop?.x??drag.current.anchor.x,1:screenDrop?.y??drag.current.anchor.y}) : dragging ? destination ? ui("Mover para célula {0}, {1}",{0:destination.x,1:destination.y}) : ui("Solte sobre uma célula livre") : ui("Célula {0}, {1}",{0:hover!.x,1:hover!.y})}</output>:null}
  </div>;
}
