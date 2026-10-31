import { describe, expect, it } from "vitest";

import { resolveLutaFighterFramebufferMasks, resolveLutaNativeFramebufferMasks } from "./luta-framebuffer-contract.mjs";
import * as luta from './luta-framebuffer-contract.mjs';
import { auditOpaqueRgbaAgainstFramebufferRegion } from './rgb555-framebuffer-contract.mjs';

describe('oclusão entre lutadores em movimento', () => {
  function scene() {
    const framebuffer = new Uint8Array(4 * 2 * 4);
    for (let i=0;i<8;i++) framebuffer.set([0,255,0,255],i*4);
    framebuffer.set([255,0,0,255],2*4);
    framebuffer.set([0,0,255,255],5*4);
    const pixels = new Uint8Array(4*2*4);
    pixels.set([255,0,0,255],0); pixels.set([0,0,255,255],(4+1)*4);
    pixels.set([0,255,0,255],2*4); pixels.set([255,0,0,255],(4+3)*4);
    const fighters = [{ object:{index:0,x:1,y:0,width:2,height:2,flipX:true,flipY:false,affine:false},
      source:{pixels,width:4,height:2},frameWidth:2,frameHeight:2,frameCount:2 }];
    const back = new Uint8Array(4*2*4);
    for (let i=0;i<8;i++) back.set([0,255,0,255],i*4);
    return {framebuffer,fighters,back};
  }
  const masks = fixture => luta.resolveLutaFighterOcclusionPixels({ ...fixture,
    targetObjectIndex:1,framebufferWidth:4,framebufferHeight:2 });
  const audit = (fixture,allowedOcclusionPixels) => auditOpaqueRgbaAgainstFramebufferRegion({
    framebuffer:fixture.framebuffer,framebufferWidth:4,framebufferHeight:2,
    sourcePixels:fixture.back,sourceSheetWidth:4,sourceX:0,frameWidth:4,frameHeight:2,
    targetX:0,targetY:0,allowedOcclusionPixels });
  it('mascara apenas os pixels opacos da pose comprovada, incluindo flip e buracos transparentes',()=>{
    const fixture=scene(),allowed=masks(fixture);
    expect(allowed).toEqual(new Set(['2:255,0,0','5:0,0,255']));
    expect(audit(fixture,allowed)).toMatchObject({ok:true,mismatchCount:0,occludedPixelCount:2,comparedPixelCount:6});
  });
  it('continua reprovando uma corrupção visível da mesma cor fora da sobreposição',()=>{
    const fixture=scene();fixture.framebuffer.set([255,0,0,255],4*4);
    expect(audit(fixture,masks(fixture))).toMatchObject({ok:false,mismatchCount:1});
  });
  it('não usa uma pose nem um lutador de primeiro plano que não correspondem ao framebuffer',()=>{
    const fixture=scene();fixture.framebuffer.set([255,255,255,255],2*4);
    expect(()=>masks(fixture)).toThrow(/foreground|primeiro plano/i);
  });
  it('não mascara o próprio alvo ou objetos atrás dele na ordem OAM',()=>{
    const fixture=scene();fixture.fighters[0].object.index=1;
    expect(masks(fixture).size).toBe(0);
    expect(audit(fixture,masks(fixture)).ok).toBe(false);
  });
});

describe("luta framebuffer contract", () => {
  it('masks the actual rounds, frames and fighters without excluding unrelated floor pixels',()=>{
    const objects=[{x:8,y:32,width:32,height:8},{x:208,y:32,width:32,height:8},{x:32,y:80,width:64,height:64}];
    const masks=resolveLutaNativeFramebufferMasks({objects});
    const covered=(x,y)=>masks.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height);
    expect(covered(10,36)).toBe(true);expect(covered(228,36)).toBe(true);
    expect(covered(50,120)).toBe(true);expect(covered(128,120)).toBe(false);
    expect(covered(100,150)).toBe(false);
  });
  it('rejects missing native OAM rather than inventing a legacy HUD rectangle',()=>{
    expect(()=>resolveLutaNativeFramebufferMasks(null)).toThrow(/OAM/);
  });
  it("reutiliza os alvos reais dos lutadores para mascarar somente os retangulos OAM", () => {
    const fighters = [
      {
        frameHeight: 64,
        frameWidth: 64,
        side: "player1",
        target: { x: 80, y: 24 }
      },
      {
        frameHeight: 64,
        frameWidth: 64,
        side: "player2",
        target: { x: 167, y: 24 }
      }
    ];

    expect(resolveLutaFighterFramebufferMasks({ fighters, sourceX: 0, sourceY: 0 })).toEqual([
      { height: 64, width: 64, x: 80, y: 24 },
      { height: 64, width: 64, x: 167, y: 24 }
    ]);
  });
});
