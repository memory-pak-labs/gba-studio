import {compositeRgbaLayers} from './rgb555-framebuffer-contract.mjs';
const SCREEN_WIDTH=240,SCREEN_HEIGHT=160;
export function platformerCameraPosition(exportedRoom, runtimeState) {
  const roomWidthPixels = Number(exportedRoom?.width_tiles ?? 0) * 8;
  const roomHeightPixels = Number(exportedRoom?.height_tiles ?? 0) * 8;
  const playerWidth = Number(exportedRoom?.player_start?.width ?? 16);
  const playerHeight = Number(exportedRoom?.player_start?.height ?? 16);
  const initialPosition = exportedRoom?.camera?.position ?? { x: 0, y: 0 };
  const config = exportedRoom?.config ?? {};
  const followDirections = Number(config.camera_follow_directions ?? 15);
  const deadZoneX = Number(config.camera_deadzone_x_pixels ?? 0);
  const cameraLockEdge = Number(config.camera_lock_edge ?? 0);
  let cameraX = Number(initialPosition.x ?? 0);
  let cameraY = Number(initialPosition.y ?? 0);
  if (exportedRoom?.camera?.follow_player === true) {
    const centerX = Number(runtimeState?.player?.x ?? 0) + Math.floor(playerWidth / 2);
    const centerY = Number(runtimeState?.player?.y ?? 0) + Math.floor(playerHeight / 2);
    if ((followDirections & 0x01) !== 0 || (followDirections & 0x02) !== 0) {
      const viewportCenterX = cameraX + (SCREEN_WIDTH / 2);
      if (deadZoneX <= 0) {
        cameraX = centerX - (SCREEN_WIDTH / 2);
      } else if ((followDirections & 0x01) !== 0 && centerX > viewportCenterX + deadZoneX) {
        cameraX += centerX - (viewportCenterX + deadZoneX);
      } else if ((followDirections & 0x02) !== 0 && centerX < viewportCenterX - deadZoneX) {
        cameraX -= (viewportCenterX - deadZoneX) - centerX;
      }
    }
    if ((followDirections & 0x04) !== 0 || (followDirections & 0x08) !== 0) {
      cameraY = centerY - (SCREEN_HEIGHT / 2);
    }
    if (cameraLockEdge === 1) cameraX = 0;
    else if (cameraLockEdge === 2) cameraX = roomWidthPixels - SCREEN_WIDTH;
  }
  const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
  cameraX=clamp(cameraX,0,Math.max(0,roomWidthPixels-SCREEN_WIDTH));
  cameraY=clamp(cameraY,0,Math.max(0,roomHeightPixels-SCREEN_HEIGHT));
  const x=Number(runtimeState?.player?.x??0),y=Number(runtimeState?.player?.y??0);
  const zone=exportedRoom?.camera_zones?.find(z=>x<z.area.x+z.area.width&&x+playerWidth>z.area.x&&y<z.area.y+z.area.height&&y+playerHeight>z.area.y);
  if(zone){
    cameraX=(zone.lock_x?zone.bounds.x:cameraX)+(zone.offset?.x??0);
    cameraY=(zone.lock_y?zone.bounds.y:cameraY)+(zone.offset?.y??0);
    cameraX=clamp(cameraX,zone.bounds.x,Math.max(zone.bounds.x,zone.bounds.x+zone.bounds.width-SCREEN_WIDTH));
    cameraY=clamp(cameraY,zone.bounds.y,Math.max(zone.bounds.y,zone.bounds.y+zone.bounds.height-SCREEN_HEIGHT));
  }
  return {x:cameraX,y:cameraY};
}

/** Independent reference sampling: parallax is 8.8 fixed point, like the exported contract. */
export function composePlatformerViewport(layers,camera,width=240,height=160){
  const views=layers.map(layer=>{
    const pixels=new Uint8Array(width*height*4);
    const sx=Math.trunc(camera.x*(layer.parallax?.x??256)/256),sy=Math.trunc(camera.y*(layer.parallax?.y??256)/256);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const px=((sx+x)%layer.width+layer.width)%layer.width,py=((sy+y)%layer.height+layer.height)%layer.height;
      const offset=(py*layer.width+px)*4;pixels.set(layer.pixels.subarray(offset,offset+4),(y*width+x)*4);
    }
    return {width,height,pixels};
  });
  return compositeRgbaLayers(views);
}
