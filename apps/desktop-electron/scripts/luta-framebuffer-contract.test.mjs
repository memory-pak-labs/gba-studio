import { describe, expect, it } from "vitest";

import { resolveLutaFighterFramebufferMasks, resolveLutaNativeFramebufferMasks } from "./luta-framebuffer-contract.mjs";

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
