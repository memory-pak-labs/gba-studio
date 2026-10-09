import { useEffect, useRef, useState } from "react";
import { racingCameraFloorLine } from "../shared/racingCameraProjection";
import { racingFloorSourceTileIndex } from "../shared/racingAuthoring";
import type { RacingSceneConfig } from "../shared/sceneTypeProfiles";
import type { RoomsWorkspaceEntity, RoomsWorkspaceRoom } from "../shared/roomsWorkspace";

export function RacingCircuitCamera({room,config,floorURL,panoramaURL,player,playerURL}:{room:RoomsWorkspaceRoom;config:RacingSceneConfig;
  floorURL:string|null;panoramaURL:string|null;player:RoomsWorkspaceEntity|null;playerURL:string|null}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!canvas.current||!config.topdownTrack)return;
    let cancelled=false;
    const load=(url:string|null)=>new Promise<HTMLImageElement|null>((resolve,reject)=>{if(!url){resolve(null);return;}const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Não foi possível carregar o piso da prévia."));image.src=url;});
    Promise.all([load(floorURL),load(panoramaURL),load(playerURL)]).then(([floor,panorama,vehicle])=>{
      if(cancelled||!canvas.current)return;
      const context=canvas.current.getContext("2d");if(!context)return;
      context.imageSmoothingEnabled=false;context.fillStyle="#231737";context.fillRect(0,0,240,160);
      const horizon=config.pseudo3dVisuals?.horizonY??48;
      if(panorama)context.drawImage(panorama,0,0,panorama.width,panorama.height,0,0,240,horizon);
      const image=context.getImageData(0,0,240,160);
      const camera=config.perspectiveCamera??{height:48,distance:64,focalLength:96};
      const position={x:(player?.x??room.width/2)*8+4,y:(player?.y??room.height/2)*8+4};
      const heading=(config.topdownTrack?.startHeading??0)*256;
      if(floor) {
        const source=document.createElement("canvas");source.width=floor.width;source.height=floor.height;
        const sourceContext=source.getContext("2d");if(!sourceContext)return;
        sourceContext.drawImage(floor,0,0);const pixels=sourceContext.getImageData(0,0,floor.width,floor.height).data;
        const tileColumns=Math.floor(floor.width/8);
        for(let y=horizon+1;y<160;y++) {
          const line=racingCameraFloorLine(position,heading,camera,horizon,y)!;
          for(let x=0;x<240;x++) {
            const wx=Math.floor((line.x+line.pa*x)/256),wy=Math.floor((line.y+line.pc*x)/256);
            if(wx<0||wy<0||wx>=room.width*8||wy>=room.height*8)continue;
            const tile=racingFloorSourceTileIndex(room.tileCells[Math.floor(wy/8)*room.width+Math.floor(wx/8)]??0);
            if(tile<0)continue;
            const sx=(tile%tileColumns)*8+(wx&7),sy=Math.floor(tile/tileColumns)*8+(wy&7);
            if(sx>=floor.width||sy>=floor.height)continue;
            const sourceOffset=(sy*floor.width+sx)*4,targetOffset=(y*240+x)*4;
            for(let channel=0;channel<3;channel++)image.data[targetOffset+channel]=pixels[sourceOffset+channel];
            image.data[targetOffset+3]=255;
          }
        }
      }
      context.putImageData(image,0,0);
      if(vehicle&&player?.spriteFrame){const frame=player.spriteFrame;const ground=horizon+Math.trunc(camera.height*camera.focalLength/camera.distance);context.drawImage(vehicle,frame.sourceX,frame.sourceY,frame.frameWidth,frame.frameHeight,120-frame.originX,ground-frame.originY,frame.frameWidth,frame.frameHeight);}
      setError("");
    }).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"Prévia indisponível");});
    return ()=>{cancelled=true;};
  },[room,config,floorURL,panoramaURL,player,playerURL]);
  return <><canvas ref={canvas} width={240} height={160} aria-label="Circuito em perspectiva na posição de largada" style={{position:"absolute",inset:0,width:"100%",height:"100%",zIndex:2,imageRendering:"pixelated"}}/>{error?<span role="status">{error}</span>:null}</>;
}
