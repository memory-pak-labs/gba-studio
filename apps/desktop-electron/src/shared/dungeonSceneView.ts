import type { GBAProjectData } from "./projectFile.js";
/** Logical maze coordinates are independent from the 240x160 display. */
export interface DungeonGrid { width:number; height:number; cells:readonly boolean[] }
export interface DungeonCamera { x:number; y:number; direction:number }
export interface DungeonTexture { width:number; height:number; pixels:Uint8ClampedArray }
export const DUNGEON_DIRECTIONS = [[0,-1],[1,0],[0,1],[-1,0]] as const;
export function dungeonGeometryKey(grid:DungeonGrid):string {
  return `${grid.width}x${grid.height}:${Array.from({length:grid.width*grid.height},(_,i)=>grid.cells[i]?'1':'0').join('')}`;
}
export function dungeonBlocked(grid:DungeonGrid,x:number,y:number):boolean {
  return x<0||y<0||x>=grid.width||y>=grid.height||grid.cells[y*grid.width+x]!==false;
}
export function nearestDungeonPassage(grid:DungeonGrid,origin:{x:number;y:number}):{x:number;y:number} {
  let closest={...origin},distance=Infinity;
  for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++)if(!dungeonBlocked(grid,x,y)){
    const next=Math.abs(x-origin.x)+Math.abs(y-origin.y);
    if(next<distance){closest={x,y};distance=next;}
  }
  return closest;
}
export function projectDungeonActor(grid:DungeonGrid,camera:DungeonCamera,actor:{x:number;y:number},cell:boolean,options?:{modern?:boolean;viewDistance?:number}) {
  const [dx,dy]=DUNGEON_DIRECTIONS[camera.direction&3];const vx=actor.x-camera.x,vy=actor.y-camera.y;
  const distance=vx*dx+vy*dy,lateral=-vx*dy+vy*dx;
  if(distance<1||distance>(options?.viewDistance??8)||Math.abs(lateral)>distance||options?.modern&&Math.abs(lateral)*100>distance*65)return null;
  if(options?.modern){
    const steps=Math.max(Math.abs(vx),Math.abs(vy))*10;
    for(let i=1;i<steps;i++)if(dungeonBlocked(grid,Math.trunc((camera.x*10+5+Math.trunc(vx*10*i/steps))/10),Math.trunc((camera.y*10+5+Math.trunc(vy*10*i/steps))/10)))return null;
  }else for(let step=1;step<distance;step++)if(dungeonBlocked(grid,camera.x+dx*step-dy*Math.round(lateral*step/distance),camera.y+dy*step+dx*Math.round(lateral*step/distance)))return null;
  const depth=distance===1?'near':distance<=3?'mid':'far';const size=(depth==='near'?64:depth==='mid'?32:16)/(cell?2:1);
  return {x:Math.trunc(120+lateral*100/distance)-size/2,y:Math.trunc(58+48/distance)-size+4,size,depth,distance};
}
/** Match the native metasprite parts; selecting a depth never resizes the PNG. */
function dungeonSpriteFrame(data:GBAProjectData,actor:Record<string,unknown>,depth?:string) {
  const rows=(v:unknown):Record<string,any>[]=>Array.isArray(v)?v:[];
  const sheets=actor.dungeonDepthSheets as Record<string,string>|undefined;
  const hasDepth=Boolean(depth && sheets && Object.values(sheets).some(Boolean));
  const sheet=String((depth && sheets?.[depth]) || actor.spriteSheet || "");
  const animations=rows(data.animations).filter(a=>a.spriteSheet===sheet);
  const animation=animations.find(a=>a.name===(hasDepth ? actor.dungeonDepthAnimationName || "poses" : actor.animationName)) ?? animations[0];
  if(!animation)return null;
  const frame=rows(animation.frames)[0] ?? {},tiles=rows(frame.tiles);
  const width=Number(animation.frameWidth || 16),height=Number(animation.frameHeight || 16);
  const originX=Number(frame.originX ?? animation.originX ?? 0),originY=Number(frame.originY ?? animation.originY ?? 0);
  const offsetX=tiles.length?Math.min(...tiles.map(t=>Number(t.x ?? 0)))-originX:-Math.max(0,Math.floor(width/2)-8)-originX;
  const offsetY=tiles.length?Math.min(...tiles.map(t=>8-originY-Number(t.y ?? 0)-Number(t.tileHeight || 8))):-height+8-originY;
  const metadata=rows(data.assets).find(a=>a.name===sheet)?.metadata ?? {};
  const allTiles=animations.flatMap(a=>rows(a.frames).flatMap(f=>rows(f.tiles)));
  return {offsetX,offsetY,width,height,sheet,
    sourceX:tiles.length?Math.min(...tiles.map(t=>Number(t.sliceX || 0))):0,
    sourceY:tiles.length?Math.min(...tiles.map(t=>Number(t.sliceY || 0))):0,
    sheetWidth:Number(metadata.width || Math.max(width,...allTiles.map(t=>Number(t.sliceX || 0)+Number(t.tileWidth || width)))),
    sheetHeight:Number(metadata.height || Math.max(height,...allTiles.map(t=>Number(t.sliceY || 0)+Number(t.tileHeight || height))))};
}
export function dungeonActorVisual(data:GBAProjectData,actor:Record<string,unknown>,projection:NonNullable<ReturnType<typeof projectDungeonActor>>,modern:boolean) {
  const frame=dungeonSpriteFrame(data,actor,projection.depth);
  if(!frame)return null;
  const footX=projection.x+projection.size/2,footY=projection.y+projection.size;
  const lateral=(footX-120)*projection.distance/100;
  const span=projection.distance<=1?48:projection.distance===2?38:projection.distance===3?30:22;
  const anchorX=modern?footX:88+lateral*span;
  const anchorY=modern?58+48/projection.distance:32-(projection.distance-1)*8;
  return {...projection,...frame,x:anchorX+frame.offsetX,y:anchorY+frame.offsetY,footX,footY};
}
type DungeonRoomSource={name?:unknown;playerActorName?:unknown;runtime?:unknown};
/** The optional visual actor never becomes the logical camera or a projected NPC. */
export function dungeonPlayerActor(data:GBAProjectData,room:DungeonRoomSource):Record<string,any>|null {
  const settings=data.settings as {general?:{startPlayer?:string}}|undefined;
  // The workspace normalizes an empty selection to null; retain the saved choice.
  const source=(Array.isArray(data.rooms)?data.rooms as DungeonRoomSource[]:[]).find(r=>r.name===room.name) ?? room;
  const name=source.playerActorName===null ? "" : typeof source.playerActorName==="string" ? source.playerActorName : settings?.general?.startPlayer || "Player";
  if(!name)return null;
  return (Array.isArray(data.actors)?data.actors as Record<string,any>[]:[]).find(a=>a.name===name&&a.roomName===room.name) ?? null;
}
export function dungeonPlayerVisual(data:GBAProjectData,room:DungeonRoomSource) {
  const config=(room.runtime as {config?:{presentation?:{playerView?:{enabled?:boolean}}}})?.config;
  if(config?.presentation?.playerView?.enabled!==true)return null;
  const actor=dungeonPlayerActor(data,room),frame=actor&&dungeonSpriteFrame(data,actor);
  if(!actor||!frame)return null;
  const anchorX=Number(actor.dungeonViewAnchor?.x ?? 200),anchorY=Number(actor.dungeonViewAnchor?.y ?? 120);
  return {...frame,x:anchorX+frame.offsetX,y:anchorY+frame.offsetY,anchorX,anchorY,actorId:String(actor.id)};
}
export function decodeDungeonView(tiles:Uint8Array,maps:Uint8Array,palettes:Uint8Array,view:{mapOffset:number;paletteOffset:number;paletteColors:number}):Uint8ClampedArray {
  const out=new Uint8ClampedArray(240*160*4);const map=new DataView(maps.buffer,maps.byteOffset,maps.byteLength),pal=new DataView(palettes.buffer,palettes.byteOffset,palettes.byteLength);
  if(view.mapOffset<0||view.mapOffset+2400>maps.length||view.paletteOffset<0||view.paletteOffset+view.paletteColors*2>palettes.length)throw Error('Vistas Dungeon inválidas');
  for(let y=0;y<160;y++)for(let x=0;x<240;x++){
    const at=view.mapOffset+(Math.floor(y/8)*30+Math.floor(x/8))*4,id=map.getUint16(at,true),flags=map.getUint16(at+2,true);
    const xx=flags&1024?7-x%8:x%8,yy=flags&2048?7-y%8:y%8,offset=id*32+yy*4+Math.floor(xx/2);
    if(offset>=tiles.length)throw Error('Tile Dungeon inválido');
    const index=(tiles[offset]>>(4*(xx%2)))&15,pi=(flags>>12)*16+index;if(pi>=view.paletteColors)throw Error('Paleta Dungeon inválida');
    const color=pal.getUint16(view.paletteOffset+pi*2,true),i=(y*240+x)*4;
    out[i]=id?(color&31)<<3:8;out[i+1]=id?(color>>5&31)<<3:32;out[i+2]=id?(color>>10&31)<<3:48;out[i+3]=255;
  }return out;
}
const mod=(v:number,n:number)=>((v%n)+n)%n;
/** Nearest sampling of approved materials; the export compiler prepares GBA palette banks. */
export function renderDungeonWorld(grid:DungeonGrid,camera:DungeonCamera,textures:readonly DungeonTexture[]=[],door={x:9,y:0}):Uint8ClampedArray {
  const out=new Uint8ClampedArray(240*160*4);const [dx,dy]=DUNGEON_DIRECTIONS[camera.direction&3];const px=camera.x+.5,py=camera.y+.5;
  const sample=(x:number,y:number,material:number,u:number,v:number)=>{
    const i=(y*240+x)*4,t=textures[material];
    if(t){const ti=(mod(v,t.height)*t.width+mod(u,t.width))*4;out[i]=t.pixels[ti];out[i+1]=t.pixels[ti+1];out[i+2]=t.pixels[ti+2];}
    else {const edge=u%16===0||v%16===0;out[i]=edge?32:material===4?48:112;out[i+1]=edge?64:material===4?88:144;out[i+2]=edge?72:material===4?96:128;}
    out[i+3]=255;
  };
  for(let y=0;y<160;y++)for(let x=0;x<240;x++){const i=(y*240+x)*4;out[i]=8;out[i+1]=32;out[i+2]=48;out[i+3]=255;}
  for(let y=0;y<128;y++){
    const den=y-58;if(!den)continue;const dist=(den>0?48:72)/Math.abs(den);
    for(let x=0;x<240;x++){const q=(2*(x+.5)/240-1)*.66,wx=px+dist*(dx-dy*q),wy=py+dist*(dy+dx*q);let material=den>0?4:5;
      if(den>0&&Math.min(mod(wx,1),mod(wy,1),1-mod(wx,1),1-mod(wy,1))<.09)material=7;
      sample(x,y,material,mod(Math.floor(wx*64),64),mod(Math.floor(wy*64),64));
    }
  }
  for(let x=0;x<240;x++){
    const q=(2*(x+.5)/240-1)*.66,rx=dx-dy*q,ry=dy+dx*q;let mx=camera.x,my=camera.y,side=0;
    const ddx=rx?Math.abs(1/rx):1e10,ddy=ry?Math.abs(1/ry):1e10,sx=rx>=0?1:-1,sy=ry>=0?1:-1;
    let ax=(rx>=0?mx+1-px:px-mx)*ddx,ay=(ry>=0?my+1-py:py-my)*ddy;
    for(let n=0;n<512;n++){if(ax<ay){ax+=ddx;mx+=sx;side=0;}else{ay+=ddy;my+=sy;side=1;}if(dungeonBlocked(grid,mx,my))break;}
    const dist=Math.max(.1,side?(my-py+(1-sy)/2)/ry:(mx-px+(1-sx)/2)/rx),hit=side?px+dist*rx:py+dist*ry,u=Math.floor(mod(hit,1)*64),top=58-72/dist,bottom=58+48/dist;
    const seed=mod(mx*11+my*7,13),material=mx===door.x&&my===door.y?6:seed===0?1:seed===2?2:seed===4?3:0;
    for(let y=Math.max(0,Math.ceil(top));y<Math.min(128,Math.floor(bottom)+1);y++)sample(x,y,material,u,Math.min(63,Math.max(0,Math.floor((y-top)/(bottom-top)*64))));
  }return out;
}
