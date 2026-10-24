import { findBestOpaqueRgbaFramebufferFrame } from './rgb555-framebuffer-contract.mjs';
import { framebufferOcclusionPixels } from './native-scene-framebuffer-contract.mjs';

// Same-priority fighters follow their native OAM order (Tonc, lab.html).
// An occluder must first match one exact compiled pose; neither the whole
// bounding box nor the union of every animation frame is an allowed mask.
export function resolveLutaFighterOcclusionPixels({fighters, targetObjectIndex, framebuffer,
  framebufferWidth = 240, framebufferHeight = 160}) {
  const layers = [];
  for (const fighter of fighters.filter(f => f.object.index < targetObjectIndex)
    .sort((a,b) => a.object.index-b.object.index)) {
    const {object,source,frameWidth,frameHeight,frameCount}=fighter;
    if (object.affine || object.flipY || object.width !== frameWidth || object.height !== frameHeight) {
      throw new Error('Unsupported native foreground fighter');
    }
    let opaque = 0;
    for (let y=0;y<frameHeight;y++) for(let x=0;x<frameWidth;x++) {
      if(source.pixels[(y*source.width+x)*4+3]) opaque++;
    }
    const match=findBestOpaqueRgbaFramebufferFrame({
      candidateSourceXs:Array.from({length:frameCount},(_,i)=>i*frameWidth),
      candidateFlipsX:[object.flipX],candidateTargets:[{x:object.x,y:object.y}],
      framebuffer,framebufferWidth,framebufferHeight,frameWidth,frameHeight,
      sourcePixels:source.pixels,sourceSheetWidth:source.width,
      minimumComparedPixelCount:Math.max(1,Math.floor(opaque*0.5)),
      allowedOcclusionPixels:framebufferOcclusionPixels(layers,{width:framebufferWidth,height:framebufferHeight})
    });
    if (!match.ok) throw new Error('Native foreground fighter does not match its compiled pixels');
    const pixels=new Uint8Array(frameWidth*frameHeight*4);
    for(let y=0;y<frameHeight;y++) for(let x=0;x<frameWidth;x++) {
      const sx=match.sourceX+(match.flipX?frameWidth-1-x:x), offset=(y*source.width+sx)*4;
      pixels.set(source.pixels.subarray(offset,offset+4),(y*frameWidth+x)*4);
    }
    layers.push({source:{width:frameWidth,height:frameHeight,pixels},x:object.x,y:object.y});
  }
  return framebufferOcclusionPixels(layers,{width:framebufferWidth,height:framebufferHeight});
}

/** Screen-space rectangles read from the emulator, including modular HUD OBJ. */
export function resolveLutaNativeFramebufferMasks(nativeVideo) {
  if (!Array.isArray(nativeVideo?.objects)) throw new Error('Native luta OAM unavailable');
  return nativeVideo.objects.map(({x,y,width,height})=>{
    if (![x,y,width,height].every(Number.isFinite)||width<=0||height<=0) throw new Error('Invalid native luta OAM');
    return {x,y,width,height};
  });
}

export function resolveLutaFighterFramebufferMasks({ fighters, sourceX = 0, sourceY = 0 } = {}) {
  if (!Array.isArray(fighters)) return [];

  return fighters.flatMap((fighter) => {
    const targetX = Number(fighter?.target?.x);
    const targetY = Number(fighter?.target?.y);
    const width = Number(fighter?.frameWidth);
    const height = Number(fighter?.frameHeight);
    if (![targetX, targetY, width, height].every(Number.isFinite)
      || width <= 0
      || height <= 0) {
      return [];
    }
    return [{
      height,
      width,
      x: targetX - Number(sourceX),
      y: targetY - Number(sourceY)
    }];
  });
}
