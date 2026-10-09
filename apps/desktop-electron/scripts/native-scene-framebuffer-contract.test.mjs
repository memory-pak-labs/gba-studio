import { expect, it } from 'vitest';
import { decodeMGBAHardwareVideoState, exportedHudFramebufferMasks, framebufferOcclusionPixels, nativeSinglePartSpriteObject, transformRacingSpriteSheetRgba } from './native-scene-framebuffer-contract.mjs';
import { auditOpaqueRgbaAgainstFramebufferRegion, findBestOpaqueRgbaFramebufferFrame } from './rgb555-framebuffer-contract.mjs';

it('accepts an occluding pixel only at its declared coordinate and color', () => {
  const source = {width:2,height:1,pixels:Uint8Array.from([255,0,0,255,255,0,0,255])};
  const marker = {width:1,height:1,pixels:Uint8Array.from([0,255,0,255])};
  const allowed = framebufferOcclusionPixels([{source:marker,x:1,y:0}], {width:2,height:1});
  const options = {sourcePixels:source.pixels,sourceSheetWidth:2,frameWidth:2,frameHeight:1,framebufferWidth:2,framebufferHeight:1,targetX:0,targetY:0,allowedOcclusionPixels:allowed};
  expect(auditOpaqueRgbaAgainstFramebufferRegion({...options,framebuffer:Uint8Array.from([255,0,0,255,0,255,0,255])})).toMatchObject({ok:true,occludedPixelCount:1});
  expect(auditOpaqueRgbaAgainstFramebufferRegion({...options,framebuffer:Uint8Array.from([0,255,0,255,255,0,0,255])})).toMatchObject({ok:false,mismatchCount:1});
  expect(auditOpaqueRgbaAgainstFramebufferRegion({...options,framebuffer:Uint8Array.from([255,0,0,255,0,0,255,255])})).toMatchObject({ok:false,mismatchCount:1});
});

it('uses the exported HUD component bounds and skips hidden components', () => {
  const header = `constexpr gbs::HudLayoutComponent race_components[] = {
    {"panel","frame","LAP","","",8,8,72,24,1,true,nullptr},
    {"hidden","frame","","","",0,40,240,80,1,false,nullptr}
  }; constexpr gbs::HudLayout layouts[] = {{"race-hud","advanced",race_components,2}};`;
  expect(exportedHudFramebufferMasks(header,'race-hud')).toEqual([{x:8,y:8,width:72,height:24}]);
  expect(exportedHudFramebufferMasks(header,'missing')).toEqual([]);
});

it('samples racing OBJ affine rotation around the native center, including the clipped edge', () => {
  const pixels = new Uint8Array(4*4*4);
  pixels.set([255,0,0,255], (1*4+2)*4);
  pixels.set([0,255,0,255], (0*4+0)*4);
  const source = {width:4,height:4,pixels};
  expect(transformRacingSpriteSheetRgba({source,frameWidth:4,frameHeight:4,heading:0}).pixels).toEqual(pixels);
  const rotated = transformRacingSpriteSheetRgba({source,frameWidth:4,frameHeight:4,heading:4});
  expect(Array.from(rotated.pixels.slice((2*4+3)*4,(2*4+3)*4+4))).toEqual([255,0,0,255]);
  expect(rotated.pixels[3]).toBe(0);
  expect(rotated.pixels.filter((value,index)=>index%4===3&&value!==0)).toHaveLength(1);
});

it('reads video registers and affine OAM from the pinned native state layout and rejects other layouts', () => {
  const bytes = new Uint8Array(0x1000), view = new DataView(bytes.buffer);
  view.setUint32(0,0x01000007,true);
  view.setUint16(0x418,67,true); view.setUint16(0x41a,45,true);
  for (let i=0;i<128;i++) view.setUint16(0xc00+i*8,0x200,true);
  view.setUint16(0xc00,0x100|52,true); view.setUint16(0xc02,0x8000|164,true);
  view.setInt16(0xc06,0,true); view.setInt16(0xc0e,256,true); view.setInt16(0xc16,-256,true); view.setInt16(0xc1e,0,true);
  expect(decodeMGBAHardwareVideoState(bytes)).toMatchObject({bg:[{},{},{x:67,y:45},{}],objects:[{index:0,x:164,y:52,width:32,height:32,matrix:{pa:0,pb:256,pc:-256,pd:0}}]});
  view.setUint32(0,0x01000005,true);
  expect(() => decodeMGBAHardwareVideoState(bytes)).toThrow(/layout/);
});

it('reads horizontal and vertical flips only for regular native objects', () => {
  const bytes = new Uint8Array(0x1000), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x01000007, true);
  for (let i=0;i<128;i++) view.setUint16(0xc00+i*8, 0x200, true);
  view.setUint16(0xc00, 40, true); view.setUint16(0xc02, 0xb000|148, true);
  expect(decodeMGBAHardwareVideoState(bytes).objects[0]).toMatchObject({flipX:true,flipY:true});
  view.setUint16(0xc00, 0x100|40, true);
  expect(decodeMGBAHardwareVideoState(bytes).objects[0]).toMatchObject({flipX:false,flipY:false});
});

it('matches a single-part actor by tile and palette and refuses ambiguous instances', () => {
  const header = 'constexpr gbs::MetaSpritePart moth_frame_0_parts[1] = {{0,0,155,2,false,false,32,32}};';
  const object = {tile:155,palette:2,x:148,y:40,flipX:true,affine:false};
  expect(nativeSinglePartSpriteObject(header,'moth',{objects:[object]})).toBe(object);
  expect(nativeSinglePartSpriteObject(header,'moth',{objects:[object,{...object,x:20}]})).toBeNull();
  expect(nativeSinglePartSpriteObject(header,'moth',{objects:[{...object,palette:1}]})).toBeNull();
});

it('compares a fighter at its clipped native OAM position and rejects a corrupted visible pixel', () => {
  const header = 'constexpr gbs::MetaSpritePart rival_frame_0_parts[1] = {{0,0,384,1,false,false,64,64}};';
  const nativeObject = nativeSinglePartSpriteObject(header, 'rival', {objects:[
    {tile:0,palette:0,x:80,y:24,flipX:false,affine:false},
    {tile:384,palette:1,x:179,y:24,flipX:false,affine:false}
  ]});
  const source = new Uint8Array(64*64*4);
  const framebuffer = new Uint8Array(240*160*4);
  // A visible red pixel and a green pixel beyond the right viewport edge.
  source.set([255,0,0,255], (20*64+40)*4);
  source.set([0,255,0,255], (20*64+63)*4);
  framebuffer.set([255,0,0,255], (44*240+219)*4);
  const options = {candidateFlipsX:[nativeObject.flipX], candidateSourceXs:[0],
    candidateTargets:[{x:nativeObject.x,y:nativeObject.y}], frameWidth:64,frameHeight:64,
    framebufferWidth:240,framebufferHeight:160,sourceSheetWidth:64,sourcePixels:source,framebuffer};
  expect(findBestOpaqueRgbaFramebufferFrame(options)).toMatchObject({ok:true,comparedPixelCount:1,mismatchCount:0,target:{x:179,y:24}});
  framebuffer.set([0,0,255,255], (44*240+219)*4);
  expect(findBestOpaqueRgbaFramebufferFrame(options)).toMatchObject({ok:false,comparedPixelCount:1,mismatchCount:1});
});
